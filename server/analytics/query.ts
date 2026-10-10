import type { AnalyticsFilter, PendingSla, RequestStatusFilter } from "@/lib/db/repositories/analytics.repository";
import { AGING_BUCKETS, type AgingKey } from "@/server/analytics/semantics";
import type { CompareMode, Period } from "@/server/analytics/periods";
import type { Scope } from "@/server/analytics/scope";

// v1.7.0 (B01, B02): one reading of the Analytics filters from the address,
// shared by the dashboard and its drill-down list, so a click carries
// exactly the filters the number was worked out with. Nothing here widens
// what the viewer may see: every filter only narrows their scope.
const STATUSES: readonly RequestStatusFilter[] = ["IN_PROGRESS", "ON_HOLD", "CHANGES_REQUIRED", "APPROVED", "REJECTED", "CANCELLED"];
const SLAS: readonly PendingSla[] = ["WITHIN", "APPROACHING", "BREACHED", "PAUSED", "NOT_CONFIGURED"];

export const STATUS_FILTER_LABEL: Record<RequestStatusFilter, string> = {
  IN_PROGRESS: "In progress",
  ON_HOLD: "On hold",
  CHANGES_REQUIRED: "Changes required",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Withdrawn",
};
export const SLA_FILTER_LABEL: Record<PendingSla, string> = {
  WITHIN: "A task within its response time",
  APPROACHING: "A task approaching its response time",
  BREACHED: "A task past its response time",
  PAUSED: "A task paused (on hold)",
  NOT_CONFIGURED: "A task with no response time",
};

export interface ReadFilter {
  filter: AnalyticsFilter;
  compare: CompareMode;
  carried: Record<string, string>; // the filters, as address parameters
}

export function readFilter(
  query: Record<string, string | undefined>,
  context: { scope: Scope; period: Period; typeIds: readonly number[]; departmentIds: readonly number[] },
): ReadFilter {
  const workflowId = query.type === "-1" ? -1 : context.typeIds.some((id) => String(id) === query.type) ? Number(query.type) : null;
  const departmentId = context.scope.kind === "ORGANISATION" && context.departmentIds.some((id) => String(id) === query.department) ? Number(query.department) : null;
  const status = STATUSES.includes(query.status as RequestStatusFilter) ? (query.status as RequestStatusFilter) : null;
  const approverId = /^\d{1,10}$/.test(query.approver ?? "") ? Number(query.approver) : null;
  const step = query.step && query.step.length <= 200 ? query.step : null;
  const sla = SLAS.includes(query.sla as PendingSla) ? (query.sla as PendingSla) : null;
  const aging = AGING_BUCKETS.some((bucket) => bucket.key === query.aging) ? (query.aging as AgingKey) : null;
  const compare: CompareMode = query.compare === "LAST_YEAR" ? "LAST_YEAR" : "PREVIOUS";
  const carried: Record<string, string> = { scope: context.scope.kind, period: context.period.key };
  if (context.period.key === "custom") Object.assign(carried, { from: context.period.from, to: context.period.to });
  const add = (key: string, value: string | number | null) => {
    if (value !== null && value !== "") carried[key] = String(value);
  };
  add("type", workflowId);
  add("department", departmentId);
  add("status", status);
  add("approver", approverId);
  add("step", step);
  add("sla", sla);
  add("aging", aging);
  if (compare === "LAST_YEAR") carried.compare = compare;
  return { filter: { period: context.period, workflowId, departmentId, status, approverId, step, sla, aging }, compare, carried };
}

// An address with the carried filters and some changes (null removes one).
export function withParams(path: string, carried: Record<string, string>, changes: Record<string, string | null> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...carried, ...changes })) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `${path}?${text}` : path;
}
