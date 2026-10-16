import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { requestScopeSql, taskScopeSql, type Scope, type ScopeKind, type Viewer } from "@/server/analytics/scope";
import { APPROACHING_SHARE, median, percentile, SLA_LABEL } from "@/server/analytics/semantics";
import type { AnalyticsFilter } from "@/lib/db/repositories/analytics.repository";
import { listBudgets } from "@/lib/db/repositories/budgets.repository";
import { financialYear, fyLabel } from "@/server/workflows/type-settings";
import { moduleReports } from "@/server/reports/module-reports";

// Reports catalogue (Addendum A §10, D-123). Each report: who may run it
// (scopes), its columns, and a scoped query capped at MAX_ROWS. The same
// rows feed the preview, CSV, XLSX, PDF and scheduled deliveries.
export const MAX_ROWS = 5000;

export type Cell = string | number | null;
export interface Column {
  key: string;
  label: string;
  kind: "text" | "number" | "hours" | "percent" | "date" | "datetime";
}
export interface ReportResult {
  columns: Column[];
  rows: Cell[][];
  truncated: boolean;
}
export interface ReportDefinition {
  key: string;
  name: string;
  description: string;
  scopes: readonly ScopeKind[];
  usesPeriod: boolean;
  run: (scope: Scope, viewer: Viewer, filter: AnalyticsFilter) => Promise<ReportResult>;
}

const INDIA_DATE = (column: string) => `DATE(DATE_ADD(${column}, INTERVAL 330 MINUTE))`;
const JOINS = `FROM approval_requests r JOIN workflow_versions v ON v.id = r.workflow_version_id JOIN workflow_definitions w ON w.id = v.workflow_id JOIN users rq ON rq.id = r.requester_id`;
const TASK_JOINS = `FROM approval_tasks t JOIN approval_requests r ON r.id = t.request_id JOIN workflow_versions v ON v.id = r.workflow_version_id JOIN workflow_definitions w ON w.id = v.workflow_id JOIN users rq ON rq.id = r.requester_id`;
const STATUS_LABEL: Record<string, string> = { IN_PROGRESS: "In progress", ON_HOLD: "On hold", CHANGES_REQUIRED: "Back with requester", APPROVED: "Approved", REJECTED: "Rejected", CANCELLED: "Withdrawn" };
const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));
const round1 = (value: number | null) => (value === null ? null : Math.round(value * 10) / 10);

function scoped(scope: Scope, viewer: Viewer, filter: AnalyticsFilter, level: "request" | "task" | "pending" = "request") {
  const base = level === "request" ? requestScopeSql(scope, viewer) : taskScopeSql(scope, viewer, level === "pending");
  const parts = ["r.deleted_at IS NULL", base.sql];
  const params = [...base.params];
  if (filter.workflowId === -1) parts.push("w.kind = 'CUSTOM'");
  else if (filter.workflowId !== null) {
    parts.push("w.id = ?");
    params.push(filter.workflowId);
  }
  if (filter.departmentId !== null && scope.kind === "ORGANISATION") {
    parts.push("rq.department_id = ?");
    params.push(filter.departmentId);
  }
  return { sql: parts.join(" AND "), params };
}

// v1.7.0 (C02): background exports run with a higher row cap; everything
// else (screen, downloads, schedules) keeps MAX_ROWS.
export const BACKGROUND_MAX_ROWS = 50000;
export const rowCap = new AsyncLocalStorage<number>();

async function query(sql: string, params: unknown[]): Promise<{ rows: RowDataPacket[]; truncated: boolean }> {
  const cap = rowCap.getStore() ?? MAX_ROWS;
  const [rows] = await getDbPool().query<RowDataPacket[]>(`${sql} LIMIT ${cap + 1}`, params);
  return { rows: rows.slice(0, cap), truncated: rows.length > cap };
}

const EVERYONE: readonly ScopeKind[] = ["MINE", "APPROVALS", "TEAM", "DEPARTMENT", "ORGANISATION"];
const MANAGERS: readonly ScopeKind[] = ["TEAM", "DEPARTMENT", "ORGANISATION"];

export const REPORTS: readonly ReportDefinition[] = [
  {
    key: "request_register",
    name: "Request register",
    description: "Every request raised in the period, with its outcome and time to decide.",
    scopes: EVERYONE,
    usesPeriod: true,
    run: async (scope, viewer, filter) => {
      const w = scoped(scope, viewer, filter);
      const { rows, truncated } = await query(
        `SELECT r.request_no, r.title, w.name AS type, rq.name AS raiser, d.name AS department, r.status, r.submitted_at, r.closed_at,
                CASE WHEN r.status IN ('APPROVED', 'REJECTED') THEN TIMESTAMPDIFF(MINUTE, r.submitted_at, r.closed_at) / 60 END AS hours,
                (SELECT GROUP_CONCAT(DISTINCT t.node_label SEPARATOR ', ') FROM approval_tasks t WHERE t.request_id = r.id AND t.status = 'PENDING') AS waiting_at
         ${JOINS} LEFT JOIN departments d ON d.id = rq.department_id
         WHERE ${w.sql} AND ${INDIA_DATE("r.submitted_at")} BETWEEN ? AND ? ORDER BY r.submitted_at DESC`,
        [...w.params, filter.period.from, filter.period.to],
      );
      return {
        columns: [
          { key: "no", label: "Request", kind: "text" },
          { key: "title", label: "Title", kind: "text" },
          { key: "type", label: "Approval type", kind: "text" },
          { key: "raiser", label: "Raised by", kind: "text" },
          { key: "department", label: "Department", kind: "text" },
          { key: "status", label: "Status", kind: "text" },
          { key: "submitted", label: "Raised", kind: "datetime" },
          { key: "closed", label: "Closed", kind: "datetime" },
          { key: "hours", label: "Hours to decide", kind: "hours" },
          { key: "waiting", label: "Waiting at", kind: "text" },
        ],
        rows: rows.map((row) => [row.request_no, row.title, row.type, row.raiser, row.department ?? "", STATUS_LABEL[row.status] ?? row.status, iso(row.submitted_at), iso(row.closed_at), round1(num(row.hours)), row.waiting_at ?? ""]),
        truncated,
      };
    },
  },
  {
    key: "pending_approvals",
    name: "Pending approvals",
    description: "Outstanding approval tasks right now: who has them, for how long, and their response-time status.",
    scopes: EVERYONE,
    usesPeriod: false,
    run: async (scope, viewer, filter) => pendingRows(scope, viewer, filter, false),
  },
  {
    key: "overdue_approvals",
    name: "Overdue approvals",
    description: "Outstanding tasks past their step's response time.",
    scopes: EVERYONE,
    usesPeriod: false,
    run: async (scope, viewer, filter) => pendingRows(scope, viewer, filter, true),
  },
  {
    key: "approver_performance",
    name: "Approver performance",
    description: "Decisions per approver in the period: outcomes, time taken and decisions in time.",
    scopes: ["APPROVALS", ...MANAGERS],
    usesPeriod: true,
    run: async (scope, viewer, filter) => {
      const w = scoped(scope, viewer, filter, "task");
      const { rows, truncated } = await query(
        `SELECT u.name, COUNT(*) AS decided, SUM(t.status = 'APPROVED') AS approved, SUM(t.status = 'REJECTED') AS rejected, SUM(t.status = 'CHANGES_REQUESTED') AS sent_back,
                AVG(TIMESTAMPDIFF(MINUTE, t.created_at, t.decided_at)) / 60 AS hours, SUM(t.due_at IS NOT NULL AND t.decided_at <= t.due_at) AS on_time, SUM(t.due_at IS NOT NULL) AS timed
         ${TASK_JOINS} JOIN users u ON u.id = t.decided_by
         WHERE ${w.sql} AND t.task_type = 'APPROVAL' AND t.status IN ('APPROVED', 'REJECTED', 'CHANGES_REQUESTED') AND ${INDIA_DATE("t.decided_at")} BETWEEN ? AND ?
         GROUP BY u.id, u.name ORDER BY decided DESC`,
        [...w.params, filter.period.from, filter.period.to],
      );
      return {
        columns: [
          { key: "approver", label: "Approver", kind: "text" },
          { key: "decided", label: "Decisions", kind: "number" },
          { key: "approved", label: "Approved", kind: "number" },
          { key: "rejected", label: "Rejected", kind: "number" },
          { key: "sentBack", label: "Sent back", kind: "number" },
          { key: "hours", label: "Average hours", kind: "hours" },
          { key: "onTime", label: "In time %", kind: "percent" },
        ],
        rows: rows.map((row) => [row.name, Number(row.decided), Number(row.approved), Number(row.rejected), Number(row.sent_back), round1(num(row.hours)), Number(row.timed) ? round1((Number(row.on_time) / Number(row.timed)) * 100) : null]),
        truncated,
      };
    },
  },
  {
    key: "turnaround_by_step",
    name: "Turnaround by step",
    description: "How long each step takes to decide in the period: average, median and slowest 10 %.",
    scopes: ["APPROVALS", ...MANAGERS],
    usesPeriod: true,
    run: async (scope, viewer, filter) => {
      const w = scoped(scope, viewer, filter, "task");
      const [rows] = await getDbPool().query<RowDataPacket[]>(
        `SELECT w.name AS type, t.node_label AS step, TIMESTAMPDIFF(MINUTE, t.created_at, t.decided_at) / 60 AS hours, (t.due_at IS NOT NULL) AS timed, (t.due_at IS NOT NULL AND t.decided_at <= t.due_at) AS on_time
         ${TASK_JOINS} WHERE ${w.sql} AND t.task_type = 'APPROVAL' AND t.decided_at IS NOT NULL AND t.status IN ('APPROVED', 'REJECTED', 'CHANGES_REQUESTED') AND ${INDIA_DATE("t.decided_at")} BETWEEN ? AND ?
         LIMIT 50000`,
        [...w.params, filter.period.from, filter.period.to],
      );
      type Group = { type: string; step: string; hours: number[]; timed: number; onTime: number };
      const groups = new Map<string, Group>();
      for (const row of rows) {
        const key = `${row.type}|${row.step}`;
        const group: Group = groups.get(key) ?? { type: String(row.type), step: String(row.step), hours: [], timed: 0, onTime: 0 };
        group.hours.push(Number(row.hours));
        group.timed += Number(row.timed);
        group.onTime += Number(row.on_time);
        groups.set(key, group);
      }
      const list = [...groups.values()].sort((a, b) => (median(b.hours) ?? 0) - (median(a.hours) ?? 0));
      return {
        columns: [
          { key: "type", label: "Approval type", kind: "text" },
          { key: "step", label: "Step", kind: "text" },
          { key: "decisions", label: "Decisions", kind: "number" },
          { key: "avg", label: "Average hours", kind: "hours" },
          { key: "median", label: "Median hours", kind: "hours" },
          { key: "p90", label: "90th percentile hours", kind: "hours" },
          { key: "onTime", label: "In time %", kind: "percent" },
        ],
        rows: list.map((group) => [group.type, group.step, group.hours.length, round1(group.hours.reduce((a, b) => a + b, 0) / group.hours.length), round1(median(group.hours)), round1(percentile(group.hours, 90)), group.timed ? round1((group.onTime / group.timed) * 100) : null]),
        truncated: false,
      };
    },
  },
  {
    key: "type_summary",
    name: "Approval type summary",
    description: "Per approval type: raised in the period, outcomes so far, approval rate and time to decide.",
    scopes: EVERYONE,
    usesPeriod: true,
    run: async (scope, viewer, filter) => summary("w.name", scope, viewer, filter, "Approval type"),
  },
  {
    key: "department_summary",
    name: "Department summary",
    description: "Per raiser's department: raised in the period, outcomes so far, approval rate and time to decide.",
    scopes: ["DEPARTMENT", "ORGANISATION"],
    usesPeriod: true,
    run: async (scope, viewer, filter) => summary("COALESCE(d.name, 'No department')", scope, viewer, filter, "Department"),
  },
  {
    key: "sla_compliance",
    name: "Response-time compliance",
    description: "Per step: tasks decided in the period in time, late, or with no response time set.",
    scopes: ["APPROVALS", ...MANAGERS],
    usesPeriod: true,
    run: async (scope, viewer, filter) => {
      const w = scoped(scope, viewer, filter, "task");
      const { rows, truncated } = await query(
        `SELECT w.name AS type, t.node_label AS step, SUM(t.due_at IS NOT NULL AND t.decided_at <= t.due_at) AS in_time, SUM(t.due_at IS NOT NULL AND t.decided_at > t.due_at) AS late, SUM(t.due_at IS NULL) AS no_sla
         ${TASK_JOINS} WHERE ${w.sql} AND t.task_type = 'APPROVAL' AND t.decided_at IS NOT NULL AND t.status IN ('APPROVED', 'REJECTED', 'CHANGES_REQUESTED') AND ${INDIA_DATE("t.decided_at")} BETWEEN ? AND ?
         GROUP BY w.name, t.node_label ORDER BY late DESC, w.name`,
        [...w.params, filter.period.from, filter.period.to],
      );
      return {
        columns: [
          { key: "type", label: "Approval type", kind: "text" },
          { key: "step", label: "Step", kind: "text" },
          { key: "inTime", label: SLA_LABEL.COMPLETED_WITHIN, kind: "number" },
          { key: "late", label: SLA_LABEL.COMPLETED_AFTER, kind: "number" },
          { key: "noSla", label: SLA_LABEL.NOT_CONFIGURED, kind: "number" },
          { key: "share", label: "In time %", kind: "percent" },
        ],
        rows: rows.map((row) => {
          const timed = Number(row.in_time) + Number(row.late);
          return [row.type, row.step, Number(row.in_time), Number(row.late), Number(row.no_sla), timed ? round1((Number(row.in_time) / timed) * 100) : null];
        }),
        truncated,
      };
    },
  },
  {
    key: "amendments",
    name: "Amendments",
    description: "Amendments of approved requests raised in the period, what they change and their outcome.",
    scopes: EVERYONE,
    usesPeriod: true,
    run: async (scope, viewer, filter) => {
      const w = scoped(scope, viewer, filter);
      const { rows, truncated } = await query(
        `SELECT r.request_no, o.request_no AS original_no, r.status, a.reason, a.changes_json, a.created_at
         FROM request_amendments a JOIN approval_requests r ON r.id = a.amendment_id JOIN approval_requests o ON o.id = a.original_id
         JOIN workflow_versions v ON v.id = r.workflow_version_id JOIN workflow_definitions w ON w.id = v.workflow_id JOIN users rq ON rq.id = r.requester_id
         WHERE ${w.sql} AND ${INDIA_DATE("a.created_at")} BETWEEN ? AND ? ORDER BY a.created_at DESC`,
        [...w.params, filter.period.from, filter.period.to],
      );
      return {
        columns: [
          { key: "no", label: "Amendment", kind: "text" },
          { key: "original", label: "Original", kind: "text" },
          { key: "status", label: "Status", kind: "text" },
          { key: "fields", label: "Fields changed", kind: "text" },
          { key: "reason", label: "Reason", kind: "text" },
          { key: "raised", label: "Raised", kind: "datetime" },
        ],
        rows: rows.map((row) => {
          const changes = (typeof row.changes_json === "string" ? JSON.parse(row.changes_json) : row.changes_json) as { key: string }[];
          return [row.request_no, row.original_no, STATUS_LABEL[row.status] ?? row.status, changes.map((change) => change.key).join(", "), row.reason, iso(row.created_at)];
        }),
        truncated,
      };
    },
  },
  {
    key: "duplicate_overrides",
    name: "Possible duplicates submitted anyway",
    description: "Requests submitted in the period after a possible-duplicate warning, with the reason given.",
    scopes: EVERYONE,
    usesPeriod: true,
    run: async (scope, viewer, filter) => {
      const w = scoped(scope, viewer, filter);
      const { rows, truncated } = await query(
        `SELECT r.request_no, r.title, w.name AS type, rq.name AS raiser, c.override_reason, c.created_at
         FROM request_submission_checks c JOIN approval_requests r ON r.id = c.request_id JOIN workflow_versions v ON v.id = r.workflow_version_id JOIN workflow_definitions w ON w.id = v.workflow_id JOIN users rq ON rq.id = r.requester_id
         WHERE ${w.sql} AND c.override_reason IS NOT NULL AND ${INDIA_DATE("c.created_at")} BETWEEN ? AND ? ORDER BY c.created_at DESC`,
        [...w.params, filter.period.from, filter.period.to],
      );
      return {
        columns: [
          { key: "no", label: "Request", kind: "text" },
          { key: "title", label: "Title", kind: "text" },
          { key: "type", label: "Approval type", kind: "text" },
          { key: "raiser", label: "Raised by", kind: "text" },
          { key: "reason", label: "Reason given", kind: "text" },
          { key: "submitted", label: "Submitted", kind: "datetime" },
        ],
        rows: rows.map((row) => [row.request_no, row.title, row.type, row.raiser, row.override_reason, iso(row.created_at)]),
        truncated,
      };
    },
  },
  {
    key: "department_scorecard",
    name: "Department scorecard",
    description: "Per raiser's department: volume, outcomes, time to decide, decisions in time and the backlog now. In the organisation view the first row is the whole organisation, for comparison.",
    scopes: ["DEPARTMENT", "ORGANISATION"],
    usesPeriod: true,
    run: async (scope, viewer, filter) => {
      const w = scoped(scope, viewer, filter);
      const t = scoped(scope, viewer, filter, "task");
      const period = [filter.period.from, filter.period.to];
      const [raised] = await getDbPool().query<RowDataPacket[]>(
        `SELECT rq.department_id AS dept, COUNT(*) AS raised ${JOINS} WHERE ${w.sql} AND ${INDIA_DATE("r.submitted_at")} BETWEEN ? AND ? GROUP BY rq.department_id`,
        [...w.params, ...period],
      );
      const [closed] = await getDbPool().query<RowDataPacket[]>(
        `SELECT rq.department_id AS dept, SUM(r.status = 'APPROVED') AS approved, SUM(r.status = 'REJECTED') AS rejected,
                AVG(CASE WHEN r.status IN ('APPROVED', 'REJECTED') THEN TIMESTAMPDIFF(MINUTE, r.submitted_at, r.closed_at) / 60 END) AS hours
         ${JOINS} WHERE ${w.sql} AND r.closed_at IS NOT NULL AND ${INDIA_DATE("r.closed_at")} BETWEEN ? AND ? GROUP BY rq.department_id`,
        [...w.params, ...period],
      );
      const [decided] = await getDbPool().query<RowDataPacket[]>(
        `SELECT rq.department_id AS dept, SUM(t.due_at IS NOT NULL AND t.decided_at <= t.due_at) AS on_time, SUM(t.due_at IS NOT NULL) AS timed
         ${TASK_JOINS} WHERE ${t.sql} AND t.task_type = 'APPROVAL' AND t.decided_at IS NOT NULL AND t.status IN ('APPROVED', 'REJECTED', 'CHANGES_REQUESTED') AND ${INDIA_DATE("t.decided_at")} BETWEEN ? AND ?
         GROUP BY rq.department_id`,
        [...t.params, ...period],
      );
      const [now] = await getDbPool().query<RowDataPacket[]>(
        `SELECT rq.department_id AS dept, COUNT(DISTINCT CASE WHEN r.status IN ('IN_PROGRESS', 'ON_HOLD', 'CHANGES_REQUIRED') THEN r.id END) AS open_n,
                SUM(t.status = 'PENDING' AND r.status = 'IN_PROGRESS' AND t.due_at < CURRENT_TIMESTAMP) AS overdue
         ${JOINS} LEFT JOIN approval_tasks t ON t.request_id = r.id WHERE ${w.sql} GROUP BY rq.department_id`,
        w.params,
      );
      const [departments] = await getDbPool().query<RowDataPacket[]>("SELECT id, name FROM departments ORDER BY name");
      type Score = { raised: number; approved: number; rejected: number; hours: number | null; hoursWeight: number; onTime: number; timed: number; open: number; overdue: number };
      const empty = (): Score => ({ raised: 0, approved: 0, rejected: 0, hours: null, hoursWeight: 0, onTime: 0, timed: 0, open: 0, overdue: 0 });
      const scores = new Map<string, Score>();
      const get = (dept: unknown) => {
        const key = dept === null || dept === undefined ? "none" : String(dept);
        if (!scores.has(key)) scores.set(key, empty());
        return scores.get(key)!;
      };
      for (const row of raised) get(row.dept).raised = Number(row.raised);
      for (const row of closed) Object.assign(get(row.dept), { approved: Number(row.approved), rejected: Number(row.rejected), hours: num(row.hours), hoursWeight: Number(row.approved) + Number(row.rejected) });
      for (const row of decided) Object.assign(get(row.dept), { onTime: Number(row.on_time), timed: Number(row.timed) });
      for (const row of now) Object.assign(get(row.dept), { open: Number(row.open_n), overdue: Number(row.overdue ?? 0) });
      const nameOf = new Map(departments.map((row) => [String(row.id), String(row.name)]));
      const toRow = (label: string, s: Score): Cell[] => [
        label,
        s.raised,
        s.approved,
        s.approved + s.rejected ? round1((s.approved / (s.approved + s.rejected)) * 100) : null,
        round1(s.hours),
        s.timed ? round1((s.onTime / s.timed) * 100) : null,
        s.open,
        s.overdue,
      ];
      const rows = [...scores.entries()].filter(([, s]) => s.raised || s.approved || s.rejected || s.open || s.timed).map(([key, s]) => ({ label: key === "none" ? "No department" : (nameOf.get(key) ?? key), s }));
      rows.sort((a, b) => b.s.raised - a.s.raised);
      const out: Cell[][] = rows.map((row) => toRow(row.label, row.s));
      if (scope.kind === "ORGANISATION" && rows.length) {
        const total = empty();
        let weighted = 0;
        for (const { s } of rows) {
          total.raised += s.raised;
          total.approved += s.approved;
          total.rejected += s.rejected;
          total.onTime += s.onTime;
          total.timed += s.timed;
          total.open += s.open;
          total.overdue += s.overdue;
          if (s.hours !== null) {
            weighted += s.hours * s.hoursWeight;
            total.hoursWeight += s.hoursWeight;
          }
        }
        total.hours = total.hoursWeight ? weighted / total.hoursWeight : null;
        out.unshift(toRow("Whole organisation", total));
      }
      return {
        columns: [
          { key: "department", label: "Department", kind: "text" },
          { key: "raised", label: "Raised", kind: "number" },
          { key: "approved", label: "Approved", kind: "number" },
          { key: "rate", label: "Approval rate %", kind: "percent" },
          { key: "hours", label: "Average hours to decide", kind: "hours" },
          { key: "onTime", label: "Decided in time %", kind: "percent" },
          { key: "open", label: "Open now", kind: "number" },
          { key: "overdue", label: "Overdue tasks now", kind: "number" },
        ],
        rows: out,
        truncated: false,
      };
    },
  },
  {
    key: "budget_position",
    name: "Budget position",
    description: "Each department's budget for the current financial year: committed, available and used.",
    scopes: ["DEPARTMENT", "ORGANISATION"],
    usesPeriod: false,
    run: async (scope) => {
      const fy = financialYear(new Date());
      const all = await listBudgets(fy);
      const rows = scope.kind === "DEPARTMENT" ? all.filter((row) => scope.departmentIds?.includes(row.departmentId)) : all;
      return {
        columns: [
          { key: "department", label: "Department", kind: "text" },
          { key: "fy", label: "Financial year", kind: "text" },
          { key: "budget", label: "Budget (₹)", kind: "number" },
          { key: "committed", label: "Committed (₹)", kind: "number" },
          { key: "available", label: "Available (₹)", kind: "number" },
          { key: "used", label: "Used %", kind: "percent" },
        ],
        rows: rows.map((row) => [
          row.departmentName,
          fyLabel(fy),
          row.budgetPaise === null ? null : row.budgetPaise / 100,
          row.committedPaise / 100,
          row.budgetPaise === null ? null : (row.budgetPaise - row.committedPaise) / 100,
          row.budgetPaise ? round1((row.committedPaise / row.budgetPaise) * 100) : null,
        ]),
        truncated: false,
      };
    },
  },
  // v1.9.0: Task and Information reports.
  ...moduleReports(() => rowCap.getStore() ?? MAX_ROWS),
];

export const REPORT = Object.fromEntries(REPORTS.map((report) => [report.key, report])) as Record<string, ReportDefinition>;

export function reportsFor(scopeKinds: readonly ScopeKind[]): ReportDefinition[] {
  return REPORTS.filter((report) => report.scopes.some((kind) => scopeKinds.includes(kind)));
}

function iso(value: Date | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null;
}

async function pendingRows(scope: Scope, viewer: Viewer, filter: AnalyticsFilter, overdueOnly: boolean): Promise<ReportResult> {
  const w = scoped(scope, viewer, filter, "pending");
  const { rows, truncated } = await query(
    `SELECT r.request_no, r.title, w.name AS type, t.node_label AS step, u.name AS approver, t.created_at, t.due_at, r.status AS request_status,
            TIMESTAMPDIFF(MINUTE, t.created_at, CURRENT_TIMESTAMP) / 60 AS age_hours,
            CASE WHEN t.due_at IS NULL THEN 'NOT_CONFIGURED' WHEN r.status = 'ON_HOLD' THEN 'PAUSED' WHEN t.due_at < CURRENT_TIMESTAMP THEN 'BREACHED'
                 WHEN TIMESTAMPDIFF(SECOND, t.created_at, CURRENT_TIMESTAMP) >= ? * TIMESTAMPDIFF(SECOND, t.created_at, t.due_at) THEN 'APPROACHING' ELSE 'WITHIN' END AS sla
     ${TASK_JOINS} JOIN users u ON u.id = t.approver_id
     WHERE ${w.sql} AND t.status = 'PENDING' AND r.status ${overdueOnly ? "= 'IN_PROGRESS' AND t.due_at < CURRENT_TIMESTAMP" : "IN ('IN_PROGRESS', 'ON_HOLD')"}
     ORDER BY t.due_at IS NULL, t.due_at, t.created_at`,
    [APPROACHING_SHARE, ...w.params],
  );
  return {
    columns: [
      { key: "no", label: "Request", kind: "text" },
      { key: "title", label: "Title", kind: "text" },
      { key: "type", label: "Approval type", kind: "text" },
      { key: "step", label: "Step", kind: "text" },
      { key: "approver", label: "With", kind: "text" },
      { key: "assigned", label: "Assigned", kind: "datetime" },
      { key: "due", label: "Due", kind: "datetime" },
      { key: "age", label: "Hours at this step", kind: "hours" },
      { key: "sla", label: "Response-time status", kind: "text" },
    ],
    rows: rows.map((row) => [row.request_no, row.title, row.type, row.step, row.approver, iso(row.created_at), iso(row.due_at), round1(num(row.age_hours)), SLA_LABEL[row.sla as keyof typeof SLA_LABEL] ?? row.sla]),
    truncated,
  };
}

async function summary(groupExpr: string, scope: Scope, viewer: Viewer, filter: AnalyticsFilter, label: string): Promise<ReportResult> {
  const w = scoped(scope, viewer, filter);
  const { rows, truncated } = await query(
    `SELECT ${groupExpr} AS name, COUNT(*) AS raised, SUM(r.status = 'APPROVED') AS approved, SUM(r.status = 'REJECTED') AS rejected, SUM(r.status = 'CANCELLED') AS withdrawn,
            SUM(r.status IN ('IN_PROGRESS', 'ON_HOLD', 'CHANGES_REQUIRED')) AS open_n,
            AVG(CASE WHEN r.status IN ('APPROVED', 'REJECTED') THEN TIMESTAMPDIFF(MINUTE, r.submitted_at, r.closed_at) / 60 END) AS hours
     ${JOINS} LEFT JOIN departments d ON d.id = rq.department_id
     WHERE ${w.sql} AND ${INDIA_DATE("r.submitted_at")} BETWEEN ? AND ? GROUP BY name ORDER BY raised DESC`,
    [...w.params, filter.period.from, filter.period.to],
  );
  return {
    columns: [
      { key: "name", label, kind: "text" },
      { key: "raised", label: "Raised", kind: "number" },
      { key: "approved", label: "Approved", kind: "number" },
      { key: "rejected", label: "Rejected", kind: "number" },
      { key: "withdrawn", label: "Withdrawn", kind: "number" },
      { key: "open", label: "Open", kind: "number" },
      { key: "rate", label: "Approval rate %", kind: "percent" },
      { key: "hours", label: "Average hours to decide", kind: "hours" },
    ],
    rows: rows.map((row) => {
      const decided = Number(row.approved) + Number(row.rejected);
      return [row.name, Number(row.raised), Number(row.approved), Number(row.rejected), Number(row.withdrawn), Number(row.open_n), decided ? round1((Number(row.approved) / decided) * 100) : null, round1(num(row.hours))];
    }),
    truncated,
  };
}
