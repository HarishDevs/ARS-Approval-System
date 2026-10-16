// v1.12.0 (D-156): the Analytics Center. One Analytics page with dashboard
// views (tabs), not separate navigation items. Pure rules: the boards, the
// configurable age buckets, safe rates, and the explainable alert rules.
export const BOARDS = [
  { key: "overview", label: "Executive overview", what: "Approvals, tasks and information side by side, with the previous period." },
  { key: "approvals", label: "Approval analytics", what: "Volume, outcomes, turnaround, response times, steps, approvers and aging." },
  { key: "tasks", label: "Task analytics", what: "Task volume, delivery against due dates, backlog and aging, priorities." },
  { key: "information", label: "Information analytics", what: "Publishing, reading and acknowledgement of information." },
  { key: "employees", label: "Employee analytics", what: "Each person's approval, task and information workload, kept separate." },
  { key: "departments", label: "Department analytics", what: "Each department's workload, completion and backlog by module." },
  { key: "sla", label: "SLA & performance", what: "Approval response times and task due-date performance." },
  { key: "trends", label: "Trends & forecasts", what: "Twelve months by module, and period-on-period change." },
  { key: "quality", label: "Data quality", what: "Records with missing or inconsistent data, to fix at the source." },
] as const;
export type BoardKey = (typeof BOARDS)[number]["key"];

export function parseBoard(value: string | undefined): BoardKey {
  return (BOARDS.find((board) => board.key === value)?.key ?? "overview") as BoardKey;
}

// Age buckets are a setting (analytics.aging_days, e.g. "1,3,7,14"), not
// hard-coded: "under 1 day, 1–3 days, 4–7 days, 8–14 days, over 14 days".
export interface AgeBucket {
  key: string;
  label: string;
  maxHours: number | null; // null = no upper limit
}

export const DEFAULT_AGING_DAYS = "1,3,7,14";

export function agingBuckets(setting: string | null | undefined): AgeBucket[] {
  const days = [...new Set((setting ?? DEFAULT_AGING_DAYS).split(",").map((part) => Number(part.trim())).filter((value) => Number.isInteger(value) && value > 0 && value <= 365))].sort((a, b) => a - b).slice(0, 6);
  const edges = days.length ? days : [1, 3, 7, 14];
  const buckets: AgeBucket[] = [];
  let previous = 0;
  for (const edge of edges) {
    buckets.push({ key: `le${edge}`, label: previous === 0 ? `Under ${edge} day${edge === 1 ? "" : "s"}` : `${previous + 1}–${edge} days`, maxHours: edge * 24 });
    previous = edge;
  }
  buckets.push({ key: `gt${previous}`, label: `Over ${previous} days`, maxHours: null });
  return buckets;
}

export function bucketOf(hours: number, buckets: readonly AgeBucket[]): string {
  return (buckets.find((bucket) => bucket.maxHours === null || hours < bucket.maxHours) ?? buckets[buckets.length - 1]!).key;
}

export function countBuckets(hours: readonly number[], buckets: readonly AgeBucket[]): Record<string, number> {
  const counts = Object.fromEntries(buckets.map((bucket) => [bucket.key, 0])) as Record<string, number>;
  for (const value of hours) counts[bucketOf(value, buckets)]! += 1;
  return counts;
}

// A rate never divides by zero: no denominator → unavailable (null).
export function rate(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

export function medianOf(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

// 90th percentile only with enough values to mean something (≥ 10).
export function p90Of(values: readonly number[]): number | null {
  if (values.length < 10) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(0.9 * sorted.length) - 1)]!;
}

export function averageOf(values: readonly number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

// Executive alerts (brief §3.3): fixed, explainable rules on numbers shown on
// the page. No predictions.
export const ALERT_RULES = {
  completionDropPoints: 10, // a completion rate falling by 10 points or more on the previous period
  overdueRiseShare: 0.25, // overdue items created in the period up by 25 % or more (and at least 5)
  minCount: 5,
  lowAckRate: 50, // information published 7+ days ago with under 50 % acknowledged
  ackAgeDays: 7,
  departmentLoadMultiple: 2, // a department with open work at least twice the department median (and 10+)
  departmentMinOpen: 10,
} as const;

export interface Alert {
  key: string;
  tone: "warning" | "danger";
  text: string;
  rule: string;
}

export interface AlertInput {
  module: "Approvals" | "Tasks";
  completionRate: number | null;
  previousCompletionRate: number | null;
  lateCount: number;
  previousLateCount: number;
}

export function moduleAlerts(input: AlertInput): Alert[] {
  const out: Alert[] = [];
  if (input.completionRate !== null && input.previousCompletionRate !== null && input.previousCompletionRate - input.completionRate >= ALERT_RULES.completionDropPoints) {
    out.push({
      key: `${input.module}-completion`,
      tone: "warning",
      text: `${input.module}: completion rate fell from ${input.previousCompletionRate}% to ${input.completionRate}%.`,
      rule: `Falls by ${ALERT_RULES.completionDropPoints} points or more against the comparison period.`,
    });
  }
  if (input.lateCount >= ALERT_RULES.minCount && input.lateCount >= input.previousLateCount * (1 + ALERT_RULES.overdueRiseShare)) {
    out.push({
      key: `${input.module}-late`,
      tone: "danger",
      text: `${input.module}: ${input.lateCount} went past their due time in this period (${input.previousLateCount} in the comparison period).`,
      rule: `At least ${ALERT_RULES.minCount}, and up ${Math.round(ALERT_RULES.overdueRiseShare * 100)}% or more.`,
    });
  }
  return out;
}

export function departmentAlerts(rows: readonly { name: string; open: number }[]): Alert[] {
  const median = medianOf(rows.map((row) => row.open));
  if (median === null) return [];
  return rows
    .filter((row) => row.open >= ALERT_RULES.departmentMinOpen && row.open >= median * ALERT_RULES.departmentLoadMultiple && median > 0)
    .map((row) => ({
      key: `dept-${row.name}`,
      tone: "warning" as const,
      text: `${row.name} has ${row.open} open items, ${Math.round((row.open / median) * 10) / 10}× the department median (${median}).`,
      rule: `At least ${ALERT_RULES.departmentMinOpen} open and ${ALERT_RULES.departmentLoadMultiple}× the median of all departments.`,
    }));
}

// The last N calendar months (India), oldest first: "2026-05".
export function lastMonths(today: string, count: number): string[] {
  const [year, month] = today.split("-").map(Number) as [number, number];
  const out: string[] = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(Date.UTC(year, month - 1 - index, 1));
    out.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export const monthLabel = (key: string) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });

// Forecasts only with enough history (brief §9). Twelve months of data are
// needed; until then the page says so instead of guessing.
export const FORECAST_MIN_MONTHS = 12;

export function forecastNext(series: readonly number[]): { value: number; low: number; high: number } | null {
  const history = series.slice(-FORECAST_MIN_MONTHS);
  if (history.length < FORECAST_MIN_MONTHS || history.filter((value) => value > 0).length < FORECAST_MIN_MONTHS - 2) return null;
  // Least-squares line over the last 12 months; the range is ± the average
  // absolute miss of that line (labelled as an estimate on the page).
  const n = history.length;
  const xs = history.map((_, index) => index);
  const meanX = averageOf(xs)!;
  const meanY = averageOf(history)!;
  const slope = xs.reduce((sum, x, index) => sum + (x - meanX) * (history[index]! - meanY), 0) / xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0);
  const at = (x: number) => meanY + slope * (x - meanX);
  const miss = averageOf(history.map((value, index) => Math.abs(value - at(index))))!;
  const value = Math.max(0, Math.round(at(n)));
  return { value, low: Math.max(0, Math.round(at(n) - miss)), high: Math.round(at(n) + miss) };
}
