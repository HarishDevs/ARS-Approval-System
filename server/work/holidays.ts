import { z } from "zod";
import { WEEKDAYS, type Weekday } from "@/server/workflows/calendar";

// D-217 (owner: "if any task falls on a holiday give a warning … they can
// keep it or change the date; make it configurable in Admin under Task
// management"). The holidays are the organisation's one list (Admin →
// Working calendar, also used for approval response times); these settings
// say what Tasks do with them. Pure and unit-tested.
export const HOLIDAY_MODES = ["WARN", "BLOCK", "OFF"] as const;
export type HolidayMode = (typeof HOLIDAY_MODES)[number];
export const HOLIDAY_MODE_LABEL: Record<HolidayMode, string> = {
  WARN: "Warn, and let people keep the date or move it",
  BLOCK: "Don't allow: people must choose a working day",
  OFF: "Ignore holidays for tasks",
};

export const holidaySettingsSchema = z.object({
  mode: z.enum(HOLIDAY_MODES).default("WARN"),
  weeklyOff: z.boolean().default(true), // weekly offs (e.g. Sunday) count as holidays too
  suggest: z.enum(["NEXT", "PREVIOUS"]).default("NEXT"), // the working day offered instead
  checkStart: z.boolean().default(true), // start dates are checked too
  holdReminders: z.boolean().default(true), // no due-soon/overdue reminders on a holiday; they go on the next working day
  showOnCalendars: z.boolean().default(true),
  notifyNewHoliday: z.boolean().default(true), // a new holiday tells people whose open tasks are due that day
});
export type HolidaySettings = z.infer<typeof holidaySettingsSchema>;
export const DEFAULT_HOLIDAY_SETTINGS: HolidaySettings = holidaySettingsSchema.parse({});
export const HOLIDAY_SETTINGS_KEY = "tasks.holidays";

export function parseHolidaySettings(raw: string | null | undefined): HolidaySettings {
  try {
    const parsed = holidaySettingsSchema.safeParse(raw ? JSON.parse(raw) : {});
    return parsed.success ? parsed.data : DEFAULT_HOLIDAY_SETTINGS;
  } catch {
    return DEFAULT_HOLIDAY_SETTINGS;
  }
}

export interface HolidayCalendar {
  holidays: ReadonlyMap<string, string>; // YYYY-MM-DD (India) → name
  workingDays: ReadonlySet<Weekday>;
  // v1.54.5 (owner): the assignee's Out of office days (YYYY-MM-DD → "Out of office until …").
  away?: ReadonlyMap<string, string>;
}

const weekday = (day: string) => WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]!;
const shift = (day: string, by: number) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + by);
  return date.toISOString().slice(0, 10);
};

// Why a day is not a working day for tasks (null: it is one).
export function holidayName(day: string, calendar: HolidayCalendar, settings: HolidaySettings): string | null {
  const named = calendar.holidays.get(day);
  if (named) return named;
  const away = calendar.away?.get(day);
  if (away) return away;
  if (settings.weeklyOff && calendar.workingDays.size > 0 && !calendar.workingDays.has(weekday(day))) return `Weekly off (${weekday(day).charAt(0)}${weekday(day).slice(1).toLowerCase()})`;
  return null;
}

// The nearest working day in the chosen direction (the day itself if it is one).
export function nearestWorkingDay(day: string, calendar: HolidayCalendar, settings: HolidaySettings, direction: "NEXT" | "PREVIOUS" = settings.suggest): string {
  let current = day;
  for (let guard = 0; guard < 366 && holidayName(current, calendar, settings) !== null; guard += 1) current = shift(current, direction === "NEXT" ? 1 : -1);
  return current;
}

export interface HolidayHit {
  day: string;
  name: string;
  suggestion: string;
  mode: Exclude<HolidayMode, "OFF">;
  field: "due" | "start";
  away?: boolean; // v1.54.5: the assignee is out of office that day (always a warning)
}

// What a chosen date runs into. `keep` = the person chose to keep it anyway
// (only allowed when the mode is WARN).
export function checkHoliday(day: string | null, field: "due" | "start", calendar: HolidayCalendar, settings: HolidaySettings, keep: boolean): HolidayHit | null {
  if (!day) return null;
  // v1.54.5 (owner: "a new task on an out of office date shows a warning, like
  // the approval"): the assignee being away is always a warning (keep or move
  // to the next free day), whatever the holiday setting.
  const away = !calendar.holidays.has(day) && Boolean(calendar.away?.has(day));
  if (away) {
    if (keep || field === "start") return null;
    return { day, name: calendar.away!.get(day)!, suggestion: nearestWorkingDay(day, calendar, settings, "NEXT"), mode: "WARN", field, away: true };
  }
  if (settings.mode === "OFF" || (field === "start" && !settings.checkStart)) return null;
  const name = holidayName(day, calendar, settings);
  if (!name) return null;
  if (keep && settings.mode === "WARN") return null;
  return { day, name, suggestion: nearestWorkingDay(day, calendar, settings), mode: settings.mode, field };
}

export function holidayMessage(hit: HolidayHit): string {
  const what = hit.field === "due" ? "The due date" : "The start date";
  if (hit.away) return `${what} ${hit.day} falls while the person is away (${hit.name}). Keep it anyway, or move it to ${hit.suggestion}.`;
  return hit.mode === "BLOCK"
    ? `${what} ${hit.day} is a holiday (${hit.name}). Choose a working day, such as ${hit.suggestion}.`
    : `${what} ${hit.day} is a holiday (${hit.name}). Keep it anyway, or move it to ${hit.suggestion}.`;
}
