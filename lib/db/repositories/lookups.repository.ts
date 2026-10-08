import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import type { FieldLookups } from "@/server/forms/fields";

// Options for "from the list" form fields (S12-06, D-088): active
// departments and designations, by name.
export async function loadFieldLookups(db: Queryable = getDbPool()): Promise<FieldLookups> {
  const [departments] = await db.query<(RowDataPacket & { code: string; name: string })[]>("SELECT code, name FROM departments WHERE active = TRUE ORDER BY name");
  const [designations] = await db.query<(RowDataPacket & { code: string; name: string })[]>("SELECT code, name FROM designations WHERE active = TRUE ORDER BY name");
  return {
    DEPARTMENT: departments.map((row) => ({ code: row.code, name: row.name })),
    DESIGNATION: designations.map((row) => ({ code: row.code, name: row.name })),
  };
}

// Every department and designation, active or not, for showing stored
// values ("SOURCE:CODE" → name).
export async function loadLookupNames(db: Queryable = getDbPool()): Promise<Map<string, string>> {
  const [rows] = await db.query<(RowDataPacket & { source: string; code: string; name: string })[]>(
    "SELECT 'DEPARTMENT' AS source, code, name FROM departments UNION ALL SELECT 'DESIGNATION', code, name FROM designations",
  );
  return new Map(rows.map((row) => [`${row.source}:${row.code}`, row.name]));
}
