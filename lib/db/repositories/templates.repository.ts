import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";

// FN4 / RP-01 personal templates. Every query filters on user_id: nobody
// can read or change someone else's template.
export interface Template {
  id: number;
  workflowId: number;
  name: string;
  title: string | null;
  fields: Record<string, string>;
  updatedAt: Date;
}

type Row = RowDataPacket & { id: number; workflow_id: number; name: string; title: string | null; fields_json: unknown; updated_at: Date };
const toTemplate = (row: Row): Template => ({
  id: row.id,
  workflowId: row.workflow_id,
  name: row.name,
  title: row.title,
  fields: (typeof row.fields_json === "string" ? JSON.parse(row.fields_json) : row.fields_json) as Record<string, string>,
  updatedAt: row.updated_at,
});

export async function listTemplates(userId: number, workflowId?: number, db: Queryable = getDbPool()): Promise<Template[]> {
  const [rows] = await db.query<Row[]>(
    `SELECT id, workflow_id, name, title, fields_json, updated_at FROM request_templates WHERE user_id = ?${workflowId ? " AND workflow_id = ?" : ""} ORDER BY name LIMIT 100`,
    workflowId ? [userId, workflowId] : [userId],
  );
  return rows.map(toTemplate);
}

export async function findTemplate(userId: number, id: number, db: Queryable = getDbPool()): Promise<Template | null> {
  const [rows] = await db.query<Row[]>("SELECT id, workflow_id, name, title, fields_json, updated_at FROM request_templates WHERE id = ? AND user_id = ?", [id, userId]);
  return rows[0] ? toTemplate(rows[0]) : null;
}

export async function saveTemplate(input: { userId: number; workflowId: number; name: string; title: string | null; fields: Record<string, string> }, db: Queryable = getDbPool()): Promise<"OK" | "TOO_MANY"> {
  const [[count]] = await db.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM request_templates WHERE user_id = ?", [input.userId]);
  if (Number(count?.n ?? 0) >= 100) return "TOO_MANY";
  // The same name for the same type replaces it (an update).
  await db.query<ResultSetHeader>(
    `INSERT INTO request_templates (user_id, workflow_id, name, title, fields_json) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE title = VALUES(title), fields_json = VALUES(fields_json)`,
    [input.userId, input.workflowId, input.name, input.title, JSON.stringify(input.fields)],
  );
  return "OK";
}

export async function deleteTemplate(userId: number, id: number, db: Queryable = getDbPool()): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>("DELETE FROM request_templates WHERE id = ? AND user_id = ?", [id, userId]);
  return result.affectedRows === 1;
}
