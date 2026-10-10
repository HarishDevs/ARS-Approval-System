import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";

// Saved Analytics / report filters (Addendum A §11). A saved view stores
// filters only; the scope is re-checked whenever it is opened. v1.7.0 (B07):
// the owner can share a view (everyone sees its name and filters, and gets
// their own numbers) and mark one of their own as the default for a page.
export interface AnalyticsView {
  id: number;
  name: string;
  target: string;
  query: Record<string, string>;
  shared: boolean;
  isDefault: boolean;
  mine: boolean;
  ownerName: string;
}

type Row = RowDataPacket & { id: number; user_id: number; name: string; target: string; query_json: unknown; shared: number; is_default: number; owner_name: string };
const toView = (row: Row, userId: number): AnalyticsView => ({
  id: row.id,
  name: row.name,
  target: row.target,
  query: (typeof row.query_json === "string" ? JSON.parse(row.query_json) : row.query_json) as Record<string, string>,
  shared: Boolean(row.shared),
  isDefault: Boolean(row.is_default) && row.user_id === userId,
  mine: row.user_id === userId,
  ownerName: row.owner_name,
});

// The person's own views, then views others shared (by active people).
export async function listViews(userId: number, target: string): Promise<AnalyticsView[]> {
  const [rows] = await getDbPool().query<Row[]>(
    `SELECT a.id, a.user_id, a.name, a.target, a.query_json, a.shared, a.is_default, u.name AS owner_name
     FROM analytics_views a JOIN users u ON u.id = a.user_id
     WHERE a.target = ? AND (a.user_id = ? OR (a.shared = TRUE AND u.active = TRUE))
     ORDER BY a.user_id = ? DESC, a.name LIMIT 100`,
    [target, userId, userId],
  );
  return rows.map((row) => toView(row, userId));
}

export async function findDefaultView(userId: number, target: string): Promise<AnalyticsView | null> {
  return (await listViews(userId, target)).find((view) => view.isDefault) ?? null;
}

export async function saveView(input: { userId: number; target: string; name: string; query: Record<string, string>; shared?: boolean }): Promise<"OK" | "TOO_MANY"> {
  const db = getDbPool();
  const [[count]] = await db.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM analytics_views WHERE user_id = ?", [input.userId]);
  if (Number(count?.n ?? 0) >= 100) return "TOO_MANY";
  await db.query<ResultSetHeader>(
    "INSERT INTO analytics_views (user_id, target, name, query_json, shared) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE query_json = VALUES(query_json), shared = VALUES(shared)",
    [input.userId, input.target, input.name, JSON.stringify(input.query), Boolean(input.shared)],
  );
  return "OK";
}

export async function deleteView(userId: number, id: number): Promise<boolean> {
  const [result] = await getDbPool().query<ResultSetHeader>("DELETE FROM analytics_views WHERE id = ? AND user_id = ?", [id, userId]);
  return result.affectedRows === 1;
}

// Owner only. Sharing shows the view's name and filters to everyone.
export async function setViewShared(userId: number, id: number, shared: boolean): Promise<boolean> {
  const [result] = await getDbPool().query<ResultSetHeader>("UPDATE analytics_views SET shared = ? WHERE id = ? AND user_id = ?", [shared, id, userId]);
  return result.affectedRows === 1;
}

// One default per person and page: setting one clears the others.
export async function setDefaultView(userId: number, id: number, isDefault: boolean): Promise<boolean> {
  return withTransaction(async (connection) => {
    const [rows] = await connection.query<(RowDataPacket & { target: string })[]>("SELECT target FROM analytics_views WHERE id = ? AND user_id = ? FOR UPDATE", [id, userId]);
    if (!rows[0]) return false;
    await connection.query("UPDATE analytics_views SET is_default = FALSE WHERE user_id = ? AND target = ?", [userId, rows[0].target]);
    if (isDefault) await connection.query("UPDATE analytics_views SET is_default = TRUE WHERE id = ? AND user_id = ?", [id, userId]);
    return true;
  });
}
