import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import type { PendingTaskAge } from "@/server/workload/summary";

// #12: every pending approval or work task right now, with its age. Small
// enough for ARS to read whole (hundreds of people).
export async function listPendingTaskAges(db: Queryable = getDbPool()): Promise<PendingTaskAge[]> {
  const [rows] = await db.query<(RowDataPacket & { approver_id: number; name: string; age_seconds: number; overdue: number; on_hold: number })[]>(
    `SELECT t.approver_id, u.name, TIMESTAMPDIFF(SECOND, t.created_at, CURRENT_TIMESTAMP) AS age_seconds,
            (t.due_at IS NOT NULL AND t.due_at < CURRENT_TIMESTAMP AND r.status = 'IN_PROGRESS') AS overdue,
            (r.status = 'ON_HOLD') AS on_hold
     FROM approval_tasks t
     JOIN approval_requests r ON r.id = t.request_id
     JOIN users u ON u.id = t.approver_id
     WHERE t.status = 'PENDING' AND r.status IN ('IN_PROGRESS', 'ON_HOLD') AND r.deleted_at IS NULL
     LIMIT 20000`,
  );
  return rows.map((row) => ({
    approverId: row.approver_id,
    name: row.name,
    ageHours: Math.max(0, Number(row.age_seconds)) / 3600,
    overdue: Number(row.overdue) === 1,
    onHold: Number(row.on_hold) === 1,
  }));
}

export async function pendingCountsByApprover(db: Queryable = getDbPool()): Promise<Map<number, number>> {
  const [rows] = await db.query<(RowDataPacket & { approver_id: number; total: number })[]>(
    `SELECT t.approver_id, COUNT(*) AS total FROM approval_tasks t JOIN approval_requests r ON r.id = t.request_id
     WHERE t.status = 'PENDING' AND r.status IN ('IN_PROGRESS', 'ON_HOLD') AND r.deleted_at IS NULL
     GROUP BY t.approver_id`,
  );
  return new Map(rows.map((row) => [row.approver_id, Number(row.total)]));
}

// v1.7.0 (A3): pending tasks IT can move in bulk, optionally of one person
// or one approval type. At most 300, oldest first.
export interface ReassignableTask {
  requestId: number;
  taskKey: string;
  requestNo: string;
  title: string;
  nodeLabel: string;
  work: boolean;
  approverId: number;
  approverName: string;
  workflowName: string;
  createdAt: Date;
  overdue: boolean;
}

export async function listReassignableTasks(filter: { approverId?: number | null; workflowId?: number | null }, db: Queryable = getDbPool()): Promise<ReassignableTask[]> {
  const where: string[] = ["t.status = 'PENDING'", "r.status IN ('IN_PROGRESS', 'ON_HOLD')", "r.deleted_at IS NULL", "t.round = r.round"];
  const params: unknown[] = [];
  if (filter.approverId) {
    where.push("t.approver_id = ?");
    params.push(filter.approverId);
  }
  if (filter.workflowId) {
    where.push("v.workflow_id = ?");
    params.push(filter.workflowId);
  }
  const [rows] = await db.query<
    (RowDataPacket & { request_id: number; task_key: string; request_no: string; title: string; node_label: string; task_type: string; approver_id: number; approver_name: string; workflow_name: string; created_at: Date; overdue: number })[]
  >(
    `SELECT t.request_id, t.task_key, r.request_no, r.title, t.node_label, t.task_type, t.approver_id, u.name AS approver_name, w.name AS workflow_name, t.created_at,
            (t.due_at IS NOT NULL AND t.due_at < CURRENT_TIMESTAMP) AS overdue
     FROM approval_tasks t
     JOIN approval_requests r ON r.id = t.request_id
     JOIN workflow_versions v ON v.id = r.workflow_version_id
     JOIN workflow_definitions w ON w.id = v.workflow_id
     JOIN users u ON u.id = t.approver_id
     WHERE ${where.join(" AND ")}
     ORDER BY t.created_at, t.id LIMIT 300`,
    params,
  );
  return rows.map((row) => ({
    requestId: row.request_id,
    taskKey: row.task_key,
    requestNo: row.request_no,
    title: row.title,
    nodeLabel: row.node_label,
    work: row.task_type === "WORK",
    approverId: row.approver_id,
    approverName: row.approver_name,
    workflowName: row.workflow_name,
    createdAt: row.created_at,
    overdue: Number(row.overdue) === 1,
  }));
}
