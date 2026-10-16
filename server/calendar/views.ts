import { addDays } from "@/server/calendar/events";
import { monthGrid, parseMonth, shiftMonth } from "@/server/approvals/calendar-rules";

// v1.11.0 (D-155): month, week and day views of the calendar page. Pure.
export type CalendarView = "month" | "week" | "day";
export const KINDS = ["approval", "task", "info", "needed", "personal"] as const;
export type Kind = (typeof KINDS)[number];
export const KIND_LABEL: Record<Kind, string> = { approval: "Approvals", task: "Tasks", info: "Information", needed: "Needed by", personal: "Personal" };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const indiaToday = (now: Date = new Date()) => new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);

// Monday of the week holding the date.
export function weekStart(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

export interface ViewState {
  view: CalendarView;
  anchor: string; // a date inside the period
  month: string; // YYYY-MM of the anchor
  from: string;
  to: string;
  days: string[];
  grid: (string | null)[][] | null;
  prev: string;
  next: string;
  kinds: Kind[];
  showAll: boolean;
}

export function parseView(query: Record<string, string | undefined>, now: Date = new Date()): ViewState {
  const view: CalendarView = query.view === "week" || query.view === "day" ? query.view : "month";
  const today = indiaToday(now);
  // ?month= (older links) or ?date=; else today.
  const anchor = query.date && ISO.test(query.date) && !Number.isNaN(Date.parse(query.date)) ? query.date : query.month ? `${parseMonth(query.month, now)}-01` : today;
  const month = anchor.slice(0, 7);
  const kinds = (query.k ?? "").split(",").filter((kind): kind is Kind => (KINDS as readonly string[]).includes(kind));
  const base = { view, anchor, month, kinds: kinds.length ? kinds : [...KINDS], showAll: query.show === "all" };
  if (view === "day") return { ...base, from: anchor, to: anchor, days: [anchor], grid: null, prev: addDays(anchor, -1), next: addDays(anchor, 1) };
  if (view === "week") {
    const start = weekStart(anchor);
    const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
    return { ...base, from: start, to: days[6]!, days, grid: null, prev: addDays(start, -7), next: addDays(start, 7) };
  }
  const grid = monthGrid(month);
  const days = grid.flat().filter((day): day is string => day !== null);
  return { ...base, from: days[0]!, to: days[days.length - 1]!, days, grid, prev: `${shiftMonth(month, -1)}-01`, next: `${shiftMonth(month, 1)}-01` };
}

export function viewHref(state: Pick<ViewState, "view" | "kinds" | "showAll">, change: { view?: CalendarView; date?: string; kinds?: Kind[]; showAll?: boolean }, anchor: string): string {
  const query = new URLSearchParams();
  const view = change.view ?? state.view;
  if (view !== "month") query.set("view", view);
  query.set("date", change.date ?? anchor);
  const kinds = change.kinds ?? state.kinds;
  if (kinds.length && kinds.length < KINDS.length) query.set("k", kinds.join(","));
  if (change.showAll ?? state.showAll) query.set("show", "all");
  return `/users/calendar?${query.toString()}`;
}

export function periodTitle(state: Pick<ViewState, "view" | "anchor" | "from" | "to">): string {
  const fmt = (date: string, options: Intl.DateTimeFormatOptions) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { ...options, timeZone: "UTC" });
  if (state.view === "month") return fmt(state.anchor, { month: "long", year: "numeric" });
  if (state.view === "day") return fmt(state.anchor, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return `${fmt(state.from, { day: "numeric", month: "short" })} – ${fmt(state.to, { day: "numeric", month: "short", year: "numeric" })}`;
}

// The days an entry covers inside the period (multi-day all-day entries).
export function daysCovered(start: string, end: string, from: string, to: string): string[] {
  const out: string[] = [];
  for (let day = start < from ? from : start; day <= end && day <= to && out.length < 42; day = addDays(day, 1)) out.push(day);
  return out;
}
