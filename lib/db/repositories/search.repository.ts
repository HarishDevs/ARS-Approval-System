import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import { likeEscape, SEARCH_PAGE_SIZE, type SearchFilters } from "@/server/search/filters";
import type { InstanceStatus } from "@/server/engine/types";

// Global search (#4, D-109). Who may see a request is decided inside the
// SQL, with the same rule as the request page (D-057): the requester, anyone
// with a task on it (or who decided one), an active delegate of such a
// person, or IT / Super Admin. Nothing is filtered after the fact.
export interface SearchItem {
  id: number;
  requestNo: string;
  title: string;
  typeName: string;
  requesterName: string;
  status: InstanceStatus;
  submittedAt: Date;
  pendingWith: string | null;
  overdue: boolean;
}

const INDIA_DATE = (column: string) => `DATE(DATE_ADD(${column}, INTERVAL 330 MINUTE))`;

export async function searchRequests(viewer: { id: number; isAdmin: boolean }, filters: SearchFilters, db: Queryable = getDbPool()): Promise<{ items: SearchItem[]; total: number }> {
  const where: string[] = ["r.deleted_at IS NULL"];
  const params: unknown[] = [];
  const involvement = `(r.requester_id = ?
      OR EXISTS (SELECT 1 FROM approval_tasks x WHERE x.request_id = r.id AND (x.approver_id = ? OR x.decided_by = ?))
      OR EXISTS (SELECT 1 FROM approval_tasks x JOIN delegations d ON d.user_id = x.approver_id
                 WHERE x.request_id = r.id AND d.delegate_id = ? AND d.ended_at IS NULL
                   AND DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE)) BETWEEN d.starts_on AND d.ends_on))`;
  if (!viewer.isAdmin) {
    where.push(involvement);
    params.push(viewer.id, viewer.id, viewer.id, viewer.id);
  }
  if (filters.role === "raised") {
    where.push("r.requester_id = ?");
    params.push(viewer.id);
  } else if (filters.role === "approver") {
    where.push("EXISTS (SELECT 1 FROM approval_tasks x WHERE x.request_id = r.id AND (x.approver_id = ? OR x.decided_by = ?))");
    params.push(viewer.id, viewer.id);
  }
  if (filters.q) {
    where.push("(r.request_no LIKE ? OR r.title LIKE ? OR u.name LIKE ?)");
    const like = likeEscape(filters.q);
    params.push(like, like, like);
  }
  if (filters.status) {
    where.push("r.status = ?");
    params.push(filters.status);
  }
  if (filters.typeId) {
    where.push("w.id = ?");
    params.push(filters.typeId);
  }
  if (filters.departmentId && viewer.isAdmin) {
    where.push("u.department_id = ?");
    params.push(filters.departmentId);
  }
  if (filters.from) {
    where.push(`${INDIA_DATE("r.submitted_at")} >= ?`);
    params.push(filters.from);
  }
  if (filters.to) {
    where.push(`${INDIA_DATE("r.submitted_at")} <= ?`);
    params.push(filters.to);
  }
  const overdueSql = "EXISTS (SELECT 1 FROM approval_tasks o WHERE o.request_id = r.id AND o.status = 'PENDING' AND o.due_at < CURRENT_TIMESTAMP)";
  if (filters.overdue) where.push(`r.status = 'IN_PROGRESS' AND ${overdueSql}`);
  const from = `FROM approval_requests r
     JOIN workflow_versions v ON v.id = r.workflow_version_id
     JOIN workflow_definitions w ON w.id = v.workflow_id
     JOIN users u ON u.id = r.requester_id
     WHERE ${where.join(" AND ")}`;
  const order =
    filters.sort === "oldest"
      ? "r.submitted_at ASC, r.id ASC"
      : filters.sort === "due"
        ? "(SELECT MIN(d.due_at) FROM approval_tasks d WHERE d.request_id = r.id AND d.status = 'PENDING') IS NULL, (SELECT MIN(d.due_at) FROM approval_tasks d WHERE d.request_id = r.id AND d.status = 'PENDING'), r.id DESC"
        : "r.submitted_at DESC, r.id DESC";
  const [[count]] = await db.query<RowDataPacket[]>(`SELECT COUNT(*) AS total ${from}`, params);
  const [rows] = await db.query<
    (RowDataPacket & { id: number; request_no: string; title: string; type_name: string; requester_name: string; status: InstanceStatus; submitted_at: Date; pending_with: string | null; overdue: number })[]
  >(
    `SELECT r.id, r.request_no, r.title, w.name AS type_name, u.name AS requester_name, r.status, r.submitted_at,
            (SELECT GROUP_CONCAT(DISTINCT p.name ORDER BY p.name SEPARATOR ', ') FROM approval_tasks t JOIN users p ON p.id = t.approver_id
              WHERE t.request_id = r.id AND t.status = 'PENDING') AS pending_with,
            (r.status = 'IN_PROGRESS' AND ${overdueSql}) AS overdue
     ${from}
     ORDER BY ${order}
     LIMIT ? OFFSET ?`,
    [...params, SEARCH_PAGE_SIZE, (filters.page - 1) * SEARCH_PAGE_SIZE],
  );
  return {
    total: Number(count?.total ?? 0),
    items: rows.map((row) => ({
      id: row.id,
      requestNo: row.request_no,
      title: row.title,
      typeName: row.type_name,
      requesterName: row.requester_name,
      status: row.status,
      submittedAt: row.submitted_at,
      pendingWith: row.pending_with,
      overdue: Number(row.overdue) === 1,
    })),
  };
}

// ---- saved views (#4): private to their owner; every query filters on user_id.
export interface SavedView {
  id: number;
  name: string;
  query: Record<string, string>;
  isDefault: boolean;
}

export async function listSavedViews(userId: number, db: Queryable = getDbPool()): Promise<SavedView[]> {
  const [rows] = await db.query<(RowDataPacket & { id: number; name: string; query_json: Record<string, string> | string; is_default: number })[]>(
    "SELECT id, name, query_json, is_default FROM saved_views WHERE user_id = ? ORDER BY name LIMIT 50",
    [userId],
  );
  return rows.map((row) => ({ id: row.id, name: row.name, query: typeof row.query_json === "string" ? JSON.parse(row.query_json) : row.query_json, isDefault: Number(row.is_default) === 1 }));
}

export async function createSavedView(userId: number, name: string, query: Record<string, string>, db: Queryable = getDbPool()): Promise<"OK" | "DUPLICATE" | "TOO_MANY"> {
  const [[count]] = await db.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM saved_views WHERE user_id = ?", [userId]);
  if (Number(count?.n ?? 0) >= 50) return "TOO_MANY";
  try {
    await db.query<ResultSetHeader>("INSERT INTO saved_views (user_id, name, query_json) VALUES (?, ?, ?)", [userId, name, JSON.stringify(query)]);
    return "OK";
  } catch (error) {
    if ((error as { code?: string }).code === "ER_DUP_ENTRY") return "DUPLICATE";
    throw error;
  }
}

export async function renameSavedView(userId: number, id: number, name: string, db: Queryable = getDbPool()): Promise<"OK" | "DUPLICATE" | "NOT_FOUND"> {
  try {
    const [result] = await db.query<ResultSetHeader>("UPDATE saved_views SET name = ? WHERE id = ? AND user_id = ?", [name, id, userId]);
    return result.affectedRows === 1 ? "OK" : "NOT_FOUND";
  } catch (error) {
    if ((error as { code?: string }).code === "ER_DUP_ENTRY") return "DUPLICATE";
    throw error;
  }
}

export async function setDefaultSavedView(userId: number, id: number | null, db: Queryable = getDbPool()): Promise<boolean> {
  await db.query<ResultSetHeader>("UPDATE saved_views SET is_default = FALSE WHERE user_id = ?", [userId]);
  if (id === null) return true;
  const [result] = await db.query<ResultSetHeader>("UPDATE saved_views SET is_default = TRUE WHERE id = ? AND user_id = ?", [id, userId]);
  return result.affectedRows === 1;
}

export async function deleteSavedView(userId: number, id: number, db: Queryable = getDbPool()): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>("DELETE FROM saved_views WHERE id = ? AND user_id = ?", [id, userId]);
  return result.affectedRows === 1;
}
