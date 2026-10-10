import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import { where, type AnalyticsFilter } from "@/lib/db/repositories/analytics.repository";
import type { Scope, Viewer } from "@/server/analytics/scope";
import { grainFor, type Grain, type Period } from "@/server/analytics/periods";
import { qualityFrom, historyFrom, type Quality, type HistoryPoint } from "@/server/analytics/derived";

// v1.7.0 list B: more analytics. Same scoping and definitions as
// analytics.repository.ts (every query goes through where()).
const n = (value: unknown) => Number(value ?? 0);
const INDIA_DATE = (column: string) => `DATE(DATE_ADD(${column}, INTERVAL 330 MINUTE))`;
const JOINS = `FROM approval_requests r
  JOIN workflow_versions v ON v.id = r.workflow_version_id
  JOIN workflow_definitions w ON w.id = v.workflow_id
  JOIN users rq ON rq.id = r.requester_id`;
const TASK_JOINS = `FROM approval_tasks t JOIN approval_requests r ON r.id = t.request_id
  JOIN workflow_versions v ON v.id = r.workflow_version_id JOIN workflow_definitions w ON w.id = v.workflow_id JOIN users rq ON rq.id = r.requester_id`;
const ROW_LIMIT = 20000;

// B03: outstanding tasks due today (India date) and in the next 7 days.
export async function loadDueSoon(scope: Scope, viewer: Viewer, filter: AnalyticsFilter, db: Queryable = getDbPool()): Promise<{ dueToday: number; dueWeek: number }> {
  const t = where(scope, viewer, filter, "pending");
  const [[row]] = await db.query<RowDataPacket[]>(
    `SELECT SUM(${INDIA_DATE("t.due_at")} = ${INDIA_DATE("CURRENT_TIMESTAMP")}) AS today,
            SUM(t.due_at >= CURRENT_TIMESTAMP AND t.due_at < DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 7 DAY)) AS week
     ${TASK_JOINS} WHERE ${t.sql} AND t.status = 'PENDING' AND r.status = 'IN_PROGRESS' AND t.due_at IS NOT NULL`,
    t.params,
  );
  return { dueToday: n(row?.today), dueWeek: n(row?.week) };
}

// B03: median time to decide, first-pass approval, rework and withdrawal
// rates, for requests closed in the period.
export async function loadQuality(scope: Scope, viewer: Viewer, filter: AnalyticsFilter, period: Period = filter.period, db: Queryable = getDbPool()): Promise<Quality> {
  const w = where(scope, viewer, filter);
  const [rows] = await db.query<(RowDataPacket & { status: string; minutes: number | null; round: number; sends: number })[]>(
    `SELECT r.status, TIMESTAMPDIFF(MINUTE, r.submitted_at, r.closed_at) AS minutes, r.round,
            (SELECT COUNT(*) FROM approval_tasks x WHERE x.request_id = r.id AND x.status = 'CHANGES_REQUESTED') AS sends
     ${JOINS} WHERE ${w.sql} AND r.closed_at IS NOT NULL AND ${INDIA_DATE("r.closed_at")} BETWEEN ? AND ? LIMIT ${ROW_LIMIT}`,
    [...w.params, period.from, period.to],
  );
  return qualityFrom(rows.map((row) => ({ status: row.status, minutes: row.minutes === null ? null : n(row.minutes), round: n(row.round), sends: n(row.sends) })));
}

// B05: what became of the requests raised in the period (status now).
export async function loadStatusMix(scope: Scope, viewer: Viewer, filter: AnalyticsFilter, db: Queryable = getDbPool()): Promise<Record<string, number>> {
  const w = where(scope, viewer, filter);
  const [rows] = await db.query<(RowDataPacket & { status: string; total: number })[]>(
    `SELECT r.status, COUNT(*) AS total ${JOINS} WHERE ${w.sql} AND ${INDIA_DATE("r.submitted_at")} BETWEEN ? AND ? GROUP BY r.status`,
    [...w.params, filter.period.from, filter.period.to],
  );
  return Object.fromEntries(rows.map((row) => [row.status, n(row.total)]));
}

// B05: backlog and overdue at the end of each bucket, response times passed
// and decisions made in each bucket. Worked out from the request and task
// times (no history table): due times already include time on hold.
export async function loadHistory(scope: Scope, viewer: Viewer, filter: AnalyticsFilter, db: Queryable = getDbPool()): Promise<{ grain: Grain; points: HistoryPoint[] }> {
  const grain = grainFor(filter.period);
  const w = where(scope, viewer, filter);
  const end = `${filter.period.to} 23:59:59`;
  const start = `${filter.period.from} 00:00:00`;
  // India dates as UTC instants: shift by 5:30.
  const [requests] = await db.query<(RowDataPacket & { submitted: Date; closed: Date | null })[]>(
    `SELECT DATE_ADD(r.submitted_at, INTERVAL 330 MINUTE) AS submitted, DATE_ADD(r.closed_at, INTERVAL 330 MINUTE) AS closed ${JOINS}
     WHERE ${w.sql} AND DATE_ADD(r.submitted_at, INTERVAL 330 MINUTE) <= ? AND (r.closed_at IS NULL OR DATE_ADD(r.closed_at, INTERVAL 330 MINUTE) >= ?) LIMIT ${ROW_LIMIT}`,
    [...w.params, end, start],
  );
  const t = where(scope, viewer, filter, "task");
  const [tasks] = await db.query<(RowDataPacket & { due: Date; decided: Date | null })[]>(
    `SELECT DATE_ADD(t.due_at, INTERVAL 330 MINUTE) AS due, DATE_ADD(t.decided_at, INTERVAL 330 MINUTE) AS decided ${TASK_JOINS}
     WHERE ${t.sql} AND t.task_type = 'APPROVAL' AND t.due_at IS NOT NULL AND t.status IN ('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED')
       AND DATE_ADD(t.due_at, INTERVAL 330 MINUTE) <= ? AND (t.decided_at IS NULL OR DATE_ADD(t.decided_at, INTERVAL 330 MINUTE) >= ?) LIMIT ${ROW_LIMIT}`,
    [...t.params, end, start],
  );
  const [decisions] = await db.query<(RowDataPacket & { day: string; status: string; total: number })[]>(
    `SELECT DATE_FORMAT(${INDIA_DATE("t.decided_at")}, '%Y-%m-%d') AS day, t.status, COUNT(*) AS total ${TASK_JOINS}
     WHERE ${t.sql} AND t.task_type = 'APPROVAL' AND t.status IN ('APPROVED', 'REJECTED', 'CHANGES_REQUESTED') AND t.decided_at IS NOT NULL
       AND ${INDIA_DATE("t.decided_at")} BETWEEN ? AND ? GROUP BY day, t.status`,
    [...t.params, filter.period.from, filter.period.to],
  );
  const points = historyFrom({
    period: filter.period,
    grain,
    requests: requests.map((row) => ({ submitted: new Date(row.submitted), closed: row.closed ? new Date(row.closed) : null })),
    tasks: tasks.map((row) => ({ due: new Date(row.due), decided: row.decided ? new Date(row.decided) : null })),
    decisions: decisions.map((row) => ({ day: row.day, status: row.status, total: n(row.total) })),
    now: new Date(Date.now() + 330 * 60_000),
  });
  return { grain, points };
}

// B05: outstanding tasks now, by the raiser's department and step.
export async function loadHeatmap(scope: Scope, viewer: Viewer, filter: AnalyticsFilter, db: Queryable = getDbPool()): Promise<{ departments: string[]; steps: string[]; cells: Record<string, Record<string, number>> }> {
  const t = where(scope, viewer, filter, "pending");
  const [rows] = await db.query<(RowDataPacket & { department: string; step: string; total: number })[]>(
    `SELECT COALESCE(d.name, 'No department') AS department, t.node_label AS step, COUNT(*) AS total
     ${TASK_JOINS} LEFT JOIN departments d ON d.id = rq.department_id
     WHERE ${t.sql} AND t.status = 'PENDING' AND r.status IN ('IN_PROGRESS', 'ON_HOLD')
     GROUP BY department, step ORDER BY total DESC LIMIT 400`,
    t.params,
  );
  const totals = (key: "department" | "step") => {
    const sums = new Map<string, number>();
    for (const row of rows) sums.set(row[key], (sums.get(row[key]) ?? 0) + n(row.total));
    return [...sums.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  };
  const departments = totals("department").slice(0, 12);
  const steps = totals("step").slice(0, 10);
  const cells: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    if (!departments.includes(row.department) || !steps.includes(row.step)) continue;
    (cells[row.department] ??= {})[row.step] = n(row.total);
  }
  return { departments, steps, cells };
}

// B02: choices for the approver and step filters: only people and steps
// that appear on requests in the viewer's scope.
export async function loadFilterChoices(scope: Scope, viewer: Viewer, filter: AnalyticsFilter, db: Queryable = getDbPool()): Promise<{ approvers: { id: number; name: string }[]; steps: string[] }> {
  const base: AnalyticsFilter = { period: filter.period, workflowId: filter.workflowId, departmentId: filter.departmentId };
  const t = where(scope, viewer, base, "task");
  const [approvers] = await db.query<(RowDataPacket & { id: number; name: string })[]>(
    `SELECT DISTINCT u.id, u.name ${TASK_JOINS} JOIN users u ON u.id = t.approver_id WHERE ${t.sql} AND t.task_type = 'APPROVAL' ORDER BY u.name LIMIT 300`,
    t.params,
  );
  const [steps] = await db.query<(RowDataPacket & { step: string })[]>(`SELECT DISTINCT t.node_label AS step ${TASK_JOINS} WHERE ${t.sql} ORDER BY step LIMIT 200`, t.params);
  return { approvers: approvers.map((row) => ({ id: row.id, name: row.name })), steps: steps.map((row) => row.step) };
}

// B01: the requests behind a number. Each kind matches the query that
// produced the number, so the list and the card always agree.
export type DrillKind = "raised" | "approved" | "rejected" | "withdrawn" | "open" | "pending" | "overdue" | "awaiting" | "paused" | "due_today" | "due_week" | "sent_back";
export const DRILL_LABEL: Record<DrillKind, string> = {
  raised: "Raised in the period",
  approved: "Approved in the period",
  rejected: "Rejected in the period",
  withdrawn: "Withdrawn in the period",
  open: "Open now",
  pending: "Waiting for approvers now",
  overdue: "With an overdue task now",
  awaiting: "Back with the requester now",
  paused: "On hold now",
  due_today: "With a task due today",
  due_week: "With a task due in the next 7 days",
  sent_back: "Sent back for changes in the period",
};

export interface DrillRow {
  id: number;
  requestNo: string;
  title: string;
  workflowName: string;
  requesterName: string;
  status: string;
  submittedAt: Date;
  closedAt: Date | null;
}

export async function loadDrill(kind: DrillKind, scope: Scope, viewer: Viewer, filter: AnalyticsFilter, db: Queryable = getDbPool()): Promise<{ rows: DrillRow[]; truncated: boolean }> {
  const w = where(scope, viewer, filter);
  const p = where(scope, viewer, filter, "pending");
  const tk = where(scope, viewer, filter, "task");
  const period = [filter.period.from, filter.period.to];
  // Task-based kinds use the same task scope as the cards (pending / decided).
  const taskExists = (scoped: { sql: string; params: unknown[] }, condition: string, params: unknown[] = []) => ({
    sql: `r.id IN (SELECT t.request_id ${TASK_JOINS} WHERE ${scoped.sql} AND ${condition})`,
    params: [...scoped.params, ...params],
  });
  let condition: { sql: string; params: unknown[] };
  switch (kind) {
    case "raised":
      condition = { sql: `${w.sql} AND ${INDIA_DATE("r.submitted_at")} BETWEEN ? AND ?`, params: [...w.params, ...period] };
      break;
    case "approved":
    case "rejected":
    case "withdrawn":
      condition = { sql: `${w.sql} AND r.status = ? AND r.closed_at IS NOT NULL AND ${INDIA_DATE("r.closed_at")} BETWEEN ? AND ?`, params: [...w.params, kind === "approved" ? "APPROVED" : kind === "rejected" ? "REJECTED" : "CANCELLED", ...period] };
      break;
    case "open":
      condition = { sql: `${w.sql} AND r.status IN ('IN_PROGRESS', 'ON_HOLD', 'CHANGES_REQUIRED')`, params: w.params };
      break;
    case "awaiting":
      condition = { sql: `${w.sql} AND r.status = 'CHANGES_REQUIRED'`, params: w.params };
      break;
    case "paused":
      condition = { sql: `${w.sql} AND r.status = 'ON_HOLD'`, params: w.params };
      break;
    case "pending":
      condition = taskExists(p, "t.status = 'PENDING' AND r.status = 'IN_PROGRESS'");
      break;
    case "overdue":
      condition = taskExists(p, "t.status = 'PENDING' AND r.status = 'IN_PROGRESS' AND t.due_at < CURRENT_TIMESTAMP");
      break;
    case "due_today":
      condition = taskExists(p, `t.status = 'PENDING' AND r.status = 'IN_PROGRESS' AND t.due_at IS NOT NULL AND ${INDIA_DATE("t.due_at")} = ${INDIA_DATE("CURRENT_TIMESTAMP")}`);
      break;
    case "due_week":
      condition = taskExists(p, "t.status = 'PENDING' AND r.status = 'IN_PROGRESS' AND t.due_at >= CURRENT_TIMESTAMP AND t.due_at < DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 7 DAY)");
      break;
    case "sent_back":
      condition = taskExists(tk, `t.task_type = 'APPROVAL' AND t.status = 'CHANGES_REQUESTED' AND t.decided_at IS NOT NULL AND ${INDIA_DATE("t.decided_at")} BETWEEN ? AND ?`, period);
      break;
  }
  const [rows] = await db.query<(RowDataPacket & { id: number; request_no: string; title: string; workflow_name: string; requester_name: string; status: string; submitted_at: Date; closed_at: Date | null })[]>(
    `SELECT r.id, r.request_no, r.title, w.name AS workflow_name, rq.name AS requester_name, r.status, r.submitted_at, r.closed_at
     ${JOINS} WHERE r.deleted_at IS NULL AND ${condition.sql} ORDER BY r.submitted_at DESC LIMIT 501`,
    condition.params,
  );
  return {
    rows: rows.slice(0, 500).map((row) => ({ id: row.id, requestNo: row.request_no, title: row.title, workflowName: row.workflow_name, requesterName: row.requester_name, status: row.status, submittedAt: row.submitted_at, closedAt: row.closed_at })),
    truncated: rows.length > 500,
  };
}

