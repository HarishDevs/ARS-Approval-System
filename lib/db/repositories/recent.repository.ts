import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import { visibleToSql } from "@/lib/db/repositories/visibility";
import type { InstanceStatus } from "@/server/engine/types";

// WS-04 recently viewed. Stored per account (not in the browser), and every
// list re-checks access, so a request someone can no longer see drops out.
export async function recordView(userId: number, requestId: number, db: Queryable = getDbPool()): Promise<void> {
  await db.query("INSERT INTO recent_views (user_id, request_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE viewed_at = CURRENT_TIMESTAMP", [userId, requestId]);
}

export interface RecentItem {
  id: number;
  requestNo: string;
  title: string;
  status: InstanceStatus;
  viewedAt: Date;
}

export async function listRecent(viewer: { id: number; isAdmin: boolean }, limit = 8, db: Queryable = getDbPool()): Promise<RecentItem[]> {
  const visible = visibleToSql("r");
  const [rows] = await db.query<(RowDataPacket & { id: number; request_no: string; title: string; status: InstanceStatus; viewed_at: Date })[]>(
    `SELECT r.id, r.request_no, r.title, r.status, rv.viewed_at
     FROM recent_views rv JOIN approval_requests r ON r.id = rv.request_id
     WHERE rv.user_id = ? AND r.deleted_at IS NULL ${viewer.isAdmin ? "" : `AND ${visible.sql}`}
     ORDER BY rv.viewed_at DESC LIMIT ?`,
    [viewer.id, ...(viewer.isAdmin ? [] : visible.params(viewer.id)), Math.min(Math.max(limit, 1), 20)],
  );
  return rows.map((row) => ({ id: row.id, requestNo: row.request_no, title: row.title, status: row.status, viewedAt: row.viewed_at }));
}

// Older than 90 days: no longer "recent" (job runner housekeeping).
export async function pruneRecentViews(db: Queryable = getDbPool()): Promise<number> {
  const [result] = await db.query<import("mysql2/promise").ResultSetHeader>("DELETE FROM recent_views WHERE viewed_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 90 DAY) LIMIT 5000");
  return result.affectedRows;
}
