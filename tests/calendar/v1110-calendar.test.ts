import { describe, expect, it } from "vitest";
import { authUrl, calendarConfigSchema, DEFAULT_CONFIG, hasRequiredScope, integrationStatus, parseConfig, redirectUri } from "@/server/calendar/config";
import { backoffSeconds, businessEvent, contentHash, decideConflict, eventIdFor, itemEvent, itemFromGoogle, renderTemplate } from "@/server/calendar/events";
import { parseView, viewHref, weekStart, daysCovered } from "@/server/calendar/views";
import { parseInfoSettings } from "@/server/modules/settings";

// v1.11.0 Google Calendar sync: the pure rules.
describe("configuration", () => {
  it("defaults to two-way, private events, manual conflicts, reference-only titles", () => {
    expect(DEFAULT_CONFIG).toMatchObject({ direction: "TWO_WAY", privacy: "PRIVATE", conflictPolicy: "MANUAL", titleTemplate: "{kind}: {ref}", arsDeletion: "DELETE_EVENT", googleDeletion: "UNLINK" });
    expect(parseConfig("not json")).toEqual(DEFAULT_CONFIG);
    expect(parseConfig({ intervalMinutes: 30 }).intervalMinutes).toBe(30);
  });
  it("templates accept only known variables", () => {
    expect(calendarConfigSchema.safeParse({ titleTemplate: "{kind} {amount}" }).success).toBe(false);
    expect(calendarConfigSchema.safeParse({ titleTemplate: "{kind} – {title}" }).success).toBe(true);
  });
  it("is Enabled only when switched on, complete and tested", () => {
    const base = { enabled: true, maintenance: false, clientId: "x", hasSecret: true, lastTestOk: true };
    expect(integrationStatus(base)).toBe("ENABLED");
    expect(integrationStatus({ ...base, lastTestOk: null })).toBe("NOT_CONFIGURED");
    expect(integrationStatus({ ...base, hasSecret: false })).toBe("NOT_CONFIGURED");
    expect(integrationStatus({ ...base, enabled: false })).toBe("DISABLED");
    expect(integrationStatus({ ...base, maintenance: true })).toBe("MAINTENANCE");
  });
  it("builds the consent URL with least-privilege scopes, offline access and the state", () => {
    const url = new URL(authUrl({ clientId: "c", redirectUri: "https://a.test/cb", state: "s1" }));
    expect(url.searchParams.get("scope")).toBe("openid email https://www.googleapis.com/auth/calendar.events.owned https://www.googleapis.com/auth/calendar.calendarlist.readonly");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("state")).toBe("s1");
    expect(redirectUri("https://approval.arssteels.net")).toBe("https://approval.arssteels.net/api/integrations/google-calendar/callback");
    expect(hasRequiredScope("openid https://www.googleapis.com/auth/calendar.events.owned")).toBe(true);
    // The broader scope alone isn't what the app asked for (D-162).
    expect(hasRequiredScope("openid https://www.googleapis.com/auth/calendar.events")).toBe(false);
    expect(hasRequiredScope("openid email")).toBe(false);
  });
});

describe("events written to Google", () => {
  const due = new Date("2026-11-20T06:30:00Z");
  const source = { entityType: "APPROVAL_TASK" as const, entityId: 9, ref: "PR-0042", title: "Buy 3 servers for ₹9,00,000", path: "/users/requests/42", when: { kind: "timed" as const, start: due, end: new Date(due.getTime() + 1_800_000) } };
  it("carry the reference and a link, never the title or amounts by default; private", () => {
    const event = businessEvent(source, DEFAULT_CONFIG, "https://approval.test/");
    expect(event.body.summary).toBe("Approval due: PR-0042");
    expect(event.body.description).toBe("Open in ARS Approvals: https://approval.test/users/requests/42");
    expect(JSON.stringify(event.body)).not.toMatch(/servers|9,00,000/);
    expect(event.body.visibility).toBe("private");
    expect(event.body.extendedProperties?.private).toEqual({ ars: "1", arsType: "APPROVAL_TASK", arsId: "9" });
  });
  it("{title} is the Super Admin's explicit choice; templates are one line", () => {
    expect(renderTemplate("{kind}\n{title}", { kind: "Task due", ref: "T-1", title: "Fix", link: "l" }, true)).toBe("Task due Fix");
  });
  it("all-day dates use Google's exclusive end; the hash changes only with content", () => {
    const allDay = businessEvent({ ...source, when: { kind: "allDay", startDate: "2026-12-31", endDate: "2026-12-31" } }, DEFAULT_CONFIG, "https://a");
    expect(allDay.body.start).toEqual({ date: "2026-12-31" });
    expect(allDay.body.end).toEqual({ date: "2027-01-01" });
    expect(contentHash(allDay.body)).toBe(contentHash({ ...allDay.body }));
    expect(contentHash(allDay.body)).not.toBe(contentHash({ ...allDay.body, summary: "x" }));
  });
  it("event ids are fixed per record and valid for Google (base32hex)", () => {
    const id = eventIdFor(1, "TASK", 5, 0);
    expect(id).toMatch(/^[0-9a-v]{5,1024}$/);
    expect(eventIdFor(1, "TASK", 5, 0)).toBe(id);
    expect(eventIdFor(1, "TASK", 5, 1)).not.toBe(id);
    expect(eventIdFor(2, "TASK", 5, 0)).not.toBe(id);
  });
  it("personal entries keep their own text; entries from Google aren't re-marked", () => {
    const item = { id: 3, title: "Gym", notes: null, allDay: false, startsAt: due, endsAt: null, startDate: null, endDate: null, origin: "GOOGLE" as const, version: 2 };
    const event = itemEvent(item, "Asia/Kolkata")!;
    expect(event.body.summary).toBe("Gym");
    expect(event.body.extendedProperties).toBeUndefined();
    expect(event.body.end).toEqual({ dateTime: new Date(due.getTime() + 1_800_000).toISOString(), timeZone: "Asia/Kolkata" });
    expect(event.arsVersion).toBe(2);
  });
});

describe("events read from Google", () => {
  it("timed events keep the instant (time zones and DST carried by the offset)", () => {
    const fields = itemFromGoogle({ id: "a", summary: "Call", start: { dateTime: "2026-03-08T09:00:00-05:00" }, end: { dateTime: "2026-03-08T10:00:00-04:00" } })!;
    expect(fields.startsAt!.toISOString()).toBe("2026-03-08T14:00:00.000Z");
    expect(fields.endsAt!.toISOString()).toBe("2026-03-08T14:00:00.000Z");
  });
  it("all-day ends become inclusive; repeating events are marked; empty titles get a placeholder", () => {
    expect(itemFromGoogle({ id: "b", start: { date: "2026-12-25" }, end: { date: "2026-12-27" }, recurrence: ["RRULE:FREQ=YEARLY"] })).toMatchObject({ allDay: true, startDate: "2026-12-25", endDate: "2026-12-26", recurring: true, title: "(No title)" });
    expect(itemFromGoogle({ id: "c" })).toBeNull();
  });
});

describe("retries and conflicts", () => {
  it("backs off exponentially with jitter, capped at 6 hours", () => {
    expect(backoffSeconds(1, 0)).toBe(60);
    expect(backoffSeconds(4, 0)).toBe(480);
    expect(backoffSeconds(30, 0)).toBe(21_600);
    expect(backoffSeconds(1, 0.99)).toBe(89);
  });
  it("decides by policy; latest needs Google's time; manual otherwise", () => {
    const arsAt = new Date("2026-01-01T10:00:00Z");
    expect(decideConflict("LATEST", { arsAt, googleAt: new Date("2026-01-01T11:00:00Z") })).toBe("GOOGLE");
    expect(decideConflict("LATEST", { arsAt, googleAt: new Date("2026-01-01T09:00:00Z") })).toBe("ARS");
    expect(decideConflict("LATEST", { arsAt, googleAt: null })).toBe("MANUAL");
    expect(decideConflict("MANUAL", { arsAt, googleAt: null })).toBe("MANUAL");
    expect(decideConflict("ARS_WINS", { arsAt, googleAt: null })).toBe("ARS");
  });
});

describe("calendar views", () => {
  const now = new Date("2026-10-16T06:00:00Z");
  it("month (and older ?month= links), week from Monday, day", () => {
    expect(parseView({ month: "2031-03" }, now)).toMatchObject({ view: "month", anchor: "2031-03-01", from: "2031-03-01", to: "2031-03-31", prev: "2031-02-01", next: "2031-04-01" });
    expect(weekStart("2026-10-16")).toBe("2026-10-12");
    expect(parseView({ view: "week", date: "2026-10-16" }, now)).toMatchObject({ from: "2026-10-12", to: "2026-10-18", prev: "2026-10-05" });
    expect(parseView({ view: "day", date: "bad" }, now)).toMatchObject({ anchor: "2026-10-16", days: ["2026-10-16"] });
  });
  it("filters by kind and keeps them in links", () => {
    const state = parseView({ k: "task,personal,nonsense" }, now);
    expect(state.kinds).toEqual(["task", "personal"]);
    expect(viewHref(state, { view: "day" }, "2026-10-16")).toBe("/users/calendar?view=day&date=2026-10-16&k=task%2Cpersonal");
    expect(daysCovered("2026-10-10", "2026-10-14", "2026-10-12", "2026-10-31")).toEqual(["2026-10-12", "2026-10-13", "2026-10-14"]);
  });
  it("information types are off the calendar unless marked (old settings still read)", () => {
    expect(parseInfoSettings({ ...parseInfoSettings(null), calendar: undefined }).calendar).toBe(false);
  });
});
