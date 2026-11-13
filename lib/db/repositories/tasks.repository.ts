import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import type { TaskPriority } from "@/server/modules/settings";
import type { TaskStatus } from "@/server/modules/task-rules";

// v1.9.0 (D-143): tasks, their append-only history and reminders.
export interface TaskRecord {
  id: number;
  taskNo: string;
  typeVersionId: number;
  typeId: number;
  typeName: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  createdBy: number;
  createdByName: string;
  assigneeId: number;
  assigneeName: string;
  assigneeManagerId: number | null;
  assignedBy: number;
  assignedByName: string;
  dueAt: Date | null;
  startsOn: string | null;
  formData: Record<string, unknown>;
  relatedRequestId: number | null;
  relatedRequestNo: string | null;
  completedByName: string | null;
  completedAt: Date | null;
  completionNote: string | null;
  cancelledAt: Date | null;
  rowVersion: number;
  createdAt: Date;
  updatedAt: Date;
  // D-215: subtasks, milestones, My Tasks and soft delete.
  parentTaskId: number | null;
  rootTaskId: number | null;
  depth: number;
  isMilestone: boolean;
  assignedAt: Date | null;
  deletedAt: Date | null;
  deletedBy: number | null;
}

type TaskRow = RowDataPacket & {
  id: number;
  task_no: string;
  type_version_id: number;
  type_id: number;
  type_name: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  created_by: number;
  created_by_name: string;
  assignee_id: number;
  assignee_name: string;
  assignee_manager_id: number | null;
  assigned_by: number;
  assigned_by_name: string;
  due_at: Date | null;
  starts_on: string | Date | null;
  form_data_json: unknown;
  related_request_id: number | null;
  related_request_no: string | null;
  completed_by_name: string | null;
  completed_at: Date | null;
  completion_note: string | null;
  cancelled_at: Date | null;
  row_version: number;
  created_at: Date;
  updated_at: Date;
  parent_task_id?: number | null;
  root_task_id?: number | null;
  depth?: number;
  is_milestone?: number | boolean;
  assigned_at?: Date | null;
  deleted_at?: Date | null;
  deleted_by?: number | null;
};

const dateOnly = (value: string | Date | null) => (value === null ? null : typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10));

const toTask = (row: TaskRow): TaskRecord => ({
  id: row.id,
  taskNo: row.task_no,
  typeVersionId: row.type_version_id,
  typeId: row.type_id,
  typeName: row.type_name,
  title: row.title,
  description: row.description,
  priority: row.priority,
  status: row.status,
  createdBy: row.created_by,
  createdByName: row.created_by_name,
  assigneeId: row.assignee_id,
  assigneeName: row.assignee_name,
  assigneeManagerId: row.assignee_manager_id,
  assignedBy: row.assigned_by,
  assignedByName: row.assigned_by_name,
  dueAt: row.due_at,
  startsOn: dateOnly(row.starts_on),
  formData: (typeof row.form_data_json === "string" ? JSON.parse(row.form_data_json) : row.form_data_json) as Record<string, unknown>,
  relatedRequestId: row.related_request_id,
  relatedRequestNo: row.related_request_no,
  completedByName: row.completed_by_name,
  completedAt: row.completed_at,
  completionNote: row.completion_note,
  cancelledAt: row.cancelled_at,
  rowVersion: row.row_version,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  parentTaskId: row.parent_task_id ?? null,
  rootTaskId: row.root_task_id ?? null,
  depth: Number(row.depth ?? 0),
  isMilestone: Boolean(row.is_milestone),
  assignedAt: row.assigned_at ?? null,
  deletedAt: row.deleted_at ?? null,
  deletedBy: row.deleted_by ?? null,
});

export const TASK_SELECT = `SELECT t.*, v.type_id, mt.name AS type_name, c.name AS created_by_name, a.name AS assignee_name, a.reporting_manager_id AS assignee_manager_id,
    ab.name AS assigned_by_name, cb.name AS completed_by_name, r.request_no AS related_request_no
  FROM tasks t
  JOIN module_type_versions v ON v.id = t.type_version_id
  JOIN module_types mt ON mt.id = v.type_id
  JOIN users c ON c.id = t.created_by
  JOIN users a ON a.id = t.assignee_id
  JOIN users ab ON ab.id = t.assigned_by
  LEFT JOIN users cb ON cb.id = t.completed_by
  LEFT JOIN approval_requests r ON r.id = t.related_request_id`;

export async function findTask(id: number, db: Queryable = getDbPool(), lock = false): Promise<TaskRecord | null> {
  if (lock) await db.query("SELECT id FROM tasks WHERE id = ? FOR UPDATE", [id]);
  const [rows] = await db.query<TaskRow[]>(`${TASK_SELECT} WHERE t.id = ?`, [id]);
  return rows[0] ? toTask(rows[0]) : null;
}

export async function findTaskBySubmissionKey(createdBy: number, key: string, db: Queryable = getDbPool()): Promise<{ id: number; taskNo: string } | null> {
  const [rows] = await db.query<(RowDataPacket & { id: number; task_no: string })[]>("SELECT id, task_no FROM tasks WHERE created_by = ? AND submission_key = ?", [createdBy, key]);
  return rows[0] ? { id: rows[0].id, taskNo: rows[0].task_no } : null;
}

export interface NewTask {
  taskNo: string;
  typeVersionId: number;
  title: string;
  description: string | null;
  priority: TaskPriority;
  createdBy: number;
  assigneeId: number;
  dueAt: Date | null;
  startsOn: string | null;
  formData: Record<string, unknown>;
  relatedRequestId: number | null;
  submissionKey: string | null;
}

export async function insertTask(task: NewTask, db: Queryable): Promise<number> {
  const [result] = await db.query<ResultSetHeader>(
    `INSERT INTO tasks (task_no, type_version_id, title, description, priority, status, created_by, assignee_id, assigned_by, due_at, starts_on, form_data_json, related_request_id, submission_key, created_at, assigned_at)
     VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
    [task.taskNo, task.typeVersionId, task.title, task.description, task.priority, task.createdBy, task.assigneeId, task.createdBy, task.dueAt, task.startsOn, JSON.stringify(task.formData), task.relatedRequestId, task.submissionKey],
  );
  return result.insertId;
}

// Every change goes through here, guarded by the row version read under the lock.
export async function updateTask(id: number, expectedVersion: number, changes: Record<string, unknown>, db: Queryable): Promise<boolean> {
  const allowed = ["title", "description", "priority", "status", "assignee_id", "assigned_by", "due_at", "starts_on", "form_data_json", "completed_by", "completed_at", "completion_note", "cancelled_by", "cancelled_at", "assigned_at", "recurrence_json"]; // v1.54.4: a reassigned task stops repeating
  const keys = Object.keys(changes).filter((key) => allowed.includes(key));
  if (keys.length === 0) return true;
  const [result] = await db.query<ResultSetHeader>(
    `UPDATE tasks SET ${keys.map((key) => `${key} = ?`).join(", ")}, row_version = row_version + 1 WHERE id = ? AND row_version = ?`,
    [...keys.map((key) => (key === "form_data_json" ? JSON.stringify(changes[key]) : changes[key])), id, expectedVersion],
  );
  return result.affectedRows === 1;
}

export interface TaskEvent {
  id: number;
  actorName: string | null;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  body: string | null;
  payload: Record<string, unknown> | null;
  createdAt: Date;
}

export async function appendTaskEvent(
  taskId: number,
  event: { actorId: number | null; type: string; from?: string | null; to?: string | null; body?: string | null; payload?: Record<string, unknown> | null },
  db: Queryable,
): Promise<void> {
  await db.query<ResultSetHeader>("INSERT INTO task_events (task_id, actor_id, event_type, from_status, to_status, body, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)", [
    taskId,
    event.actorId,
    event.type,
    event.from ?? null,
    event.to ?? null,
    event.body ?? null,
    event.payload ? JSON.stringify(event.payload) : null,
  ]);
}

export async function listTaskEvents(taskId: number, db: Queryable = getDbPool()): Promise<TaskEvent[]> {
  const [rows] = await db.query<(RowDataPacket & { id: number; name: string | null; event_type: string; from_status: string | null; to_status: string | null; body: string | null; payload_json: unknown; created_at: Date })[]>(
    "SELECT e.id, u.name, e.event_type, e.from_status, e.to_status, e.body, e.payload_json, e.created_at FROM task_events e LEFT JOIN users u ON u.id = e.actor_id WHERE e.task_id = ? ORDER BY e.id",
    [taskId],
  );
  return rows.map((row) => ({
    id: row.id,
    actorName: row.name,
    eventType: row.event_type,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    body: row.body,
    payload: (typeof row.payload_json === "string" ? JSON.parse(row.payload_json) : row.payload_json) as Record<string, unknown> | null,
    createdAt: row.created_at,
  }));
}

// ---- lists ------------------------------------------------------------------------
export type TaskBase = "MINE" | "CREATED" | "TEAM" | "PERIODIC";
export interface TaskListItem {
  id: number;
  taskNo: string;
  title: string;
  typeName: string;
  typeId: number;
  priority: TaskPriority;
  status: TaskStatus;
  assigneeId: number;
  assigneeName: string;
  createdByName: string;
  dueAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  formData: Record<string, unknown>;
}

export async function listTasks(where: string[], params: unknown[], orderBy: string, limit: number, offset: number, db: Queryable = getDbPool()): Promise<{ rows: TaskListItem[]; total: number }> {
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [rows] = await db.query<TaskRow[]>(`${TASK_SELECT} ${clause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const [count] = await db.query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) AS total FROM tasks t JOIN module_type_versions v ON v.id = t.type_version_id JOIN users a ON a.id = t.assignee_id ${clause}`,
    params,
  );
  return {
    rows: rows.map(toTask).map((task) => ({
      id: task.id,
      taskNo: task.taskNo,
      title: task.title,
      typeName: task.typeName,
      typeId: task.typeId,
      priority: task.priority,
      status: task.status,
      assigneeId: task.assigneeId,
      assigneeName: task.assigneeName,
      createdByName: task.createdByName,
      dueAt: task.dueAt,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      formData: task.formData,
    })),
    total: Number(count[0]?.total ?? 0),
  };
}

export async function countTasks(where: string[], params: unknown[], db: Queryable = getDbPool()): Promise<number> {
  const [count] = await db.query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) AS total FROM tasks t JOIN module_type_versions v ON v.id = t.type_version_id JOIN users a ON a.id = t.assignee_id ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`,
    params,
  );
  return Number(count[0]?.total ?? 0);
}

// ---- people facts for assignment and visibility ------------------------------------
export interface PersonFacts {
  id: number;
  name: string;
  active: boolean;
  departmentId: number | null;
  managerId: number | null;
  groupIds: number[];
}

export async function personFacts(id: number, db: Queryable = getDbPool()): Promise<PersonFacts | null> {
  const [rows] = await db.query<(RowDataPacket & { id: number; name: string; active: number; department_id: number | null; reporting_manager_id: number | null })[]>(
    "SELECT id, name, active, department_id, reporting_manager_id FROM users WHERE id = ?",
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  const [groups] = await db.query<(RowDataPacket & { group_id: number })[]>("SELECT m.group_id FROM approver_group_members m JOIN approver_groups g ON g.id = m.group_id AND g.active = TRUE WHERE m.user_id = ?", [id]);
  return { id: row.id, name: row.name, active: row.active === 1, departmentId: row.department_id, managerId: row.reporting_manager_id, groupIds: groups.map((group) => group.group_id) };
}

export async function hasDirectReports(managerId: number, db: Queryable = getDbPool()): Promise<boolean> {
  const [rows] = await db.query<RowDataPacket[]>("SELECT 1 FROM users WHERE reporting_manager_id = ? AND active = TRUE LIMIT 1", [managerId]);
  return rows.length > 0;
}

// ---- reminders (job runner) --------------------------------------------------------
export interface DueTask {
  id: number;
  taskNo: string;
  title: string;
  assigneeId: number;
  createdBy: number;
  dueAt: Date;
  settings: unknown;
}

// Open tasks due within the next `hours`, or overdue, with their type's settings.
export async function listTasksForReminders(limit: number, db: Queryable = getDbPool()): Promise<DueTask[]> {
  const [rows] = await db.query<(RowDataPacket & { id: number; task_no: string; title: string; assignee_id: number; created_by: number; due_at: Date; settings_json: unknown })[]>(
    `SELECT t.id, t.task_no, t.title, t.assignee_id, t.created_by, t.due_at, v.settings_json
     FROM tasks t JOIN module_type_versions v ON v.id = t.type_version_id
     WHERE t.status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED') AND t.due_at IS NOT NULL AND t.due_at < DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY)
     ORDER BY t.due_at LIMIT ?`,
    [limit],
  );
  return rows.map((row) => ({ id: row.id, taskNo: row.task_no, title: row.title, assigneeId: row.assignee_id, createdBy: row.created_by, dueAt: row.due_at, settings: typeof row.settings_json === "string" ? JSON.parse(row.settings_json) : row.settings_json }));
}

// Claim a reminder (once per task, kind and due time). true = this caller sends it.
export async function claimTaskReminder(taskId: number, kind: string, db: Queryable = getDbPool()): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>("INSERT IGNORE INTO task_item_reminders (task_id, kind) VALUES (?, ?)", [taskId, kind.slice(0, 30)]);
  return result.affectedRows === 1;
}

// Every active person (no break-glass) with what assignment scopes need.
export async function listPeopleFacts(db: Queryable = getDbPool()): Promise<(PersonFacts & { loginId: string; departmentName: string | null })[]> {
  const [rows] = await db.query<(RowDataPacket & { id: number; name: string; login_id: string; department_id: number | null; reporting_manager_id: number | null; department_name: string | null })[]>(
    "SELECT u.id, u.name, u.login_id, u.department_id, u.reporting_manager_id, d.name AS department_name FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.active = TRUE AND u.is_break_glass = FALSE ORDER BY u.name",
  );
  const [groups] = await db.query<(RowDataPacket & { user_id: number; group_id: number })[]>("SELECT m.user_id, m.group_id FROM approver_group_members m JOIN approver_groups g ON g.id = m.group_id AND g.active = TRUE");
  const byUser = new Map<number, number[]>();
  for (const row of groups) byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row.group_id]);
  return rows.map((row) => ({ id: row.id, name: row.name, loginId: row.login_id, departmentName: row.department_name, active: true, departmentId: row.department_id, managerId: row.reporting_manager_id, groupIds: byUser.get(row.id) ?? [] }));
}
