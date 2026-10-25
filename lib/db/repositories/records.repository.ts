import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import { indiaDayStartUtc, likeOf, nextIndiaDayStartUtc, SORTS, type RecordFilter, type RecordKind } from "@/server/records/filters";

// D-191 (owner): the Admin registers. Read-only; every request, task and
// information item whoever raised it, for the IT team (the pages and the
// download check the Admin area). Deleted requests are left out, like
// everywhere else (D-086). Filters arrive already checked (filters.ts).
export const RECORDS_PAGE_SIZE = 50;
export const RECORDS_EXPORT_MAX = 10_000;

export interface RequestRecord {
  id: number;
  no: string;
  title: string;
  type: string;
  raisedBy: string;
  department: string | null;
  status: string;
  round: number;
  currentStep: string | null;
  waitingOn: string | null;
  approvals: number;
  submitted: Date;
  closed: Date | null;
}

export interface TaskRecord {
  id: number;
  no: string;
  title: string;
  type: string;
  priority: string;
  status: string;
  assignee: string;
  department: string | null;
  assignedBy: string;
  created: Date;
  due: Date | null;
  completed: Date | null;
  overdue: boolean;
  relatedRequest: string | null;
}

export interface InfoRecord {
  id: number;
  no: string;
  title: string;
  type: string;
  priority: string;
  status: string;
  createdBy: string;
  department: string | null;
  ackRequired: boolean;
  created: Date;
  published: Date | null;
  effectiveOn: string | null;
  expiresOn: string | null;
  recipients: number;
  read: number;
  acknowledged: number;
}

export type RecordRow<K extends RecordKind> = K extends "requests" ? RequestRecord : K extends "tasks" ? TaskRecord : InfoRecord;

function dates(column: string, filter: RecordFilter, where: string[], params: unknown[]) {
  if (filter.from) {
    where.push(`${column} >= ?`);
    params.push(indiaDayStartUtc(filter.from));
  }
  if (filter.to) {
    where.push(`${column} < ?`);
    params.push(nextIndiaDayStartUtc(filter.to));
  }
}

function sql(kind: RecordKind, filter: RecordFilter): { select: string; from: string; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (clause: string, value: unknown) => {
    where.push(clause);
    params.push(value);
  };
  if (kind === "requests") {
    where.push("r.deleted_at IS NULL");
    if (filter.q) {
      where.push("(r.request_no LIKE ? OR r.title LIKE ? OR u.name LIKE ?)");
      params.push(likeOf(filter.q), likeOf(filter.q), likeOf(filter.q));
    }
    if (filter.status) add("r.status = ?", filter.status);
    if (filter.type) add("w.id = ?", filter.type);
    if (filter.department) add("u.department_id = ?", filter.department);
    if (filter.person) add("r.requester_id = ?", filter.person);
    if (filter.waitingOn) add("EXISTS (SELECT 1 FROM approval_tasks p WHERE p.request_id = r.id AND p.status = 'PENDING' AND p.approver_id = ?)", filter.waitingOn);
    dates("r.submitted_at", filter, where, params);
    return {
      select: `SELECT r.id, r.request_no, r.title, w.name AS type_name, u.name AS requester_name, d.name AS department_name, r.status, r.round, r.submitted_at, r.closed_at,
        (SELECT GROUP_CONCAT(DISTINCT p.node_label ORDER BY p.node_label SEPARATOR ', ') FROM approval_tasks p WHERE p.request_id = r.id AND p.status = 'PENDING') AS current_step,
        (SELECT GROUP_CONCAT(DISTINCT a.name ORDER BY a.name SEPARATOR ', ') FROM approval_tasks p JOIN users a ON a.id = p.approver_id WHERE p.request_id = r.id AND p.status = 'PENDING') AS waiting_on,
        (SELECT COUNT(*) FROM approval_tasks p WHERE p.request_id = r.id AND p.status = 'APPROVED') AS approvals`,
      from: `FROM approval_requests r
        JOIN workflow_versions v ON v.id = r.workflow_version_id
        JOIN workflow_definitions w ON w.id = v.workflow_id
        JOIN users u ON u.id = r.requester_id
        LEFT JOIN departments d ON d.id = u.department_id
        WHERE ${where.join(" AND ")}`,
      params,
    };
  }
  if (kind === "tasks") {
    if (filter.q) {
      where.push("(t.task_no LIKE ? OR t.title LIKE ? OR a.name LIKE ?)");
      params.push(likeOf(filter.q), likeOf(filter.q), likeOf(filter.q));
    }
    if (filter.status) add("t.status = ?", filter.status);
    if (filter.priority) add("t.priority = ?", filter.priority);
    if (filter.type) add("mt.id = ?", filter.type);
    if (filter.department) add("a.department_id = ?", filter.department);
    if (filter.person) add("t.assignee_id = ?", filter.person);
    if (filter.overdue) where.push("t.status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED') AND t.due_at < UTC_TIMESTAMP()");
    dates("t.created_at", filter, where, params);
    return {
      select: `SELECT t.id, t.task_no, t.title, mt.name AS type_name, t.priority, t.status, a.name AS assignee_name, d.name AS department_name, ab.name AS assigned_by_name,
        t.created_at, t.due_at, t.completed_at, rr.request_no AS related_request,
        (t.status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED') AND t.due_at IS NOT NULL AND t.due_at < UTC_TIMESTAMP()) AS overdue`,
      from: `FROM tasks t
        JOIN module_type_versions mv ON mv.id = t.type_version_id
        JOIN module_types mt ON mt.id = mv.type_id
        JOIN users a ON a.id = t.assignee_id
        JOIN users ab ON ab.id = t.assigned_by
        LEFT JOIN departments d ON d.id = a.department_id
        LEFT JOIN approval_requests rr ON rr.id = t.related_request_id AND rr.deleted_at IS NULL
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`,
      params,
    };
  }
  if (filter.q) {
    where.push("(i.info_no LIKE ? OR i.title LIKE ? OR c.name LIKE ?)");
    params.push(likeOf(filter.q), likeOf(filter.q), likeOf(filter.q));
  }
  if (filter.status) add("i.status = ?", filter.status);
  if (filter.priority) add("i.priority = ?", filter.priority);
  if (filter.type) add("mt.id = ?", filter.type);
  if (filter.department) add("c.department_id = ?", filter.department);
  if (filter.person) add("i.created_by = ?", filter.person);
  dates("i.created_at", filter, where, params);
  return {
    select: `SELECT i.id, i.info_no, i.title, mt.name AS type_name, i.priority, i.status, i.ack_required, c.name AS creator_name, d.name AS department_name,
      i.created_at, i.published_at, DATE_FORMAT(i.effective_on, '%Y-%m-%d') AS effective_on, DATE_FORMAT(i.expires_on, '%Y-%m-%d') AS expires_on,
      (SELECT COUNT(*) FROM info_recipients x WHERE x.info_id = i.id) AS recipients,
      (SELECT COUNT(*) FROM info_recipients x WHERE x.info_id = i.id AND x.read_at IS NOT NULL) AS read_count,
      (SELECT COUNT(*) FROM info_recipients x WHERE x.info_id = i.id AND x.acknowledged_at IS NOT NULL) AS ack_count`,
    from: `FROM info_items i
      JOIN module_type_versions mv ON mv.id = i.type_version_id
      JOIN module_types mt ON mt.id = mv.type_id
      JOIN users c ON c.id = i.created_by
      LEFT JOIN departments d ON d.id = c.department_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`,
    params,
  };
}

function mapRow(kind: RecordKind, row: RowDataPacket): RequestRecord | TaskRecord | InfoRecord {
  if (kind === "requests")
    return { id: row.id, no: row.request_no, title: row.title, type: row.type_name, raisedBy: row.requester_name, department: row.department_name, status: row.status, round: Number(row.round), currentStep: row.current_step, waitingOn: row.waiting_on, approvals: Number(row.approvals), submitted: row.submitted_at, closed: row.closed_at };
  if (kind === "tasks")
    return { id: row.id, no: row.task_no, title: row.title, type: row.type_name, priority: row.priority, status: row.status, assignee: row.assignee_name, department: row.department_name, assignedBy: row.assigned_by_name, created: row.created_at, due: row.due_at, completed: row.completed_at, overdue: Boolean(Number(row.overdue)), relatedRequest: row.related_request };
  return { id: row.id, no: row.info_no, title: row.title, type: row.type_name, priority: row.priority, status: row.status, createdBy: row.creator_name, department: row.department_name, ackRequired: Boolean(row.ack_required), created: row.created_at, published: row.published_at, effectiveOn: row.effective_on, expiresOn: row.expires_on, recipients: Number(row.recipients), read: Number(row.read_count), acknowledged: Number(row.ack_count) };
}

const orderBy = (kind: RecordKind, filter: RecordFilter) => `${SORTS[kind][filter.sort] ?? SORTS[kind].no} ${filter.dir === "asc" ? "ASC" : "DESC"}, ${kind === "requests" ? "r" : kind === "tasks" ? "t" : "i"}.id DESC`;

export async function listRecords<K extends RecordKind>(kind: K, filter: RecordFilter, db: Queryable = getDbPool()): Promise<{ rows: RecordRow<K>[]; total: number; page: number; pages: number }> {
  const query = sql(kind, filter);
  const [count] = await db.query<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total ${query.from}`, query.params);
  const total = Number(count[0]?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / RECORDS_PAGE_SIZE));
  const page = Math.min(filter.page, pages);
  const [rows] = await db.query<RowDataPacket[]>(`${query.select} ${query.from} ORDER BY ${orderBy(kind, filter)} LIMIT ? OFFSET ?`, [...query.params, RECORDS_PAGE_SIZE, (page - 1) * RECORDS_PAGE_SIZE]);
  return { rows: rows.map((row) => mapRow(kind, row)) as RecordRow<K>[], total, page, pages };
}

export async function exportRecords<K extends RecordKind>(kind: K, filter: RecordFilter, db: Queryable = getDbPool()): Promise<{ rows: RecordRow<K>[]; truncated: boolean }> {
  const query = sql(kind, filter);
  const [rows] = await db.query<RowDataPacket[]>(`${query.select} ${query.from} ORDER BY ${orderBy(kind, filter)} LIMIT ?`, [...query.params, RECORDS_EXPORT_MAX + 1]);
  return { rows: rows.slice(0, RECORDS_EXPORT_MAX).map((row) => mapRow(kind, row)) as RecordRow<K>[], truncated: rows.length > RECORDS_EXPORT_MAX };
}

// The choices for the filters: types of this module, departments, people.
export async function recordChoices(kind: RecordKind, db: Queryable = getDbPool()): Promise<{ types: { id: number; name: string }[]; departments: { id: number; name: string }[]; people: { id: number; name: string }[] }> {
  const typeSql = kind === "requests" ? "SELECT id, name FROM workflow_definitions ORDER BY name" : "SELECT id, name FROM module_types WHERE module = ? ORDER BY name";
  const [[types], [departments], [people]] = await Promise.all([
    db.query<RowDataPacket[]>(typeSql, kind === "requests" ? [] : [kind === "tasks" ? "TASK" : "INFO"]),
    db.query<RowDataPacket[]>("SELECT id, name FROM departments ORDER BY name"),
    db.query<RowDataPacket[]>("SELECT id, name FROM users WHERE is_break_glass = FALSE ORDER BY name"),
  ]);
  const pick = (list: RowDataPacket[]) => list.map((row) => ({ id: Number(row.id), name: String(row.name) }));
  return { types: pick(types), departments: pick(departments), people: pick(people) };
}
