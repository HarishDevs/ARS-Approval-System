import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import { formFieldSchema, type FormField } from "@/server/forms/fields";
import type { ModuleKind } from "@/server/modules/settings";

// v1.9.0 (D-144): Task types and Information types and their versions.
export type VersionStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export interface ModuleType {
  id: number;
  module: ModuleKind;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ModuleTypeVersion {
  id: number;
  typeId: number;
  versionNo: number;
  status: VersionStatus;
  form: FormField[];
  settings: unknown;
  createdByName: string | null;
  createdAt: Date;
  updatedAt: Date;
  publishedByName: string | null;
  publishedAt: Date | null;
}

export interface ModuleTypeListItem extends ModuleType {
  liveVersion: number | null;
  hasDraft: boolean;
  records: number;
}

type TypeRow = RowDataPacket & { id: number; module: ModuleKind; code: string; name: string; description: string | null; active: number; created_at: Date; updated_at: Date };
const toType = (row: TypeRow): ModuleType => ({ id: row.id, module: row.module, code: row.code, name: row.name, description: row.description, active: Boolean(row.active), createdAt: row.created_at, updatedAt: row.updated_at });

type VersionRow = RowDataPacket & {
  id: number;
  type_id: number;
  version_no: number;
  status: VersionStatus;
  form_json: unknown;
  settings_json: unknown;
  created_by_name: string | null;
  created_at: Date;
  updated_at: Date;
  published_by_name: string | null;
  published_at: Date | null;
};

export function parseForm(raw: unknown): FormField[] {
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  const parsed = formFieldSchema.array().safeParse(value);
  return parsed.success ? parsed.data : [];
}

const toVersion = (row: VersionRow): ModuleTypeVersion => ({
  id: row.id,
  typeId: row.type_id,
  versionNo: row.version_no,
  status: row.status,
  form: parseForm(row.form_json),
  settings: typeof row.settings_json === "string" ? JSON.parse(row.settings_json) : row.settings_json,
  createdByName: row.created_by_name,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  publishedByName: row.published_by_name,
  publishedAt: row.published_at,
});

const VERSION_SELECT = `SELECT v.id, v.type_id, v.version_no, v.status, v.form_json, v.settings_json, c.name AS created_by_name, v.created_at, v.updated_at, p.name AS published_by_name, v.published_at
  FROM module_type_versions v LEFT JOIN users c ON c.id = v.created_by LEFT JOIN users p ON p.id = v.published_by`;

const RECORD_TABLE: Record<ModuleKind, string> = { TASK: "tasks", INFO: "info_items" };

export async function listModuleTypes(module: ModuleKind, db: Queryable = getDbPool()): Promise<ModuleTypeListItem[]> {
  const [rows] = await db.query<(TypeRow & { live_version: number | null; draft_count: number; records: number })[]>(
    `SELECT t.*,
       (SELECT v.version_no FROM module_type_versions v WHERE v.type_id = t.id AND v.status = 'PUBLISHED') AS live_version,
       (SELECT COUNT(*) FROM module_type_versions v WHERE v.type_id = t.id AND v.status = 'DRAFT') AS draft_count,
       (SELECT COUNT(*) FROM ${RECORD_TABLE[module]} r JOIN module_type_versions v ON v.id = r.type_version_id WHERE v.type_id = t.id) AS records
     FROM module_types t WHERE t.module = ? ORDER BY t.active DESC, t.name`,
    [module],
  );
  return rows.map((row) => ({ ...toType(row), liveVersion: row.live_version, hasDraft: Number(row.draft_count) > 0, records: Number(row.records) }));
}

export async function findModuleType(id: number, db: Queryable = getDbPool(), lock = false): Promise<ModuleType | null> {
  const [rows] = await db.query<TypeRow[]>(`SELECT * FROM module_types WHERE id = ?${lock ? " FOR UPDATE" : ""}`, [id]);
  return rows[0] ? toType(rows[0]) : null;
}

export async function findModuleTypeByCode(module: ModuleKind, code: string, db: Queryable = getDbPool()): Promise<ModuleType | null> {
  const [rows] = await db.query<TypeRow[]>("SELECT * FROM module_types WHERE module = ? AND code = ?", [module, code]);
  return rows[0] ? toType(rows[0]) : null;
}

export async function listTypeVersions(typeId: number, db: Queryable = getDbPool()): Promise<ModuleTypeVersion[]> {
  const [rows] = await db.query<VersionRow[]>(`${VERSION_SELECT} WHERE v.type_id = ? ORDER BY v.version_no DESC`, [typeId]);
  return rows.map(toVersion);
}

export async function findTypeVersion(id: number, db: Queryable = getDbPool()): Promise<ModuleTypeVersion | null> {
  const [rows] = await db.query<VersionRow[]>(`${VERSION_SELECT} WHERE v.id = ?`, [id]);
  return rows[0] ? toVersion(rows[0]) : null;
}

export async function findVersionByStatus(typeId: number, status: "DRAFT" | "PUBLISHED", db: Queryable = getDbPool()): Promise<ModuleTypeVersion | null> {
  const [rows] = await db.query<VersionRow[]>(`${VERSION_SELECT} WHERE v.type_id = ? AND v.status = ? ORDER BY v.version_no DESC LIMIT 1`, [typeId, status]);
  return rows[0] ? toVersion(rows[0]) : null;
}

export async function insertModuleType(input: { module: ModuleKind; code: string; name: string; description: string | null }, actorId: number, db: Queryable): Promise<number> {
  const [result] = await db.query<ResultSetHeader>("INSERT INTO module_types (module, code, name, description, created_by) VALUES (?, ?, ?, ?, ?)", [input.module, input.code, input.name, input.description, actorId]);
  return result.insertId;
}

export async function updateModuleTypeDetails(id: number, input: { name: string; description: string | null }, db: Queryable): Promise<void> {
  await db.query<ResultSetHeader>("UPDATE module_types SET name = ?, description = ? WHERE id = ?", [input.name, input.description, id]);
}

export async function setModuleTypeActive(id: number, active: boolean, db: Queryable): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>("UPDATE module_types SET active = ? WHERE id = ? AND active <> ?", [active, id, active]);
  return result.affectedRows === 1;
}

export async function insertTypeVersion(typeId: number, form: readonly FormField[], settings: unknown, actorId: number, db: Queryable): Promise<{ id: number; versionNo: number }> {
  const [rows] = await db.query<(RowDataPacket & { next: number })[]>("SELECT COALESCE(MAX(version_no), 0) + 1 AS next FROM module_type_versions WHERE type_id = ?", [typeId]);
  const versionNo = Number(rows[0]!.next);
  const [result] = await db.query<ResultSetHeader>("INSERT INTO module_type_versions (type_id, version_no, status, form_json, settings_json, created_by) VALUES (?, ?, 'DRAFT', ?, ?, ?)", [
    typeId,
    versionNo,
    JSON.stringify(form),
    JSON.stringify(settings),
    actorId,
  ]);
  return { id: result.insertId, versionNo };
}

// Only a draft is ever changed in place.
export async function updateDraftVersion(id: number, form: readonly FormField[], settings: unknown, db: Queryable): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>("UPDATE module_type_versions SET form_json = ?, settings_json = ? WHERE id = ? AND status = 'DRAFT'", [JSON.stringify(form), JSON.stringify(settings), id]);
  return result.affectedRows === 1;
}

export async function deleteDraftVersion(id: number, db: Queryable): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>("DELETE FROM module_type_versions WHERE id = ? AND status = 'DRAFT'", [id]);
  return result.affectedRows === 1;
}

// The live version becomes ARCHIVED (records keep pointing at it), the draft becomes live.
export async function publishDraftVersion(typeId: number, draftId: number, actorId: number, db: Queryable): Promise<void> {
  await db.query<ResultSetHeader>("UPDATE module_type_versions SET status = 'ARCHIVED' WHERE type_id = ? AND status = 'PUBLISHED'", [typeId]);
  const [result] = await db.query<ResultSetHeader>("UPDATE module_type_versions SET status = 'PUBLISHED', published_by = ?, published_at = CURRENT_TIMESTAMP WHERE id = ? AND type_id = ? AND status = 'DRAFT'", [actorId, draftId, typeId]);
  if (result.affectedRows !== 1) throw new Error("draft not found");
}

// Live types of a module and their live version (for "New task" / "New information").
export interface LiveType {
  typeId: number;
  versionId: number;
  code: string;
  name: string;
  description: string | null;
  form: FormField[];
  settings: unknown;
}

export async function listLiveTypes(module: ModuleKind, db: Queryable = getDbPool()): Promise<LiveType[]> {
  const [rows] = await db.query<(RowDataPacket & { type_id: number; version_id: number; code: string; name: string; description: string | null; form_json: unknown; settings_json: unknown })[]>(
    `SELECT t.id AS type_id, v.id AS version_id, t.code, t.name, t.description, v.form_json, v.settings_json
     FROM module_types t JOIN module_type_versions v ON v.type_id = t.id AND v.status = 'PUBLISHED'
     WHERE t.module = ? AND t.active = TRUE ORDER BY t.name`,
    [module],
  );
  return rows.map((row) => ({
    typeId: row.type_id,
    versionId: row.version_id,
    code: row.code,
    name: row.name,
    description: row.description,
    form: parseForm(row.form_json),
    settings: typeof row.settings_json === "string" ? JSON.parse(row.settings_json) : row.settings_json,
  }));
}

export async function findLiveType(module: ModuleKind, typeId: number, db: Queryable = getDbPool()): Promise<LiveType | null> {
  return (await listLiveTypes(module, db)).find((type) => type.typeId === typeId) ?? null;
}

// The version a record was made with, and its type (for showing the record).
export async function versionWithType(versionId: number, db: Queryable = getDbPool()): Promise<{ version: ModuleTypeVersion; type: ModuleType } | null> {
  const version = await findTypeVersion(versionId, db);
  if (!version) return null;
  const type = await findModuleType(version.typeId, db);
  return type ? { version, type } : null;
}
