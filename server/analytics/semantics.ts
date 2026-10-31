// Analytics semantics (unified prompt Addendum A §7, D-122). Pure and
// unit-tested; every dashboard, report and alert uses these definitions.
//
// - Pending: a task is PENDING on a request that is IN_PROGRESS (the engine
//   decides what is outstanding; Any-One / N-of-M groups only create the tasks
//   the engine needs, and closes the rest as NOT_REQUIRED).
// - Overdue: a pending task whose due time (step response time in working
//   hours, F-31/F-82, shifted by time on hold) has passed. Steps without a
//   response time are never overdue.
// - Paused: the request is ON_HOLD (a question to the requester or a hold).
// - Awaiting requester: the request is CHANGES_REQUIRED.
// - Blocked / unassigned: a step the engine marked BLOCKED.
// - Stuck: see server/ops/stuck.ts (no activity for general.stuck_idle_days).
// - Terminal: APPROVED, REJECTED or CANCELLED (withdrawn).

export type RequestState = "IN_PROGRESS" | "ON_HOLD" | "CHANGES_REQUIRED" | "APPROVED" | "REJECTED" | "CANCELLED";

// ---- aging ---------------------------------------------------------------------
// Elapsed calendar time (not working time). Buckets follow the prompt's
// proposed scheme; they are a display choice, not a business rule.
export const AGING_BUCKETS = [
  { key: "lt1d", label: "Under 24 hours", maxHours: 24 },
  { key: "1to2d", label: "1–2 days", maxHours: 48 },
  { key: "3to7d", label: "3–7 days", maxHours: 7 * 24 },
  { key: "8to14d", label: "8–14 days", maxHours: 14 * 24 },
  { key: "15to30d", label: "15–30 days", maxHours: 30 * 24 },
  { key: "gt30d", label: "Over 30 days", maxHours: Number.POSITIVE_INFINITY },
] as const;
export type AgingKey = (typeof AGING_BUCKETS)[number]["key"];

export function agingBucket(hours: number): AgingKey {
  const safe = Math.max(0, hours);
  return AGING_BUCKETS.find((bucket) => safe < bucket.maxHours)!.key;
}

export function countByBucket(hoursList: readonly number[]): Record<AgingKey, number> {
  const out = Object.fromEntries(AGING_BUCKETS.map((bucket) => [bucket.key, 0])) as Record<AgingKey, number>;
  for (const hours of hoursList) out[agingBucket(hours)] += 1;
  return out;
}

// ---- SLA ---------------------------------------------------------------------
export type SlaStatus = "WITHIN" | "APPROACHING" | "BREACHED" | "PAUSED" | "COMPLETED_WITHIN" | "COMPLETED_AFTER" | "NOT_CONFIGURED";

export const SLA_LABEL: Record<SlaStatus, string> = {
  WITHIN: "Within response time",
  APPROACHING: "Approaching response time",
  BREACHED: "Response time passed",
  PAUSED: "Paused (on hold)",
  COMPLETED_WITHIN: "Decided in time",
  COMPLETED_AFTER: "Decided late",
  NOT_CONFIGURED: "No response time set",
};

// "Approaching" = at least this share of the response time used. 75 % is
// the platform's existing due-soon rule (F-91, D-112), not a new policy.
export const APPROACHING_SHARE = 0.75;

export function slaStatus(task: { createdAt: Date; dueAt: Date | null; decidedAt: Date | null; paused?: boolean }, now: Date, approachingShare = APPROACHING_SHARE): SlaStatus {
  if (!task.dueAt) return "NOT_CONFIGURED";
  if (task.decidedAt) return task.decidedAt.getTime() <= task.dueAt.getTime() ? "COMPLETED_WITHIN" : "COMPLETED_AFTER";
  if (task.paused) return "PAUSED";
  if (now.getTime() > task.dueAt.getTime()) return "BREACHED";
  const total = task.dueAt.getTime() - task.createdAt.getTime();
  const used = now.getTime() - task.createdAt.getTime();
  return total > 0 && used / total >= approachingShare ? "APPROACHING" : "WITHIN";
}

// ---- statistics ----------------------------------------------------------------
export function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function percentile(values: readonly number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[rank]!;
}

// Change against the previous period. null when there is nothing to compare
// with (a previous value of 0 has no meaningful percentage).
export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function share(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}
