import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";

// v1.54.0 (D-309): the person's own approval templates (levels only). Every
// query filters on user_id: nobody reads or changes someone else's.
export interface ApprovalTemplate {
  id: number;
  name: string;
  stages: unknown[];
  updatedAt: Date;
}
export const TEMPLATE_LIMIT = 100;

type Row = RowDataPacket & { id: number; name: string; spec_json: unknown; updated_at: Date };
const toTemplate = (row: Row): ApprovalTemplate => {
  const spec = (typeof row.spec_json === "string" ? JSON.parse(row.spec_json) : row.spec_json) as { stages?: unknown[] } | null;
  return { id: Number(row.id), name: row.name, stages: Array.isArray(spec?.stages) ? spec!.stages : [], updatedAt: row.updated_at };
};

export async function listApprovalTemplates(userId: number, db: Queryable = getDbPool()): Promise<ApprovalTemplate[]> {
  const [rows] = await db.query<Row[]>("SELECT id, name, spec_json, updated_at FROM approval_templates WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT ?", [userId, TEMPLATE_LIMIT]);
  return rows.map(toTemplate);
}

export async function findApprovalTemplate(userId: number, id: number, db: Queryable = getDbPool()): Promise<ApprovalTemplate | null> {
  const [rows] = await db.query<Row[]>("SELECT id, name, spec_json, updated_at FROM approval_templates WHERE user_id = ? AND id = ? LIMIT 1", [userId, id]);
  return rows[0] ? toTemplate(rows[0]) : null;
}

// A name already used is replaced (the person saves it again on purpose).
export async function saveApprovalTemplate(userId: number, name: string, stages: unknown[], db: Queryable = getDbPool()): Promise<{ id: number; replaced: boolean } | "TOO_MANY"> {
  const [existing] = await db.query<(RowDataPacket & { id: number })[]>("SELECT id FROM approval_templates WHERE user_id = ? AND name = ? LIMIT 1", [userId, name]);
  if (existing[0]) {
    await db.query("UPDATE approval_templates SET spec_json = ? WHERE id = ? AND user_id = ?", [JSON.stringify({ stages }), existing[0].id, userId]);
    return { id: Number(existing[0].id), replaced: true };
  }
  const [count] = await db.query<(RowDataPacket & { n: number })[]>("SELECT COUNT(*) AS n FROM approval_templates WHERE user_id = ?", [userId]);
  if (Number(count[0]?.n ?? 0) >= TEMPLATE_LIMIT) return "TOO_MANY";
  const [result] = await db.query<ResultSetHeader>("INSERT INTO approval_templates (user_id, name, spec_json) VALUES (?, ?, ?)", [userId, name, JSON.stringify({ stages })]);
  return { id: result.insertId, replaced: false };
}

export async function deleteApprovalTemplate(userId: number, id: number, db: Queryable = getDbPool()): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>("DELETE FROM approval_templates WHERE user_id = ? AND id = ?", [userId, id]);
  return result.affectedRows > 0;
}

export async function renameApprovalTemplate(userId: number, id: number, name: string, db: Queryable = getDbPool()): Promise<"OK" | "DUPLICATE" | "NOT_FOUND"> {
  try {
    const [result] = await db.query<ResultSetHeader>("UPDATE approval_templates SET name = ? WHERE user_id = ? AND id = ?", [name, userId, id]);
    return result.affectedRows > 0 ? "OK" : "NOT_FOUND";
  } catch (error) {
    if ((error as { code?: string }).code === "ER_DUP_ENTRY") return "DUPLICATE";
    throw error;
  }
}
