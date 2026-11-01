import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import { requestScopeSql, taskScopeSql, type Scope, type Viewer } from "@/server/analytics/scope";
import { AGING_BUCKETS, APPROACHING_SHARE, type AgingKey, type SlaStatus, agingBucket } from "@/server/analytics/semantics";
import { bucketKey, buckets, grainFor, type Grain, type Period } from "@/server/analytics/periods";

// Role analytics queries (Addendum A, D-122). Every query is scoped on the
// server (server/analytics/scope.ts), never counts deleted requests, and
// follows the definitions in server/analytics/semantics.ts and the metric
// dictionary (server/analytics/metrics.ts).
export interface AnalyticsFilter {
  period: Period;
  workflowId: number | null; // -1 = custom approvals
  departmentId: number | null; // raiser's department (organisation scope only)
  // v1.7.0 (B02): narrow to requests with this status, a task held or decided
  // by this person, a task at this step, a pending task in this response-time
  // state, or open requests of this age. Each is a condition on the request.
  status?: RequestStatusFilter | null;
  approverId?: number | null;
  step?: string | null;
  sla?: PendingSla | null;
  aging?: AgingKey | null;
}

export type RequestStatusFilter = "IN_PROGRESS" | "ON_HOLD" | "CHANGES_REQUIRED" | "APPROVED" | "REJECTED" | "CANCELLED";
export type PendingSla = "WITHIN" | "APPROACHING" | "BREACHED" | "PAUSED" | "NOT_CONFIGURED";

const n = (value: unknown) => Number(value ?? 0);
const orNull = (value: unknown) => (value === null || value === undefined ? null : Number(value));
const INDIA_DATE = (column: string) => `DATE(DATE_ADD(${column}, INTERVAL 330 MINUTE))`;
const OPEN = "('IN_PROGRESS', 'ON_HOLD', 'CHANGES_REQUIRED')";

const JOINS = `FROM approval_requests r
  JOIN workflow_versions v ON v.id = r.workflow_version_id
  JOIN workflow_definitions w ON w.id = v.workflow_id
  JOIN users rq ON rq.id = r.requester_id`;

export function where(scope: Scope, viewer: Viewer, filter: AnalyticsFilter, level: "request" | "task" | "pending" = "request"): { sql: string; params: unknown[] } {
  const scoped = level === "request" ? requestScopeSql(scope, viewer) : taskScopeSql(scope, viewer, level === "pending");
  const parts = ["r.deleted_at IS NULL", scoped.sql];
  const params = [...scoped.params];
  if (filter.workflowId === -1) parts.push("w.kind = 'CUSTOM'");
  else if (filter.workflowId !== null) {
    parts.push("w.id = ?");
    params.push(filter.workflowId);
  }
  if (filter.departmentId !== null && scope.kind === "ORGANISATION") {
    parts.push("rq.department_id = ?");
    params.push(filter.departmentId);
  }
  if (filter.status) {
    parts.push("r.status = ?");
    params.push(filter.status);
  }
  if (filter.approverId) {
    parts.push("EXISTS (SELECT 1 FROM approval_tasks fa WHERE fa.request_id = r.id AND (fa.approver_id = ? OR fa.decided_by = ?))");
    params.push(filter.approverId, filter.approverId);
  }
  if (filter.step) {
    parts.push("EXISTS (SELECT 1 FROM approval_tasks fs WHERE fs.request_id = r.id AND fs.node_label = ?)");
    params.push(filter.step);
  }
  if (filter.sla) {
    parts.push(`EXISTS (SELECT 1 FROM approval_tasks fx WHERE fx.request_id = r.id AND fx.status = 'PENDING' AND fx.task_type = 'APPROVAL' AND ${SLA_SQL[filter.sla]})`);
    if (filter.sla === "APPROACHING" || filter.sla === "WITHIN") params.push(APPROACHING_SHARE);
  }
  if (filter.aging) {
    const index = AGING_BUCKETS.findIndex((bucket) => bucket.key === filter.aging);
    const min = index > 0 ? AGING_BUCKETS[index - 1]!.maxHours : 0;
    const max = AGING_BUCKETS[index]!.maxHours;
    parts.push(`r.status IN ${OPEN} AND TIMESTAMPDIFF(MINUTE, r.submitted_at, CURRENT_TIMESTAMP) >= ?${Number.isFinite(max) ? " AND TIMESTAMPDIFF(MINUTE, r.submitted_at, CURRENT_TIMESTAMP) < ?" : ""}`);
    params.push(min * 60, ...(Number.isFinite(max) ? [max * 60] : []));
  }
  return { sql: parts.join(" AND "), params };
}

// B02: a pending task's response-time state, as in loadSla / slaStatus().
const SLA_SQL: Record<PendingSla, string> = {
  NOT_CONFIGURED: "fx.due_at IS NULL",
  PAUSED: "fx.due_at IS NOT NULL AND r.status = 'ON_HOLD'",
  BREACHED: "fx.due_at IS NOT NULL AND r.status = 'IN_PROGRESS' AND fx.due_at < CURRENT_TIMESTAMP",
  APPROACHING:
    "fx.due_at IS NOT NULL AND r.status = 'IN_PROGRESS' AND fx.due_at >= CURRENT_TIMESTAMP AND TIMESTAMPDIFF(SECOND, fx.created_at, CURRENT_TIMESTAMP) >= ? * TIMESTAMPDIFF(SECOND, fx.created_at, fx.due_at)",
  WITHIN:
    "fx.due_at IS NOT NULL AND r.status = 'IN_PROGRESS' AND fx.due_at >= CURRENT_TIMESTAMP AND TIMESTAMPDIFF(SECOND, fx.created_at, CURRENT_TIMESTAMP) < ? * TIMESTAMPDIFF(SECOND, fx.created_at, fx.due_at)",
};

export interface Kpis {
  raised: number;
  approved: number;
  rejected: number;
  withdrawn: number;
  approvalRate: number | null;
  avgCycleHours: number | null;
  decisions: number;
  avgDecisionHours: number | null;
  onTimeDecisions: number;
  timedDecisions: number;
  sentBack: number;
  amendments: number;
  duplicateOverrides: number;
  budgetWarnings: number;
}

// Period numbers (raised by submitted date; outcomes by closed date;
// decisions by decided date).
export async function loadKpis(scope: Scope, viewer: Viewer, filter: AnalyticsFilter, period: Period = filter.period, db: Queryable = getDbPool()): Promise<Kpis> {
  const w = where(scope, viewer, filter);
  const [[raised]] = await db.query<RowDataPacket[]>(`SELECT COUNT(*) AS n ${JOINS} WHERE ${w.sql} AND ${INDIA_DATE("r.submitted_at")} BETWEEN ? AND ?`, [...w.params, period.from, period.to]);
  const [[closed]] = await db.query<RowDataPacket[]>(
    `SELECT SUM(r.status = 'APPROVED') AS approved, SUM(r.status = 'REJECTED') AS rejected, SUM(r.status = 'CANCELLED') AS withdrawn,
            AVG(CASE WHEN r.status IN ('APPROVED', 'REJECTED') THEN TIMESTAMPDIFF(MINUTE, r.submitted_at, r.closed_at) / 60 END) AS avg_cycle
     ${JOINS} WHERE ${w.sql} AND r.closed_at IS NOT NULL AND ${INDIA_DATE("r.closed_at")} BETWEEN ? AND ?`,
    [...w.params, period.from, period.to],
  );
  const t = where(scope, viewer, filter, "task");
  const [[decided]] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS decisions, AVG(TIMESTAMPDIFF(MINUTE, t.created_at, t.decided_at)) / 60 AS avg_hours,
            SUM(t.due_at IS NOT NULL AND t.decided_at <= t.due_at) AS on_time, SUM(t.due_at IS NOT NULL) AS timed,
            SUM(t.status = 'CHANGES_REQUESTED') AS sent_back
     FROM approval_tasks t JOIN approval_requests r ON r.id = t.request_id
     JOIN workflow_versions v ON v.id = r.workflow_version_id JOIN workflow_definitions w ON w.id = v.workflow_id JOIN users rq ON rq.id = r.requester_id
     WHERE ${t.sql} AND t.task_type = 'APPROVAL' AND t.status IN ('APPROVED', 'REJECTED', 'CHANGES_REQUESTED') AND t.decided_at IS NOT NULL
       AND ${INDIA_DATE("t.decided_at")} BETWEEN ? AND ?`,
    [...t.params, period.from, period.to],
  );
  const [[extras]] = await db.query<RowDataPacket[]>(
    `SELECT
       (SELECT COUNT(*) FROM request_amendments a JOIN approval_requests r ON r.id = a.amendment_id JOIN workflow_versions v ON v.id = r.workflow_version_id JOIN workflow_definitions w ON w.id = v.workflow_id JOIN users rq ON rq.id = r.requester_id
         WHERE ${w.sql} AND ${INDIA_DATE("a.created_at")} BETWEEN ? AND ?) AS amendments,
       (SELECT COUNT(*) FROM request_submission_checks c JOIN approval_requests r ON r.id = c.request_id JOIN workflow_versions v ON v.id = r.workflow_version_id JOIN workflow_definitions w ON w.id = v.workflow_id JOIN users rq ON rq.id = r.requester_id
         WHERE ${w.sql} AND c.override_reason IS NOT NULL AND ${INDIA_DATE("c.created_at")} BETWEEN ? AND ?) AS overrides,
       (SELECT COUNT(*) FROM request_submission_checks c JOIN approval_requests r ON r.id = c.request_id JOIN workflow_versions v ON v.id = r.workflow_version_id JOIN workflow_definitions w ON w.id = v.workflow_id JOIN users rq ON rq.id = r.requester_id
         WHERE ${w.sql} AND c.budget_state IN ('WARN', 'OVER') AND ${INDIA_DATE("c.created_at")} BETWEEN ? AND ?) AS budget_warnings`,
    [...w.params, period.from, period.to, ...w.params, period.from, period.to, ...w.params, period.from, period.to],
  );
  const approved = n(closed?.approved);
  const rejected = n(closed?.rejected);
  return {
    raised: n(raised?.n),
    approved,
    rejected,
    withdrawn: n(closed?.withdrawn),
    approvalRate: approved + rejected > 0 ? Math.round((approved / (approved + rejected)) * 1000) / 10 : null,
    avgCycleHours: orNull(closed?.avg_cycle),
    decisions: n(decided?.decisions),
    avgDecisionHours: orNull(decided?.avg_hours),
    onTimeDecisions: n(decided?.on_time),
    timedDecisions: n(decided?.timed),
    sentBack: n(decided?.sent_back),
    amendments: n(extras?.amendments),
    duplicateOverrides: n(extras?.overrides),
    budgetWarnings: n(extras?.budget_warnings),
  };
}

export interface NowCounts {
  openRequests: number;
  pendingRequests: number; // unique requests with a pending task, IN_PROGRESS
  pendingTasks: number; // individual outstanding assignments
  overdueRequests: number;
  overdueTasks: number;
  paused: number; // ON_HOLD
  awaitingRequester: number; // CHANGES_REQUIRED
  blocked: number; // a step BLOCKED
}

// The position right now (not period-bound).
export async function loadNow(scope: Scope, viewer: Viewer, filter: AnalyticsFilter, db: Queryable = getDbPool()): Promise<NowCounts> {
  const w = where(scope, viewer, filter);
  const [[requests]] = await db.query<RowDataPacket[]>(
    `SELECT SUM(r.status IN ${OPEN}) AS open_n, SUM(r.status = 'ON_HOLD') AS paused, SUM(r.status = 'CHANGES_REQUIRED') AS awaiting,
            SUM(r.status = 'IN_PROGRESS' AND JSON_SEARCH(r.state_json, 'one', 'BLOCKED', NULL, '$.nodes.*.status') IS NOT NULL) AS blocked
     ${JOINS} WHERE ${w.sql}`,
    w.params,
  );
  const t = where(scope, viewer, filter, "pending");
  const [[tasks]] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS pending_tasks, COUNT(DISTINCT t.request_id) AS pending_requests,
            SUM(t.due_at < CURRENT_TIMESTAMP) AS overdue_tasks, COUNT(DISTINCT CASE WHEN t.due_at < CURRENT_TIMESTAMP THEN t.request_id END) AS overdue_requests
     FROM approval_tasks t JOIN approval_requests r ON r.id = t.request_id
     JOIN workflow_versions v ON v.id = r.workflow_version_id JOIN workflow_definitions w ON w.id = v.workflow_id JOIN users rq ON rq.id = r.requester_id
     WHERE ${t.sql} AND t.status = 'PENDING' AND r.status = 'IN_PROGRESS'`,
    t.params,
  );
  return {
    openRequests: n(requests?.open_n),
    pendingRequests: n(tasks?.pending_requests),
    pendingTasks: n(tasks?.pending_tasks),
    overdueRequests: n(tasks?.overdue_requests),
    overdueTasks: n(tasks?.overdue_tasks),
    paused: n(requests?.paused),
    awaitingRequester: n(requests?.awaiting),
    blocked: n(requests?.blocked),
  };
}

export interface TrendPoint {
  key: string;
  raised: number;
  approved: number;
  rejected: number;
}

export async function loadTrend(scope: Scope, viewer: Viewer, filter: AnalyticsFilter, db: Queryable = getDbPool()): Promise<{ grain: Grain; points: TrendPoint[] }> {
  const grain = grainFor(filter.period);
  const w = where(scope, viewer, filter);
  const [raisedRows] = await db.query<(RowDataPacket & { day: string; n: number })[]>(
    `SELECT DATE_FORMAT(${INDIA_DATE("r.submitted_at")}, '%Y-%m-%d') AS day, COUNT(*) AS n ${JOINS} WHERE ${w.sql} AND ${INDIA_DATE("r.submitted_at")} BETWEEN ? AND ? GROUP BY day`,
    [...w.params, filter.period.from, filter.period.to],
  );
  const [closedRows] = await db.query<(RowDataPacket & { day: string; approved: number; rejected: number })[]>(
    `SELECT DATE_FORMAT(${INDIA_DATE("r.closed_at")}, '%Y-%m-%d') AS day, SUM(r.status = 'APPROVED') AS approved, SUM(r.status = 'REJECTED') AS rejected
     ${JOINS} WHERE ${w.sql} AND r.closed_at IS NOT NULL AND ${INDIA_DATE("r.closed_at")} BETWEEN ? AND ? GROUP BY day`,
    [...w.params, filter.period.from, filter.period.to],
  );
  const points = new Map(buckets(filter.period, grain).map((key) => [key, { key, raised: 0, approved: 0, rejected: 0 }]));
  for (const row of raisedRows) {
    const point = points.get(bucketKey(row.day, grain));
    if (point) point.raised += n(row.n);
  }
  for (const row of closedRows) {
    const point = points.get(bucketKey(row.day, grain));
    if (point) {
      point.approved += n(row.approved);
      point.rejected += n(row.rejected);
    }
  }
  return { grain, points: [...points.values()] };
}

export interface Aging {
  sinceSubmission: Record<AgingKey, number>; // open requests, age since raised
  atCurrentStep: Record<AgingKey, number>; // pending tasks, age since assigned
}

export async function loadAging(scope: Scope, viewer: Viewer, filter: AnalyticsFilter, db: Queryable = getDbPool()): Promise<Aging> {
  const empty = () => ({ lt1d: 0, "1to2d": 0, "3to7d": 0, "8to14d": 0, "15to30d": 0, gt30d: 0 }) as Record<AgingKey, number>;
  const w = where(scope, viewer, filter);
  const [requests] = await db.query<(RowDataPacket & { hours: number })[]>(`SELECT TIMESTAMPDIFF(MINUTE, r.submitted_at, CURRENT_TIMESTAMP) / 60 AS hours ${JOINS} WHERE ${w.sql} AND r.status IN ${OPEN}`, w.params);
  const t = where(scope, viewer, filter, "pending");
  const [tasks] = await db.query<(RowDataPacket & { hours: number })[]>(
    `SELECT TIMESTAMPDIFF(MINUTE, t.created_at, CURRENT_TIMESTAMP) / 60 AS hours FROM approval_tasks t JOIN approval_requests r ON r.id = t.request_id
     JOIN workflow_versions v ON v.id = r.workflow_version_id JOIN workflow_definitions w ON w.id = v.workflow_id JOIN users rq ON rq.id = r.requester_id
     WHERE ${t.sql} AND t.status = 'PENDING' AND r.status IN ('IN_PROGRESS', 'ON_HOLD')`,
    t.params,
  );
  const out: Aging = { sinceSubmission: empty(), atCurrentStep: empty() };
  for (const row of requests) out.sinceSubmission[agingBucket(n(row.hours))] += 1;
  for (const row of tasks) out.atCurrentStep[agingBucket(n(row.hours))] += 1;
  return out;
}

// SLA status of pending tasks now, and of tasks decided in the period. The
// SQL mirrors slaStatus() in server/analytics/semantics.ts.
export async function loadSla(scope: Scope, viewer: Viewer, filter: AnalyticsFilter, db: Queryable = getDbPool()): Promise<Record<SlaStatus, number>> {
  const t = where(scope, viewer, filter, "task");
  const [rows] = await db.query<(RowDataPacket & { status: SlaStatus; n: number })[]>(
    `SELECT CASE
        WHEN t.due_at IS NULL THEN 'NOT_CONFIGURED'
        WHEN t.status <> 'PENDING' THEN IF(t.decided_at <= t.due_at, 'COMPLETED_WITHIN', 'COMPLETED_AFTER')
        WHEN r.status = 'ON_HOLD' THEN 'PAUSED'
        WHEN t.due_at < CURRENT_TIMESTAMP THEN 'BREACHED'
        WHEN TIMESTAMPDIFF(SECOND, t.created_at, CURRENT_TIMESTAMP) >= ? * TIMESTAMPDIFF(SECOND, t.created_at, t.due_at) THEN 'APPROACHING'
        ELSE 'WITHIN' END AS status, COUNT(*) AS n
     FROM approval_tasks t JOIN approval_requests r ON r.id = t.request_id
     JOIN workflow_versions v ON v.id = r.workflow_version_id JOIN workflow_definitions w ON w.id = v.workflow_id JOIN users rq ON rq.id = r.requester_id
     WHERE ${t.sql} AND t.task_type = 'APPROVAL'
       AND ((t.status = 'PENDING' AND r.status IN ('IN_PROGRESS', 'ON_HOLD'))
         OR (t.status IN ('APPROVED', 'REJECTED', 'CHANGES_REQUESTED') AND t.decided_at IS NOT NULL AND ${INDIA_DATE("t.decided_at")} BETWEEN ? AND ?))
     GROUP BY status`,
    [APPROACHING_SHARE, ...t.params, filter.period.from, filter.period.to],
  );
  const out = { WITHIN: 0, APPROACHING: 0, BREACHED: 0, PAUSED: 0, COMPLETED_WITHIN: 0, COMPLETED_AFTER: 0, NOT_CONFIGURED: 0 } as Record<SlaStatus, number>;
  for (const row of rows) out[row.status] = n(row.n);
  return out;
}

export interface BreakdownRow {
  id: number | null;
  name: string;
  raised: number;
  approved: number;
  rejected: number;
  open: number;
  avgCycleHours: number | null;
}

// Requests raised in the period, by approval type or by raiser's department.
export async function loadBreakdown(by: "type" | "department", scope: Scope, viewer: Viewer, filter: AnalyticsFilter, db: Queryable = getDbPool()): Promise<BreakdownRow[]> {
  const w = where(scope, viewer, filter);
  const group = by === "type" ? "w.id, w.name" : "d.id, d.name";
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT ${by === "type" ? "w.id, w.name" : "d.id, COALESCE(d.name, 'No department') AS name"}, COUNT(*) AS raised,
            SUM(r.status = 'APPROVED') AS approved, SUM(r.status = 'REJECTED') AS rejected, SUM(r.status IN ${OPEN}) AS open_n,
            AVG(CASE WHEN r.status IN ('APPROVED', 'REJECTED') THEN TIMESTAMPDIFF(MINUTE, r.submitted_at, r.closed_at) / 60 END) AS avg_cycle
     ${JOINS} LEFT JOIN departments d ON d.id = rq.department_id
     WHERE ${w.sql} AND ${INDIA_DATE("r.submitted_at")} BETWEEN ? AND ?
     GROUP BY ${group} ORDER BY raised DESC LIMIT 25`,
    [...w.params, filter.period.from, filter.period.to],
  );
  return rows.map((row) => ({ id: orNull(row.id), name: String(row.name), raised: n(row.raised), approved: n(row.approved), rejected: n(row.rejected), open: n(row.open_n), avgCycleHours: orNull(row.avg_cycle) }));
}

export interface StepRow {
  workflow: string;
  step: string;
  pending: number;
  decisions: number;
  avgDecisionHours: number | null;
  onTimePercent: number | null;
}

// Bottlenecks: where requests wait, and how long each step takes to decide.
export async function loadSteps(scope: Scope, viewer: Viewer, filter: AnalyticsFilter, db: Queryable = getDbPool()): Promise<StepRow[]> {
  const t = where(scope, viewer, filter, "task");
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT w.name AS workflow, t.node_label AS step,
            SUM(t.status = 'PENDING' AND r.status IN ('IN_PROGRESS', 'ON_HOLD')) AS pending,
            SUM(t.decided_at IS NOT NULL AND ${INDIA_DATE("t.decided_at")} BETWEEN ? AND ?) AS decisions,
            AVG(CASE WHEN t.decided_at IS NOT NULL AND ${INDIA_DATE("t.decided_at")} BETWEEN ? AND ? THEN TIMESTAMPDIFF(MINUTE, t.created_at, t.decided_at) / 60 END) AS avg_hours,
            SUM(t.decided_at IS NOT NULL AND t.due_at IS NOT NULL AND t.decided_at <= t.due_at AND ${INDIA_DATE("t.decided_at")} BETWEEN ? AND ?) AS on_time,
            SUM(t.decided_at IS NOT NULL AND t.due_at IS NOT NULL AND ${INDIA_DATE("t.decided_at")} BETWEEN ? AND ?) AS timed
     FROM approval_tasks t JOIN approval_requests r ON r.id = t.request_id
     JOIN workflow_versions v ON v.id = r.workflow_version_id JOIN workflow_definitions w ON w.id = v.workflow_id JOIN users rq ON rq.id = r.requester_id
     WHERE ${t.sql} AND t.task_type = 'APPROVAL' AND t.status IN ('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED')
     GROUP BY w.name, t.node_label HAVING pending > 0 OR decisions > 0
     ORDER BY pending DESC, avg_hours DESC LIMIT 25`,
    [filter.period.from, filter.period.to, filter.period.from, filter.period.to, filter.period.from, filter.period.to, filter.period.from, filter.period.to, ...t.params],
  );
  return rows.map((row) => ({
    workflow: String(row.workflow),
    step: String(row.step),
    pending: n(row.pending),
    decisions: n(row.decisions),
    avgDecisionHours: orNull(row.avg_hours),
    onTimePercent: n(row.timed) > 0 ? Math.round((n(row.on_time) / n(row.timed)) * 1000) / 10 : null,
  }));
}

export interface ApproverLoad {
  id: number;
  name: string;
  pending: number;
  overdue: number;
  decided: number;
  avgDecisionHours: number | null;
}

// Workload per approver (team, department and organisation scopes only).
export async function loadApproverLoad(scope: Scope, viewer: Viewer, filter: AnalyticsFilter, db: Queryable = getDbPool()): Promise<ApproverLoad[]> {
  if (scope.kind === "MINE" || scope.kind === "APPROVALS" || scope.kind === "TASKS") return [];
  const t = where(scope, viewer, filter, "task");
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT u.id, u.name,
            SUM(t.status = 'PENDING' AND r.status = 'IN_PROGRESS') AS pending,
            SUM(t.status = 'PENDING' AND r.status = 'IN_PROGRESS' AND t.due_at < CURRENT_TIMESTAMP) AS overdue,
            SUM(t.decided_at IS NOT NULL AND ${INDIA_DATE("t.decided_at")} BETWEEN ? AND ?) AS decided,
            AVG(CASE WHEN t.decided_at IS NOT NULL AND ${INDIA_DATE("t.decided_at")} BETWEEN ? AND ? THEN TIMESTAMPDIFF(MINUTE, t.created_at, t.decided_at) / 60 END) AS avg_hours
     FROM approval_tasks t JOIN approval_requests r ON r.id = t.request_id JOIN users u ON u.id = t.approver_id
     JOIN workflow_versions v ON v.id = r.workflow_version_id JOIN workflow_definitions w ON w.id = v.workflow_id JOIN users rq ON rq.id = r.requester_id
     WHERE ${t.sql} AND t.task_type = 'APPROVAL'
     GROUP BY u.id, u.name HAVING pending > 0 OR decided > 0
     ORDER BY overdue DESC, pending DESC LIMIT 25`,
    [filter.period.from, filter.period.to, filter.period.from, filter.period.to, ...t.params],
  );
  return rows.map((row) => ({ id: n(row.id), name: String(row.name), pending: n(row.pending), overdue: n(row.overdue), decided: n(row.decided), avgDecisionHours: orNull(row.avg_hours) }));
}
