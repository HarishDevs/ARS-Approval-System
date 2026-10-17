import "server-only";

// v1.11.0: the few Google endpoints the calendar sync uses, over fetch
// (mocked in tests). Tokens are passed in and never logged; errors carry a
// category and Google's short reason only, never a token or a full body.
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/calendar/v3";
const TIMEOUT_MS = 15_000;

export type GoogleErrorCategory = "AUTH" | "API_DISABLED" | "FORBIDDEN" | "RATE_LIMIT" | "GONE" | "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST" | "SERVER" | "NETWORK";

export class GoogleApiError extends Error {
  constructor(
    readonly category: GoogleErrorCategory,
    readonly status: number,
    readonly reason: string,
  ) {
    super(`Google ${status} ${category}: ${reason}`.slice(0, 300));
    this.name = "GoogleApiError";
  }
  // Worth trying again later (backoff), rather than giving up.
  get transient(): boolean {
    return this.category === "RATE_LIMIT" || this.category === "SERVER" || this.category === "NETWORK";
  }
}

function categorise(status: number, reason: string): GoogleErrorCategory {
  if (status === 401 || reason === "invalid_grant" || reason === "invalid_token") return "AUTH";
  if (status === 410) return "GONE";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 429 || /rateLimitExceeded|userRateLimitExceeded|quotaExceeded/.test(reason)) return "RATE_LIMIT";
  if (status === 403 && /accessNotConfigured|SERVICE_DISABLED/.test(reason)) return "API_DISABLED";
  if (status === 403) return "FORBIDDEN";
  if (status >= 500) return "SERVER";
  return "BAD_REQUEST";
}

async function call<T>(url: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch {
    throw new GoogleApiError("NETWORK", 0, "network error or timeout");
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = {};
  }
  if (!response.ok) {
    const error = body.error as { errors?: { reason?: string }[]; status?: string; message?: string } | string | undefined;
    const reason = typeof error === "string" ? error : (error?.errors?.[0]?.reason ?? error?.status ?? `HTTP ${response.status}`);
    throw new GoogleApiError(categorise(response.status, String(reason)), response.status, String(reason).slice(0, 100));
  }
  return body as T;
}

const form = (values: Record<string, string>) => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(values).toString(),
});

export interface TokenSet {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
}

export function exchangeCode(input: { clientId: string; clientSecret: string; code: string; redirectUri: string }): Promise<TokenSet> {
  return call<TokenSet>(TOKEN_URL, form({ grant_type: "authorization_code", code: input.code, client_id: input.clientId, client_secret: input.clientSecret, redirect_uri: input.redirectUri }));
}

export function refreshAccessToken(input: { clientId: string; clientSecret: string; refreshToken: string }): Promise<TokenSet> {
  return call<TokenSet>(TOKEN_URL, form({ grant_type: "refresh_token", refresh_token: input.refreshToken, client_id: input.clientId, client_secret: input.clientSecret }));
}

export async function revokeToken(token: string): Promise<void> {
  await call<unknown>(REVOKE_URL, form({ token })).catch(() => undefined); // best effort: it may already be revoked
}

// Super Admin "Test configuration": a made-up code at the token endpoint.
// Google answers invalid_grant when the client ID and secret are right, and
// invalid_client when they are wrong. Nothing is created.
export async function probeClient(input: { clientId: string; clientSecret: string; redirectUri: string }): Promise<"OK" | "BAD_CLIENT" | "UNREACHABLE" | "UNEXPECTED"> {
  try {
    await exchangeCode({ ...input, code: "ars-configuration-test" });
    return "UNEXPECTED";
  } catch (error) {
    if (!(error instanceof GoogleApiError)) return "UNEXPECTED";
    if (error.category === "NETWORK") return "UNREACHABLE";
    if (error.reason === "invalid_grant") return "OK";
    if (error.reason === "invalid_client" || error.reason === "unauthorized_client") return "BAD_CLIENT";
    return "UNEXPECTED";
  }
}

// The account email from the ID token returned by the token endpoint itself
// (over TLS, straight from Google), so its signature needn't be checked.
export function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8")) as { email?: unknown };
    return typeof payload.email === "string" ? payload.email.slice(0, 255) : null;
  } catch {
    return null;
  }
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const cal = (calendarId: string) => `${API}/calendars/${encodeURIComponent(calendarId)}`;

export interface CalendarListEntry {
  id: string;
  summary: string;
  primary?: boolean;
  accessRole: string;
}

export async function listCalendars(token: string): Promise<CalendarListEntry[]> {
  const body = await call<{ items?: CalendarListEntry[] }>(`${API}/users/me/calendarList?minAccessRole=owner&maxResults=100`, { headers: auth(token) });
  return (body.items ?? []).map((item) => ({ id: item.id, summary: item.summary, primary: item.primary, accessRole: item.accessRole }));
}

export interface GoogleEventTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

export interface GoogleEvent {
  id: string;
  etag?: string;
  status?: "confirmed" | "tentative" | "cancelled";
  summary?: string;
  description?: string;
  start?: GoogleEventTime;
  end?: GoogleEventTime;
  updated?: string;
  recurrence?: string[];
  recurringEventId?: string;
  visibility?: string;
  extendedProperties?: { private?: Record<string, string> };
}

export interface EventPage {
  items?: GoogleEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

// Incremental sync (brief §5): with a sync token only the changes since the
// last call come back (deletions included); without one, a full listing
// from timeMin, which ends with a fresh sync token. 410 = token expired.
export function listEvents(token: string, calendarId: string, input: { syncToken?: string | null; pageToken?: string | null; timeMin?: string }): Promise<EventPage> {
  const url = new URL(`${cal(calendarId)}/events`);
  url.searchParams.set("maxResults", "250");
  if (input.syncToken) url.searchParams.set("syncToken", input.syncToken);
  else {
    url.searchParams.set("showDeleted", "false");
    if (input.timeMin) url.searchParams.set("timeMin", input.timeMin);
  }
  if (input.pageToken) url.searchParams.set("pageToken", input.pageToken);
  return call<EventPage>(url.toString(), { headers: auth(token) });
}

export type EventBody = Omit<GoogleEvent, "id" | "etag" | "updated" | "recurringEventId" | "recurrence"> & { id?: string; reminders?: { useDefault: boolean } };

export function insertEvent(token: string, calendarId: string, event: EventBody): Promise<GoogleEvent> {
  return call<GoogleEvent>(`${cal(calendarId)}/events`, { method: "POST", headers: { ...auth(token), "Content-Type": "application/json" }, body: JSON.stringify(event) });
}

export function patchEvent(token: string, calendarId: string, eventId: string, event: Partial<EventBody>): Promise<GoogleEvent> {
  return call<GoogleEvent>(`${cal(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: "PATCH", headers: { ...auth(token), "Content-Type": "application/json" }, body: JSON.stringify(event) });
}

export async function deleteEvent(token: string, calendarId: string, eventId: string): Promise<void> {
  try {
    await call<unknown>(`${cal(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: "DELETE", headers: auth(token) });
  } catch (error) {
    // Already gone is the outcome we wanted.
    if (error instanceof GoogleApiError && (error.category === "NOT_FOUND" || error.category === "GONE")) return;
    throw error;
  }
}

export function watchEvents(token: string, calendarId: string, input: { channelId: string; address: string; channelToken: string; ttlSeconds: number }): Promise<{ id: string; resourceId: string; expiration?: string }> {
  return call(`${cal(calendarId)}/events/watch`, {
    method: "POST",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ id: input.channelId, type: "web_hook", address: input.address, token: input.channelToken, params: { ttl: String(input.ttlSeconds) } }),
  });
}

export async function stopChannel(token: string, channelId: string, resourceId: string): Promise<void> {
  await call<unknown>(`${API}/channels/stop`, { method: "POST", headers: { ...auth(token), "Content-Type": "application/json" }, body: JSON.stringify({ id: channelId, resourceId }) }).catch(() => undefined);
}
