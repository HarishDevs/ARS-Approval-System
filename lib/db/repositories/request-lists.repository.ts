import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import type { InstanceStatus } from "@/server/engine/types";
import { listFilterSql, tabsFor, type ListBase, type ListFilters, type QuickTab } from "@/server/requests/list-filters";

// v1.7.2: My requests and Collaborating. The base condition decides whose
// requests these are and is always applied first:
//   MINE   - raised by the person;
//   COLLAB - the person is a collaborator on it (not removed);
//   APPROVED_MINE - raised by the person and approved (v1.8.0);
//   APPROVED_BY_ME - the person approved a step of it, themselves or for
//     someone they cover (v1.8.0). They can always open it (D-057).
// Deleted requests never appear. Filters only narrow the base.
const BASE: Record<ListBase, string> = {
  MINE: "r.requester_id = ?",
  COLLAB: "k.user_id = ? AND k.removed_at IS NULL",
  APPROVED_MINE: "r.requester_id = ? AND r.status = 'APPROVED'",
  APPROVED_BY_ME: "EXISTS (SELECT 1 FROM approval_tasks mb WHERE mb.request_id = r.id AND mb.task_type = 'APPROVAL' AND mb.status = 'APPROVED' AND mb.decided_by = ?)",
};
const FROM = (base: ListBase) => `FROM approval_requests r
     JOIN workflow_versions v ON v.id = r.workflow_version_id
     JOIN workflow_definitions w ON w.id = v.workflow_id
     JOIN users u ON u.id = r.requester_id
     ${base === "COLLAB" ? "JOIN request_collaborators k ON k.request_id = r.id JOIN users ab ON ab.id = k.added_by" : ""}`;

// v1.8.0: who approved (my approved requests), and my own approval (approved by me).
const APPROVED_BY_COLUMN = `, (SELECT GROUP_CONCAT(DISTINCT p.name ORDER BY p.name SEPARATOR ', ') FROM approval_tasks t JOIN users p ON p.id = COALESCE(t.decided_by, t.approver_id)
     WHERE t.request_id = r.id AND t.status = 'APPROVED' AND t.task_type = 'APPROVAL') AS approved_by`;
const MY_APPROVAL_COLUMNS = `, (SELECT MAX(x.decided_at) FROM approval_tasks x WHERE x.request_id = r.id AND x.task_type = 'APPROVAL' AND x.status = 'APPROVED' AND x.decided_by = ?) AS my_approved_at,
     (SELECT GROUP_CONCAT(DISTINCT x.node_label ORDER BY x.node_label SEPARATOR ', ') FROM approval_tasks x WHERE x.request_id = r.id AND x.task_type = 'APPROVAL' AND x.status = 'APPROVED' AND x.decided_by = ?) AS my_step,
     (SELECT GROUP_CONCAT(DISTINCT o.name SEPARATOR ', ') FROM approval_tasks x JOIN users o ON o.id = x.on_behalf_of WHERE x.request_id = r.id AND x.status = 'APPROVED' AND x.decided_by = ?) AS my_for`;

export interface ListedRequest {
  id: number;
  requestNo: string;
  title: string;
  workflowName: string;
  requesterName: string;
  status: InstanceStatus;
  submittedAt: Date;
  closedAt: Date | null;
  updatedAt: Date;
  pendingWith: string | null;
  pendingStep: string | null;
  nextDue: Date | null;
  overdue: boolean;
  files: number;
  validUntil: Date | null;
  addedByName: string | null; // COLLAB
  addedAt: Date | null; // COLLAB
  approvedBy: string | null; // who approved (APPROVED_MINE)
  myApprovedAt: Date | null; // APPROVED_BY_ME: my latest approval
  myStep: string | null; // APPROVED_BY_ME
  myForName: string | null; // APPROVED_BY_ME: approved for this person (covering)
  amended: boolean;
}

export async function listRequests(base: ListBase, userId: number, filters: ListFilters, db: Queryable = getDbPool()): Promise<{ items: ListedRequest[]; total: number; page: number; pages: number }> {
  const extra = listFilterSql(filters, base, userId);
  const where = ["r.deleted_at IS NULL", BASE[base], ...extra.where].join(" AND ");
  const params = [userId, ...extra.params];
  const [[count]] = await db.query<RowDataPacket[]>(`SELECT COUNT(*) AS total ${FROM(base)} WHERE ${where}`, params);
  const total = Number(count?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / filters.size));
  const page = Math.min(filters.page, pages);
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT r.id, r.request_no, r.title, w.name AS workflow_name, u.name AS requester_name, r.status, r.submitted_at, r.closed_at, r.updated_at, r.valid_until,
            (SELECT GROUP_CONCAT(DISTINCT p.name ORDER BY p.name SEPARATOR ', ') FROM approval_tasks t JOIN users p ON p.id = t.approver_id WHERE t.request_id = r.id AND t.status = 'PENDING') AS pending_with,
            (SELECT GROUP_CONCAT(DISTINCT t.node_label ORDER BY t.node_label SEPARATOR ', ') FROM approval_tasks t WHERE t.request_id = r.id AND t.status = 'PENDING') AS pending_step,
            (SELECT MIN(t.due_at) FROM approval_tasks t WHERE t.request_id = r.id AND t.status = 'PENDING') AS next_due,
            (SELECT COUNT(*) FROM request_attachments f WHERE f.request_id = r.id) AS files,
            EXISTS (SELECT 1 FROM request_amendments am WHERE am.original_id = r.id) AS amended
            ${base === "COLLAB" ? ", ab.name AS added_by_name, k.added_at" : ""}
            ${base === "APPROVED_MINE" ? APPROVED_BY_COLUMN : ""}
            ${base === "APPROVED_BY_ME" ? MY_APPROVAL_COLUMNS : ""}
     ${FROM(base)} WHERE ${where}
     ORDER BY ${extra.orderBy} LIMIT ? OFFSET ?`,
    [...(base === "APPROVED_BY_ME" ? [userId, userId, userId] : []), ...params, filters.size, (page - 1) * filters.size],
  );
  const now = Date.now();
  return {
    items: rows.map((row) => ({
      id: row.id,
      requestNo: row.request_no,
      title: row.title,
      workflowName: row.workflow_name,
      requesterName: row.requester_name,
      status: row.status,
      submittedAt: row.submitted_at,
      closedAt: row.closed_at,
      updatedAt: row.updated_at,
      pendingWith: row.pending_with,
      pendingStep: row.pending_step,
      nextDue: row.next_due,
      overdue: row.status === "IN_PROGRESS" && row.next_due !== null && new Date(row.next_due).getTime() < now,
      files: Number(row.files),
      validUntil: row.valid_until,
      addedByName: row.added_by_name ?? null,
      addedAt: row.added_at ?? null,
      approvedBy: row.approved_by ?? null,
      myApprovedAt: row.my_approved_at ?? null,
      myStep: row.my_step ?? null,
      myForName: row.my_for ?? null,
      amended: Number(row.amended) === 1,
    })),
    total,
    page,
    pages,
  };
}

// Counts for the quick tabs (with every other filter applied).
export async function tabCounts(base: ListBase, userId: number, filters: ListFilters, db: Queryable = getDbPool()): Promise<Record<QuickTab, number>> {
  const out = {} as Record<QuickTab, number>;
  const currentTab = tabsFor(base).find((item) => item.key === filters.tab);
  for (const tab of tabsFor(base)) {
    const extra = listFilterSql({ ...filters, tab: tab.key, overdue: Boolean(tab.overdue) || (filters.overdue && !currentTab?.overdue) }, base, userId);
    const [[row]] = await db.query<RowDataPacket[]>(`SELECT COUNT(*) AS n ${FROM(base)} WHERE ${["r.deleted_at IS NULL", BASE[base], ...extra.where].join(" AND ")}`, [userId, ...extra.params]);
    out[tab.key] = Number(row?.n ?? 0);
  }
  return out;
}

export interface ListChoices {
  types: { id: number; name: string }[];
  requesters: { id: number; name: string }[];
  departments: { id: number; name: string }[];
  addedBy: { id: number; name: string }[];
  steps: string[];
  waitingWith: { id: number; name: string }[];
  hasCustom: boolean;
  approvedBy: { id: number; name: string }[]; // APPROVED_MINE
  mySteps: string[]; // APPROVED_BY_ME
}

// The choices for the filters, taken only from the person's own base set,
// so a list never shows a name or type they couldn't already see.
export async function listChoices(base: ListBase, userId: number, db: Queryable = getDbPool()): Promise<ListChoices> {
  const where = `WHERE r.deleted_at IS NULL AND ${BASE[base]}`;
  const run = async <T,>(sql: string, extra: unknown[] = []) => (await db.query<RowDataPacket[]>(sql, [...extra, userId]))[0] as unknown as T[];
  const people = base === "COLLAB" || base === "APPROVED_BY_ME";
  const [types, requesters, departments, addedBy, steps, waitingWith, approvedBy, mySteps] = await Promise.all([
    run<{ id: number; name: string; kind: string }>(`SELECT DISTINCT w.id, w.name, w.kind ${FROM(base)} ${where} ORDER BY w.name LIMIT 200`),
    people ? run<{ id: number; name: string }>(`SELECT DISTINCT u.id, u.name ${FROM(base)} ${where} ORDER BY u.name LIMIT 300`) : Promise.resolve([]),
    people ? run<{ id: number; name: string }>(`SELECT DISTINCT d.id, d.name ${FROM(base)} JOIN departments d ON d.id = u.department_id ${where} ORDER BY d.name LIMIT 200`) : Promise.resolve([]),
    base === "COLLAB" ? run<{ id: number; name: string }>(`SELECT DISTINCT ab.id, ab.name ${FROM(base)} ${where} ORDER BY ab.name LIMIT 300`) : Promise.resolve([]),
    run<{ step: string }>(`SELECT DISTINCT t.node_label AS step ${FROM(base)} JOIN approval_tasks t ON t.request_id = r.id AND t.status = 'PENDING' ${where} ORDER BY step LIMIT 200`),
    run<{ id: number; name: string }>(`SELECT DISTINCT p.id, p.name ${FROM(base)} JOIN approval_tasks t ON t.request_id = r.id AND t.status = 'PENDING' JOIN users p ON p.id = t.approver_id ${where} ORDER BY p.name LIMIT 300`),
    base === "APPROVED_MINE"
      ? run<{ id: number; name: string }>(`SELECT DISTINCT p.id, p.name ${FROM(base)} JOIN approval_tasks t ON t.request_id = r.id AND t.status = 'APPROVED' AND t.task_type = 'APPROVAL' JOIN users p ON p.id = COALESCE(t.decided_by, t.approver_id) ${where} ORDER BY p.name LIMIT 300`)
      : Promise.resolve([]),
    base === "APPROVED_BY_ME"
      ? run<{ step: string }>(`SELECT DISTINCT t.node_label AS step ${FROM(base)} JOIN approval_tasks t ON t.request_id = r.id AND t.status = 'APPROVED' AND t.task_type = 'APPROVAL' AND t.decided_by = ? ${where} ORDER BY step LIMIT 200`, [userId])
      : Promise.resolve([]),
  ]);
  return {
    types: types.filter((row) => row.kind !== "CUSTOM").map((row) => ({ id: row.id, name: row.name })),
    hasCustom: types.some((row) => row.kind === "CUSTOM"),
    requesters,
    departments,
    addedBy,
    steps: steps.map((row) => row.step),
    waitingWith,
    approvedBy,
    mySteps: mySteps.map((row) => row.step),
  };
}
