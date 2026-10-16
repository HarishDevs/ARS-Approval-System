import crypto from "node:crypto";
import type { CalendarConfig } from "@/server/calendar/config";
import type { EventBody, GoogleEvent } from "@/server/integrations/google-calendar/client";

// v1.11.0 (D-153): what ARS writes to Google and how a Google event becomes
// an ARS calendar entry. Pure, unit-tested.
//
// Privacy (brief §6): business events carry the reference (request, task or
// information number) and a link back, never amounts, form contents or
// descriptions. {title} in a template is the Super Admin's explicit choice.

export type EntityType = "APPROVAL_TASK" | "REQUEST" | "TASK" | "INFO" | "ITEM";

export const KIND_LABEL: Record<Exclude<EntityType, "ITEM">, string> = {
  APPROVAL_TASK: "Approval due",
  REQUEST: "Needed by",
  TASK: "Task due",
  INFO: "Information",
};

export type When = { kind: "timed"; start: Date; end: Date } | { kind: "allDay"; startDate: string; endDate: string }; // endDate inclusive

export interface BusinessSource {
  entityType: Exclude<EntityType, "ITEM">;
  entityId: number;
  ref: string;
  title: string;
  path: string;
  when: When;
}

export interface ItemSource {
  id: number;
  title: string;
  notes: string | null;
  allDay: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  startDate: string | null;
  endDate: string | null;
  origin: "ARS" | "GOOGLE";
  version: number;
}

export interface DesiredEvent {
  entityType: EntityType;
  entityId: number;
  body: EventBody;
  hash: string;
  arsVersion: number | null;
}

const MARK = "ars"; // extendedProperties.private key: written by ARS

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function times(when: When, timezone: string): Pick<EventBody, "start" | "end"> {
  if (when.kind === "allDay") return { start: { date: when.startDate }, end: { date: addDays(when.endDate, 1) } }; // Google's end date is exclusive
  return { start: { dateTime: when.start.toISOString(), timeZone: timezone }, end: { dateTime: when.end.toISOString(), timeZone: timezone } };
}

export function renderTemplate(template: string, values: { kind: string; ref: string; title: string; link: string }, oneLine: boolean): string {
  const text = template.replace(/\{(kind|ref|title|link)\}/g, (_match, key: keyof typeof values) => values[key]);
  return (oneLine ? text.replace(/\s+/g, " ") : text).trim();
}

// Stable JSON (sorted keys) so the same content always hashes the same.
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function contentHash(body: Partial<EventBody>): string {
  const { summary, description, start, end, visibility, status } = body;
  return crypto.createHash("sha256").update(stable({ summary, description, start, end, visibility, status })).digest("hex");
}

export function businessEvent(source: BusinessSource, config: CalendarConfig, baseUrl: string): DesiredEvent {
  const values = { kind: KIND_LABEL[source.entityType], ref: source.ref, title: source.title, link: `${baseUrl.replace(/\/$/, "")}${source.path}` };
  const body: EventBody = {
    summary: renderTemplate(config.titleTemplate, values, true).slice(0, 250),
    description: renderTemplate(config.descriptionTemplate, values, false).slice(0, 2000),
    ...times(source.when, config.timezone),
    ...(config.privacy === "PRIVATE" ? { visibility: "private" } : {}),
    status: "confirmed",
    reminders: { useDefault: true },
    extendedProperties: { private: { [MARK]: "1", arsType: source.entityType, arsId: String(source.entityId) } },
  };
  return { entityType: source.entityType, entityId: source.entityId, body, hash: contentHash(body), arsVersion: null };
}

export function itemWhen(item: Pick<ItemSource, "allDay" | "startsAt" | "endsAt" | "startDate" | "endDate">): When | null {
  if (item.allDay && item.startDate) return { kind: "allDay", startDate: item.startDate, endDate: item.endDate ?? item.startDate };
  if (!item.allDay && item.startsAt) return { kind: "timed", start: item.startsAt, end: item.endsAt ?? new Date(item.startsAt.getTime() + 30 * 60_000) };
  return null;
}

// A personal entry: its own title and notes (it is the person's own data,
// in their own calendar). Entries that came from Google aren't re-marked.
export function itemEvent(item: ItemSource, timezone: string): DesiredEvent | null {
  const when = itemWhen(item);
  if (!when) return null;
  const body: EventBody = {
    summary: item.title,
    description: item.notes ?? "",
    ...times(when, timezone),
    status: "confirmed",
    ...(item.origin === "ARS" ? { extendedProperties: { private: { [MARK]: "1", arsType: "ITEM", arsId: String(item.id) } } } : {}),
  };
  return { entityType: "ITEM", entityId: item.id, body, hash: contentHash(body), arsVersion: item.version };
}

// Google lets the caller choose the event id (base32hex: 0-9 and a-v). A
// fixed id per record makes a retried insert hit "already exists" instead of
// making a second event (idempotency, brief §5).
export function eventIdFor(connectionId: number, entityType: EntityType, entityId: number, generation: number): string {
  return `ars${crypto.createHash("sha256").update(`${connectionId}:${entityType}:${entityId}:${generation}`).digest("hex").slice(0, 40)}`;
}

export function isArsEvent(event: GoogleEvent): boolean {
  return event.extendedProperties?.private?.[MARK] === "1";
}

export interface ItemFields {
  title: string;
  notes: string | null;
  allDay: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  startDate: string | null;
  endDate: string | null;
  recurring: boolean;
}

// A Google event as an ARS calendar entry. All-day: Google's end date is
// exclusive, ARS keeps it inclusive. Timed: stored as UTC instants, so time
// zones and daylight-saving changes are carried by the instant itself.
// A repeating event is kept as one entry (its first occurrence) and marked.
export function itemFromGoogle(event: GoogleEvent): ItemFields | null {
  const title = (event.summary ?? "").trim().slice(0, 200) || "(No title)";
  const notes = event.description ? event.description.slice(0, 2000) : null;
  const recurring = Boolean(event.recurrence?.length);
  if (event.start?.date) {
    const endExclusive = event.end?.date ?? addDays(event.start.date, 1);
    const endDate = addDays(endExclusive, -1) < event.start.date ? event.start.date : addDays(endExclusive, -1);
    return { title, notes, allDay: true, startsAt: null, endsAt: null, startDate: event.start.date, endDate, recurring };
  }
  if (event.start?.dateTime) {
    const startsAt = new Date(event.start.dateTime);
    const endsAt = event.end?.dateTime ? new Date(event.end.dateTime) : null;
    if (Number.isNaN(startsAt.getTime())) return null;
    return { title, notes, allDay: false, startsAt, endsAt: endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt : null, startDate: null, endDate: null, recurring };
  }
  return null;
}

export function sameItem(a: ItemFields, b: ItemFields): boolean {
  const time = (value: Date | null) => value?.getTime() ?? null;
  return a.title === b.title && (a.notes ?? "") === (b.notes ?? "") && a.allDay === b.allDay && time(a.startsAt) === time(b.startsAt) && time(a.endsAt) === time(b.endsAt) && a.startDate === b.startDate && a.endDate === b.endDate;
}

// Retry with exponential backoff and jitter: 1, 2, 4, 8 … minutes, at most 6 h.
export function backoffSeconds(attempt: number, random: number = Math.random()): number {
  return Math.min(60 * 2 ** Math.max(0, attempt - 1), 21_600) + Math.floor(random * 30);
}

// Who wins when a personal entry changed in both places since the last sync.
export function decideConflict(policy: CalendarConfig["conflictPolicy"], changed: { arsAt: Date; googleAt: Date | null }): "ARS" | "GOOGLE" | "MANUAL" {
  if (policy === "ARS_WINS") return "ARS";
  if (policy === "GOOGLE_WINS") return "GOOGLE";
  if (policy === "LATEST" && changed.googleAt) return changed.googleAt.getTime() > changed.arsAt.getTime() ? "GOOGLE" : "ARS";
  return "MANUAL";
}

// The title and times of a version, for the conflict review (nothing more).
export function summaryOf(fields: Pick<ItemFields, "title" | "allDay" | "startsAt" | "endsAt" | "startDate" | "endDate">): { title: string; allDay: boolean; start: string | null; end: string | null } {
  return {
    title: fields.title,
    allDay: fields.allDay,
    start: fields.allDay ? fields.startDate : (fields.startsAt?.toISOString() ?? null),
    end: fields.allDay ? fields.endDate : (fields.endsAt?.toISOString() ?? null),
  };
}
