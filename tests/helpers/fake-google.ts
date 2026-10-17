// v1.11.0 tests: an in-memory stand-in for Google's OAuth token endpoint and
// the Calendar API, used as a fetch mock. No real Google account is used.
// It behaves like Google where the sync depends on it: sync tokens, paging,
// etags, client-chosen event ids (409 when taken), cancelled events kept as
// tombstones, 410 for an expired sync token, Bearer token checks.
import type { GoogleEvent } from "@/server/integrations/google-calendar/client";

interface Stored extends GoogleEvent {
  seq: number;
}

export const FAKE_CLIENT_ID = "123456789012-fakeclient.apps.googleusercontent.com";
export const FAKE_CLIENT_SECRET = "fake-client-secret-value";
export const FAKE_REFRESH = "fake-refresh-token-1";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const apiError = (status: number, reason: string) => json(status, { error: { code: status, errors: [{ reason }], message: reason } });

// The event as Google returns it (without the fake's own sequence number).
function strip(event: Stored): GoogleEvent {
  const copy: Partial<Stored> = { ...event };
  delete copy.seq;
  return copy as GoogleEvent;
}

export class FakeGoogle {
  calendars = new Map<string, Map<string, Stored>>();
  seq = 0;
  etagCounter = 0;
  accessTokens = new Set<string>();
  refreshValid = true;
  pageSize = 2;
  expiredSyncTokens = new Set<string>();
  calls: { method: string; path: string }[] = [];
  failures: { match: (method: string, path: string) => boolean; status: number; reason: string; times: number }[] = [];
  email = "person@example.com";
  grantScope = "openid email https://www.googleapis.com/auth/calendar.events.owned https://www.googleapis.com/auth/calendar.calendarlist.readonly";

  private cal(id: string): Map<string, Stored> {
    if (!this.calendars.has(id)) this.calendars.set(id, new Map());
    return this.calendars.get(id)!;
  }

  private stamp(event: Stored): Stored {
    this.seq += 1;
    this.etagCounter += 1;
    event.seq = this.seq;
    event.etag = `"etag-${this.etagCounter}"`;
    event.updated = new Date(Date.now() + this.seq).toISOString();
    return event;
  }

  failNext(match: (method: string, path: string) => boolean, status: number, reason: string, times = 1) {
    this.failures.push({ match, status, reason, times });
  }

  // What a person does in Google Calendar.
  userCreates(calendarId: string, event: Omit<GoogleEvent, "id" | "etag"> & { id?: string }): Stored {
    const id = event.id ?? `g${Math.random().toString(36).slice(2, 10)}`;
    return this.stamp(this.cal(calendarId).set(id, { ...event, id, status: "confirmed", seq: 0 }).get(id)!);
  }

  userEdits(calendarId: string, id: string, change: Partial<GoogleEvent>): Stored {
    const event = this.cal(calendarId).get(id)!;
    Object.assign(event, change);
    return this.stamp(event);
  }

  userDeletes(calendarId: string, id: string): void {
    const event = this.cal(calendarId).get(id)!;
    event.status = "cancelled";
    this.stamp(event);
  }

  live(calendarId: string): Stored[] {
    return [...this.cal(calendarId).values()].filter((event) => event.status !== "cancelled");
  }

  fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    const method = (init.method ?? "GET").toUpperCase();
    this.calls.push({ method, path: url.pathname });
    const failure = this.failures.find((item) => item.times > 0 && item.match(method, url.pathname));
    if (failure) {
      failure.times -= 1;
      return failure.status === 0 ? Promise.reject(new TypeError("fetch failed")) : apiError(failure.status, failure.reason);
    }

    if (url.hostname === "oauth2.googleapis.com" && url.pathname === "/token") {
      const form = new URLSearchParams(String(init.body));
      if (form.get("client_id") !== FAKE_CLIENT_ID || form.get("client_secret") !== FAKE_CLIENT_SECRET) return json(401, { error: "invalid_client" });
      if (form.get("grant_type") === "authorization_code") {
        if (form.get("code") !== "good-code") return json(400, { error: "invalid_grant" });
        const access = `access-${this.accessTokens.size + 1}`;
        this.accessTokens.add(access);
        const idToken = `x.${Buffer.from(JSON.stringify({ email: this.email })).toString("base64url")}.y`;
        return json(200, { access_token: access, expires_in: 3600, refresh_token: FAKE_REFRESH, scope: this.grantScope, id_token: idToken });
      }
      if (form.get("grant_type") === "refresh_token") {
        if (!this.refreshValid || form.get("refresh_token") !== FAKE_REFRESH) return json(400, { error: "invalid_grant" });
        const access = `access-${this.accessTokens.size + 1}`;
        this.accessTokens.add(access);
        return json(200, { access_token: access, expires_in: 3600 });
      }
      return json(400, { error: "unsupported_grant_type" });
    }
    if (url.hostname === "oauth2.googleapis.com" && url.pathname === "/revoke") return new Response("", { status: 200 });

    if (url.hostname !== "www.googleapis.com") return new Response("no such host", { status: 599 });
    const bearer = new Headers(init.headers).get("authorization")?.replace("Bearer ", "");
    if (!bearer || !this.accessTokens.has(bearer)) return apiError(401, "authError");

    const path = url.pathname.replace("/calendar/v3", "");
    if (path === "/users/me/calendarList") {
      const all = [
        { id: "person@example.com", summary: "Person", primary: true, accessRole: "owner" },
        { id: "team@group.calendar.google.com", summary: "Team", accessRole: "writer" },
      ];
      // Like Google: minAccessRole=owner leaves out calendars the person can only write to.
      const ownersOnly = url.searchParams.get("minAccessRole") === "owner";
      return json(200, { items: all.filter((item) => !ownersOnly || item.accessRole === "owner") });
    }
    if (path === "/channels/stop") return new Response(null, { status: 204 });
    const match = /^\/calendars\/([^/]+)\/events(?:\/(watch|[^/]+))?$/.exec(path);
    if (!match) return apiError(404, "notFound");
    const calendarId = decodeURIComponent(match[1]!);
    const store = this.cal(calendarId);
    const tail = match[2] ? decodeURIComponent(match[2]) : null;
    const body = init.body ? (JSON.parse(String(init.body)) as GoogleEvent) : null;

    if (tail === "watch" && method === "POST") return json(200, { id: (body as unknown as { id: string }).id, resourceId: "resource-1", expiration: String(Date.now() + 7 * 86_400_000) });
    if (!tail && method === "GET") {
      const syncToken = url.searchParams.get("syncToken");
      if (syncToken && this.expiredSyncTokens.has(syncToken)) return apiError(410, "fullSyncRequired");
      const since = syncToken ? Number(syncToken.replace("st-", "")) : null;
      const all = [...store.values()].filter((event) => (since === null ? event.status !== "cancelled" : event.seq > since)).sort((a, b) => a.seq - b.seq);
      const offset = Number(url.searchParams.get("pageToken") ?? 0);
      const page = all.slice(offset, offset + this.pageSize).map(strip);
      const more = offset + this.pageSize < all.length;
      return json(200, { items: page, ...(more ? { nextPageToken: String(offset + this.pageSize) } : { nextSyncToken: `st-${this.seq}` }) });
    }
    if (!tail && method === "POST") {
      const id = body!.id ?? `g${this.seq + 1}`;
      if (store.has(id)) return apiError(409, "duplicate");
      const created = this.stamp({ ...body!, id, status: body!.status ?? "confirmed", seq: 0 });
      store.set(id, created);
      return json(200, strip(created));
    }
    const existing = tail ? store.get(tail) : undefined;
    if (method === "PATCH") {
      if (!existing) return apiError(404, "notFound");
      Object.assign(existing, body);
      return json(200, strip(this.stamp(existing)));
    }
    if (method === "DELETE") {
      if (!existing) return apiError(404, "notFound");
      if (existing.status === "cancelled") return apiError(410, "deleted");
      existing.status = "cancelled";
      this.stamp(existing);
      return new Response(null, { status: 204 });
    }
    return apiError(404, "notFound");
  };
}
