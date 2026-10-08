import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import { CUSTOM_TYPE, type DashboardFilter } from "@/server/dashboards/filters";

// Admin dashboards (S11-11, D-087, F-74). Read-only aggregates; deleted
// requests (D-086) are never counted. A request belongs to the period by the
// India date it was raised, and to the department its raiser is in now.
const n = (value: unknown) => Number(value ?? 0);
const hoursOrNull = (value: unknown) => (value === null || value === undefined ? null : Number(value));
const INDIA_DATE = (column: string) => `DATE(DATE_ADD(${column}, INTERVAL 330 MINUTE))`;
const CLOSE_HOURS = "TIMESTAMPDIFF(MINUTE, r.submitted_at, r.closed_at) / 60";

// Shared conditions on r (request), w (approval type) and rq (raiser).
function requestScope(filter: DashboardFilter, options: { department: "raiser" | "none" } = { department: "raiser" }): { sql: string; params: unknown[] } {
  const where = ["r.deleted_at IS NULL", `${INDIA_DATE("r.submitted_at")} BETWEEN ? AND ?`];
  const params: unknown[] = [filter.from, filter.to];
  if (filter.workflowId === CUSTOM_TYPE) where.push("w.kind = 'CUSTOM'");
  else if (filter.workflowId !== null) {
    where.push("w.id = ?");
    params.push(filter.workflowId);
  }
  if (options.department === "raiser" && filter.departmentId !== null) {
    where.push("rq.department_id = ?");
    params.push(filter.departmentId);
  }
  return { sql: where.join(" AND "), params };
}

const REQUEST_JOINS = `FROM approval_requests r
  JOIN workflow_versions v ON v.id = r.workflow_version_id
  JOIN workflow_definitions w ON w.id = v.workflow_id
  JOIN users rq ON rq.id = r.requester_id`;

const OUTCOME_COLUMNS = `COUNT(r.id) AS raised,
  SUM(r.status = 'APPROVED') AS approved, SUM(r.status = 'REJECTED') AS rejected, SUM(r.status = 'CANCELLED') AS withdrawn,
  SUM(r.status IN ('IN_PROGRESS', 'ON_HOLD', 'CHANGES_REQUIRED')) AS open_count,
  AVG(CASE WHEN r.status IN ('APPROVED', 'REJECTED') AND r.closed_at IS NOT NULL THEN ${CLOSE_HOURS} END) AS avg_close_hours`;

export interface Outcomes {
  raised: number;
  approved: number;
  rejected: number;
  withdrawn: number;
  open: number;
  avgCloseHours: number | null;
}

const outcomes = (row: RowDataPacket): Outcomes => ({
  raised: n(row.raised),
  approved: n(row.approved),
  rejected: n(row.rejected),
  withdrawn: n(row.withdrawn),
  open: n(row.open_count),
  avgCloseHours: hoursOrNull(row.avg_close_hours),
});

export async function dashboardChoices(db: Queryable = getDbPool()): Promise<{ types: { id: number; name: string }[]; departments: { id: number; name: string }[] }> {
  const [types] = await db.query<(RowDataPacket & { id: number; name: string })[]>("SELECT id, name FROM workflow_definitions WHERE kind = 'PREDEFINED' ORDER BY name");
  const [departments] = await db.query<(RowDataPacket & { id: number; name: string })[]>("SELECT id, name FROM departments ORDER BY name");
  return { types: types.map((row) => ({ id: row.id, name: row.name })), departments: departments.map((row) => ({ id: row.id, name: row.name })) };
}

// ---- Utilisation: per approval type -------------------------------------------------------
export interface UtilisationRow extends Outcomes {
  workflowId: number | null; // null = all custom approvals together
  name: string;
  active: boolean;
  published: boolean;
  lastRaisedAt: Date | null;
}

export async function loadUtilisation(filter: DashboardFilter, db: Queryable = getDbPool()): Promise<UtilisationRow[]> {
  const scope = requestScope(filter);
  // Every predefined type is listed, used or not; requests join on the filter.
  const typeFilter = filter.workflowId === CUSTOM_TYPE ? "AND FALSE" : filter.workflowId !== null ? "AND w.id = ?" : "";
  const [types] = await db.query<RowDataPacket[]>(
    `SELECT w.id, w.name, w.active,
            EXISTS (SELECT 1 FROM workflow_versions p WHERE p.workflow_id = w.id AND p.status = 'PUBLISHED') AS published,
            COALESCE(s.raised, 0) AS raised, s.approved, s.rejected, s.withdrawn, s.open_count, s.avg_close_hours, s.last_raised
     FROM workflow_definitions w
     LEFT JOIN (
       SELECT w.id AS workflow_id, ${OUTCOME_COLUMNS}, MAX(r.submitted_at) AS last_raised
       ${REQUEST_JOINS}
       WHERE ${scope.sql}
       GROUP BY w.id
     ) s ON s.workflow_id = w.id
     WHERE w.kind = 'PREDEFINED' ${typeFilter}
     ORDER BY raised DESC, w.name`,
    [...scope.params, ...(filter.workflowId !== null && filter.workflowId !== CUSTOM_TYPE ? [filter.workflowId] : [])],
  );
  const rows: UtilisationRow[] = types.map((row) => ({
    workflowId: row.id,
    name: row.name,
    active: n(row.active) === 1,
    published: n(row.published) === 1,
    lastRaisedAt: row.last_raised ?? null,
    ...outcomes(row),
  }));
  if (filter.workflowId === null || filter.workflowId === CUSTOM_TYPE) {
    const [[custom]] = await db.query<RowDataPacket[]>(
      `SELECT ${OUTCOME_COLUMNS}, MAX(r.submitted_at) AS last_raised ${REQUEST_JOINS} WHERE ${scope.sql} AND w.kind = 'CUSTOM'`,
      scope.params,
    );
    if (custom) rows.push({ workflowId: null, name: "Custom approvals (all)", active: true, published: true, lastRaisedAt: custom.last_raised ?? null, ...outcomes(custom) });
  }
  return rows;
}

// ---- Department-wise raised ---------------------------------------------------------------
export interface DepartmentRow extends Outcomes {
  departmentId: number | null;
  name: string;
  raisers: number;
  topTypes: { name: string; raised: number }[];
}

export async function loadDepartments(filter: DashboardFilter, db: Queryable = getDbPool()): Promise<DepartmentRow[]> {
  const scope = requestScope(filter);
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT rq.department_id, COALESCE(d.name, 'No department') AS name, COUNT(DISTINCT r.requester_id) AS raisers, ${OUTCOME_COLUMNS}
     ${REQUEST_JOINS} LEFT JOIN departments d ON d.id = rq.department_id
     WHERE ${scope.sql}
     GROUP BY rq.department_id, d.name ORDER BY raised DESC, name`,
    scope.params,
  );
  const [byType] = await db.query<RowDataPacket[]>(
    `SELECT rq.department_id, IF(w.kind = 'CUSTOM', 'Custom approvals', w.name) AS type_name, COUNT(*) AS raised
     ${REQUEST_JOINS}
     WHERE ${scope.sql}
     GROUP BY rq.department_id, type_name ORDER BY raised DESC, type_name`,
    scope.params,
  );
  return rows.map((row) => ({
    departmentId: row.department_id ?? null,
    name: row.name,
    raisers: n(row.raisers),
    topTypes: byType
      .filter((item) => (item.department_id ?? null) === (row.department_id ?? null))
      .slice(0, 3)
      .map((item) => ({ name: item.type_name, raised: n(item.raised) })),
    ...outcomes(row),
  }));
}

// ---- Approver-wise ------------------------------------------------------------------------
export interface ApproverRow {
  approverId: number;
  name: string;
  designation: string | null;
  department: string | null;
  assigned: number;
  approved: number;
  rejected: number;
  changes: number;
  notNeeded: number;
  pending: number;
  overdue: number;
  avgDecideHours: number | null;
  onTimePercent: number | null;
}

// Tasks given in the period (by the India date the task was created). The
// department filter is the approver's department here.
export async function loadApprovers(filter: DashboardFilter, db: Queryable = getDbPool()): Promise<ApproverRow[]> {
  const scope = requestScope(filter, { department: "none" });
  const where = scope.sql.replace(`${INDIA_DATE("r.submitted_at")} BETWEEN ? AND ?`, `${INDIA_DATE("t.created_at")} BETWEEN ? AND ?`);
  const params = [...scope.params];
  let departmentSql = "";
  if (filter.departmentId !== null) {
    departmentSql = "AND a.department_id = ?";
    params.push(filter.departmentId);
  }
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT a.id, a.name, g.name AS designation, d.name AS department,
            SUM(t.status <> 'CANCELLED') AS assigned,
            SUM(t.status = 'APPROVED') AS approved, SUM(t.status = 'REJECTED') AS rejected, SUM(t.status = 'CHANGES_REQUESTED') AS changes,
            SUM(t.status = 'NOT_REQUIRED') AS not_needed,
            SUM(t.status = 'PENDING' AND r.status IN ('IN_PROGRESS', 'ON_HOLD')) AS pending,
            SUM(t.status = 'PENDING' AND r.status = 'IN_PROGRESS' AND t.due_at < CURRENT_TIMESTAMP) AS overdue,
            AVG(CASE WHEN t.decided_at IS NOT NULL AND t.status IN ('APPROVED', 'REJECTED', 'CHANGES_REQUESTED') THEN TIMESTAMPDIFF(MINUTE, t.created_at, t.decided_at) / 60 END) AS avg_decide_hours,
            SUM(t.decided_at IS NOT NULL AND t.due_at IS NOT NULL AND t.status IN ('APPROVED', 'REJECTED', 'CHANGES_REQUESTED') AND t.decided_at <= t.due_at) AS on_time,
            SUM(t.decided_at IS NOT NULL AND t.due_at IS NOT NULL AND t.status IN ('APPROVED', 'REJECTED', 'CHANGES_REQUESTED')) AS timed
     FROM approval_tasks t
     JOIN approval_requests r ON r.id = t.request_id
     JOIN workflow_versions v ON v.id = r.workflow_version_id
     JOIN workflow_definitions w ON w.id = v.workflow_id
     JOIN users a ON a.id = t.approver_id
     LEFT JOIN designations g ON g.id = a.designation_id
     LEFT JOIN departments d ON d.id = a.department_id
     WHERE ${where} ${departmentSql}
     GROUP BY a.id, a.name, g.name, d.name
     ORDER BY assigned DESC, a.name`,
    params,
  );
  return rows.map((row) => ({
    approverId: row.id,
    name: row.name,
    designation: row.designation ?? null,
    department: row.department ?? null,
    assigned: n(row.assigned),
    approved: n(row.approved),
    rejected: n(row.rejected),
    changes: n(row.changes),
    notNeeded: n(row.not_needed),
    pending: n(row.pending),
    overdue: n(row.overdue),
    avgDecideHours: hoursOrNull(row.avg_decide_hours),
    onTimePercent: n(row.timed) === 0 ? null : Math.round((n(row.on_time) / n(row.timed)) * 100),
  }));
}

// ---- Raiser-wise, by department -----------------------------------------------------------
export interface RaiserRow extends Outcomes {
  requesterId: number;
  name: string;
  department: string;
  lastRaisedAt: Date | null;
}

export async function loadRaisers(filter: DashboardFilter, db: Queryable = getDbPool()): Promise<RaiserRow[]> {
  const scope = requestScope(filter);
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT rq.id, rq.name, COALESCE(d.name, 'No department') AS department, ${OUTCOME_COLUMNS}, MAX(r.submitted_at) AS last_raised
     ${REQUEST_JOINS} LEFT JOIN departments d ON d.id = rq.department_id
     WHERE ${scope.sql}
     GROUP BY rq.id, rq.name, d.name
     ORDER BY department, raised DESC, rq.name`,
    scope.params,
  );
  return rows.map((row) => ({ requesterId: row.id, name: row.name, department: row.department, lastRaisedAt: row.last_raised ?? null, ...outcomes(row) }));
}
