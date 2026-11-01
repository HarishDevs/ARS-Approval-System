// D-265 (owner's My Work / Approval Overview briefs): the reporting periods
// on Home. Days are India days; `to` is exclusive. The previous period is the
// same length just before, for "vs last …" comparisons.
import { addDays } from "@/server/work/rules";

export const PERIODS = ["today", "week", "month", "30d", "90d", "custom"] as const;
export type PeriodKey = (typeof PERIODS)[number];
export const PERIOD_LABEL: Record<PeriodKey, string> = { today: "Today", week: "This week", month: "This month", "30d": "Last 30 days", "90d": "Last 90 days", custom: "Custom period" };
export const PREVIOUS_LABEL: Record<PeriodKey, string> = {
  today: "vs yesterday",
  week: "vs last week",
  month: "vs last month",
  "30d": "vs the 30 days before",
  "90d": "vs the 90 days before",
  custom: "vs the period before",
};

export interface Period {
  key: PeriodKey;
  label: string;
  fromDay: string; // first India day (YYYY-MM-DD)
  toDay: string; // last India day, inclusive
  from: Date;
  to: Date; // exclusive
  prevFrom: Date;
  prevTo: Date;
  days: number;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const start = (day: string) => new Date(`${day}T00:00:00+05:30`);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

// Monday of the India week that holds `day`.
export function mondayOf(day: string): string {
  const weekday = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday
  return addDays(day, -weekday);
}

export function parsePeriod(raw: { period?: string; from?: string; to?: string }, today: string, fallback: PeriodKey = "week"): Period {
  let key: PeriodKey = (PERIODS as readonly string[]).includes(String(raw.period)) ? (raw.period as PeriodKey) : fallback;
  let fromDay: string;
  let toDay = today;
  if (key === "today") fromDay = today;
  else if (key === "week") {
    fromDay = mondayOf(today);
    toDay = addDays(fromDay, 6);
  } else if (key === "month") fromDay = `${today.slice(0, 8)}01`;
  else if (key === "30d") fromDay = addDays(today, -29);
  else if (key === "90d") fromDay = addDays(today, -89);
  else if (raw.from && raw.to && DAY.test(raw.from) && DAY.test(raw.to) && raw.from <= raw.to && daysBetween(raw.from, raw.to) <= 366) {
    fromDay = raw.from;
    toDay = raw.to;
  } else {
    key = "week";
    fromDay = mondayOf(today);
    toDay = addDays(fromDay, 6);
  }
  if (key === "month") {
    const [year, month] = today.split("-").map(Number) as [number, number];
    toDay = addDays(month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`, -1);
  }
  const days = daysBetween(fromDay, toDay) + 1;
  const prevFromDay =
    key === "month"
      ? (() => {
          const [year, month] = fromDay.split("-").map(Number) as [number, number];
          return month === 1 ? `${year - 1}-12-01` : `${year}-${String(month - 1).padStart(2, "0")}-01`;
        })()
      : addDays(fromDay, -days);
  return { key, label: PERIOD_LABEL[key], fromDay, toDay, from: start(fromDay), to: start(addDays(toDay, 1)), prevFrom: start(prevFromDay), prevTo: start(fromDay), days };
}

// The change against the previous period, as a whole percentage (null when
// there was nothing before to compare with).
export function changePercent(now: number, before: number): number | null {
  if (before === 0) return null;
  return Math.round(((now - before) / before) * 100);
}
