import "server-only";
import { loadNeededBy } from "@/server/approvals/calendar";
import { itemsInRange, linkStates } from "@/lib/db/repositories/gcal.repository";
import { businessSources, indiaDate } from "@/server/calendar/sources";
import { daysCovered, type Kind, type ViewState } from "@/server/calendar/views";

// v1.11.0 (D-155): everything on one person's calendar for a period. Each
// source already limits itself to what the person may open; personal
// entries are only ever their own.
export interface CalendarEntry {
  key: string;
  kind: Kind;
  title: string;
  ref: string | null;
  href: string;
  day: string;
  time: string | null; // "14:30" India time, or null for all-day
  source: "ARS" | "GOOGLE";
  sync: "synced" | "pending" | "error" | "conflict" | null;
  recurring: boolean;
}

const indiaTime = (value: Date) => new Date(value.getTime() + 330 * 60_000).toISOString().slice(11, 16);

export async function loadEntries(user: { id: number; roles: readonly string[] }, state: ViewState, connected: boolean): Promise<CalendarEntry[]> {
  const wants = (kind: Kind) => state.kinds.includes(kind);
  const links = connected ? await linkStates(user.id) : new Map();
  const syncOf = (type: string, id: number): CalendarEntry["sync"] => {
    if (!connected) return null;
    const link = links.get(`${type}:${id}`);
    if (!link) return "pending";
    if (link.conflict) return "conflict";
    if (link.error) return "error";
    if (link.state !== "ACTIVE") return null;
    return link.synced ? "synced" : "pending";
  };
  const out: CalendarEntry[] = [];

  if (wants("needed")) {
    const months = [...new Set([state.from.slice(0, 7), state.to.slice(0, 7)])];
    const seen = new Set<number>();
    for (const month of months) {
      for (const item of await loadNeededBy({ id: user.id, roles: user.roles as never }, month, { mine: !state.showAll })) {
        if (seen.has(item.id) || item.date < state.from || item.date > state.to) continue;
        seen.add(item.id);
        out.push({ key: `REQUEST:${item.id}`, kind: "needed", title: item.title, ref: item.requestNo, href: `/users/requests/${item.id}`, day: item.date, time: null, source: "ARS", sync: syncOf("REQUEST", item.id), recurring: false });
      }
    }
  }

  const sources = await businessSources(user, { from: state.from, to: state.to }, { approvalDue: wants("approval"), neededBy: false, taskDue: wants("task"), infoEvents: wants("info") });
  for (const source of sources) {
    const kind: Kind = source.entityType === "APPROVAL_TASK" ? "approval" : source.entityType === "TASK" ? "task" : "info";
    const day = source.when.kind === "allDay" ? source.when.startDate : indiaDate(source.when.start);
    const time = source.when.kind === "timed" ? indiaTime(source.when.start) : null;
    out.push({ key: `${source.entityType}:${source.entityId}`, kind, title: source.title, ref: source.ref, href: source.path, day, time, source: "ARS", sync: syncOf(source.entityType, source.entityId), recurring: false });
  }

  if (wants("personal")) {
    for (const item of await itemsInRange(user.id, state.from, state.to)) {
      const days = item.allDay ? daysCovered(item.startDate!, item.endDate ?? item.startDate!, state.from, state.to) : [indiaDate(item.startsAt!)];
      for (const day of days) {
        out.push({
          key: `ITEM:${item.id}:${day}`,
          kind: "personal",
          title: item.title,
          ref: null,
          href: `/users/calendar/items/${item.id}`,
          day,
          time: item.allDay ? null : indiaTime(item.startsAt!),
          source: item.origin,
          sync: syncOf("ITEM", item.id),
          recurring: item.recurring,
        });
      }
    }
  }
  return out.sort((a, b) => (a.day === b.day ? (a.time ?? "").localeCompare(b.time ?? "") : a.day.localeCompare(b.day)));
}
