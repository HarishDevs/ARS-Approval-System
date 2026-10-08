import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import type { InstanceStatus } from "@/server/engine/types";

// Super Admin view of every request, and soft delete (S11, D-086, F-73).
export const ALL_REQUESTS_PAGE_SIZE = 25;
const STATUSES: readonly InstanceStatus[] = ["IN_PROGRESS", "ON_HOLD", "CHANGES_REQUIRED", "APPROVED", "REJECTED", "CANCELLED"];

export interface AdminRequestItem {
  id: number;
  requestNo: string;
  title: string;
  workflowName: string;
  requesterName: string;
  departmentName: string | null;
  status: InstanceStatus;
  submittedAt: Date;
  deletedAt: Date | null;
  deletedByName: string | null;
  deleteReason: string | null;
}

export async function listAllRequests(
  filter: { q?: string; status?: string; deleted?: boolean; page?: number },
  db: Queryable = getDbPool(),
): Promise<{ items: AdminRequestItem[]; total: number; page: number; pages: number }> {
  const where = [filter.deleted ? "r.deleted_at IS NOT NULL" : "r.deleted_at IS NULL"];
  const params: unknown[] = [];
  const q = (filter.q ?? "").trim().slice(0, 100);
  if (q) {
    where.push("(r.request_no LIKE ? OR r.title LIKE ? OR u.name LIKE ?)");
    const like = `%${q.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
    params.push(like, like, like);
  }
  if (filter.status && (STATUSES as readonly string[]).includes(filter.status)) {
    where.push("r.status = ?");
    params.push(filter.status);
  }
  const from = `FROM approval_requests r
     JOIN workflow_versions v ON v.id = r.workflow_version_id
     JOIN workflow_definitions w ON w.id = v.workflow_id
     JOIN users u ON u.id = r.requester_id
     LEFT JOIN departments d ON d.id = u.department_id
     LEFT JOIN users x ON x.id = r.deleted_by
     WHERE ${where.join(" AND ")}`;
  const [countRows] = await db.query<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total ${from}`, params);
  const total = Number(countRows[0]?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / ALL_REQUESTS_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(filter.page ?? 1)), pages);
  const [rows] = await db.query<
    (RowDataPacket & {
      id: number;
      request_no: string;
      title: string;
      workflow_name: string;
      requester_name: string;
      department_name: string | null;
      status: InstanceStatus;
      submitted_at: Date;
      deleted_at: Date | null;
      deleted_by_name: string | null;
      delete_reason: string | null;
    })[]
  >(
    `SELECT r.id, r.request_no, r.title, w.name AS workflow_name, u.name AS requester_name, d.name AS department_name, r.status, r.submitted_at,
            r.deleted_at, x.name AS deleted_by_name, r.delete_reason
     ${from}
     ORDER BY ${filter.deleted ? "r.deleted_at" : "r.id"} DESC LIMIT ? OFFSET ?`,
    [...params, ALL_REQUESTS_PAGE_SIZE, (page - 1) * ALL_REQUESTS_PAGE_SIZE],
  );
  return {
    items: rows.map((row) => ({
      id: row.id,
      requestNo: row.request_no,
      title: row.title,
      workflowName: row.workflow_name,
      requesterName: row.requester_name,
      departmentName: row.department_name,
      status: row.status,
      submittedAt: row.submitted_at,
      deletedAt: row.deleted_at,
      deletedByName: row.deleted_by_name,
      deleteReason: row.delete_reason,
    })),
    total,
    page,
    pages,
  };
}

// Within the caller's transaction, after lockRequest.
export async function markRequestDeleted(id: number, deletedBy: number, reason: string, db: Queryable): Promise<void> {
  await db.query<ResultSetHeader>("UPDATE approval_requests SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?, delete_reason = ? WHERE id = ? AND deleted_at IS NULL", [
    deletedBy,
    reason,
    id,
  ]);
}

export async function cancelPendingTasks(requestId: number, db: Queryable): Promise<number> {
  const [result] = await db.query<ResultSetHeader>("UPDATE approval_tasks SET status = 'CANCELLED' WHERE request_id = ? AND status = 'PENDING'", [requestId]);
  return result.affectedRows;
}
