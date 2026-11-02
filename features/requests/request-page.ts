// v1.49 request page layout (owner, 2 Nov 2026): the small pure rules the
// request page's cards use. No React, no server imports, unit-tested in
// tests/ui/request-page.test.ts.

// ---------------------------------------------------------------- Timeline
// Owner: "Timeline should show last 3 in a desc order; if they click show
// more it should show the rest as a scroll bar".
export const TIMELINE_VISIBLE = 3;

export interface TimelineItem {
  id: number;
  at: Date;
}

/** Newest first; the same moment falls back to the later event id first. */
export function newestFirst<T extends TimelineItem>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => b.at.getTime() - a.at.getTime() || b.id - a.id);
}

/** The latest `visible` events (newest first) and the older rest, still newest first. */
export function splitTimeline<T extends TimelineItem>(entries: readonly T[], visible = TIMELINE_VISIBLE): { shown: T[]; rest: T[] } {
  const ordered = newestFirst(entries);
  const count = Math.max(0, Math.floor(visible));
  return { shown: ordered.slice(0, count), rest: ordered.slice(count) };
}

// ------------------------------------------------------------------ Times
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * India time written out by hand (server and browser print the same text):
 * "01 Nov, 10:30 pm", or with the year "01 Nov 2026, 10:30 pm".
 */
export function indiaDateTime(iso: string | Date | null | undefined, withYear = false): string | null {
  if (!iso) return null;
  const ms = typeof iso === "string" ? Date.parse(iso) : iso.getTime();
  if (!Number.isFinite(ms)) return null;
  const ist = new Date(ms + 330 * 60_000);
  const hours = ist.getUTCHours();
  const day = `${String(ist.getUTCDate()).padStart(2, "0")} ${MONTHS[ist.getUTCMonth()]}${withYear ? ` ${ist.getUTCFullYear()}` : ""}`;
  return `${day}, ${hours % 12 || 12}:${String(ist.getUTCMinutes()).padStart(2, "0")} ${hours < 12 ? "am" : "pm"}`;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * How long a request has been (or was) in process: "17 hrs 28 mins",
 * "2 days 3 hrs", "5 mins". Until `toIso` when closed, else until `now`.
 */
export function timeInProcess(fromIso: string | null | undefined, toIso: string | null | undefined, now: number): string | null {
  if (!fromIso) return null;
  const from = Date.parse(fromIso);
  const to = toIso ? Date.parse(toIso) : now;
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  const minutes = Math.max(0, Math.round((to - from) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${plural(days, "day")}${hours ? ` ${plural(hours, "hr")}` : ""}`;
  if (hours > 0) return `${plural(hours, "hr")}${mins ? ` ${plural(mins, "min")}` : ""}`;
  return plural(mins, "min");
}

// ------------------------------------------------------- Approval figures
export type RequestStatusCode = "IN_PROGRESS" | "ON_HOLD" | "CHANGES_REQUIRED" | "APPROVED" | "REJECTED" | "CANCELLED";
const CLOSED: readonly string[] = ["APPROVED", "REJECTED", "CANCELLED"];

export interface ProcessFigures {
  percent: number;
  done: number;
  total: number;
  remaining: number | null; // null once the request is closed
  startIso: string | null;
  endIso: string | null; // when it closed (null while open)
  lastUpdateIso: string | null;
}

/**
 * The stat tiles under "Approval levels": the journey's road counts levels
 * when it loaded, else the tracker's step counts. Times come from the
 * request's own history (raised on, last event; the last event is the close
 * for a closed request).
 */
export function processFigures(input: {
  status: string;
  road: { levelsDone: number; levels: number; percent: number } | null;
  tracker: { done: number; total: number };
  timeline: readonly TimelineItem[];
  raisedAt: string | null;
}): ProcessFigures {
  const closed = CLOSED.includes(input.status);
  const done = input.road ? input.road.levelsDone : input.tracker.done;
  const total = input.road ? input.road.levels : input.tracker.total;
  const percent = input.road
    ? input.road.percent
    : input.status === "APPROVED"
      ? 100
      : total > 0
        ? Math.min(99, Math.round((done / total) * 100))
        : 0;
  const ordered = newestFirst(input.timeline);
  const lastUpdateIso = ordered[0]?.at.toISOString() ?? null;
  const startIso = input.raisedAt ?? ordered.at(-1)?.at.toISOString() ?? null;
  return { percent, done, total, remaining: closed ? null : Math.max(0, total - done), startIso, endIso: closed ? lastUpdateIso : null, lastUpdateIso };
}

// ----------------------------------------------------- Detail row icons
export type FieldIconKind = "text" | "longText" | "number" | "money" | "date" | "link" | "person" | "department" | "priority" | "choice" | "check" | "file" | "table" | "lookup" | "calc" | "email" | "phone";

/** Which icon a form field's row gets on the Request details card. */
export function fieldIconKind(field: { type?: string | null; key: string; label: string }): FieldIconKind {
  const name = `${field.key} ${field.label}`.toLowerCase();
  if (field.key.toLowerCase() === "priority") return "priority";
  if (/\bdepartment|\bdept\b/.test(name)) return "department";
  if (/e-?mail/.test(name)) return "email";
  if (/phone|mobile|whatsapp/.test(name) && field.type !== "CHOICE") return "phone";
  switch (field.type) {
    case "CURRENCY":
      return "money";
    case "DATE":
    case "DATETIME":
      return "date";
    case "URL":
      return "link";
    case "PERSON":
      return "person";
    case "CHOICE":
    case "RADIO":
    case "MULTI_CHOICE":
      return "choice";
    case "CHECKBOX":
      return "check";
    case "ATTACHMENT":
      return "file";
    case "LINE_ITEMS":
      return "table";
    case "LOOKUP":
      return "lookup";
    case "CALC":
      return "calc";
    case "NUMBER":
      return /amount|cost|price|value|budget|rupee|inr|₹/.test(name) ? "money" : "number";
    case "LONG_TEXT":
      return "longText";
    default:
      if (/amount|cost|price|budget/.test(name)) return "money";
      if (/\bdate\b|\bdue\b/.test(name)) return "date";
      if (/\blink\b|\burl\b|website/.test(name)) return "link";
      return "text";
  }
}

// ---------------------------------------------------------- The banner
export type BannerKind = "waiting" | "hold" | "returned" | "approved" | "rejected" | "withdrawn" | "stuck" | "progress";

/** Which banner (icon and colour) the Approval levels card shows. */
export function bannerKind(status: string, trackerTone: string): BannerKind {
  switch (status) {
    case "APPROVED":
      return "approved";
    case "REJECTED":
      return "rejected";
    case "CANCELLED":
      return "withdrawn";
    case "ON_HOLD":
      return "hold";
    case "CHANGES_REQUIRED":
      return "returned";
    default:
      return trackerTone === "attention" ? "stuck" : trackerTone === "waiting" ? "waiting" : "progress";
  }
}
