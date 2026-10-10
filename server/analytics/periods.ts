// Reporting periods in India time (D-122). Pure. A request belongs to a
// period by the India date it was raised; decisions by the India date they
// were made. Every period has an equally long previous period to compare.
export type PeriodKey = "7d" | "30d" | "90d" | "this_month" | "last_month" | "this_quarter" | "this_fy" | "last_fy" | "custom";

export interface Period {
  key: PeriodKey;
  label: string;
  from: string; // YYYY-MM-DD inclusive, India date
  to: string; // YYYY-MM-DD inclusive
}

export const PERIOD_LABEL: Record<PeriodKey, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  this_month: "This month",
  last_month: "Last month",
  this_quarter: "This quarter",
  this_fy: "This financial year",
  last_fy: "Last financial year",
  custom: "Custom",
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (iso: string, days: number) => toIso(new Date(toDate(iso).getTime() + days * 86_400_000));
export const daysBetween = (from: string, to: string) => Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000) + 1;

// Today's India date for a moment in time.
export function indiaToday(now: Date): string {
  return toIso(new Date(now.getTime() + 330 * 60_000));
}

function fyStart(today: string): number {
  const [year, month] = today.split("-").map(Number) as [number, number];
  return month >= 4 ? year : year - 1;
}

export function resolvePeriod(input: { key?: string; from?: string; to?: string }, today: string): Period {
  const key = (input.key && input.key in PERIOD_LABEL ? input.key : "30d") as PeriodKey;
  const [year, month] = today.split("-").map(Number) as [number, number];
  const monthStart = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}-01`;
  switch (key) {
    case "7d":
      return { key, label: PERIOD_LABEL[key], from: addDays(today, -6), to: today };
    case "90d":
      return { key, label: PERIOD_LABEL[key], from: addDays(today, -89), to: today };
    case "this_month":
      return { key, label: PERIOD_LABEL[key], from: monthStart(year, month), to: today };
    case "last_month": {
      const start = month === 1 ? monthStart(year - 1, 12) : monthStart(year, month - 1);
      return { key, label: PERIOD_LABEL[key], from: start, to: addDays(monthStart(year, month), -1) };
    }
    case "this_quarter": {
      // Financial quarters: Apr–Jun, Jul–Sep, Oct–Dec, Jan–Mar.
      const quarterStartMonth = [1, 4, 7, 10].filter((m) => m <= month).pop()!;
      return { key, label: PERIOD_LABEL[key], from: monthStart(year, quarterStartMonth), to: today };
    }
    case "this_fy":
      return { key, label: PERIOD_LABEL[key], from: `${fyStart(today)}-04-01`, to: today };
    case "last_fy":
      return { key, label: PERIOD_LABEL[key], from: `${fyStart(today) - 1}-04-01`, to: `${fyStart(today)}-03-31` };
    case "custom": {
      const from = input.from && ISO.test(input.from) ? input.from : addDays(today, -29);
      let to = input.to && ISO.test(input.to) ? input.to : today;
      if (to < from) to = from;
      // At most two years in one view.
      if (daysBetween(from, to) > 731) to = addDays(from, 730);
      return { key, label: `${from} to ${to}`, from, to };
    }
    default:
      return { key: "30d", label: PERIOD_LABEL["30d"], from: addDays(today, -29), to: today };
  }
}

// The equally long period just before.
export function previousPeriod(period: Period): Period {
  const length = daysBetween(period.from, period.to);
  const to = addDays(period.from, -1);
  return { key: "custom", label: "Previous period", from: addDays(to, -(length - 1)), to };
}

// Chart buckets: days up to 45 days, weeks (Monday start) up to 26 weeks,
// months beyond.
export type Grain = "day" | "week" | "month";

export function grainFor(period: Period): Grain {
  const days = daysBetween(period.from, period.to);
  return days <= 45 ? "day" : days <= 182 ? "week" : "month";
}

export function bucketKey(isoDate: string, grain: Grain): string {
  if (grain === "day") return isoDate;
  if (grain === "month") return isoDate.slice(0, 7);
  const date = toDate(isoDate);
  const weekday = (date.getUTCDay() + 6) % 7; // Monday = 0
  return toIso(new Date(date.getTime() - weekday * 86_400_000));
}

export function buckets(period: Period, grain: Grain): string[] {
  const out: string[] = [];
  let cursor = period.from;
  while (cursor <= period.to) {
    const key = bucketKey(cursor, grain);
    if (out[out.length - 1] !== key) out.push(key);
    cursor = addDays(cursor, 1);
  }
  return out;
}

export function bucketLabel(key: string, grain: Grain): string {
  if (grain === "month") return new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" });
}

// v1.7.0 (B04): what to compare with.
// - PREVIOUS: the period just before. For this month, the same days of the
//   previous calendar month (1st to the same date, shortened in a short
//   month); for last month, the whole month before. Otherwise as long, just before.
// - LAST_YEAR: the same dates a year earlier (29 Feb becomes 28 Feb).
export type CompareMode = "PREVIOUS" | "LAST_YEAR";

const minusYear = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number) as [number, number, number];
  const last = new Date(Date.UTC(year - 1, month, 0)).getUTCDate();
  return `${year - 1}-${String(month).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
};

export function comparisonPeriod(period: Period, mode: CompareMode): Period {
  if (mode === "LAST_YEAR") return { key: "custom", label: "Same period last year", from: minusYear(period.from), to: minusYear(period.to) };
  if (period.key === "this_month" || period.key === "last_month") {
    const [year, month] = period.from.split("-").map(Number) as [number, number];
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevLast = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
    const start = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
    const day = period.key === "last_month" ? prevLast : Math.min(Number(period.to.slice(8)), prevLast);
    return { key: "custom", label: "Previous month", from: start, to: `${start.slice(0, 8)}${String(day).padStart(2, "0")}` };
  }
  return previousPeriod(period);
}
