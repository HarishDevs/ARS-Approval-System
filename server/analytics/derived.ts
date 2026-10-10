import { median, share } from "@/server/analytics/semantics";
import { bucketKey, buckets, type Grain, type Period } from "@/server/analytics/periods";

// v1.7.0 list B: numbers worked out from rows, free of the database so the
// definitions can be tested (and match docs/ANALYTICS_METRIC_DICTIONARY.md).

export interface Quality {
  closed: number; // approved + rejected + withdrawn in the period
  medianCycleHours: number | null; // approved or rejected
  firstPassRate: number | null; // approved without any send-back, of all approved
  reworkRate: number | null; // decided requests sent back at least once, of approved + rejected
  withdrawalRate: number | null; // withdrawn, of everything closed
}

export function qualityFrom(rows: readonly { status: string; minutes: number | null; round: number; sends: number }[]): Quality {
  const decided = rows.filter((row) => row.status === "APPROVED" || row.status === "REJECTED");
  const approved = decided.filter((row) => row.status === "APPROVED");
  const withdrawn = rows.filter((row) => row.status === "CANCELLED");
  const closed = decided.length + withdrawn.length;
  const cycle = median(decided.map((row) => row.minutes).filter((value): value is number => value !== null && value >= 0));
  return {
    closed,
    medianCycleHours: cycle === null ? null : Math.round((cycle / 60) * 10) / 10,
    firstPassRate: share(approved.filter((row) => row.sends === 0 && row.round <= 1).length, approved.length),
    reworkRate: share(decided.filter((row) => row.sends > 0 || row.round > 1).length, decided.length),
    withdrawalRate: share(withdrawn.length, closed),
  };
}

export interface HistoryPoint {
  key: string;
  backlog: number; // open at the end of the bucket
  overdue: number; // tasks past their due time and not decided, at the end of the bucket
  breaches: number; // tasks whose due time passed in the bucket before a decision
  approved: number; // approval decisions in the bucket
  rejected: number;
  sentBack: number;
}

const DAY = 86_400_000;
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

// All times here are India-shifted instants (UTC fields read as India time).
export function historyFrom(input: {
  period: Period;
  grain: Grain;
  requests: readonly { submitted: Date; closed: Date | null }[];
  tasks: readonly { due: Date; decided: Date | null }[];
  decisions: readonly { day: string; status: string; total: number }[];
  now: Date;
}): HistoryPoint[] {
  const keys = buckets(input.period, input.grain);
  const points = new Map(keys.map((key) => [key, { key, backlog: 0, overdue: 0, breaches: 0, approved: 0, rejected: 0, sentBack: 0 }]));
  // The last day of each bucket inside the period: snapshots are taken at its end.
  const lastDay = new Map<string, string>();
  for (let day = new Date(`${input.period.from}T00:00:00Z`); isoDay(day) <= input.period.to; day = new Date(day.getTime() + DAY)) lastDay.set(bucketKey(isoDay(day), input.grain), isoDay(day));
  for (const [key, day] of lastDay) {
    const point = points.get(key)!;
    // A bucket still running is measured now, not at its future end.
    const at = Math.min(new Date(`${day}T23:59:59.999Z`).getTime(), input.now.getTime());
    point.backlog = input.requests.filter((row) => row.submitted.getTime() <= at && (!row.closed || row.closed.getTime() > at)).length;
    point.overdue = input.tasks.filter((row) => row.due.getTime() <= at && (!row.decided || row.decided.getTime() > at)).length;
  }
  for (const task of input.tasks) {
    if (task.decided && task.decided.getTime() <= task.due.getTime()) continue; // decided in time
    if (task.due.getTime() > input.now.getTime()) continue; // not passed yet
    const point = points.get(bucketKey(isoDay(task.due), input.grain));
    if (point && isoDay(task.due) >= input.period.from && isoDay(task.due) <= input.period.to) point.breaches += 1;
  }
  for (const row of input.decisions) {
    const point = points.get(bucketKey(row.day, input.grain));
    if (!point) continue;
    if (row.status === "APPROVED") point.approved += row.total;
    else if (row.status === "REJECTED") point.rejected += row.total;
    else if (row.status === "CHANGES_REQUESTED") point.sentBack += row.total;
  }
  return [...points.values()];
}

// B05 heatmap shading: five steps of one hue, by share of the largest cell.
export function heatStep(value: number, max: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (value <= 0 || max <= 0) return 0;
  return Math.min(5, Math.max(1, Math.ceil((value / max) * 5))) as 1 | 2 | 3 | 4 | 5;
}
