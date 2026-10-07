import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";

// request_attachments (F-18, D-072): insert and read only.
export interface AttachmentRecord {
  id: number;
  requestId: number;
  uploadedBy: number;
  uploaderName: string;
  round: number;
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
  original_name: string;
  stored_path: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  created_at: Date;
}

const SELECT = `SELECT a.id, a.request_id, a.uploaded_by, u.name AS uploader_name, a.round, a.original_name, a.stored_path,
  a.content_type, a.size_bytes, a.sha256, a.created_at
  FROM request_attachments a JOIN users u ON u.id = a.uploaded_by`;

const toRecord = (row: AttachmentRow): AttachmentRecord => ({
  id: row.id,
  requestId: row.request_id,
  uploadedBy: row.uploaded_by,
  uploaderName: row.uploader_name,
  round: row.round,
  name: row.original_name,
  storedPath: row.stored_path,
  contentType: row.content_type,
  sizeBytes: row.size_bytes,
  sha256: row.sha256,
  createdAt: row.created_at,
});

export async function insertAttachment(
  input: { requestId: number; uploadedBy: number; round: number; name: string; storedPath: string; contentType: string; sizeBytes: number; sha256: string },
  db: Queryable,
): Promise<number> {
  const [result] = await db.query<ResultSetHeader>(
    "INSERT INTO request_attachments (request_id, uploaded_by, round, original_name, stored_path, content_type, size_bytes, sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [input.requestId, input.uploadedBy, input.round, input.name, input.storedPath, input.contentType, input.sizeBytes, input.sha256],
  );
  return result.insertId;
}

export async function listAttachments(requestId: number, db: Queryable = getDbPool()): Promise<AttachmentRecord[]> {
  const [rows] = await db.query<AttachmentRow[]>(`${SELECT} WHERE a.request_id = ? ORDER BY a.id`, [requestId]);
  return rows.map(toRecord);
}

export async function findAttachment(id: number, db: Queryable = getDbPool()): Promise<AttachmentRecord | null> {
  const [rows] = await db.query<AttachmentRow[]>(`${SELECT} WHERE a.id = ?`, [id]);
  return rows[0] ? toRecord(rows[0]) : null;
}

export async function countAttachments(requestId: number, db: Queryable = getDbPool()): Promise<number> {
  const [rows] = await db.query<(RowDataPacket & { total: number })[]>("SELECT COUNT(*) AS total FROM request_attachments WHERE request_id = ?", [requestId]);
  return Number(rows[0]?.total ?? 0);
}
