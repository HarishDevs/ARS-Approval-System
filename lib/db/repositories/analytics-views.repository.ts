import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";

// Saved Analytics / report filters (Addendum A §11). Owner-scoped: every
// query filters on user_id. A saved view stores filters only; the scope is
// re-checked whenever it is opened.
export interface AnalyticsView {
  id: number;
  name: string;
  target: string;
  query: Record<string, string>;
}

export async function listViews(userId: number, target: string): Promise<AnalyticsView[]> {
  const [rows] = await getDbPool().query<(RowDataPacket & { id: number; name: string; target: string; query_json: unknown })[]>(
    "SELECT id, name, target, query_json FROM analytics_views WHERE user_id = ? AND target = ? ORDER BY name LIMIT 50",
    [userId, target],
  );
  return rows.map((row) => ({ id: row.id, name: row.name, target: row.target, query: (typeof row.query_json === "string" ? JSON.parse(row.query_json) : row.query_json) as Record<string, string> }));
}

export async function saveView(input: { userId: number; target: string; name: string; query: Record<string, string> }): Promise<"OK" | "TOO_MANY"> {
  const db = getDbPool();
  const [[count]] = await db.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM analytics_views WHERE user_id = ?", [input.userId]);
  if (Number(count?.n ?? 0) >= 100) return "TOO_MANY";
  await db.query<ResultSetHeader>("INSERT INTO analytics_views (user_id, target, name, query_json) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE query_json = VALUES(query_json)", [input.userId, input.target, input.name, JSON.stringify(input.query)]);
  return "OK";
}

export async function deleteView(userId: number, id: number): Promise<boolean> {
  const [result] = await getDbPool().query<ResultSetHeader>("DELETE FROM analytics_views WHERE id = ? AND user_id = ?", [id, userId]);
  return result.affectedRows === 1;
}
