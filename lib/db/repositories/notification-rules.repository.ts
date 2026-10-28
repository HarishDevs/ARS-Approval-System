import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import type { Condition, RuleInput, RuleKind, RuleModule, Stage } from "@/server/notifications/rule-model";

// D-209: reminder and escalation rules (server/notifications/rule-model.ts)
// and the record of every send.
export interface StoredRule extends RuleInput {
  id: number;
  updatedAt: Date;
  updatedByName: string | null;
}

type RuleRow = RowDataPacket & {
  id: number;
  name: string;
  kind: RuleKind;
  module: RuleModule;
  active: number;
  match_mode: "ALL" | "ANY";
  conditions_json: unknown;
  stages_json: unknown;
  send_email: number;
  subject: string;
  body: string;
  updated_at: Date;
  updated_by_name: string | null;
};

const json = <T>(value: unknown, fallback: T): T => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
};

const toRule = (row: RuleRow): StoredRule => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  module: row.module,
  active: Boolean(row.active),
  match: row.match_mode,
  conditions: json<Condition[]>(row.conditions_json, []),
  stages: json<Stage[]>(row.stages_json, []),
  email: Boolean(row.send_email),
  subject: row.subject,
  body: row.body,
  updatedAt: row.updated_at,
  updatedByName: row.updated_by_name,
});

const SELECT = `SELECT r.*, u.name AS updated_by_name FROM notification_rules r LEFT JOIN users u ON u.id = r.updated_by`;

export async function listRules(db: Queryable = getDbPool()): Promise<StoredRule[]> {
  const [rows] = await db.query<RuleRow[]>(`${SELECT} ORDER BY r.module, r.kind, r.name`);
  return rows.map(toRule);
}

export async function listActiveRules(db: Queryable = getDbPool()): Promise<StoredRule[]> {
  const [rows] = await db.query<RuleRow[]>(`${SELECT} WHERE r.active = TRUE ORDER BY r.id`);
  return rows.map(toRule);
}

export async function findRule(id: number, db: Queryable = getDbPool()): Promise<StoredRule | null> {
  const [rows] = await db.query<RuleRow[]>(`${SELECT} WHERE r.id = ?`, [id]);
  return rows[0] ? toRule(rows[0]) : null;
}

const values = (rule: RuleInput) => [rule.name, rule.kind, rule.module, rule.active, rule.match, JSON.stringify(rule.conditions), JSON.stringify(rule.stages), rule.email, rule.subject, rule.body];

export async function insertRule(rule: RuleInput, userId: number, db: Queryable = getDbPool()): Promise<number> {
  const [result] = await db.query<ResultSetHeader>(
    `INSERT INTO notification_rules (name, kind, module, active, match_mode, conditions_json, stages_json, send_email, subject, body, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [...values(rule), userId, userId],
  );
  return result.insertId;
}

export async function updateRule(id: number, rule: RuleInput, userId: number, db: Queryable = getDbPool()): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>(
    `UPDATE notification_rules SET name = ?, kind = ?, module = ?, active = ?, match_mode = ?, conditions_json = ?, stages_json = ?, send_email = ?, subject = ?, body = ?, updated_by = ? WHERE id = ?`,
    [...values(rule), userId, id],
  );
  return result.affectedRows === 1;
}

export async function setRuleActive(id: number, active: boolean, userId: number, db: Queryable = getDbPool()): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>("UPDATE notification_rules SET active = ?, updated_by = ? WHERE id = ?", [active, userId, id]);
  return result.affectedRows === 1;
}

export async function deleteRule(id: number, db: Queryable = getDbPool()): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>("DELETE FROM notification_rules WHERE id = ?", [id]);
  return result.affectedRows === 1;
}

// One open record a rule may fire on, with every field a condition can name.
export interface RuleCandidate {
  recordKind: "APPROVAL_STEP" | "TASK";
  recordId: number;
  linkPath: string;
  ref: string;
  title: string;
  stepLabel: string;
  assigneeId: number;
  assigneeName: string;
  assigneeManagerId: number | null;
  assigneeManager2Id: number | null;
  requesterId: number | null;
  requesterName: string;
  requesterManagerId: number | null;
  hodId: number | null;
  started: Date;
  raised: Date;
  due: Date | null;
  fields: Record<string, string | number | null>;
}

const hoursBetween = (from: Date, to: Date) => Math.max(0, Math.round(((to.getTime() - from.getTime()) / 3_600_000) * 10) / 10);

function formFields(raw: unknown): Record<string, string | number | null> {
  const data = json<Record<string, unknown>>(raw, {});
  const out: Record<string, string | number | null> = {};
  for (const [key, value] of Object.entries(data ?? {})) {
    if (value === null || value === undefined) out[`form.${key}`] = null;
    else if (typeof value === "number" || typeof value === "string") out[`form.${key}`] = value;
    else if (typeof value === "boolean") out[`form.${key}`] = value ? "yes" : "no";
    else if (Array.isArray(value)) out[`form.${key}`] = value.map((item) => (typeof item === "object" && item !== null ? ((item as { label?: string; name?: string }).label ?? (item as { name?: string }).name ?? "") : String(item))).join(", ");
    else if (typeof value === "object") out[`form.${key}`] = (value as { label?: string; name?: string }).label ?? (value as { name?: string }).name ?? null;
  }
  return out;
}

// Pending approval steps of requests in progress (on hold is skipped).
export async function approvalCandidates(now: Date, limit = 2000, db: Queryable = getDbPool()): Promise<RuleCandidate[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT t.id, t.request_id, t.node_label, t.task_type, t.approver_id, t.created_at, t.due_at,
            r.request_no, r.title, r.status, r.submitted_at, r.form_data_json, r.requester_id,
            w.name AS type_name,
            a.name AS assignee_name, a.reporting_manager_id AS assignee_manager_id, am.reporting_manager_id AS assignee_manager2_id, ad.name AS assignee_department,
            q.name AS requester_name, q.reporting_manager_id AS requester_manager_id, qd.name AS requester_department, qd.hod_user_id
     FROM approval_tasks t
     JOIN approval_requests r ON r.id = t.request_id
     JOIN workflow_versions v ON v.id = r.workflow_version_id
     JOIN workflow_definitions w ON w.id = v.workflow_id
     JOIN users a ON a.id = t.approver_id
     LEFT JOIN users am ON am.id = a.reporting_manager_id
     LEFT JOIN departments ad ON ad.id = a.department_id
     JOIN users q ON q.id = r.requester_id
     LEFT JOIN departments qd ON qd.id = q.department_id
     WHERE t.status = 'PENDING' AND r.status = 'IN_PROGRESS' AND r.deleted_at IS NULL
     ORDER BY t.id LIMIT ?`,
    [limit],
  );
  return rows.map((row) => {
    const started = new Date(row.created_at);
    const raised = new Date(row.submitted_at ?? row.created_at);
    const due = row.due_at ? new Date(row.due_at) : null;
    return {
      recordKind: "APPROVAL_STEP",
      recordId: row.id,
      linkPath: `/users/requests/${row.request_id}`,
      ref: row.request_no,
      title: row.title,
      stepLabel: row.node_label ?? "",
      assigneeId: row.approver_id,
      assigneeName: row.assignee_name,
      assigneeManagerId: row.assignee_manager_id ?? null,
      assigneeManager2Id: row.assignee_manager2_id ?? null,
      requesterId: row.requester_id,
      requesterName: row.requester_name,
      requesterManagerId: row.requester_manager_id ?? null,
      hodId: row.hod_user_id ?? null,
      started,
      raised,
      due,
      fields: {
        type: row.type_name,
        request_no: row.request_no,
        title: row.title,
        step: row.node_label ?? "",
        step_kind: row.task_type,
        status: row.status,
        requester: row.requester_name,
        requester_department: row.requester_department ?? null,
        assignee: row.assignee_name,
        assignee_department: row.assignee_department ?? null,
        hours_pending: hoursBetween(started, now),
        hours_since_raised: hoursBetween(raised, now),
        hours_overdue: due && now > due ? hoursBetween(due, now) : 0,
        ...formFields(row.form_data_json),
      },
    };
  });
}

// Open tasks (open, in progress or blocked).
export async function taskCandidates(now: Date, limit = 2000, db: Queryable = getDbPool()): Promise<RuleCandidate[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT k.id, k.task_no, k.title, k.priority, k.status, k.assignee_id, k.created_by, k.created_at, k.due_at, k.form_data_json,
            mt.name AS type_name,
            a.name AS assignee_name, a.reporting_manager_id AS assignee_manager_id, am.reporting_manager_id AS assignee_manager2_id, ad.name AS assignee_department, ad.hod_user_id,
            c.name AS creator_name, c.reporting_manager_id AS creator_manager_id, cd.name AS creator_department
     FROM tasks k
     LEFT JOIN module_type_versions tv ON tv.id = k.type_version_id
     LEFT JOIN module_types mt ON mt.id = tv.type_id
     JOIN users a ON a.id = k.assignee_id
     LEFT JOIN users am ON am.id = a.reporting_manager_id
     LEFT JOIN departments ad ON ad.id = a.department_id
     LEFT JOIN users c ON c.id = k.created_by
     LEFT JOIN departments cd ON cd.id = c.department_id
     WHERE k.status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED')
     ORDER BY k.id LIMIT ?`,
    [limit],
  );
  return rows.map((row) => {
    const started = new Date(row.created_at);
    const due = row.due_at ? new Date(row.due_at) : null;
    return {
      recordKind: "TASK",
      recordId: row.id,
      linkPath: `/users/tasks/${row.id}`,
      ref: row.task_no,
      title: row.title,
      stepLabel: row.status,
      assigneeId: row.assignee_id,
      assigneeName: row.assignee_name,
      assigneeManagerId: row.assignee_manager_id ?? null,
      assigneeManager2Id: row.assignee_manager2_id ?? null,
      requesterId: row.created_by ?? null,
      requesterName: row.creator_name ?? "",
      requesterManagerId: row.creator_manager_id ?? null,
      hodId: row.hod_user_id ?? null,
      started,
      raised: started,
      due,
      fields: {
        type: row.type_name ?? "",
        task_no: row.task_no,
        title: row.title,
        priority: row.priority,
        status: row.status,
        assignee: row.assignee_name,
        assignee_department: row.assignee_department ?? null,
        requester: row.creator_name ?? "",
        requester_department: row.creator_department ?? null,
        hours_pending: hoursBetween(started, now),
        hours_since_raised: hoursBetween(started, now),
        hours_overdue: due && now > due ? hoursBetween(due, now) : 0,
        ...formFields(row.form_data_json),
      },
    };
  });
}

// The highest send already made for each stage of a rule on a record.
export async function sentSoFar(ruleId: number, recordKind: RuleCandidate["recordKind"], recordId: number, db: Queryable = getDbPool()): Promise<Map<number, number>> {
  const [rows] = await db.query<(RowDataPacket & { stage_no: number; last: number })[]>(
    "SELECT stage_no, MAX(send_no) AS last FROM notification_rule_sends WHERE rule_id = ? AND record_kind = ? AND record_id = ? GROUP BY stage_no",
    [ruleId, recordKind, recordId],
  );
  return new Map(rows.map((row) => [Number(row.stage_no), Number(row.last)]));
}

// Claims one send; false when it was already made (by this or another run).
export async function claimSend(ruleId: number, recordKind: RuleCandidate["recordKind"], recordId: number, stageNo: number, sendNo: number, db: Queryable = getDbPool()): Promise<number | null> {
  const [result] = await db.query<ResultSetHeader>("INSERT IGNORE INTO notification_rule_sends (rule_id, record_kind, record_id, stage_no, send_no) VALUES (?, ?, ?, ?, ?)", [ruleId, recordKind, recordId, stageNo, sendNo]);
  return result.affectedRows === 1 ? result.insertId : null;
}

export async function recordRecipients(sendId: number, count: number, db: Queryable = getDbPool()): Promise<void> {
  await db.query("UPDATE notification_rule_sends SET recipients = ? WHERE id = ?", [count, sendId]);
}

// Active delegates of a person today (India time).
export async function activeDelegates(userId: number, db: Queryable = getDbPool()): Promise<number[]> {
  const [rows] = await db.query<(RowDataPacket & { delegate_id: number })[]>(
    "SELECT delegate_id FROM delegations WHERE user_id = ? AND ended_at IS NULL AND DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:30')) BETWEEN starts_on AND ends_on",
    [userId],
  );
  return rows.map((row) => row.delegate_id);
}

// The form field keys used by approval types and task types, for the
// condition picker ("form.<key>").
export async function formFieldOptions(module: RuleModule, db: Queryable = getDbPool()): Promise<{ key: string; label: string }[]> {
  const [rows] =
    module === "APPROVAL"
      ? await db.query<(RowDataPacket & { form_json: unknown })[]>("SELECT form_json FROM workflow_versions WHERE status = 'PUBLISHED' AND form_json IS NOT NULL")
      : await db.query<(RowDataPacket & { form_json: unknown })[]>("SELECT form_json FROM module_type_versions v JOIN module_types t ON t.id = v.type_id WHERE t.module = 'TASK' AND v.status = 'PUBLISHED' AND v.form_json IS NOT NULL");
  const seen = new Map<string, string>();
  for (const row of rows) {
    for (const field of json<{ key?: string; label?: string; type?: string }[]>(row.form_json, [])) {
      if (!field?.key || field.type === "SECTION" || field.type === "ATTACHMENT" || field.type === "LINE_ITEMS") continue;
      if (!seen.has(field.key)) seen.set(field.key, field.label ?? field.key);
    }
  }
  return [...seen].map(([key, label]) => ({ key: `form.${key}`, label: `Form: ${label}` })).sort((a, b) => a.label.localeCompare(b.label));
}
