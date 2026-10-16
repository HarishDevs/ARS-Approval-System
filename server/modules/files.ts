import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import { uploadRoot, type PreparedFile } from "@/server/attachments/service";
import { MAX_FILES_PER_REQUEST } from "@/server/attachments/files";

// v1.9.0: files on tasks and information. Same checks and storage as
// request files (D-072), but written BEFORE the business transaction and
// recorded inside it (audit AUD-10): a record is never saved without the
// files it was made with, and files of a failed save are removed.
export type FileEntity = "TASK" | "INFO";

export interface StagedFile {
  name: string;
  contentType: string;
  size: number;
  sha256: string;
  storedPath: string;
  absolute: string;
  fieldKey: string | null;
}

export async function stageFiles(files: readonly PreparedFile[], fieldKey: string | null = null): Promise<StagedFile[]> {
  if (files.length === 0) return [];
  const root = uploadRoot();
  const now = new Date();
  const folder = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  await mkdir(path.join(root, folder), { recursive: true });
  const staged: StagedFile[] = [];
  try {
    for (const file of files) {
      const storedPath = `${folder}/${randomBytes(16).toString("hex")}`;
      const absolute = path.join(root, storedPath);
      await writeFile(absolute, file.bytes, { flag: "wx" });
      staged.push({ name: file.name, contentType: file.contentType, size: file.bytes.length, sha256: createHash("sha256").update(file.bytes).digest("hex"), storedPath, absolute, fieldKey });
    }
  } catch (error) {
    await discardStaged(staged);
    throw error;
  }
  return staged;
}

export async function discardStaged(staged: readonly StagedFile[]): Promise<void> {
  await Promise.all(staged.map((file) => unlink(file.absolute).catch(() => undefined)));
}

// Inside the business transaction. Returns how many were stored.
export async function insertRecordFiles(entity: FileEntity, entityId: number, staged: readonly StagedFile[], uploadedBy: number, purpose: "GENERAL" | "EVIDENCE", db: Queryable): Promise<number> {
  if (staged.length === 0) return 0;
  const [rows] = await db.query<(RowDataPacket & { total: number })[]>("SELECT COUNT(*) AS total FROM record_files WHERE entity_type = ? AND entity_id = ?", [entity, entityId]);
  if (Number(rows[0]?.total ?? 0) + staged.length > MAX_FILES_PER_REQUEST) throw new RecordFileError(`At most ${MAX_FILES_PER_REQUEST} files can be kept on one record.`);
  for (const file of staged) {
    await db.query<ResultSetHeader>(
      "INSERT INTO record_files (entity_type, entity_id, field_key, purpose, uploaded_by, original_name, stored_path, content_type, size_bytes, sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [entity, entityId, file.fieldKey, purpose, uploadedBy, file.name, file.storedPath, file.contentType, file.size, file.sha256],
    );
  }
  return staged.length;
}

export class RecordFileError extends Error {}

export interface RecordFile {
  id: number;
  entityType: FileEntity;
  entityId: number;
  fieldKey: string | null;
  purpose: "GENERAL" | "EVIDENCE";
  uploadedByName: string;
  name: string;
  contentType: string;
  size: number;
  storedPath: string;
  createdAt: Date;
}

type FileRow = RowDataPacket & { id: number; entity_type: FileEntity; entity_id: number; field_key: string | null; purpose: "GENERAL" | "EVIDENCE"; uploaded_by_name: string; original_name: string; content_type: string; size_bytes: number; stored_path: string; created_at: Date };
const toFile = (row: FileRow): RecordFile => ({
  id: row.id,
  entityType: row.entity_type,
  entityId: row.entity_id,
  fieldKey: row.field_key,
  purpose: row.purpose,
  uploadedByName: row.uploaded_by_name,
  name: row.original_name,
  contentType: row.content_type,
  size: row.size_bytes,
  storedPath: row.stored_path,
  createdAt: row.created_at,
});
const SELECT = "SELECT f.*, u.name AS uploaded_by_name FROM record_files f JOIN users u ON u.id = f.uploaded_by";

export async function listRecordFiles(entity: FileEntity, entityId: number, db: Queryable = getDbPool()): Promise<RecordFile[]> {
  const [rows] = await db.query<FileRow[]>(`${SELECT} WHERE f.entity_type = ? AND f.entity_id = ? ORDER BY f.id`, [entity, entityId]);
  return rows.map(toFile);
}

export async function findRecordFile(id: number, db: Queryable = getDbPool()): Promise<RecordFile | null> {
  const [rows] = await db.query<FileRow[]>(`${SELECT} WHERE f.id = ?`, [id]);
  return rows[0] ? toFile(rows[0]) : null;
}

export async function countEvidence(entity: FileEntity, entityId: number, db: Queryable): Promise<number> {
  const [rows] = await db.query<(RowDataPacket & { total: number })[]>("SELECT COUNT(*) AS total FROM record_files WHERE entity_type = ? AND entity_id = ? AND purpose = 'EVIDENCE'", [entity, entityId]);
  return Number(rows[0]?.total ?? 0);
}

export async function readRecordFile(file: RecordFile): Promise<Buffer | null> {
  const root = uploadRoot();
  const absolute = path.resolve(root, file.storedPath);
  if (!absolute.startsWith(root + path.sep)) return null;
  return readFile(absolute);
}
