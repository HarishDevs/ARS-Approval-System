import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { requestScopeSql, type Scope, type Viewer } from "@/server/analytics/scope";
import { averageOf, countBuckets, lastMonths, medianOf, p90Of, rate, type AgeBucket } from "@/server/analytics/center";
import type { Period } from "@/server/analytics/periods";

// v1.12.0 (D-156, D-157): the Analytics Center's numbers. Every query is
// aggregated in MySQL and limited to the viewer's scope (server-side, same
// scopes as approval analytics). Department attribution:
//   - requests: the raiser's department;
//   - tasks: the assignee's department;
//   - information published: the sender's department;
//   - acknowledgements: the recipient's department.
// Each is the person's department now (no history of moves is recorded).
// Periods are India dates; "now" figures ignore the period.

type Row = RowDataPacket & Record<string, unknown>;
const IST = 330 * 60_000;
export const utcStart = (date: string) => new Date(new Date(`${date}T00:00:00Z`).getTime() - IST);
const range = (period: Pick<Period, "from" | "to">) => [utcStart(period.from), new Date(utcStart(period.to).getTime() + 86_400_000)] as const;
const num = (value: unknown) => Number(value ?? 0);
const hours = (value: unknown) => (value === null || value === undefined ? null : Math.round(Number(value) * 10) / 10);

async function query(sql: string, params: unknown[]): Promise<Row[]> {
  const [rows] = await getDbPool().query<Row[]>(sql, params);
  return rows;
}

// ---- scopes for tasks, information and people --------------------------------
// MINE / APPROVALS: the person's own; TEAM: direct reports; DEPARTMENT:
// people in the HOD's departments; ORGANISATION: everyone (IT, Super Admin).
export function peopleScopeSql(scope: Scope, viewer: Viewer, alias: string): { sql: string; params: unknown[] } {
  switch (scope.kind) {
    case "MINE":
    case "APPROVALS":
      return { sql: `${alias}.id = ?`, params: [viewer.id] };
    case "TEAM":
      return { sql: `${alias}.reporting_manager_id = ?`, params: [viewer.id] };
    case "DEPARTMENT":
      return scope.departmentIds?.length ? { sql: `${alias}.department_id IN (?)`, params: [scope.departmentIds] } : { sql: "FALSE", params: [] };
    case "ORGANISATION":
      return { sql: "TRUE", params: [] };
  }
}

// Tasks: in MINE the person's own (assigned to or created by them);
// otherwise by the assignee.
function taskScope(scope: Scope, viewer: Viewer): { join: string; sql: string; params: unknown[] } {
  if (scope.kind === "MINE" || scope.kind === "APPROVALS") return { join: "JOIN users ta ON ta.id = t.assignee_id", sql: "(t.assignee_id = ? OR t.created_by = ?)", params: [viewer.id, viewer.id] };
  const people = peopleScopeSql(scope, viewer, "ta");
  return { join: "JOIN users ta ON ta.id = t.assignee_id", ...people };
}

// Information records: by the sender.
function infoScope(scope: Scope, viewer: Viewer): { join: string; sql: string; params: unknown[] } {
  return { join: "JOIN users ic ON ic.id = i.created_by", ...peopleScopeSql(scope, viewer, "ic") };
}

// Acknowledgements: by the recipient.
function recipientScope(scope: Scope, viewer: Viewer): { join: string; sql: string; params: unknown[] } {
  return { join: "JOIN users ru ON ru.id = rc.user_id", ...peopleScopeSql(scope, viewer, "ru") };
}

const REQUEST_JOINS = "FROM approval_requests r JOIN users rq ON rq.id = r.requester_id";
const OPEN_TASK = "t.status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED')";

// ---- executive overview ---------------------------------------------------
export interface ModuleSummary {
  created: number;
  completed: number;
  completionRate: number | null;
  open: number;
  overdue: number | null;
  late: number;
  avgHours: number | null;
}

export interface InfoSummary {
  published: number;
  awaitingAck: number;
  recipients: number;
  acknowledged: number;
  ackRate: number | null;
  read: number;
  readRate: number | null;
}

export async function approvalSummary(scope: Scope, viewer: Viewer, period: Period): Promise<ModuleSummary> {
  const [from, to] = range(period);
  const s = requestScopeSql(scope, viewer);
  const [row] = await query(
    `SELECT
       SUM(r.submitted_at >= ? AND r.submitted_at < ?) AS created,
       SUM(r.status IN ('APPROVED', 'REJECTED') AND r.closed_at >= ? AND r.closed_at < ?) AS completed,
       SUM(r.submitted_at >= ? AND r.submitted_at < ? AND r.status <> 'CANCELLED') AS cohort,
       SUM(r.submitted_at >= ? AND r.submitted_at < ? AND r.status IN ('APPROVED', 'REJECTED')) AS cohort_done,
       SUM(r.status IN ('IN_PROGRESS', 'ON_HOLD', 'CHANGES_REQUIRED')) AS open_now,
       AVG(CASE WHEN r.status IN ('APPROVED', 'REJECTED') AND r.closed_at >= ? AND r.closed_at < ? THEN TIMESTAMPDIFF(MINUTE, r.submitted_at, r.closed_at) / 60 END) AS avg_hours
     ${REQUEST_JOINS} WHERE r.deleted_at IS NULL AND ${s.sql}`,
    [from, to, from, to, from, to, from, to, from, to, ...s.params],
  );
  const [late] = await query(
    `SELECT COUNT(DISTINCT CASE WHEN t.status = 'PENDING' AND r.status = 'IN_PROGRESS' AND t.due_at < UTC_TIMESTAMP() THEN r.id END) AS overdue,
       SUM(t.due_at >= ? AND t.due_at < ? AND (t.decided_at > t.due_at OR (t.decided_at IS NULL AND t.status = 'PENDING'))) AS late
     FROM approval_tasks t JOIN approval_requests r ON r.id = t.request_id JOIN users rq ON rq.id = r.requester_id
     WHERE r.deleted_at IS NULL AND t.task_type = 'APPROVAL' AND ${s.sql}`,
    [from, to, ...s.params],
  );
  return {
    created: num(row?.created),
    completed: num(row?.completed),
    completionRate: rate(num(row?.cohort_done), num(row?.cohort)),
    open: num(row?.open_now),
    overdue: num(late?.overdue),
    late: num(late?.late),
    avgHours: hours(row?.avg_hours),
  };
}

export async function taskSummary(scope: Scope, viewer: Viewer, period: Period): Promise<ModuleSummary> {
  const [from, to] = range(period);
  const s = taskScope(scope, viewer);
  const [row] = await query(
    `SELECT
       SUM(t.created_at >= ? AND t.created_at < ?) AS created,
       SUM(t.status = 'COMPLETED' AND t.completed_at >= ? AND t.completed_at < ?) AS completed,
       SUM(t.created_at >= ? AND t.created_at < ? AND t.status <> 'CANCELLED') AS cohort,
       SUM(t.created_at >= ? AND t.created_at < ? AND t.status = 'COMPLETED') AS cohort_done,
       SUM(${OPEN_TASK}) AS open_now,
       SUM(${OPEN_TASK} AND t.due_at < UTC_TIMESTAMP()) AS overdue,
       SUM(t.due_at >= ? AND t.due_at < ? AND ((t.completed_at IS NOT NULL AND t.completed_at > t.due_at) OR (${OPEN_TASK} AND t.due_at < UTC_TIMESTAMP()))) AS late,
       AVG(CASE WHEN t.status = 'COMPLETED' AND t.completed_at >= ? AND t.completed_at < ? THEN TIMESTAMPDIFF(MINUTE, t.created_at, t.completed_at) / 60 END) AS avg_hours
     FROM tasks t ${s.join} WHERE ${s.sql}`,
    [from, to, from, to, from, to, from, to, from, to, from, to, ...s.params],
  );
  return {
    created: num(row?.created),
    completed: num(row?.completed),
    completionRate: rate(num(row?.cohort_done), num(row?.cohort)),
    open: num(row?.open_now),
    overdue: num(row?.overdue),
    late: num(row?.late),
    avgHours: hours(row?.avg_hours),
  };
}

export async function infoSummary(scope: Scope, viewer: Viewer, period: Period): Promise<InfoSummary> {
  const [from, to] = range(period);
  const s = infoScope(scope, viewer);
  const [row] = await query(
    `SELECT
       SUM(i.status IN ('PUBLISHED', 'WITHDRAWN', 'ARCHIVED') AND i.published_at >= ? AND i.published_at < ?) AS published,
       SUM(i.status = 'PUBLISHED' AND i.ack_required AND EXISTS (SELECT 1 FROM info_recipients p WHERE p.info_id = i.id AND p.acknowledged_at IS NULL)) AS awaiting
     FROM info_items i ${s.join} WHERE ${s.sql}`,
    [from, to, ...s.params],
  );
  // Eligible recipients of acknowledgement-required records published in the
  // period (the recipient list is fixed at publishing, D-145).
  const [ack] = await query(
    `SELECT COUNT(*) AS recipients, SUM(rc.acknowledged_at IS NOT NULL) AS acknowledged
     FROM info_recipients rc JOIN info_items i ON i.id = rc.info_id ${s.join}
     WHERE i.ack_required AND i.status IN ('PUBLISHED', 'ARCHIVED') AND i.published_at >= ? AND i.published_at < ? AND ${s.sql}`,
    [from, to, ...s.params],
  );
  const [reads] = await query(
    `SELECT COUNT(*) AS recipients, SUM(rc.read_at IS NOT NULL) AS read_count
     FROM info_recipients rc JOIN info_items i ON i.id = rc.info_id ${s.join}
     WHERE i.status IN ('PUBLISHED', 'ARCHIVED') AND i.published_at >= ? AND i.published_at < ? AND ${s.sql}`,
    [from, to, ...s.params],
  );
  return {
    published: num(row?.published),
    awaitingAck: num(row?.awaiting),
    recipients: num(ack?.recipients),
    acknowledged: num(ack?.acknowledged),
    ackRate: rate(num(ack?.acknowledged), num(ack?.recipients)),
    read: num(reads?.read_count),
    readRate: rate(num(reads?.read_count), num(reads?.recipients)),
  };
}

// People who did something in the period (submitted, decided, created or
// completed a task, published or acknowledged information), in scope.
export async function activeContributors(scope: Scope, viewer: Viewer, period: Period): Promise<number> {
  const [from, to] = range(period);
  const people = peopleScopeSql(scope, viewer, "u");
  const [row] = await query(
    `SELECT COUNT(DISTINCT x.user_id) AS n FROM (
       SELECT requester_id AS user_id FROM approval_requests WHERE submitted_at >= ? AND submitted_at < ? AND deleted_at IS NULL
       UNION ALL SELECT decided_by FROM approval_tasks WHERE decided_at >= ? AND decided_at < ? AND decided_by IS NOT NULL
       UNION ALL SELECT created_by FROM tasks WHERE created_at >= ? AND created_at < ?
       UNION ALL SELECT completed_by FROM tasks WHERE completed_at >= ? AND completed_at < ? AND completed_by IS NOT NULL
       UNION ALL SELECT created_by FROM info_items WHERE published_at >= ? AND published_at < ?
       UNION ALL SELECT user_id FROM info_recipients WHERE acknowledged_at >= ? AND acknowledged_at < ?
     ) x JOIN users u ON u.id = x.user_id WHERE u.is_break_glass = FALSE AND ${people.sql}`,
    [from, to, from, to, from, to, from, to, from, to, from, to, ...people.params],
  );
  return num(row?.n);
}

// Twelve months of activity by module (India months).
export interface MonthlyRow {
  month: string;
  requestsRaised: number;
  requestsClosed: number;
  tasksCreated: number;
  tasksCompleted: number;
  infoPublished: number;
  acknowledgements: number;
}

const MONTH = (column: string) => `DATE_FORMAT(DATE_ADD(${column}, INTERVAL 330 MINUTE), '%Y-%m')`;

export async function monthlyActivity(scope: Scope, viewer: Viewer, today: string, months = 12): Promise<MonthlyRow[]> {
  const keys = lastMonths(today, months);
  const from = utcStart(`${keys[0]}-01`);
  const r = requestScopeSql(scope, viewer);
  const t = taskScope(scope, viewer);
  const i = infoScope(scope, viewer);
  const rc = recipientScope(scope, viewer);
  const [raised, closed, created, completed, published, acks] = await Promise.all([
    query(`SELECT ${MONTH("r.submitted_at")} AS m, COUNT(*) AS n ${REQUEST_JOINS} WHERE r.deleted_at IS NULL AND r.submitted_at >= ? AND ${r.sql} GROUP BY m`, [from, ...r.params]),
    query(`SELECT ${MONTH("r.closed_at")} AS m, COUNT(*) AS n ${REQUEST_JOINS} WHERE r.deleted_at IS NULL AND r.status IN ('APPROVED', 'REJECTED') AND r.closed_at >= ? AND ${r.sql} GROUP BY m`, [from, ...r.params]),
    query(`SELECT ${MONTH("t.created_at")} AS m, COUNT(*) AS n FROM tasks t ${t.join} WHERE t.created_at >= ? AND ${t.sql} GROUP BY m`, [from, ...t.params]),
    query(`SELECT ${MONTH("t.completed_at")} AS m, COUNT(*) AS n FROM tasks t ${t.join} WHERE t.status = 'COMPLETED' AND t.completed_at >= ? AND ${t.sql} GROUP BY m`, [from, ...t.params]),
    query(`SELECT ${MONTH("i.published_at")} AS m, COUNT(*) AS n FROM info_items i ${i.join} WHERE i.published_at >= ? AND ${i.sql} GROUP BY m`, [from, ...i.params]),
    query(`SELECT ${MONTH("rc.acknowledged_at")} AS m, COUNT(*) AS n FROM info_recipients rc ${rc.join} WHERE rc.acknowledged_at >= ? AND ${rc.sql} GROUP BY m`, [from, ...rc.params]),
  ]);
  const map = (rows: Row[]) => new Map(rows.map((row) => [String(row.m), num(row.n)]));
  const [a, b, c, d, e, f] = [raised, closed, created, completed, published, acks].map(map) as Map<string, number>[];
  return keys.map((month) => ({
    month,
    requestsRaised: a!.get(month) ?? 0,
    requestsClosed: b!.get(month) ?? 0,
    tasksCreated: c!.get(month) ?? 0,
    tasksCompleted: d!.get(month) ?? 0,
    infoPublished: e!.get(month) ?? 0,
    acknowledgements: f!.get(month) ?? 0,
  }));
}

// ---- task analytics ---------------------------------------------------------
export interface TaskBoard {
  status: Record<string, number>;
  completedInPeriod: number;
  cancelledInPeriod: number;
  createdInPeriod: number;
  dueToday: number;
  dueWeek: number;
  overdue: number;
  noDueDate: number;
  reopened: number;
  postponed: number;
  reassigned: number;
  completionRate: number | null;
  cancellationRate: number | null;
  duration: { avg: number | null; median: number | null; p90: number | null; count: number };
  delivery: { timed: number; onTime: number; late: number; onTimeRate: number | null; avgDaysLate: number | null; untimed: number };
  aging: Record<string, number>;
  overdueAging: Record<string, number>;
  byPriority: { label: string; open: number; completed: number; onTimeRate: number | null }[];
  byType: { label: string; open: number; completed: number }[];
  byDepartment: { label: string; open: number; overdue: number; completed: number; onTimeRate: number | null }[];
  byAssignee: { label: string; open: number; overdue: number; completed: number }[];
  blocked: { count: number; avgHours: number | null };
  oldest: { id: number; taskNo: string; priority: string; assignee: string; ageDays: number; overdue: boolean }[];
}

export async function taskBoard(scope: Scope, viewer: Viewer, period: Period, buckets: AgeBucket[]): Promise<TaskBoard> {
  const [from, to] = range(period);
  const s = taskScope(scope, viewer);
  const base = `FROM tasks t ${s.join} WHERE ${s.sql}`;
  const [counts, statusRows, durations, events, byPriority, byType, byDepartment, byAssignee, ages, blocked, oldest] = await Promise.all([
    query(
      `SELECT
         SUM(t.created_at >= ? AND t.created_at < ?) AS created,
         SUM(t.status = 'COMPLETED' AND t.completed_at >= ? AND t.completed_at < ?) AS completed,
         SUM(t.status = 'CANCELLED' AND t.cancelled_at >= ? AND t.cancelled_at < ?) AS cancelled,
         SUM(t.created_at >= ? AND t.created_at < ? AND t.status = 'COMPLETED') AS cohort_done,
         SUM(t.created_at >= ? AND t.created_at < ? AND t.status = 'CANCELLED') AS cohort_cancelled,
         SUM(${OPEN_TASK} AND DATE(DATE_ADD(t.due_at, INTERVAL 330 MINUTE)) = DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE))) AS due_today,
         SUM(${OPEN_TASK} AND t.due_at >= UTC_TIMESTAMP() AND t.due_at < DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY)) AS due_week,
         SUM(${OPEN_TASK} AND t.due_at < UTC_TIMESTAMP()) AS overdue,
         SUM(${OPEN_TASK} AND t.due_at IS NULL) AS no_due
       ${base}`,
      [from, to, from, to, from, to, from, to, from, to, ...s.params],
    ),
    query(`SELECT t.status, COUNT(*) AS n ${base} AND ${OPEN_TASK} GROUP BY t.status`, s.params),
    query(
      `SELECT TIMESTAMPDIFF(MINUTE, t.created_at, t.completed_at) / 60 AS hours, t.due_at IS NOT NULL AS timed, t.completed_at <= t.due_at AS on_time,
         TIMESTAMPDIFF(MINUTE, t.due_at, t.completed_at) / 1440 AS days_late
       ${base} AND t.status = 'COMPLETED' AND t.completed_at >= ? AND t.completed_at < ? LIMIT 20000`,
      [...s.params, from, to],
    ),
    query(
      `SELECT SUM(e.event_type = 'REOPEN') AS reopened,
         SUM(e.event_type = 'EDIT' AND JSON_EXTRACT(e.payload_json, '$.dueChanged') = TRUE
           AND JSON_UNQUOTE(JSON_EXTRACT(e.payload_json, '$.after.dueAt')) > JSON_UNQUOTE(JSON_EXTRACT(e.payload_json, '$.before.dueAt'))) AS postponed,
         SUM(e.event_type = 'REASSIGN') AS reassigned
       FROM task_events e JOIN tasks t ON t.id = e.task_id ${s.join} WHERE ${s.sql} AND e.created_at >= ? AND e.created_at < ?`,
      [...s.params, from, to],
    ),
    query(
      `SELECT t.priority AS label, SUM(${OPEN_TASK}) AS open_now, SUM(t.status = 'COMPLETED' AND t.completed_at >= ? AND t.completed_at < ?) AS completed,
         SUM(t.status = 'COMPLETED' AND t.completed_at >= ? AND t.completed_at < ? AND t.due_at IS NOT NULL) AS timed,
         SUM(t.status = 'COMPLETED' AND t.completed_at >= ? AND t.completed_at < ? AND t.completed_at <= t.due_at) AS on_time
       ${base} GROUP BY t.priority`,
      [from, to, from, to, from, to, ...s.params],
    ),
    query(
      `SELECT mt.name AS label, SUM(${OPEN_TASK}) AS open_now, SUM(t.status = 'COMPLETED' AND t.completed_at >= ? AND t.completed_at < ?) AS completed
       FROM tasks t ${s.join} JOIN module_type_versions v ON v.id = t.type_version_id JOIN module_types mt ON mt.id = v.type_id WHERE ${s.sql}
       GROUP BY mt.id, mt.name ORDER BY open_now DESC LIMIT 15`,
      [from, to, ...s.params],
    ),
    query(
      `SELECT COALESCE(d.name, 'No department') AS label, SUM(${OPEN_TASK}) AS open_now, SUM(${OPEN_TASK} AND t.due_at < UTC_TIMESTAMP()) AS overdue,
         SUM(t.status = 'COMPLETED' AND t.completed_at >= ? AND t.completed_at < ?) AS completed,
         SUM(t.status = 'COMPLETED' AND t.completed_at >= ? AND t.completed_at < ? AND t.due_at IS NOT NULL) AS timed,
         SUM(t.status = 'COMPLETED' AND t.completed_at >= ? AND t.completed_at < ? AND t.completed_at <= t.due_at) AS on_time
       FROM tasks t ${s.join} LEFT JOIN departments d ON d.id = ta.department_id WHERE ${s.sql} GROUP BY label ORDER BY open_now DESC LIMIT 30`,
      [from, to, from, to, from, to, ...s.params],
    ),
    query(
      `SELECT ta.name AS label, SUM(${OPEN_TASK}) AS open_now, SUM(${OPEN_TASK} AND t.due_at < UTC_TIMESTAMP()) AS overdue,
         SUM(t.status = 'COMPLETED' AND t.completed_at >= ? AND t.completed_at < ?) AS completed
       ${base} GROUP BY ta.id, ta.name HAVING open_now > 0 OR completed > 0 ORDER BY open_now DESC LIMIT 15`,
      [from, to, ...s.params],
    ),
    query(`SELECT TIMESTAMPDIFF(MINUTE, t.created_at, UTC_TIMESTAMP()) / 60 AS age, CASE WHEN t.due_at < UTC_TIMESTAMP() THEN TIMESTAMPDIFF(MINUTE, t.due_at, UTC_TIMESTAMP()) / 60 END AS over_hours ${base} AND ${OPEN_TASK} LIMIT 20000`, s.params),
    query(
      `SELECT COUNT(*) AS n, AVG(TIMESTAMPDIFF(MINUTE, (SELECT MAX(e.created_at) FROM task_events e WHERE e.task_id = t.id AND e.event_type = 'BLOCK'), UTC_TIMESTAMP()) / 60) AS avg_hours
       ${base} AND t.status = 'BLOCKED'`,
      s.params,
    ),
    query(
      `SELECT t.id, t.task_no, t.priority, ta.name AS assignee, TIMESTAMPDIFF(HOUR, t.created_at, UTC_TIMESTAMP()) / 24 AS age_days, t.due_at < UTC_TIMESTAMP() AS overdue
       ${base} AND ${OPEN_TASK} ORDER BY t.created_at LIMIT 10`,
      s.params,
    ),
  ]);
  const c = counts[0]!;
  const done = durations.map((row) => Number(row.hours));
  const timed = durations.filter((row) => Number(row.timed));
  const onTime = timed.filter((row) => Number(row.on_time)).length;
  const lateDays = timed.filter((row) => !Number(row.on_time)).map((row) => Number(row.days_late));
  const created = num(c.created);
  return {
    status: Object.fromEntries(statusRows.map((row) => [String(row.status), num(row.n)])),
    createdInPeriod: created,
    completedInPeriod: num(c.completed),
    cancelledInPeriod: num(c.cancelled),
    dueToday: num(c.due_today),
    dueWeek: num(c.due_week),
    overdue: num(c.overdue),
    noDueDate: num(c.no_due),
    reopened: num(events[0]?.reopened),
    postponed: num(events[0]?.postponed),
    reassigned: num(events[0]?.reassigned),
    completionRate: rate(num(c.cohort_done), created - num(c.cohort_cancelled)),
    cancellationRate: rate(num(c.cohort_cancelled), created),
    duration: { avg: hours(averageOf(done)), median: hours(medianOf(done)), p90: hours(p90Of(done)), count: done.length },
    delivery: { timed: timed.length, onTime, late: timed.length - onTime, onTimeRate: rate(onTime, timed.length), avgDaysLate: lateDays.length ? Math.round(averageOf(lateDays)! * 10) / 10 : null, untimed: done.length - timed.length },
    aging: countBuckets(ages.map((row) => Number(row.age)), buckets),
    overdueAging: countBuckets(ages.filter((row) => row.over_hours !== null).map((row) => Number(row.over_hours)), buckets),
    byPriority: byPriority.map((row) => ({ label: String(row.label), open: num(row.open_now), completed: num(row.completed), onTimeRate: rate(num(row.on_time), num(row.timed)) })),
    byType: byType.map((row) => ({ label: String(row.label), open: num(row.open_now), completed: num(row.completed) })),
    byDepartment: byDepartment.map((row) => ({ label: String(row.label), open: num(row.open_now), overdue: num(row.overdue), completed: num(row.completed), onTimeRate: rate(num(row.on_time), num(row.timed)) })),
    byAssignee: byAssignee.map((row) => ({ label: String(row.label), open: num(row.open_now), overdue: num(row.overdue), completed: num(row.completed) })),
    blocked: { count: num(blocked[0]?.n), avgHours: hours(blocked[0]?.avg_hours) },
    oldest: oldest.map((row) => ({ id: num(row.id), taskNo: String(row.task_no), priority: String(row.priority), assignee: String(row.assignee), ageDays: Math.floor(Number(row.age_days)), overdue: Boolean(Number(row.overdue)) })),
  };
}

// Daily (≤ 62 days) or monthly series of tasks created and completed.
export async function taskTrend(scope: Scope, viewer: Viewer, period: Period): Promise<{ labels: string[]; created: number[]; completed: number[] }> {
  const [from, to] = range(period);
  const s = taskScope(scope, viewer);
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
  const key = (column: string) => (days <= 62 ? `DATE_FORMAT(DATE_ADD(${column}, INTERVAL 330 MINUTE), '%Y-%m-%d')` : MONTH(column));
  const [created, completed] = await Promise.all([
    query(`SELECT ${key("t.created_at")} AS k, COUNT(*) AS n FROM tasks t ${s.join} WHERE ${s.sql} AND t.created_at >= ? AND t.created_at < ? GROUP BY k`, [...s.params, from, to]),
    query(`SELECT ${key("t.completed_at")} AS k, COUNT(*) AS n FROM tasks t ${s.join} WHERE ${s.sql} AND t.status = 'COMPLETED' AND t.completed_at >= ? AND t.completed_at < ? GROUP BY k`, [...s.params, from, to]),
  ]);
  const labels: string[] = [];
  if (days <= 62) {
    for (let day = new Date(`${period.from}T00:00:00Z`); day.toISOString().slice(0, 10) <= period.to; day = new Date(day.getTime() + 86_400_000)) labels.push(day.toISOString().slice(0, 10));
  } else {
    for (let month = period.from.slice(0, 7); month <= period.to.slice(0, 7); ) {
      labels.push(month);
      const [y, m] = month.split("-").map(Number) as [number, number];
      month = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    }
  }
  const a = new Map(created.map((row) => [String(row.k), num(row.n)]));
  const b = new Map(completed.map((row) => [String(row.k), num(row.n)]));
  return { labels, created: labels.map((label) => a.get(label) ?? 0), completed: labels.map((label) => b.get(label) ?? 0) };
}

// ---- information analytics ------------------------------------------------------
export interface InfoBoard {
  createdInPeriod: number;
  publishedInPeriod: number;
  withdrawnInPeriod: number;
  drafts: number;
  scheduled: number;
  active: number;
  expired: number;
  archived: number;
  ackRequiredInPeriod: number;
  ack: { recipients: number; acknowledged: number; pending: number; rate: number | null; avgHours: number | null; medianHours: number | null };
  reads: { recipients: number; read: number; rate: number | null; medianHours: number | null };
  pendingAging: Record<string, number>;
  byType: { label: string; published: number; ackRate: number | null }[];
  byPublisher: { label: string; published: number; ackRate: number | null }[];
  byRecipientDepartment: { label: string; recipients: number; ackRate: number | null; pending: number }[];
  lowest: { id: number; infoNo: string; title: string | null; recipients: number; ackRate: number | null; ageDays: number }[];
  delivery: { channel: string; sent: number; delivered: number; failed: number }[];
}

export async function infoBoard(scope: Scope, viewer: Viewer, period: Period, buckets: AgeBucket[], today: string): Promise<InfoBoard> {
  const [from, to] = range(period);
  const s = infoScope(scope, viewer);
  const rc = recipientScope(scope, viewer);
  const admin = viewer.roles.includes("IT_ADMIN") || viewer.roles.includes("SUPER_ADMIN");
  const PUBLISHED_IN = "i.status IN ('PUBLISHED', 'WITHDRAWN', 'ARCHIVED') AND i.published_at >= ? AND i.published_at < ?";
  const [counts, ack, reads, pending, byType, byPublisher, byDept, lowest, delivery] = await Promise.all([
    query(
      `SELECT SUM(i.created_at >= ? AND i.created_at < ?) AS created, SUM(${PUBLISHED_IN}) AS published,
         SUM(i.status = 'WITHDRAWN' AND i.withdrawn_at >= ? AND i.withdrawn_at < ?) AS withdrawn,
         SUM(i.status = 'DRAFT') AS drafts,
         SUM(i.status = 'PUBLISHED' AND i.effective_on > ?) AS scheduled,
         SUM(i.status = 'PUBLISHED' AND (i.expires_on IS NULL OR i.expires_on >= ?) AND (i.effective_on IS NULL OR i.effective_on <= ?)) AS active,
         SUM(i.status = 'PUBLISHED' AND i.expires_on < ?) AS expired,
         SUM(i.status = 'ARCHIVED') AS archived,
         SUM(${PUBLISHED_IN} AND i.ack_required) AS ack_required
       FROM info_items i ${s.join} WHERE ${s.sql}`,
      [from, to, from, to, from, to, today, today, today, today, from, to, ...s.params],
    ),
    query(
      `SELECT TIMESTAMPDIFF(MINUTE, i.published_at, rc.acknowledged_at) / 60 AS hours, rc.acknowledged_at IS NOT NULL AS done
       FROM info_recipients rc JOIN info_items i ON i.id = rc.info_id ${s.join}
       WHERE i.ack_required AND i.status IN ('PUBLISHED', 'ARCHIVED') AND i.published_at >= ? AND i.published_at < ? AND ${s.sql} LIMIT 50000`,
      [from, to, ...s.params],
    ),
    query(
      `SELECT TIMESTAMPDIFF(MINUTE, i.published_at, rc.read_at) / 60 AS hours, rc.read_at IS NOT NULL AS done
       FROM info_recipients rc JOIN info_items i ON i.id = rc.info_id ${s.join}
       WHERE i.status IN ('PUBLISHED', 'ARCHIVED') AND i.published_at >= ? AND i.published_at < ? AND ${s.sql} LIMIT 50000`,
      [from, to, ...s.params],
    ),
    query(
      `SELECT TIMESTAMPDIFF(MINUTE, i.published_at, UTC_TIMESTAMP()) / 60 AS age
       FROM info_recipients rc JOIN info_items i ON i.id = rc.info_id ${s.join}
       WHERE i.ack_required AND i.status = 'PUBLISHED' AND rc.acknowledged_at IS NULL AND ${s.sql} LIMIT 50000`,
      s.params,
    ),
    query(
      `SELECT mt.name AS label, COUNT(DISTINCT i.id) AS published, SUM(i.ack_required) AS required_rows, SUM(i.ack_required AND rc.acknowledged_at IS NOT NULL) AS acked
       FROM info_items i ${s.join} JOIN module_type_versions v ON v.id = i.type_version_id JOIN module_types mt ON mt.id = v.type_id
         LEFT JOIN info_recipients rc ON rc.info_id = i.id
       WHERE ${s.sql} AND ${PUBLISHED_IN} GROUP BY mt.id, mt.name ORDER BY published DESC LIMIT 15`,
      [...s.params, from, to],
    ),
    query(
      `SELECT ic.name AS label, COUNT(DISTINCT i.id) AS published, SUM(i.ack_required) AS required_rows, SUM(i.ack_required AND rc.acknowledged_at IS NOT NULL) AS acked
       FROM info_items i ${s.join} LEFT JOIN info_recipients rc ON rc.info_id = i.id
       WHERE ${s.sql} AND ${PUBLISHED_IN} GROUP BY ic.id, ic.name ORDER BY published DESC LIMIT 15`,
      [...s.params, from, to],
    ),
    query(
      `SELECT COALESCE(d.name, 'No department') AS label, COUNT(*) AS recipients, SUM(rc.acknowledged_at IS NOT NULL) AS acked, SUM(rc.acknowledged_at IS NULL AND i.status = 'PUBLISHED') AS pending
       FROM info_recipients rc JOIN info_items i ON i.id = rc.info_id ${rc.join} LEFT JOIN departments d ON d.id = ru.department_id
       WHERE i.ack_required AND i.status IN ('PUBLISHED', 'ARCHIVED') AND i.published_at >= ? AND i.published_at < ? AND ${rc.sql}
       GROUP BY label ORDER BY pending DESC LIMIT 30`,
      [from, to, ...rc.params],
    ),
    query(
      `SELECT i.id, i.info_no, i.title, i.created_by, COUNT(*) AS recipients, SUM(rc.acknowledged_at IS NOT NULL) AS acked, TIMESTAMPDIFF(HOUR, i.published_at, UTC_TIMESTAMP()) / 24 AS age_days
       FROM info_items i ${s.join} JOIN info_recipients rc ON rc.info_id = i.id
       WHERE ${s.sql} AND i.ack_required AND i.status = 'PUBLISHED' AND i.published_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)
       GROUP BY i.id ORDER BY acked / COUNT(*), i.published_at LIMIT 10`,
      s.params,
    ),
    query(
      `SELECT d.channel, SUM(d.status IN ('SENT', 'DELIVERED', 'READ')) AS sent, SUM(d.status IN ('DELIVERED', 'READ')) AS delivered, SUM(d.status = 'FAILED') AS failed
       FROM notification_deliveries d JOIN notifications n ON n.id = d.notification_id JOIN info_items i ON i.id = n.entity_id AND n.entity_type = 'INFO' ${s.join}
       WHERE n.event_type = 'INFO_PUBLISHED' AND ${s.sql} AND ${PUBLISHED_IN} GROUP BY d.channel`,
      [...s.params, from, to],
    ),
  ]);
  const c = counts[0]!;
  const ackDone = ack.filter((row) => Number(row.done)).map((row) => Number(row.hours));
  const readDone = reads.filter((row) => Number(row.done)).map((row) => Number(row.hours));
  return {
    createdInPeriod: num(c.created),
    publishedInPeriod: num(c.published),
    withdrawnInPeriod: num(c.withdrawn),
    drafts: num(c.drafts),
    scheduled: num(c.scheduled),
    active: num(c.active),
    expired: num(c.expired),
    archived: num(c.archived),
    ackRequiredInPeriod: num(c.ack_required),
    ack: { recipients: ack.length, acknowledged: ackDone.length, pending: ack.length - ackDone.length, rate: rate(ackDone.length, ack.length), avgHours: hours(averageOf(ackDone)), medianHours: hours(medianOf(ackDone)) },
    reads: { recipients: reads.length, read: readDone.length, rate: rate(readDone.length, reads.length), medianHours: hours(medianOf(readDone)) },
    pendingAging: countBuckets(pending.map((row) => Number(row.age)), buckets),
    byType: byType.map((row) => ({ label: String(row.label), published: num(row.published), ackRate: rate(num(row.acked), num(row.required_rows)) })),
    byPublisher: byPublisher.map((row) => ({ label: String(row.label), published: num(row.published), ackRate: rate(num(row.acked), num(row.required_rows)) })),
    byRecipientDepartment: byDept.map((row) => ({ label: String(row.label), recipients: num(row.recipients), ackRate: rate(num(row.acked), num(row.recipients)), pending: num(row.pending) })),
    // A title is shown only to its sender or IT; others see the number.
    lowest: lowest.map((row) => ({ id: num(row.id), infoNo: String(row.info_no), title: admin || num(row.created_by) === viewer.id ? String(row.title) : null, recipients: num(row.recipients), ackRate: rate(num(row.acked), num(row.recipients)), ageDays: Math.floor(Number(row.age_days)) })),
    delivery: delivery.map((row) => ({ channel: String(row.channel), sent: num(row.sent), delivered: num(row.delivered), failed: num(row.failed) })),
  };
}

// ---- employees -----------------------------------------------------------
export const EMPLOYEE_SORTS = ["name", "pending", "overdue", "tasks_open", "tasks_overdue", "acks_pending"] as const;
export type EmployeeSort = (typeof EMPLOYEE_SORTS)[number];

export interface EmployeeRow {
  id: number;
  name: string;
  department: string | null;
  submitted: number;
  decisions: number;
  avgDecisionHours: number | null;
  pendingApprovals: number;
  overdueApprovals: number;
  tasksAssigned: number;
  tasksCompleted: number;
  tasksOpen: number;
  tasksOverdue: number;
  onTimeRate: number | null;
  medianTaskHours: number | null;
  infoPublished: number;
  acksPending: number;
}

const SORT_SQL: Record<EmployeeSort, string> = {
  name: "u.name",
  pending: "pending_approvals DESC, u.name",
  overdue: "overdue_approvals DESC, u.name",
  tasks_open: "tasks_open DESC, u.name",
  tasks_overdue: "tasks_overdue DESC, u.name",
  acks_pending: "acks_pending DESC, u.name",
};

export async function employeeRows(scope: Scope, viewer: Viewer, period: Period, options: { search: string; sort: EmployeeSort; page: number; size: number }): Promise<{ rows: EmployeeRow[]; total: number }> {
  const [from, to] = range(period);
  const people = peopleScopeSql(scope, viewer, "u");
  const where = `u.active = TRUE AND u.is_break_glass = FALSE AND ${people.sql}${options.search ? " AND (u.name LIKE ? OR u.login_id LIKE ?)" : ""}`;
  const params = [...people.params, ...(options.search ? [`%${options.search}%`, `%${options.search}%`] : [])];
  const [[count]] = (await getDbPool().query<Row[]>(`SELECT COUNT(*) AS n FROM users u WHERE ${where}`, params)) as unknown as [Row[]];
  const rows = await query(
    `SELECT u.id, u.name, d.name AS department,
       (SELECT COUNT(*) FROM approval_requests r WHERE r.requester_id = u.id AND r.deleted_at IS NULL AND r.submitted_at >= ? AND r.submitted_at < ?) AS submitted,
       (SELECT COUNT(*) FROM approval_tasks t WHERE t.decided_by = u.id AND t.task_type = 'APPROVAL' AND t.decided_at >= ? AND t.decided_at < ?) AS decisions,
       (SELECT AVG(TIMESTAMPDIFF(MINUTE, t.created_at, t.decided_at)) / 60 FROM approval_tasks t WHERE t.decided_by = u.id AND t.task_type = 'APPROVAL' AND t.decided_at >= ? AND t.decided_at < ?) AS avg_decision,
       (SELECT COUNT(*) FROM approval_tasks t JOIN approval_requests r ON r.id = t.request_id WHERE t.approver_id = u.id AND t.status = 'PENDING' AND r.status = 'IN_PROGRESS' AND r.deleted_at IS NULL) AS pending_approvals,
       (SELECT COUNT(*) FROM approval_tasks t JOIN approval_requests r ON r.id = t.request_id WHERE t.approver_id = u.id AND t.status = 'PENDING' AND r.status = 'IN_PROGRESS' AND r.deleted_at IS NULL AND t.due_at < UTC_TIMESTAMP()) AS overdue_approvals,
       (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = u.id AND t.created_at >= ? AND t.created_at < ?) AS tasks_assigned,
       (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = u.id AND t.status = 'COMPLETED' AND t.completed_at >= ? AND t.completed_at < ?) AS tasks_completed,
       (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = u.id AND ${OPEN_TASK}) AS tasks_open,
       (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = u.id AND ${OPEN_TASK} AND t.due_at < UTC_TIMESTAMP()) AS tasks_overdue,
       (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = u.id AND t.status = 'COMPLETED' AND t.completed_at >= ? AND t.completed_at < ? AND t.due_at IS NOT NULL) AS tasks_timed,
       (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = u.id AND t.status = 'COMPLETED' AND t.completed_at >= ? AND t.completed_at < ? AND t.completed_at <= t.due_at) AS tasks_on_time,
       (SELECT COUNT(*) FROM info_items i WHERE i.created_by = u.id AND i.published_at >= ? AND i.published_at < ?) AS info_published,
       (SELECT COUNT(*) FROM info_recipients rc JOIN info_items i ON i.id = rc.info_id WHERE rc.user_id = u.id AND i.ack_required AND i.status = 'PUBLISHED' AND rc.acknowledged_at IS NULL) AS acks_pending
     FROM users u LEFT JOIN departments d ON d.id = u.department_id
     WHERE ${where} ORDER BY ${SORT_SQL[options.sort]} LIMIT ? OFFSET ?`,
    [from, to, from, to, from, to, from, to, from, to, from, to, from, to, from, to, ...params, options.size, (options.page - 1) * options.size],
  );
  const ids = rows.map((row) => num(row.id));
  const medians = new Map<number, number | null>();
  if (ids.length) {
    const durations = await query(
      "SELECT t.assignee_id AS id, TIMESTAMPDIFF(MINUTE, t.created_at, t.completed_at) / 60 AS hours FROM tasks t WHERE t.assignee_id IN (?) AND t.status = 'COMPLETED' AND t.completed_at >= ? AND t.completed_at < ? LIMIT 20000",
      [ids, from, to],
    );
    for (const id of ids) medians.set(id, hours(medianOf(durations.filter((row) => num(row.id) === id).map((row) => Number(row.hours)))));
  }
  return {
    total: num(count?.n),
    rows: rows.map((row) => ({
      id: num(row.id),
      name: String(row.name),
      department: (row.department as string | null) ?? null,
      submitted: num(row.submitted),
      decisions: num(row.decisions),
      avgDecisionHours: hours(row.avg_decision),
      pendingApprovals: num(row.pending_approvals),
      overdueApprovals: num(row.overdue_approvals),
      tasksAssigned: num(row.tasks_assigned),
      tasksCompleted: num(row.tasks_completed),
      tasksOpen: num(row.tasks_open),
      tasksOverdue: num(row.tasks_overdue),
      onTimeRate: rate(num(row.tasks_on_time), num(row.tasks_timed)),
      medianTaskHours: medians.get(num(row.id)) ?? null,
      infoPublished: num(row.info_published),
      acksPending: num(row.acks_pending),
    })),
  };
}

// ---- departments ------------------------------------------------------------
export interface DepartmentRow {
  id: number | null;
  name: string;
  people: number;
  requestsRaised: number;
  requestsOpen: number;
  requestsOverdue: number;
  avgCycleHours: number | null;
  tasksCreated: number;
  tasksCompleted: number;
  tasksOpen: number;
  tasksOverdue: number;
  taskOnTimeRate: number | null;
  infoPublished: number;
  ackRate: number | null;
  acksPending: number;
}

export async function departmentRows(scope: Scope, period: Period): Promise<DepartmentRow[] | null> {
  if (scope.kind !== "ORGANISATION" && scope.kind !== "DEPARTMENT") return null;
  const [from, to] = range(period);
  const filter = scope.kind === "DEPARTMENT" ? { sql: "d.id IN (?)", params: [scope.departmentIds ?? [0]] } : { sql: "d.active = TRUE", params: [] as unknown[] };
  const rows = await query(
    `SELECT d.id, d.name,
       (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id AND u.active = TRUE AND u.is_break_glass = FALSE) AS people,
       (SELECT COUNT(*) FROM approval_requests r JOIN users rq ON rq.id = r.requester_id WHERE rq.department_id = d.id AND r.deleted_at IS NULL AND r.submitted_at >= ? AND r.submitted_at < ?) AS raised,
       (SELECT COUNT(*) FROM approval_requests r JOIN users rq ON rq.id = r.requester_id WHERE rq.department_id = d.id AND r.deleted_at IS NULL AND r.status IN ('IN_PROGRESS', 'ON_HOLD', 'CHANGES_REQUIRED')) AS req_open,
       (SELECT COUNT(DISTINCT r.id) FROM approval_tasks t JOIN approval_requests r ON r.id = t.request_id JOIN users rq ON rq.id = r.requester_id WHERE rq.department_id = d.id AND r.deleted_at IS NULL AND r.status = 'IN_PROGRESS' AND t.status = 'PENDING' AND t.due_at < UTC_TIMESTAMP()) AS req_overdue,
       (SELECT AVG(TIMESTAMPDIFF(MINUTE, r.submitted_at, r.closed_at)) / 60 FROM approval_requests r JOIN users rq ON rq.id = r.requester_id WHERE rq.department_id = d.id AND r.deleted_at IS NULL AND r.status IN ('APPROVED', 'REJECTED') AND r.closed_at >= ? AND r.closed_at < ?) AS cycle,
       (SELECT COUNT(*) FROM tasks t JOIN users ta ON ta.id = t.assignee_id WHERE ta.department_id = d.id AND t.created_at >= ? AND t.created_at < ?) AS t_created,
       (SELECT COUNT(*) FROM tasks t JOIN users ta ON ta.id = t.assignee_id WHERE ta.department_id = d.id AND t.status = 'COMPLETED' AND t.completed_at >= ? AND t.completed_at < ?) AS t_completed,
       (SELECT COUNT(*) FROM tasks t JOIN users ta ON ta.id = t.assignee_id WHERE ta.department_id = d.id AND ${OPEN_TASK}) AS t_open,
       (SELECT COUNT(*) FROM tasks t JOIN users ta ON ta.id = t.assignee_id WHERE ta.department_id = d.id AND ${OPEN_TASK} AND t.due_at < UTC_TIMESTAMP()) AS t_overdue,
       (SELECT COUNT(*) FROM tasks t JOIN users ta ON ta.id = t.assignee_id WHERE ta.department_id = d.id AND t.status = 'COMPLETED' AND t.completed_at >= ? AND t.completed_at < ? AND t.due_at IS NOT NULL) AS t_timed,
       (SELECT COUNT(*) FROM tasks t JOIN users ta ON ta.id = t.assignee_id WHERE ta.department_id = d.id AND t.status = 'COMPLETED' AND t.completed_at >= ? AND t.completed_at < ? AND t.completed_at <= t.due_at) AS t_on_time,
       (SELECT COUNT(*) FROM info_items i JOIN users ic ON ic.id = i.created_by WHERE ic.department_id = d.id AND i.published_at >= ? AND i.published_at < ?) AS i_published,
       (SELECT COUNT(*) FROM info_recipients rc JOIN info_items i ON i.id = rc.info_id JOIN users ru ON ru.id = rc.user_id WHERE ru.department_id = d.id AND i.ack_required AND i.status IN ('PUBLISHED', 'ARCHIVED') AND i.published_at >= ? AND i.published_at < ?) AS ack_total,
       (SELECT COUNT(*) FROM info_recipients rc JOIN info_items i ON i.id = rc.info_id JOIN users ru ON ru.id = rc.user_id WHERE ru.department_id = d.id AND i.ack_required AND i.status IN ('PUBLISHED', 'ARCHIVED') AND i.published_at >= ? AND i.published_at < ? AND rc.acknowledged_at IS NOT NULL) AS ack_done,
       (SELECT COUNT(*) FROM info_recipients rc JOIN info_items i ON i.id = rc.info_id JOIN users ru ON ru.id = rc.user_id WHERE ru.department_id = d.id AND i.ack_required AND i.status = 'PUBLISHED' AND rc.acknowledged_at IS NULL) AS ack_pending
     FROM departments d WHERE ${filter.sql} ORDER BY d.name LIMIT 200`,
    [from, to, from, to, from, to, from, to, from, to, from, to, from, to, from, to, from, to, ...filter.params],
  );
  return rows.map((row) => ({
    id: num(row.id),
    name: String(row.name),
    people: num(row.people),
    requestsRaised: num(row.raised),
    requestsOpen: num(row.req_open),
    requestsOverdue: num(row.req_overdue),
    avgCycleHours: hours(row.cycle),
    tasksCreated: num(row.t_created),
    tasksCompleted: num(row.t_completed),
    tasksOpen: num(row.t_open),
    tasksOverdue: num(row.t_overdue),
    taskOnTimeRate: rate(num(row.t_on_time), num(row.t_timed)),
    infoPublished: num(row.i_published),
    ackRate: rate(num(row.ack_done), num(row.ack_total)),
    acksPending: num(row.ack_pending),
  }));
}

// ---- SLA and performance ------------------------------------------------------
export interface SlaBoard {
  approvals: { timed: number; onTime: number; onTimeRate: number | null; breached: number; overdueNow: number; avgOverdueHours: number | null; untimed: number };
  approvalsByDepartment: { label: string; timed: number; onTimeRate: number | null }[];
  approvalsByStep: { label: string; breaches: number; timed: number }[];
  tasks: { timed: number; onTime: number; onTimeRate: number | null; untimed: number };
  tasksByPriority: { label: string; timed: number; onTimeRate: number | null }[];
}

export async function slaBoard(scope: Scope, viewer: Viewer, period: Period): Promise<SlaBoard> {
  const [from, to] = range(period);
  const s = requestScopeSql(scope, viewer);
  const t = taskScope(scope, viewer);
  const TJOIN = "FROM approval_tasks t JOIN approval_requests r ON r.id = t.request_id JOIN users rq ON rq.id = r.requester_id";
  const DECIDED = "t.task_type = 'APPROVAL' AND t.status IN ('APPROVED', 'REJECTED', 'CHANGES_REQUESTED') AND t.decided_at >= ? AND t.decided_at < ?";
  const [summary, overdue, byDept, byStep, tasks, byPriority] = await Promise.all([
    query(`SELECT SUM(t.due_at IS NOT NULL) AS timed, SUM(t.decided_at <= t.due_at) AS on_time, SUM(t.decided_at > t.due_at) AS breached, SUM(t.due_at IS NULL) AS untimed ${TJOIN} WHERE r.deleted_at IS NULL AND ${DECIDED} AND ${s.sql}`, [from, to, ...s.params]),
    query(`SELECT COUNT(*) AS n, AVG(TIMESTAMPDIFF(MINUTE, t.due_at, UTC_TIMESTAMP())) / 60 AS avg_over ${TJOIN} WHERE r.deleted_at IS NULL AND r.status = 'IN_PROGRESS' AND t.status = 'PENDING' AND t.due_at < UTC_TIMESTAMP() AND ${s.sql}`, s.params),
    query(
      `SELECT COALESCE(d.name, 'No department') AS label, SUM(t.due_at IS NOT NULL) AS timed, SUM(t.decided_at <= t.due_at) AS on_time
       ${TJOIN} LEFT JOIN departments d ON d.id = rq.department_id WHERE r.deleted_at IS NULL AND ${DECIDED} AND ${s.sql} GROUP BY label HAVING timed > 0 ORDER BY timed DESC LIMIT 20`,
      [from, to, ...s.params],
    ),
    query(
      `SELECT t.node_label AS label, SUM(t.due_at IS NOT NULL) AS timed, SUM(t.decided_at > t.due_at) AS breaches
       ${TJOIN} WHERE r.deleted_at IS NULL AND ${DECIDED} AND ${s.sql} GROUP BY t.node_label HAVING breaches > 0 ORDER BY breaches DESC LIMIT 15`,
      [from, to, ...s.params],
    ),
    query(`SELECT SUM(t.due_at IS NOT NULL) AS timed, SUM(t.completed_at <= t.due_at) AS on_time, SUM(t.due_at IS NULL) AS untimed FROM tasks t ${t.join} WHERE t.status = 'COMPLETED' AND t.completed_at >= ? AND t.completed_at < ? AND ${t.sql}`, [from, to, ...t.params]),
    query(
      `SELECT t.priority AS label, SUM(t.due_at IS NOT NULL) AS timed, SUM(t.completed_at <= t.due_at) AS on_time FROM tasks t ${t.join}
       WHERE t.status = 'COMPLETED' AND t.completed_at >= ? AND t.completed_at < ? AND ${t.sql} GROUP BY t.priority`,
      [from, to, ...t.params],
    ),
  ]);
  const a = summary[0]!;
  const k = tasks[0]!;
  return {
    approvals: { timed: num(a.timed), onTime: num(a.on_time), onTimeRate: rate(num(a.on_time), num(a.timed)), breached: num(a.breached), overdueNow: num(overdue[0]?.n), avgOverdueHours: hours(overdue[0]?.avg_over), untimed: num(a.untimed) },
    approvalsByDepartment: byDept.map((row) => ({ label: String(row.label), timed: num(row.timed), onTimeRate: rate(num(row.on_time), num(row.timed)) })),
    approvalsByStep: byStep.map((row) => ({ label: String(row.label), breaches: num(row.breaches), timed: num(row.timed) })),
    tasks: { timed: num(k.timed), onTime: num(k.on_time), onTimeRate: rate(num(k.on_time), num(k.timed)), untimed: num(k.untimed) },
    tasksByPriority: byPriority.map((row) => ({ label: String(row.label), timed: num(row.timed), onTimeRate: rate(num(row.on_time), num(row.timed)) })),
  };
}

// ---- data quality --------------------------------------------------------
export interface QualityCheck {
  key: string;
  module: "Approvals" | "Tasks" | "Information" | "People";
  label: string;
  count: number;
  fix: string;
}

// Counts of records with missing or inconsistent data, within scope. Each
// says where to fix it. Review indicators, not proof of anything.
export async function qualityChecks(scope: Scope, viewer: Viewer, today: string): Promise<QualityCheck[]> {
  const r = requestScopeSql(scope, viewer);
  const t = taskScope(scope, viewer);
  const i = infoScope(scope, viewer);
  const people = peopleScopeSql(scope, viewer, "u");
  const one = async (sql: string, params: unknown[]) => num((await query(sql, params))[0]?.n);
  const checks: [QualityCheck["key"], QualityCheck["module"], string, string, Promise<number>][] = [
    ["req_no_pending", "Approvals", "Requests in progress with no outstanding task and no blocked step", "Admin → Needs attention", one(`SELECT COUNT(*) AS n ${REQUEST_JOINS} WHERE r.deleted_at IS NULL AND r.status = 'IN_PROGRESS' AND ${r.sql} AND NOT EXISTS (SELECT 1 FROM approval_tasks t WHERE t.request_id = r.id AND t.status = 'PENDING') AND JSON_SEARCH(r.state_json, 'one', 'BLOCKED') IS NULL`, r.params)],
    ["req_closed_no_time", "Approvals", "Finished requests without a closing time", "IT: check the request history", one(`SELECT COUNT(*) AS n ${REQUEST_JOINS} WHERE r.deleted_at IS NULL AND r.status IN ('APPROVED', 'REJECTED', 'CANCELLED') AND r.closed_at IS NULL AND ${r.sql}`, r.params)],
    ["req_inactive_approver", "Approvals", "Outstanding approvals held by inactive people", "Admin → Needs attention (hand over)", one(`SELECT COUNT(*) AS n FROM approval_tasks t JOIN approval_requests r ON r.id = t.request_id JOIN users rq ON rq.id = r.requester_id JOIN users ap ON ap.id = t.approver_id WHERE t.status = 'PENDING' AND r.status = 'IN_PROGRESS' AND r.deleted_at IS NULL AND ap.active = FALSE AND ${r.sql}`, r.params)],
    ["task_no_due", "Tasks", "Open tasks without a due date", "The task's page → Edit (or require due dates in the task type)", one(`SELECT COUNT(*) AS n FROM tasks t ${t.join} WHERE ${OPEN_TASK} AND t.due_at IS NULL AND ${t.sql}`, t.params)],
    ["task_done_no_time", "Tasks", "Completed tasks without a completion time", "IT: check the task history", one(`SELECT COUNT(*) AS n FROM tasks t ${t.join} WHERE t.status = 'COMPLETED' AND t.completed_at IS NULL AND ${t.sql}`, t.params)],
    ["task_inactive_assignee", "Tasks", "Open tasks assigned to inactive people", "The task's page → Reassign", one(`SELECT COUNT(*) AS n FROM tasks t ${t.join} WHERE ${OPEN_TASK} AND ta.active = FALSE AND ${t.sql}`, t.params)],
    ["task_no_department", "Tasks", "Open tasks whose assignee has no department (left out of department figures)", "Admin → Users: set the department", one(`SELECT COUNT(*) AS n FROM tasks t ${t.join} WHERE ${OPEN_TASK} AND ta.department_id IS NULL AND ${t.sql}`, t.params)],
    ["info_no_recipients", "Information", "Published information with no recipients", "Withdraw it, or publish again to the right people", one(`SELECT COUNT(*) AS n FROM info_items i ${i.join} WHERE i.status = 'PUBLISHED' AND NOT EXISTS (SELECT 1 FROM info_recipients rc WHERE rc.info_id = i.id) AND ${i.sql}`, i.params)],
    ["info_no_publish_time", "Information", "Published information without a publishing time", "IT: check the information history", one(`SELECT COUNT(*) AS n FROM info_items i ${i.join} WHERE i.status IN ('PUBLISHED', 'WITHDRAWN', 'ARCHIVED') AND i.published_at IS NULL AND ${i.sql}`, i.params)],
    ["info_bad_dates", "Information", "Information that expires before it takes effect", "The information's page → Edit", one(`SELECT COUNT(*) AS n FROM info_items i ${i.join} WHERE i.expires_on IS NOT NULL AND i.effective_on IS NOT NULL AND i.expires_on < i.effective_on AND ${i.sql}`, i.params)],
    ["info_ack_before_publish", "Information", "Acknowledgements dated before publishing", "IT: check the information history", one(`SELECT COUNT(*) AS n FROM info_recipients rc JOIN info_items i ON i.id = rc.info_id ${i.join} WHERE rc.acknowledged_at < i.published_at AND ${i.sql}`, i.params)],
    ["info_expired_pending", "Information", "Expired information still waiting for acknowledgements", "Expired is not acknowledged: follow up, or withdraw it", one(`SELECT COUNT(DISTINCT i.id) AS n FROM info_items i ${i.join} JOIN info_recipients rc ON rc.info_id = i.id WHERE i.status = 'PUBLISHED' AND i.ack_required AND i.expires_on < ? AND rc.acknowledged_at IS NULL AND ${i.sql}`, [today, ...i.params])],
    ["people_no_department", "People", "Active people without a department", "Admin → Users", one(`SELECT COUNT(*) AS n FROM users u WHERE u.active = TRUE AND u.is_break_glass = FALSE AND u.department_id IS NULL AND ${people.sql}`, people.params)],
    ["people_no_manager", "People", "Active people without a reporting manager", "Admin → Users", one(`SELECT COUNT(*) AS n FROM users u WHERE u.active = TRUE AND u.is_break_glass = FALSE AND u.reporting_manager_id IS NULL AND ${people.sql}`, people.params)],
  ];
  const counts = await Promise.all(checks.map((check) => check[4]));
  return checks.map(([key, module, label, fix], index) => ({ key, module, label, fix, count: counts[index]! }));
}
