import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import type { AccessRule, PageLevel } from "@/server/authorization/pages";

// v1.8.0 page access rules (Super Admin). A small table: read whole.
export interface StoredRule extends AccessRule {
  id: number;
  scopeName: string | null; // department or person name
  updatedAt: Date;
}

export async function listAccessRules(db: Queryable = getDbPool()): Promise<StoredRule[]> {
  const [rows] = await db.query<(RowDataPacket & { id: number; page_key: string; scope: AccessRule["scope"]; scope_id: number; level: PageLevel; updated_at: Date; dept_name: string | null; user_name: string | null })[]>(
    `SELECT p.id, p.page_key, p.scope, p.scope_id, p.level, p.updated_at, d.name AS dept_name, u.name AS user_name
     FROM page_access_rules p
     LEFT JOIN departments d ON p.scope = 'DEPARTMENT' AND d.id = p.scope_id
     LEFT JOIN users u ON p.scope = 'USER' AND u.id = p.scope_id
     ORDER BY p.page_key, FIELD(p.scope, 'EVERYONE', 'DEPARTMENT', 'USER'), COALESCE(d.name, u.name)`,
  );
  return rows.map((row) => ({ id: row.id, pageKey: row.page_key, scope: row.scope, scopeId: Number(row.scope_id), level: row.level, updatedAt: row.updated_at, scopeName: row.dept_name ?? row.user_name ?? null }));
}

// The rules that can apply to one person (everyone, their department, them).
export async function rulesForPerson(userId: number, departmentId: number | null, db: Queryable = getDbPool()): Promise<AccessRule[]> {
  const [rows] = await db.query<(RowDataPacket & { page_key: string; scope: AccessRule["scope"]; scope_id: number; level: PageLevel })[]>(
    `SELECT page_key, scope, scope_id, level FROM page_access_rules
     WHERE scope = 'EVERYONE' OR (scope = 'USER' AND scope_id = ?) OR (scope = 'DEPARTMENT' AND scope_id = ?)`,
    [userId, departmentId ?? 0],
  );
  return rows.map((row) => ({ pageKey: row.page_key, scope: row.scope, scopeId: Number(row.scope_id), level: row.level }));
}

export async function departmentOf(userId: number, db: Queryable = getDbPool()): Promise<number | null> {
  const [rows] = await db.query<(RowDataPacket & { department_id: number | null })[]>("SELECT department_id FROM users WHERE id = ?", [userId]);
  return rows[0]?.department_id ?? null;
}

// level null = remove the rule (back to the next one down, or Full).
export async function setAccessRule(input: { pageKey: string; scope: AccessRule["scope"]; scopeId: number; level: PageLevel | null; actorId: number }, db: Queryable = getDbPool()): Promise<void> {
  if (input.level === null) {
    await db.query<ResultSetHeader>("DELETE FROM page_access_rules WHERE page_key = ? AND scope = ? AND scope_id = ?", [input.pageKey, input.scope, input.scopeId]);
    return;
  }
  await db.query<ResultSetHeader>(
    `INSERT INTO page_access_rules (page_key, scope, scope_id, level, updated_by) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE level = VALUES(level), updated_by = VALUES(updated_by)`,
    [input.pageKey, input.scope, input.scopeId, input.level, input.actorId],
  );
}
