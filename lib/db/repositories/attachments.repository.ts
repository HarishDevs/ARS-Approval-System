import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";

// request_attachments (F-18, D-072): insert and read. v1.52.3: a deleted
// file is marked (deleted_at, deleted_by) and left out of every read.
export interface AttachmentRecord {
  id: number;
  requestId: number;
  uploadedBy: number;
  uploaderName: string;
  round: number;
  fieldKey: string | null; // the ATTACHMENT form field, if any (v1.6.1)
  name: string;
  storedPath: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: Date;
}

interface AttachmentRow extends RowDataPacket {
  id: number;
  request_id: number;
  uploaded_by: number;
  uploader_name: string;
  round: number;
  field_key: string | null;
  original_name: string;
  stored_path: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  created_at: Date;
}

const SELECT = `SELECT a.id, a.request_id, a.uploaded_by, u.name AS uploader_name, a.round, a.field_key, a.original_name, a.stored_path,
  a.content_type, a.size_bytes, a.sha256, a.created_at
  FROM request_attachments a JOIN users u ON u.id = a.uploaded_by`;

const toRecord = (row: AttachmentRow): AttachmentRecord => ({
  id: row.id,
  requestId: row.request_id,
  uploadedBy: row.uploaded_by,
  uploaderName: row.uploader_name,
  round: row.round,
  fieldKey: row.field_key,
  name: row.original_name,
  storedPath: row.stored_path,
  contentType: row.content_type,
  sizeBytes: row.size_bytes,
  sha256: row.sha256,
  createdAt: row.created_at,
});

export async function insertAttachment(
  input: { requestId: number; uploadedBy: number; round: number; fieldKey?: string | null; name: string; storedPath: string; contentType: string; sizeBytes: number; sha256: string },
  db: Queryable,
): Promise<number> {
  const [result] = await db.query<ResultSetHeader>(
    "INSERT INTO request_attachments (request_id, uploaded_by, round, field_key, original_name, stored_path, content_type, size_bytes, sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [input.requestId, input.uploadedBy, input.round, input.fieldKey ?? null, input.name, input.storedPath, input.contentType, input.sizeBytes, input.sha256],
  );
  return result.insertId;
}

export async function listAttachments(requestId: number, db: Queryable = getDbPool()): Promise<AttachmentRecord[]> {
  const [rows] = await db.query<AttachmentRow[]>(`${SELECT} WHERE a.request_id = ? AND a.deleted_at IS NULL ORDER BY a.id`, [requestId]);
  return rows.map(toRecord);
}

export async function findAttachment(id: number, db: Queryable = getDbPool()): Promise<AttachmentRecord | null> {
  const [rows] = await db.query<AttachmentRow[]>(`${SELECT} WHERE a.id = ? AND a.deleted_at IS NULL`, [id]);
  return rows[0] ? toRecord(rows[0]) : null;
}

export async function markAttachmentDeleted(id: number, by: number, db: Queryable): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>("UPDATE request_attachments SET deleted_at = UTC_TIMESTAMP(), deleted_by = ? WHERE id = ? AND deleted_at IS NULL", [by, id]);
  return result.affectedRows === 1;
}

// Has any approver approved a step of this request yet (any round)?
export async function hasAnyApproval(requestId: number, db: Queryable = getDbPool()): Promise<boolean> {
  const [rows] = await db.query<RowDataPacket[]>("SELECT 1 FROM approval_tasks WHERE request_id = ? AND status = 'APPROVED' AND task_type = 'APPROVAL' LIMIT 1", [requestId]);
  return rows.length > 0;
}
