import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";

// EN-06 consultations and EN-08 links (v1.6.0).
export interface Consultation {
  id: number;
  requestId: number;
  requestedBy: number;
  requestedByName: string;
  consulteeId: number;
  consulteeName: string;
  question: string;
  answer: string | null;
  status: "OPEN" | "ANSWERED" | "WITHDRAWN";
  createdAt: Date;
  answeredAt: Date | null;
}

export async function insertConsultation(input: { requestId: number; requestedBy: number; consulteeId: number; question: string }, db: Queryable = getDbPool()): Promise<number> {
  const [result] = await db.query<ResultSetHeader>("INSERT INTO consultations (request_id, requested_by, consultee_id, question) VALUES (?, ?, ?, ?)", [input.requestId, input.requestedBy, input.consulteeId, input.question]);
  return result.insertId;
}

export async function hasOpenConsultation(requestId: number, consulteeId: number, db: Queryable = getDbPool()): Promise<boolean> {
  const [rows] = await db.query<RowDataPacket[]>("SELECT 1 FROM consultations WHERE request_id = ? AND consultee_id = ? AND status = 'OPEN' LIMIT 1", [requestId, consulteeId]);
  return rows.length > 0;
}

// Only the consultee, only once: the conditional UPDATE is the guard.
export async function answerConsultationRow(id: number, consulteeId: number, answer: string, db: Queryable = getDbPool()): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>("UPDATE consultations SET answer = ?, status = 'ANSWERED', answered_at = CURRENT_TIMESTAMP WHERE id = ? AND consultee_id = ? AND status = 'OPEN'", [answer, id, consulteeId]);
  return result.affectedRows === 1;
}

export async function findConsultation(id: number, db: Queryable = getDbPool()): Promise<Consultation | null> {
  return (await listConsultationsWhere("c.id = ?", [id], db))[0] ?? null;
}

export async function listConsultations(requestId: number, db: Queryable = getDbPool()): Promise<Consultation[]> {
  return listConsultationsWhere("c.request_id = ?", [requestId], db);
}

async function listConsultationsWhere(where: string, params: unknown[], db: Queryable): Promise<Consultation[]> {
  const [rows] = await db.query<(RowDataPacket & { id: number; request_id: number; requested_by: number; by_name: string; consultee_id: number; consultee_name: string; question: string; answer: string | null; status: Consultation["status"]; created_at: Date; answered_at: Date | null })[]>(
    `SELECT c.id, c.request_id, c.requested_by, b.name AS by_name, c.consultee_id, k.name AS consultee_name, c.question, c.answer, c.status, c.created_at, c.answered_at
     FROM consultations c JOIN users b ON b.id = c.requested_by JOIN users k ON k.id = c.consultee_id
     WHERE ${where} ORDER BY c.id`,
    params,
  );
  return rows.map((row) => ({
    id: row.id,
    requestId: row.request_id,
    requestedBy: row.requested_by,
    requestedByName: row.by_name,
    consulteeId: row.consultee_id,
    consulteeName: row.consultee_name,
    question: row.question,
    answer: row.answer,
    status: row.status,
    createdAt: row.created_at,
    answeredAt: row.answered_at,
  }));
}

// ---- links ----------------------------------------------------------------
export async function insertLink(input: { fromId: number; toId: number; kind: "RELATED" | "FOLLOW_UP"; userId: number }, db: Queryable = getDbPool()): Promise<"OK" | "EXISTS"> {
  const [low, high] = input.kind === "RELATED" ? [Math.min(input.fromId, input.toId), Math.max(input.fromId, input.toId)] : [input.fromId, input.toId];
  const [result] = await db.query<ResultSetHeader>("INSERT IGNORE INTO request_links (from_request_id, to_request_id, kind, created_by) VALUES (?, ?, ?, ?)", [low, high, input.kind, input.userId]);
  return result.affectedRows === 1 ? "OK" : "EXISTS";
}

export interface LinkedRequest {
  id: number;
  requestNo: string;
  title: string;
  status: string;
  kind: "RELATED" | "FOLLOW_UP";
  direction: "from" | "to"; // FOLLOW_UP: "to" = this one is the follow-up of it
}

export async function listLinkedIds(requestId: number, db: Queryable = getDbPool()): Promise<LinkedRequest[]> {
  const [rows] = await db.query<(RowDataPacket & { id: number; request_no: string; title: string; status: string; kind: LinkedRequest["kind"]; direction: LinkedRequest["direction"] })[]>(
    `SELECT r.id, r.request_no, r.title, r.status, l.kind, 'to' AS direction FROM request_links l JOIN approval_requests r ON r.id = l.to_request_id WHERE l.from_request_id = ? AND r.deleted_at IS NULL
     UNION ALL
     SELECT r.id, r.request_no, r.title, r.status, l.kind, 'from' AS direction FROM request_links l JOIN approval_requests r ON r.id = l.from_request_id WHERE l.to_request_id = ? AND r.deleted_at IS NULL
     ORDER BY id LIMIT 50`,
    [requestId, requestId],
  );
  return rows.map((row) => ({ id: row.id, requestNo: row.request_no, title: row.title, status: row.status, kind: row.kind, direction: row.direction }));
}
