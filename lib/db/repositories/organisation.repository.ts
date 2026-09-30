import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";

// Departments and designations (P1-01, P1-51). Made inactive, never deleted.
export interface Department {
  id: number;
  code: string;
  name: string;
  hodUserId: number | null;
  hodName: string | null;
  active: boolean;
  memberCount: number;
}

export interface Designation {
  id: number;
  code: string;
  name: string;
  active: boolean;
}

export async function listDepartments(db: Queryable = getDbPool()): Promise<Department[]> {
  const [rows] = await db.query<
    (RowDataPacket & { id: number; code: string; name: string; hod_user_id: number | null; hod_name: string | null; active: number; member_count: number })[]
  >(
    `SELECT d.id, d.code, d.name, d.hod_user_id, h.name AS hod_name, d.active,
            (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id AND u.active = TRUE) AS member_count
     FROM departments d LEFT JOIN users h ON h.id = d.hod_user_id
     ORDER BY d.active DESC, d.name`,
  );
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    hodUserId: row.hod_user_id,
    hodName: row.hod_name,
    active: row.active === 1,
    memberCount: Number(row.member_count),
  }));
}

export async function listDesignations(db: Queryable = getDbPool()): Promise<Designation[]> {
  const [rows] = await db.query<(RowDataPacket & { id: number; code: string; name: string; active: number })[]>(
    "SELECT id, code, name, active FROM designations ORDER BY active DESC, name",
  );
  return rows.map((row) => ({ id: row.id, code: row.code, name: row.name, active: row.active === 1 }));
}

export async function findDepartment(id: number, db: Queryable = getDbPool()): Promise<Department | null> {
  return (await listDepartments(db)).find((department) => department.id === id) ?? null;
}

export async function insertDepartment(input: { code: string; name: string; hodUserId: number | null }, db: Queryable = getDbPool()): Promise<number> {
  const [result] = await db.query<ResultSetHeader>("INSERT INTO departments (code, name, hod_user_id) VALUES (?, ?, ?)", [input.code, input.name, input.hodUserId]);
  return result.insertId;
}

export async function updateDepartment(
  id: number,
  input: { code: string; name: string; hodUserId: number | null; active: boolean },
  db: Queryable = getDbPool(),
): Promise<void> {
  await db.query<ResultSetHeader>("UPDATE departments SET code = ?, name = ?, hod_user_id = ?, active = ? WHERE id = ?", [
    input.code,
    input.name,
    input.hodUserId,
    input.active,
    id,
  ]);
}

export async function insertDesignation(input: { code: string; name: string }, db: Queryable = getDbPool()): Promise<number> {
  const [result] = await db.query<ResultSetHeader>("INSERT INTO designations (code, name) VALUES (?, ?)", [input.code, input.name]);
  return result.insertId;
}

export async function updateDesignation(id: number, input: { code: string; name: string; active: boolean }, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>("UPDATE designations SET code = ?, name = ?, active = ? WHERE id = ?", [input.code, input.name, input.active, id]);
}
