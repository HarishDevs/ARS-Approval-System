import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import type { EngineEvent, InstanceState, InstanceStatus, WorkflowDefinition, WorkflowNode } from "@/server/engine/types";
import type { FormField } from "@/server/forms/fields";
import type { BuilderSpec } from "@/server/workflows/builder";
import { INDIA_TODAY_SQL } from "@/lib/db/repositories/directory.repository";
import { queueFilterSql, type QueueFilter } from "@/server/approvals/queue-filters";
import { parseTypeSettings, type TypeSettings } from "@/server/workflows/type-settings";
import { addWorkingHours, type WorkingCalendar } from "@/server/workflows/calendar";

function dueTimes(createdAt: Date, hours: number | null, calendar?: WorkingCalendar): [Date | null, Date | null] {
  if (!hours) return [null, null];
  if (!calendar) return [new Date(createdAt.getTime() + hours * 3600_000), new Date(createdAt.getTime() + 2 * hours * 3600_000)];
  return [addWorkingHours(createdAt, hours, calendar), addWorkingHours(createdAt, 2 * hours, calendar)];
}

// Persistence for workflows and requests (S2-06, D-050, F-13). Only the
// service layer (server/approvals) calls these, inside its transactions.

// ---- workflows ---------------------------------------------------------------
export interface WorkflowRecord {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  kind: "PREDEFINED" | "CUSTOM";
  requestPrefix: string;
  ownerUserId: number | null;
  active: boolean;
  // After "changes asked", restart from the step that asked, or from the first level (D-101).
  resubmitPolicy?: "REQUESTING_STEP" | "BEGINNING";
  settings?: TypeSettings; // FN1/FN3/EN-09 submission policies
}

export interface WorkflowVersionRecord {
  id: number;
  workflowId: number;
  versionNo: number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  definition: WorkflowDefinition;
  form: FormField[];
  builder: BuilderSpec | null;
  createdAt: Date;
  publishedAt: Date | null;
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
  const [rows] = await db.query<(RowDataPacket & { id: number; code: string; name: string; description: string | null; kind: WorkflowRecord["kind"]; request_prefix: string; owner_user_id: number | null; active: number; resubmit_policy: WorkflowRecord["resubmitPolicy"]; settings_json: unknown })[]>(
    "SELECT id, code, name, description, kind, request_prefix, owner_user_id, active, resubmit_policy, settings_json FROM workflow_definitions WHERE id = ? LIMIT 1",
    [id],
  );
  const row = rows[0];
  return row
    ? {
        id: row.id,
        code: row.code,
        name: row.name,
        description: row.description,
        kind: row.kind,
        requestPrefix: row.request_prefix,
        ownerUserId: row.owner_user_id,
        active: row.active === 1,
        resubmitPolicy: row.resubmit_policy ?? "REQUESTING_STEP",
        settings: parseTypeSettings(row.settings_json),
      }
    : null;
}

export async function updateWorkflowSettings(id: number, settings: TypeSettings, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>("UPDATE workflow_definitions SET settings_json = ? WHERE id = ?", [JSON.stringify(settings), id]);
}

export async function insertWorkflowVersion(
  workflowId: number,
  content: { definition: WorkflowDefinition; form: FormField[]; builder: BuilderSpec | null },
  createdBy: number,
  db: Queryable = getDbPool(),
): Promise<{ id: number; versionNo: number }> {
  const [rows] = await db.query<(RowDataPacket & { next_no: number })[]>(
    "SELECT COALESCE(MAX(version_no), 0) + 1 AS next_no FROM workflow_versions WHERE workflow_id = ? FOR UPDATE",
    [workflowId],
  );
  const versionNo = Number(rows[0]?.next_no ?? 1);
  const [result] = await db.query<ResultSetHeader>(
    "INSERT INTO workflow_versions (workflow_id, version_no, definition_json, form_json, builder_json, created_by) VALUES (?, ?, ?, ?, ?, ?)",
    [workflowId, versionNo, JSON.stringify(content.definition), JSON.stringify(content.form), content.builder ? JSON.stringify(content.builder) : null, createdBy],
  );
  return { id: result.insertId, versionNo };
}

type VersionRow = RowDataPacket & {
  id: number;
  workflow_id: number;
  version_no: number;
  status: WorkflowVersionRecord["status"];
  definition_json: WorkflowDefinition | string;
  form_json: FormField[] | string | null;
  builder_json: BuilderSpec | string | null;
  created_at: Date;
  published_at: Date | null;
};

const VERSION_COLUMNS = "id, workflow_id, version_no, status, definition_json, form_json, builder_json, created_at, published_at";

function toVersion(row: VersionRow): WorkflowVersionRecord {
  const json = <T>(value: T | string | null): T | null => (value === null ? null : typeof value === "string" ? (JSON.parse(value) as T) : value);
  return {
    id: row.id,
    workflowId: row.workflow_id,
    versionNo: row.version_no,
    status: row.status,
    definition: json(row.definition_json)!,
    form: json(row.form_json) ?? [],
    builder: json(row.builder_json),
    createdAt: row.created_at,
    publishedAt: row.published_at,
  };
}

export async function findWorkflowVersion(id: number, db: Queryable = getDbPool()): Promise<WorkflowVersionRecord | null> {
  const [rows] = await db.query<VersionRow[]>(`SELECT ${VERSION_COLUMNS} FROM workflow_versions WHERE id = ? LIMIT 1`, [id]);
  return rows[0] ? toVersion(rows[0]) : null;
}

export async function findPublishedVersion(workflowId: number, db: Queryable = getDbPool()): Promise<WorkflowVersionRecord | null> {
  const [rows] = await db.query<VersionRow[]>(
    `SELECT ${VERSION_COLUMNS} FROM workflow_versions WHERE workflow_id = ? AND status = 'PUBLISHED' LIMIT 1`,
    [workflowId],
  );
  return rows[0] ? toVersion(rows[0]) : null;
}

export async function listVersions(workflowId: number, db: Queryable = getDbPool()): Promise<WorkflowVersionRecord[]> {
  const [rows] = await db.query<VersionRow[]>(`SELECT ${VERSION_COLUMNS} FROM workflow_versions WHERE workflow_id = ? ORDER BY version_no DESC`, [workflowId]);
  return rows.map(toVersion);
}

export interface WorkflowListItem extends WorkflowRecord {
  publishedVersionNo: number | null;
  latestVersionNo: number;
  requestCount: number;
}

export async function listWorkflows(filter: { kind?: WorkflowRecord["kind"]; ownerUserId?: number }, db: Queryable = getDbPool()): Promise<WorkflowListItem[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.kind) {
    where.push("w.kind = ?");
    params.push(filter.kind);
  }
  if (filter.ownerUserId) {
    where.push("w.owner_user_id = ?");
    params.push(filter.ownerUserId);
  }
  const [rows] = await db.query<
    (RowDataPacket & { id: number; code: string; name: string; description: string | null; kind: WorkflowRecord["kind"]; request_prefix: string; owner_user_id: number | null; active: number; published_no: number | null; latest_no: number; request_count: number })[]
  >(
    `SELECT w.id, w.code, w.name, w.description, w.kind, w.request_prefix, w.owner_user_id, w.active,
            (SELECT v.version_no FROM workflow_versions v WHERE v.workflow_id = w.id AND v.status = 'PUBLISHED') AS published_no,
            (SELECT MAX(v.version_no) FROM workflow_versions v WHERE v.workflow_id = w.id) AS latest_no,
            (SELECT COUNT(*) FROM approval_requests r JOIN workflow_versions v ON v.id = r.workflow_version_id WHERE v.workflow_id = w.id AND r.deleted_at IS NULL) AS request_count
     FROM workflow_definitions w ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY w.active DESC, w.name`,
    params,
  );
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    kind: row.kind,
    requestPrefix: row.request_prefix,
    ownerUserId: row.owner_user_id,
    active: row.active === 1,
    publishedVersionNo: row.published_no,
    latestVersionNo: Number(row.latest_no ?? 0),
    requestCount: Number(row.request_count),
  }));
}

export async function updateWorkflowDetails(
  id: number,
  input: { name: string; description: string | null; active: boolean; resubmitPolicy?: WorkflowRecord["resubmitPolicy"] },
  db: Queryable = getDbPool(),
): Promise<void> {
  await db.query<ResultSetHeader>("UPDATE workflow_definitions SET name = ?, description = ?, active = ?, resubmit_policy = COALESCE(?, resubmit_policy) WHERE id = ?", [
    input.name,
    input.description,
    input.active,
    input.resubmitPolicy ?? null,
    id,
  ]);
}

// Archive the old published version, then publish this one (same
// transaction). The approval type's row is locked first, so two people
// publishing at once queue up; returns false if this version is no longer a
// draft (audit R-05), and then nothing changes.
export async function publishWorkflowVersion(versionId: number, workflowId: number, publishedBy: number, db: Queryable = getDbPool()): Promise<boolean> {
  await db.query("SELECT id FROM workflow_definitions WHERE id = ? FOR UPDATE", [workflowId]);
  const [draft] = await db.query<(RowDataPacket & { id: number })[]>("SELECT id FROM workflow_versions WHERE id = ? AND workflow_id = ? AND status = 'DRAFT' FOR UPDATE", [versionId, workflowId]);
  if (draft.length === 0) return false;
  await db.query<ResultSetHeader>("UPDATE workflow_versions SET status = 'ARCHIVED' WHERE workflow_id = ? AND status = 'PUBLISHED'", [workflowId]);
  const [result] = await db.query<ResultSetHeader>(
    "UPDATE workflow_versions SET status = 'PUBLISHED', published_by = ?, published_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'DRAFT'",
    [publishedBy, versionId],
  );
  return result.affectedRows === 1;
}

// #11 impact note: open requests of an approval type (any version).
export async function countOpenRequests(workflowId: number, db: Queryable = getDbPool()): Promise<number> {
  const [rows] = await db.query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) AS total FROM approval_requests r JOIN workflow_versions v ON v.id = r.workflow_version_id
     WHERE v.workflow_id = ? AND r.deleted_at IS NULL AND r.status IN ('IN_PROGRESS', 'ON_HOLD', 'CHANGES_REQUIRED')`,
    [workflowId],
  );
  return Number(rows[0]?.total ?? 0);
}

// An approval type nobody has used can be removed completely (with its
// versions); one with requests can only be switched off (archived).
export async function deleteUnusedWorkflow(id: number, db: Queryable): Promise<boolean> {
  await db.query("SELECT id FROM workflow_definitions WHERE id = ? FOR UPDATE", [id]);
  const [used] = await db.query<(RowDataPacket & { total: number })[]>(
    "SELECT COUNT(*) AS total FROM approval_requests r JOIN workflow_versions v ON v.id = r.workflow_version_id WHERE v.workflow_id = ?",
    [id],
  );
  if (Number(used[0]?.total ?? 0) > 0) return false;
  await db.query<ResultSetHeader>("DELETE FROM workflow_versions WHERE workflow_id = ?", [id]);
  const [result] = await db.query<ResultSetHeader>("DELETE FROM workflow_definitions WHERE id = ?", [id]);
  return result.affectedRows === 1;
}

// ---- request numbers -------------------------------------------------------------
// PREFIX-YYYY-000001. The row lock makes concurrent submissions queue, so
// numbers are unique and gap-free per prefix and year.
export async function nextRequestNumber(prefix: string, db: Queryable = getDbPool()): Promise<string> {
  // The year in India, whatever the database server's time zone (audit R-09).
  const [yearRows] = await db.query<(RowDataPacket & { year: number })[]>("SELECT YEAR(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE)) AS year");
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
  input: { requestNo: string; workflowVersionId: number; requesterId: number; title: string; formData: Record<string, unknown>; state: InstanceState; submissionKey?: string | null },
  db: Queryable = getDbPool(),
): Promise<number> {
  const [result] = await db.query<ResultSetHeader>(
    `INSERT INTO approval_requests (request_no, workflow_version_id, requester_id, submission_key, title, form_data_json, status, round, state_json, closed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, IF(? IN ('APPROVED', 'REJECTED', 'CANCELLED'), CURRENT_TIMESTAMP, NULL))`,
    [input.requestNo, input.workflowVersionId, input.requesterId, input.submissionKey ?? null, input.title, JSON.stringify(input.formData), input.state.status, input.state.round, JSON.stringify(input.state), input.state.status],
  );
  if (input.state.status === "APPROVED") await stampValidity(result.insertId, db);
  return result.insertId;
}

// v1.7.0 (A1): when a request is approved, the type's "approval valid for"
// days (at that moment) fix its valid-until date. A later policy change
// never moves the date of an approval already given.
export async function stampValidity(requestId: number, db: Queryable = getDbPool()): Promise<void> {
  const [rows] = await db.query<(RowDataPacket & { settings_json: unknown })[]>(
    `SELECT w.settings_json FROM approval_requests r
     JOIN workflow_versions v ON v.id = r.workflow_version_id JOIN workflow_definitions w ON w.id = v.workflow_id
     WHERE r.id = ? AND r.status = 'APPROVED' AND r.valid_until IS NULL`,
    [requestId],
  );
  if (!rows[0]) return;
  const days = parseTypeSettings(rows[0].settings_json).validityDays;
  if (!days) return;
  await db.query<ResultSetHeader>(
    "UPDATE approval_requests SET valid_until = DATE_ADD(COALESCE(closed_at, CURRENT_TIMESTAMP), INTERVAL ? DAY), expiry_notified_at = NULL WHERE id = ? AND valid_until IS NULL",
    [days, requestId],
  );
}

export async function findValidity(requestId: number, db: Queryable = getDbPool()): Promise<Date | null> {
  const [rows] = await db.query<(RowDataPacket & { valid_until: Date | null })[]>("SELECT valid_until FROM approval_requests WHERE id = ? AND status = 'APPROVED'", [requestId]);
  return rows[0]?.valid_until ?? null;
}

// D-QA-01: the request a form already created (a retried submit).
export async function findBySubmissionKey(requesterId: number, submissionKey: string, db: Queryable = getDbPool()): Promise<{ id: number; requestNo: string; status: InstanceStatus } | null> {
  const [rows] = await db.query<(RowDataPacket & { id: number; request_no: string; status: InstanceStatus })[]>(
    "SELECT id, request_no, status FROM approval_requests WHERE requester_id = ? AND submission_key = ? LIMIT 1",
    [requesterId, submissionKey],
  );
  return rows[0] ? { id: rows[0].id, requestNo: rows[0].request_no, status: rows[0].status } : null;
}

// D-QA-02: the same person raised the same title on the same approval type
// (or any custom approval) in the last 10 minutes.
export async function findRecentDuplicate(input: { requesterId: number; title: string; workflowId: number | null }, db: Queryable = getDbPool()): Promise<string | null> {
  const [rows] = await db.query<(RowDataPacket & { request_no: string })[]>(
    `SELECT r.request_no FROM approval_requests r
     JOIN workflow_versions v ON v.id = r.workflow_version_id
     JOIN workflow_definitions w ON w.id = v.workflow_id
     WHERE r.deleted_at IS NULL AND r.requester_id = ? AND r.title = ? AND r.submitted_at > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 10 MINUTE)
       AND ${input.workflowId === null ? "w.kind = 'CUSTOM'" : "w.id = ?"}
     ORDER BY r.id DESC LIMIT 1`,
    input.workflowId === null ? [input.requesterId, input.title] : [input.requesterId, input.title, input.workflowId],
  );
  return rows[0]?.request_no ?? null;
}

// FOR UPDATE: actions on the same request run one after another (F-13).
export async function lockRequest(id: number, db: Queryable): Promise<RequestRecord | null> {
  const [rows] = await db.query<RequestRow[]>(`SELECT ${REQUEST_COLUMNS} FROM approval_requests WHERE id = ? AND deleted_at IS NULL LIMIT 1 FOR UPDATE`, [id]);
  return rows[0] ? toRequest(rows[0]) : null;
}

export async function findRequestByNumber(requestNo: string, db: Queryable = getDbPool()): Promise<RequestRecord | null> {
  const [rows] = await db.query<RequestRow[]>(`SELECT ${REQUEST_COLUMNS} FROM approval_requests WHERE request_no = ? AND deleted_at IS NULL LIMIT 1`, [requestNo]);
  return rows[0] ? toRequest(rows[0]) : null;
}

export async function findRequest(id: number, db: Queryable = getDbPool()): Promise<RequestRecord | null> {
  const [rows] = await db.query<RequestRow[]>(`SELECT ${REQUEST_COLUMNS} FROM approval_requests WHERE id = ? AND deleted_at IS NULL LIMIT 1`, [id]);
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
         closed_at = IF(? IN ('APPROVED', 'REJECTED', 'CANCELLED'), COALESCE(closed_at, CURRENT_TIMESTAMP), NULL),
         valid_until = IF(? = 'APPROVED', valid_until, NULL)
     WHERE id = ? AND state_version = ?`,
    [JSON.stringify(state), state.status, state.round, formData ? JSON.stringify(formData) : null, state.status, state.status, id, expectedVersion],
  );
  if (result.affectedRows === 1 && state.status === "APPROVED") await stampValidity(id, db);
  return result.affectedRows === 1;
}

// ---- tasks (projection for queues) -------------------------------------------
// calendar: due and escalation times count working days only (D-067);
// without it, plain hours.
export async function syncTasks(requestId: number, state: InstanceState, nodes: readonly WorkflowNode[], db: Queryable, calendar?: WorkingCalendar): Promise<void> {
  if (state.tasks.length === 0) return;
  const labels = new Map(nodes.map((node) => [node.id, node.label]));
  const sla = new Map(nodes.map((node) => [node.id, node.kind === "APPROVAL" ? (node.slaHours ?? null) : null]));
  const work = new Set(nodes.filter((node) => node.kind === "APPROVAL" && node.mode === "WORK").map((node) => node.id));
  const rows = state.tasks.map((task) => [
    requestId,
    task.id,
    task.nodeId,
    (labels.get(task.nodeId) ?? task.nodeId).slice(0, 200),
    work.has(task.nodeId) ? "WORK" : "APPROVAL",
    task.round,
    task.approverId,
    task.status,
    task.decidedBy ?? null,
    task.onBehalfOf ?? null,
    task.comment?.slice(0, 2000) ?? null,
    new Date(task.createdAt),
    ...dueTimes(new Date(task.createdAt), sla.get(task.nodeId) ?? null, calendar),
    task.decidedAt ? new Date(task.decidedAt) : null,
  ]);
  // approver_id is updated too: a handover (F-16) moves a pending task.
  await db.query<ResultSetHeader>(
    `INSERT INTO approval_tasks (request_id, task_key, node_id, node_label, task_type, round, approver_id, status, decided_by, on_behalf_of, comment, created_at, due_at, escalate_at, decided_at)
     VALUES ?
     ON DUPLICATE KEY UPDATE approver_id = VALUES(approver_id), status = VALUES(status), decided_by = VALUES(decided_by), on_behalf_of = VALUES(on_behalf_of),
       comment = VALUES(comment), decided_at = VALUES(decided_at)`,
    [rows],
  );
}

// Handover (audit R-07): the new person gets the full response time from
// now, and the reminders already sent to the previous person don't count.
export async function restartTaskClock(requestId: number, taskKeys: readonly string[], nodes: readonly WorkflowNode[], db: Queryable, calendar?: WorkingCalendar): Promise<void> {
  if (taskKeys.length === 0) return;
  const sla = new Map(nodes.map((node) => [node.id, node.kind === "APPROVAL" ? (node.slaHours ?? null) : null]));
  const [rows] = await db.query<(RowDataPacket & { id: number; node_id: string })[]>(
    "SELECT id, node_id FROM approval_tasks WHERE request_id = ? AND task_key IN (?) AND status = 'PENDING'",
    [requestId, taskKeys],
  );
  const now = new Date();
  for (const row of rows) {
    const [due, escalate] = dueTimes(now, sla.get(row.node_id) ?? null, calendar);
    await db.query<ResultSetHeader>("UPDATE approval_tasks SET due_at = ?, escalate_at = ? WHERE id = ?", [due, escalate, row.id]);
    await db.query<ResultSetHeader>("DELETE FROM task_reminders WHERE task_id = ?", [row.id]);
  }
}

// Time on hold doesn't count against the response time (audit A-03 gap):
// on resume, open due times move on by how long the request was held.
export async function extendDueTimes(requestId: number, seconds: number, db: Queryable): Promise<void> {
  if (!(seconds > 0)) return;
  await db.query<ResultSetHeader>(
    `UPDATE approval_tasks SET due_at = DATE_ADD(due_at, INTERVAL ? SECOND), escalate_at = DATE_ADD(escalate_at, INTERVAL ? SECOND)
     WHERE request_id = ? AND status = 'PENDING' AND due_at IS NOT NULL`,
    [Math.round(seconds), Math.round(seconds), requestId],
  );
}

// The timeline holds the engine's events plus the service's own markers.
export type TimelineEvent =
  | EngineEvent
  | { type: "SUBMITTED"; requestNo: string }
  | { type: "ATTACHMENTS_ADDED"; actorId: number; names: string[] }
  // v1.6.0 (EN-06): advice asked and given; no effect on the approval itself.
  | { type: "CONSULTED"; consultationId: number; consulteeId: number; actorId: number; question: string }
  | { type: "CONSULT_ANSWERED"; consultationId: number; actorId: number; answer: string }
  // FN7: IT moved the request to another workflow version.
  | { type: "VERSION_MIGRATED"; actorId: number; fromVersionNo: number; toVersionNo: number; migrationId: number }
  // v1.6.1: people added to follow the request, or removed.
  | { type: "COLLABORATORS_ADDED"; actorId: number; userIds: number[] }
  | { type: "COLLABORATOR_REMOVED"; actorId: number; userId: number };

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
  dueAt: Date | null;
  overdue: boolean;
  forName: string | null; // set when this is a delegated task
  work: boolean; // a work task to mark done (D-097)
  onHold: boolean; // the request is on hold (can't be bulk-approved)
  typeName?: string; // the approval type (Waiting for me, v1.6.0)
}

// My pending approvals, plus those of anyone who named me as their
// delegate today (D-062). Never my own requests.
// What waits for a person: their approvals (never on their own requests)
// and their work tasks (which may be on their own, D-097), plus those of
// anyone who named them their delegate today. Oldest first, a page at a time.
const PENDING_FOR = `
     FROM approval_tasks t
     JOIN approval_requests r ON r.id = t.request_id
     JOIN users u ON u.id = r.requester_id
     JOIN users a ON a.id = t.approver_id
     JOIN workflow_versions v ON v.id = r.workflow_version_id
     JOIN workflow_definitions w ON w.id = v.workflow_id
     WHERE t.status = 'PENDING' AND r.status IN ('IN_PROGRESS', 'ON_HOLD') AND r.deleted_at IS NULL AND (r.requester_id <> ? OR t.task_type = 'WORK')
       AND (t.approver_id = ? OR t.approver_id IN (
             SELECT d.user_id FROM delegations d
             WHERE d.delegate_id = ? AND d.ended_at IS NULL AND ${INDIA_TODAY_SQL} BETWEEN d.starts_on AND d.ends_on))`;

// My Work (#1): what is overdue, or due within 24 hours, for this person.
// Same access rule as Waiting for me; bounded.
export async function listAttentionTasksFor(userId: number, limit = 10, db: Queryable = getDbPool()): Promise<{ items: QueueItem[]; overdue: number; dueSoon: number }> {
  const [rows] = await db.query<
    (RowDataPacket & { request_id: number; request_no: string; title: string; requester_name: string; task_key: string; node_label: string; task_type: string; request_status: string; created_at: Date; due_at: Date | null; overdue: number; approver_id: number; approver_name: string })[]
  >(
    `SELECT t.request_id, r.request_no, r.title, u.name AS requester_name, t.task_key, t.node_label, t.task_type, r.status AS request_status, t.created_at, t.due_at,
            (t.due_at < CURRENT_TIMESTAMP) AS overdue, t.approver_id, a.name AS approver_name
     ${PENDING_FOR} AND t.due_at IS NOT NULL AND t.due_at < DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 24 HOUR)
     ORDER BY t.due_at, t.id LIMIT ?`,
    [userId, userId, userId, limit],
  );
  const [[counts]] = await db.query<RowDataPacket[]>(
    `SELECT COALESCE(SUM(t.due_at < CURRENT_TIMESTAMP), 0) AS overdue, COALESCE(SUM(t.due_at >= CURRENT_TIMESTAMP), 0) AS due_soon
     ${PENDING_FOR} AND t.due_at IS NOT NULL AND t.due_at < DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 24 HOUR)`,
    [userId, userId, userId],
  );
  return {
    items: rows.map((row) => ({
      requestId: row.request_id,
      requestNo: row.request_no,
      title: row.title,
      requesterName: row.requester_name,
      taskKey: row.task_key,
      nodeLabel: row.node_label,
      createdAt: row.created_at,
      dueAt: row.due_at,
      overdue: Number(row.overdue) === 1,
      forName: row.approver_id === userId ? null : row.approver_name,
      work: row.task_type === "WORK",
      onHold: row.request_status === "ON_HOLD",
    })),
    overdue: Number(counts?.overdue ?? 0),
    dueSoon: Number(counts?.due_soon ?? 0),
  };
}

export async function countPendingTasksFor(userId: number, filter?: QueueFilter, db: Queryable = getDbPool()): Promise<number> {
  const extra = filter ? queueFilterSql(filter, userId) : { where: "", params: [] };
  const [rows] = await db.query<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total ${PENDING_FOR}${extra.where}`, [userId, userId, userId, ...extra.params]);
  return Number(rows[0]?.total ?? 0);
}

export async function listPendingTasksFor(
  userId: number,
  page: { limit: number; offset: number } = { limit: 500, offset: 0 },
  db: Queryable = getDbPool(),
  filter?: QueueFilter,
): Promise<QueueItem[]> {
  const extra = filter ? queueFilterSql(filter, userId) : { where: "", params: [], orderBy: "t.created_at, t.id" };
  const [rows] = await db.query<
    (RowDataPacket & { request_id: number; request_no: string; title: string; requester_name: string; task_key: string; node_label: string; task_type: string; request_status: string; created_at: Date; due_at: Date | null; overdue: number; approver_id: number; approver_name: string; type_name: string })[]
  >(
    `SELECT t.request_id, r.request_no, r.title, u.name AS requester_name, t.task_key, t.node_label, t.task_type, r.status AS request_status, t.created_at, t.due_at,
            (t.due_at IS NOT NULL AND t.due_at < CURRENT_TIMESTAMP) AS overdue, t.approver_id, a.name AS approver_name, w.name AS type_name
     ${PENDING_FOR}${extra.where}
     ORDER BY ${extra.orderBy} LIMIT ? OFFSET ?`,
    [userId, userId, userId, ...extra.params, page.limit, page.offset],
  );
  return rows.map((row) => ({
    requestId: row.request_id,
    requestNo: row.request_no,
    title: row.title,
    requesterName: row.requester_name,
    taskKey: row.task_key,
    nodeLabel: row.node_label,
    createdAt: row.created_at,
    dueAt: row.due_at,
    overdue: Number(row.overdue) === 1,
    forName: row.approver_id === userId ? null : row.approver_name,
    work: row.task_type === "WORK",
    onHold: row.request_status === "ON_HOLD",
    typeName: row.type_name,
  }));
}

// WS-01: the approval types in this person's queue, for the filter.
export async function queueTypesFor(userId: number, db: Queryable = getDbPool()): Promise<{ id: number; name: string; count: number }[]> {
  const [rows] = await db.query<(RowDataPacket & { id: number; name: string; total: number })[]>(
    `SELECT w.id, w.name, COUNT(*) AS total ${PENDING_FOR} GROUP BY w.id, w.name ORDER BY w.name`,
    [userId, userId, userId],
  );
  return rows.map((row) => ({ id: row.id, name: row.name, count: Number(row.total) }));
}

// v1.7.2: choices for the Waiting for me filters, only from what waits for
// the person now (no other names or departments).
export async function queueChoicesFor(userId: number, db: Queryable = getDbPool()): Promise<{ requesters: { id: number; name: string }[]; departments: { id: number; name: string }[]; steps: string[]; covering: boolean }> {
  const params = [userId, userId, userId];
  const [requesters] = await db.query<(RowDataPacket & { id: number; name: string })[]>(`SELECT DISTINCT u.id, u.name ${PENDING_FOR} ORDER BY u.name LIMIT 300`, params);
  const [departments] = await db.query<(RowDataPacket & { id: number; name: string })[]>(
    `SELECT DISTINCT dp.id, dp.name ${PENDING_FOR.replace("JOIN users a ON a.id = t.approver_id", "JOIN users a ON a.id = t.approver_id JOIN departments dp ON dp.id = u.department_id")} ORDER BY dp.name LIMIT 200`,
    params,
  );
  const [steps] = await db.query<(RowDataPacket & { step: string })[]>(`SELECT DISTINCT t.node_label AS step ${PENDING_FOR} ORDER BY step LIMIT 200`, params);
  const [[covering]] = await db.query<RowDataPacket[]>(`SELECT EXISTS(SELECT 1 ${PENDING_FOR} AND t.approver_id <> ?) AS yes`, [...params, userId]);
  return { requesters: requesters.map((row) => ({ id: row.id, name: row.name })), departments: departments.map((row) => ({ id: row.id, name: row.name })), steps: steps.map((row) => row.step), covering: Number(covering?.yes) === 1 };
}

// Requester, anyone with a task on it (now or before), the active delegate
// of someone with a pending task on it (D-057, D-062), a consultee
// (EN-06), or a collaborator (v1.6.1). Kept equal to visibleToSql (visibility.ts).
export async function isParticipant(requestId: number, userId: number, db: Queryable = getDbPool()): Promise<boolean> {
  const [rows] = await db.query<(RowDataPacket & { found: number })[]>(
    `SELECT 1 AS found FROM approval_requests WHERE id = ? AND requester_id = ?
     UNION SELECT 1 FROM approval_tasks WHERE request_id = ? AND (approver_id = ? OR decided_by = ?)
     UNION SELECT 1 FROM approval_tasks t JOIN delegations d ON d.user_id = t.approver_id
       WHERE t.request_id = ? AND t.status = 'PENDING' AND d.delegate_id = ? AND d.ended_at IS NULL
         AND ${INDIA_TODAY_SQL} BETWEEN d.starts_on AND d.ends_on
     UNION SELECT 1 FROM consultations c WHERE c.request_id = ? AND c.consultee_id = ?
     UNION SELECT 1 FROM request_collaborators k WHERE k.request_id = ? AND k.user_id = ? AND k.removed_at IS NULL
     LIMIT 1`,
    [requestId, userId, requestId, userId, userId, requestId, userId, requestId, userId, requestId, userId],
  );
  return rows.length > 0;
}

export interface MyRequestItem {
  id: number;
  requestNo: string;
  title: string;
  workflowName: string;
  status: InstanceStatus;
  submittedAt: Date;
  closedAt: Date | null;
  pendingWith: string | null;
}

export async function listMyRequests(userId: number, db: Queryable = getDbPool()): Promise<MyRequestItem[]> {
  const [rows] = await db.query<
    (RowDataPacket & { id: number; request_no: string; title: string; workflow_name: string; status: InstanceStatus; submitted_at: Date; closed_at: Date | null; pending_with: string | null })[]
  >(
    `SELECT r.id, r.request_no, r.title, w.name AS workflow_name, r.status, r.submitted_at, r.closed_at,
            (SELECT GROUP_CONCAT(DISTINCT u.name ORDER BY u.name SEPARATOR ', ')
               FROM approval_tasks t JOIN users u ON u.id = t.approver_id
              WHERE t.request_id = r.id AND t.status = 'PENDING') AS pending_with
     FROM approval_requests r
     JOIN workflow_versions v ON v.id = r.workflow_version_id
     JOIN workflow_definitions w ON w.id = v.workflow_id
     WHERE r.requester_id = ? AND r.deleted_at IS NULL
     ORDER BY r.id DESC LIMIT 200`,
    [userId],
  );
  return rows.map((row) => ({
    id: row.id,
    requestNo: row.request_no,
    title: row.title,
    workflowName: row.workflow_name,
    status: row.status,
    submittedAt: row.submitted_at,
    closedAt: row.closed_at,
    pendingWith: row.pending_with,
  }));
}

// D-QA-11: My requests with search (number or title), a status filter and
// paging. The filter values are bound, never pasted into the SQL.
export const MY_REQUESTS_PAGE_SIZE = 25;
const STATUSES: readonly InstanceStatus[] = ["IN_PROGRESS", "ON_HOLD", "CHANGES_REQUIRED", "APPROVED", "REJECTED", "CANCELLED"];

export async function searchMyRequests(
  userId: number,
  filter: { q?: string; status?: string; page?: number; shared?: boolean },
  db: Queryable = getDbPool(),
): Promise<{ items: MyRequestItem[]; total: number; page: number; pages: number }> {
  // v1.6.1: shared = requests the person was added to as a collaborator.
  const where = [filter.shared ? "EXISTS (SELECT 1 FROM request_collaborators k WHERE k.request_id = r.id AND k.user_id = ? AND k.removed_at IS NULL)" : "r.requester_id = ?", "r.deleted_at IS NULL"];
  const params: unknown[] = [userId];
  const q = (filter.q ?? "").trim().slice(0, 100);
  if (q) {
    where.push("(r.request_no LIKE ? OR r.title LIKE ?)");
    const like = `%${q.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
    params.push(like, like);
  }
  if (filter.status && (STATUSES as readonly string[]).includes(filter.status)) {
    where.push("r.status = ?");
    params.push(filter.status);
  }
  const [countRows] = await db.query<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total FROM approval_requests r WHERE ${where.join(" AND ")}`, params);
  const total = Number(countRows[0]?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / MY_REQUESTS_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(filter.page ?? 1)), pages);
  const [rows] = await db.query<
    (RowDataPacket & { id: number; request_no: string; title: string; workflow_name: string; status: InstanceStatus; submitted_at: Date; closed_at: Date | null; pending_with: string | null })[]
  >(
    `SELECT r.id, r.request_no, r.title, w.name AS workflow_name, r.status, r.submitted_at, r.closed_at,
            (SELECT GROUP_CONCAT(DISTINCT u.name ORDER BY u.name SEPARATOR ', ')
               FROM approval_tasks t JOIN users u ON u.id = t.approver_id
              WHERE t.request_id = r.id AND t.status = 'PENDING') AS pending_with
     FROM approval_requests r
     JOIN workflow_versions v ON v.id = r.workflow_version_id
     JOIN workflow_definitions w ON w.id = v.workflow_id
     WHERE ${where.join(" AND ")}
     ORDER BY r.id DESC LIMIT ? OFFSET ?`,
    [...params, MY_REQUESTS_PAGE_SIZE, (page - 1) * MY_REQUESTS_PAGE_SIZE],
  );
  return {
    items: rows.map((row) => ({
      id: row.id,
      requestNo: row.request_no,
      title: row.title,
      workflowName: row.workflow_name,
      status: row.status,
      submittedAt: row.submitted_at,
      closedAt: row.closed_at,
      pendingWith: row.pending_with,
    })),
    total,
    page,
    pages,
  };
}

export async function userNames(ids: readonly number[], db: Queryable = getDbPool()): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const [rows] = await db.query<(RowDataPacket & { id: number; name: string })[]>("SELECT id, name FROM users WHERE id IN (?)", [ids]);
  return new Map(rows.map((row) => [row.id, row.name]));
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
