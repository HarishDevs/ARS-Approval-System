import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import type { EngineEvent, InstanceState, InstanceStatus, WorkflowDefinition, WorkflowNode } from "@/server/engine/types";

// Persistence for workflows and requests (S2-06, D-050, F-13). Only the
// service layer (server/approvals) calls these, inside its transactions.

// ---- workflows ---------------------------------------------------------------
export interface WorkflowRecord {
  id: number;
  code: string;
  name: string;
  kind: "PREDEFINED" | "CUSTOM";
  requestPrefix: string;
  ownerUserId: number | null;
  active: boolean;
}

export interface WorkflowVersionRecord {
  id: number;
  workflowId: number;
  versionNo: number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  definition: WorkflowDefinition;
}

export async function insertWorkflow(
  input: { code: string; name: string; description: string | null; kind: WorkflowRecord["kind"]; requestPrefix: string; ownerUserId: number | null; createdBy: number },
  db: Queryable = getDbPool(),
): Promise<number> {
  const [result] = await db.query<ResultSetHeader>(
    `INSERT INTO workflow_definitions (code, name, description, kind, request_prefix, owner_user_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [input.code, input.name, input.description, input.kind, input.requestPrefix, input.ownerUserId, input.createdBy],
  );
  return result.insertId;
}

export async function findWorkflow(id: number, db: Queryable = getDbPool()): Promise<WorkflowRecord | null> {
  const [rows] = await db.query<(RowDataPacket & { id: number; code: string; name: string; kind: WorkflowRecord["kind"]; request_prefix: string; owner_user_id: number | null; active: number })[]>(
    "SELECT id, code, name, kind, request_prefix, owner_user_id, active FROM workflow_definitions WHERE id = ? LIMIT 1",
    [id],
  );
  const row = rows[0];
  return row ? { id: row.id, code: row.code, name: row.name, kind: row.kind, requestPrefix: row.request_prefix, ownerUserId: row.owner_user_id, active: row.active === 1 } : null;
}

export async function insertWorkflowVersion(workflowId: number, definition: WorkflowDefinition, createdBy: number, db: Queryable = getDbPool()): Promise<{ id: number; versionNo: number }> {
  const [rows] = await db.query<(RowDataPacket & { next_no: number })[]>(
    "SELECT COALESCE(MAX(version_no), 0) + 1 AS next_no FROM workflow_versions WHERE workflow_id = ? FOR UPDATE",
    [workflowId],
  );
  const versionNo = Number(rows[0]?.next_no ?? 1);
  const [result] = await db.query<ResultSetHeader>(
    "INSERT INTO workflow_versions (workflow_id, version_no, definition_json, created_by) VALUES (?, ?, ?, ?)",
    [workflowId, versionNo, JSON.stringify(definition), createdBy],
  );
  return { id: result.insertId, versionNo };
}

type VersionRow = RowDataPacket & { id: number; workflow_id: number; version_no: number; status: WorkflowVersionRecord["status"]; definition_json: WorkflowDefinition | string };

function toVersion(row: VersionRow): WorkflowVersionRecord {
  const definition = typeof row.definition_json === "string" ? (JSON.parse(row.definition_json) as WorkflowDefinition) : row.definition_json;
  return { id: row.id, workflowId: row.workflow_id, versionNo: row.version_no, status: row.status, definition };
}

export async function findWorkflowVersion(id: number, db: Queryable = getDbPool()): Promise<WorkflowVersionRecord | null> {
  const [rows] = await db.query<VersionRow[]>("SELECT id, workflow_id, version_no, status, definition_json FROM workflow_versions WHERE id = ? LIMIT 1", [id]);
  return rows[0] ? toVersion(rows[0]) : null;
}

export async function findPublishedVersion(workflowId: number, db: Queryable = getDbPool()): Promise<WorkflowVersionRecord | null> {
  const [rows] = await db.query<VersionRow[]>(
    "SELECT id, workflow_id, version_no, status, definition_json FROM workflow_versions WHERE workflow_id = ? AND status = 'PUBLISHED' LIMIT 1",
    [workflowId],
  );
  return rows[0] ? toVersion(rows[0]) : null;
}

// Archive the old published version, then publish this one (same transaction).
export async function publishWorkflowVersion(versionId: number, workflowId: number, publishedBy: number, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>("UPDATE workflow_versions SET status = 'ARCHIVED' WHERE workflow_id = ? AND status = 'PUBLISHED'", [workflowId]);
  await db.query<ResultSetHeader>(
    "UPDATE workflow_versions SET status = 'PUBLISHED', published_by = ?, published_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'DRAFT'",
    [publishedBy, versionId],
  );
}

// ---- request numbers -------------------------------------------------------------
// PREFIX-YYYY-000001. The row lock makes concurrent submissions queue, so
// numbers are unique and gap-free per prefix and year.
export async function nextRequestNumber(prefix: string, db: Queryable = getDbPool()): Promise<string> {
  const [yearRows] = await db.query<(RowDataPacket & { year: number })[]>("SELECT YEAR(CURRENT_TIMESTAMP) AS year");
  const year = Number(yearRows[0]!.year);
  await db.query<ResultSetHeader>("INSERT INTO request_sequences (prefix, year, current_value) VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE prefix = prefix", [prefix, year]);
  const [rows] = await db.query<(RowDataPacket & { current_value: number })[]>("SELECT current_value FROM request_sequences WHERE prefix = ? AND year = ? FOR UPDATE", [prefix, year]);
  const next = Number(rows[0]!.current_value) + 1;
  await db.query<ResultSetHeader>("UPDATE request_sequences SET current_value = ? WHERE prefix = ? AND year = ?", [next, prefix, year]);
  return `${prefix}-${year}-${String(next).padStart(6, "0")}`;
}

// ---- requests ---------------------------------------------------------------------
export interface RequestRecord {
  id: number;
  requestNo: string;
  workflowVersionId: number;
  requesterId: number;
  title: string;
  formData: Record<string, unknown>;
  status: InstanceStatus;
  round: number;
  state: InstanceState;
  stateVersion: number;
}

type RequestRow = RowDataPacket & {
  id: number;
  request_no: string;
  workflow_version_id: number;
  requester_id: number;
  title: string;
  form_data_json: Record<string, unknown> | string;
  status: InstanceStatus;
  round: number;
  state_json: InstanceState | string;
  state_version: number;
};

const parse = <T>(value: T | string): T => (typeof value === "string" ? (JSON.parse(value) as T) : value);

function toRequest(row: RequestRow): RequestRecord {
  return {
    id: row.id,
    requestNo: row.request_no,
    workflowVersionId: row.workflow_version_id,
    requesterId: row.requester_id,
    title: row.title,
    formData: parse(row.form_data_json),
    status: row.status,
    round: row.round,
    state: parse(row.state_json),
    stateVersion: row.state_version,
  };
}

const REQUEST_COLUMNS = "id, request_no, workflow_version_id, requester_id, title, form_data_json, status, round, state_json, state_version";

export async function insertRequest(
  input: { requestNo: string; workflowVersionId: number; requesterId: number; title: string; formData: Record<string, unknown>; state: InstanceState },
  db: Queryable = getDbPool(),
): Promise<number> {
  const [result] = await db.query<ResultSetHeader>(
    `INSERT INTO approval_requests (request_no, workflow_version_id, requester_id, title, form_data_json, status, round, state_json, closed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, IF(? IN ('APPROVED', 'REJECTED', 'CANCELLED'), CURRENT_TIMESTAMP, NULL))`,
    [input.requestNo, input.workflowVersionId, input.requesterId, input.title, JSON.stringify(input.formData), input.state.status, input.state.round, JSON.stringify(input.state), input.state.status],
  );
  return result.insertId;
}

// FOR UPDATE: actions on the same request run one after another (F-13).
export async function lockRequest(id: number, db: Queryable): Promise<RequestRecord | null> {
  const [rows] = await db.query<RequestRow[]>(`SELECT ${REQUEST_COLUMNS} FROM approval_requests WHERE id = ? LIMIT 1 FOR UPDATE`, [id]);
  return rows[0] ? toRequest(rows[0]) : null;
}

export async function findRequest(id: number, db: Queryable = getDbPool()): Promise<RequestRecord | null> {
  const [rows] = await db.query<RequestRow[]>(`SELECT ${REQUEST_COLUMNS} FROM approval_requests WHERE id = ? LIMIT 1`, [id]);
  return rows[0] ? toRequest(rows[0]) : null;
}

// Optimistic check on top of the row lock: fails if someone else wrote.
export async function saveRequestState(
  id: number,
  expectedVersion: number,
  state: InstanceState,
  formData: Record<string, unknown> | null,
  db: Queryable,
): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>(
    `UPDATE approval_requests
     SET state_json = ?, status = ?, round = ?, state_version = state_version + 1,
         form_data_json = COALESCE(?, form_data_json),
         closed_at = IF(? IN ('APPROVED', 'REJECTED', 'CANCELLED'), COALESCE(closed_at, CURRENT_TIMESTAMP), NULL)
     WHERE id = ? AND state_version = ?`,
    [JSON.stringify(state), state.status, state.round, formData ? JSON.stringify(formData) : null, state.status, id, expectedVersion],
  );
  return result.affectedRows === 1;
}

// ---- tasks (projection for queues) -------------------------------------------
export async function syncTasks(requestId: number, state: InstanceState, nodes: readonly WorkflowNode[], db: Queryable): Promise<void> {
  if (state.tasks.length === 0) return;
  const labels = new Map(nodes.map((node) => [node.id, node.label]));
  const rows = state.tasks.map((task) => [
    requestId,
    task.id,
    task.nodeId,
    (labels.get(task.nodeId) ?? task.nodeId).slice(0, 200),
    task.round,
    task.approverId,
    task.status,
    task.decidedBy ?? null,
    task.onBehalfOf ?? null,
    task.comment?.slice(0, 2000) ?? null,
    new Date(task.createdAt),
    task.decidedAt ? new Date(task.decidedAt) : null,
  ]);
  await db.query<ResultSetHeader>(
    `INSERT INTO approval_tasks (request_id, task_key, node_id, node_label, round, approver_id, status, decided_by, on_behalf_of, comment, created_at, decided_at)
     VALUES ?
     ON DUPLICATE KEY UPDATE status = VALUES(status), decided_by = VALUES(decided_by), on_behalf_of = VALUES(on_behalf_of),
       comment = VALUES(comment), decided_at = VALUES(decided_at)`,
    [rows],
  );
}

// The timeline holds the engine's events plus the service's own markers.
export type TimelineEvent = EngineEvent | { type: "SUBMITTED"; requestNo: string };

export async function appendEvents(requestId: number, events: readonly TimelineEvent[], actorId: number | null, db: Queryable): Promise<void> {
  if (events.length === 0) return;
  const rows = events.map((event) => [
    requestId,
    event.type,
    "nodeId" in event ? event.nodeId : null,
    "actorId" in event ? event.actorId : actorId,
    JSON.stringify(event),
  ]);
  await db.query<ResultSetHeader>("INSERT INTO approval_events (request_id, event_type, node_id, actor_id, payload_json) VALUES ?", [rows]);
}

// ---- reads -------------------------------------------------------------------------
export interface QueueItem {
  requestId: number;
  requestNo: string;
  title: string;
  requesterName: string;
  taskKey: string;
  nodeLabel: string;
  createdAt: Date;
}

export async function listPendingTasksFor(userId: number, db: Queryable = getDbPool()): Promise<QueueItem[]> {
  const [rows] = await db.query<(RowDataPacket & { request_id: number; request_no: string; title: string; requester_name: string; task_key: string; node_label: string; created_at: Date })[]>(
    `SELECT t.request_id, r.request_no, r.title, u.name AS requester_name, t.task_key, t.node_label, t.created_at
     FROM approval_tasks t
     JOIN approval_requests r ON r.id = t.request_id
     JOIN users u ON u.id = r.requester_id
     WHERE t.approver_id = ? AND t.status = 'PENDING' AND r.status IN ('IN_PROGRESS', 'ON_HOLD')
     ORDER BY t.created_at`,
    [userId],
  );
  return rows.map((row) => ({
    requestId: row.request_id,
    requestNo: row.request_no,
    title: row.title,
    requesterName: row.requester_name,
    taskKey: row.task_key,
    nodeLabel: row.node_label,
    createdAt: row.created_at,
  }));
}

export async function isParticipant(requestId: number, userId: number, db: Queryable = getDbPool()): Promise<boolean> {
  const [rows] = await db.query<(RowDataPacket & { found: number })[]>(
    `SELECT 1 AS found FROM approval_requests WHERE id = ? AND requester_id = ?
     UNION SELECT 1 FROM approval_tasks WHERE request_id = ? AND (approver_id = ? OR decided_by = ?) LIMIT 1`,
    [requestId, userId, requestId, userId, userId],
  );
  return rows.length > 0;
}

export interface TimelineEntry {
  id: number;
  eventType: string;
  nodeId: string | null;
  actorName: string | null;
  payload: TimelineEvent;
  createdAt: Date;
}

export async function listTimeline(requestId: number, db: Queryable = getDbPool()): Promise<TimelineEntry[]> {
  const [rows] = await db.query<(RowDataPacket & { id: number; event_type: string; node_id: string | null; name: string | null; payload_json: TimelineEvent | string; created_at: Date })[]>(
    `SELECT e.id, e.event_type, e.node_id, u.name, e.payload_json, e.created_at
     FROM approval_events e LEFT JOIN users u ON u.id = e.actor_id WHERE e.request_id = ? ORDER BY e.id`,
    [requestId],
  );
  return rows.map((row) => ({ id: row.id, eventType: row.event_type, nodeId: row.node_id, actorName: row.name, payload: parse(row.payload_json), createdAt: row.created_at }));
}
