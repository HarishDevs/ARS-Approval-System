import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import { DRAFT_DAYS, type DraftContent } from "@/server/drafts/rules";

// Request drafts (#3, D-108). Every query is scoped to the owner's user id,
// so a draft can't be read or changed by guessing anything.
export interface DraftRecord extends DraftContent {
  key: string;
  version: number;
  updatedAt: Date;
}

export async function findDraft(userId: number, key: string, db: Queryable = getDbPool()): Promise<DraftRecord | null> {
  const [rows] = await db.query<(RowDataPacket & { draft_key: string; title: string | null; fields_json: Record<string, string> | string; version: number; updated_at: Date })[]>(
    "SELECT draft_key, title, fields_json, version, updated_at FROM request_drafts WHERE user_id = ? AND draft_key = ? AND expires_at > CURRENT_TIMESTAMP LIMIT 1",
    [userId, key],
  );
  const row = rows[0];
  if (!row) return null;
  const fields = typeof row.fields_json === "string" ? (JSON.parse(row.fields_json) as Record<string, string>) : row.fields_json;
  return { key: row.draft_key, title: row.title ?? "", fields, version: Number(row.version), updatedAt: row.updated_at };
}

export type SaveDraftResult = { ok: true; version: number; updatedAt: Date } | { ok: false; conflict: true; current: DraftRecord | null };

// Optimistic concurrency: `expectedVersion` is what this tab last saw (null =
// it started a new draft). If another tab saved in between, nothing is
// overwritten and the caller is told.
export async function saveDraft(userId: number, key: string, content: DraftContent, expectedVersion: number | null, db: Queryable = getDbPool()): Promise<SaveDraftResult> {
  if (expectedVersion === null) {
    // An expired leftover doesn't count as a conflict.
    await db.query<ResultSetHeader>("DELETE FROM request_drafts WHERE user_id = ? AND draft_key = ? AND expires_at <= CURRENT_TIMESTAMP", [userId, key]);
    const [result] = await db.query<ResultSetHeader>(
      `INSERT IGNORE INTO request_drafts (user_id, draft_key, title, fields_json, version, expires_at)
       VALUES (?, ?, ?, ?, 1, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ${DRAFT_DAYS} DAY))`,
      [userId, key, content.title, JSON.stringify(content.fields)],
    );
    if (result.affectedRows !== 1) return { ok: false, conflict: true, current: await findDraft(userId, key, db) };
    return { ok: true, version: 1, updatedAt: new Date() };
  }
  const [result] = await db.query<ResultSetHeader>(
    `UPDATE request_drafts SET title = ?, fields_json = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP,
       expires_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ${DRAFT_DAYS} DAY)
     WHERE user_id = ? AND draft_key = ? AND version = ?`,
    [content.title, JSON.stringify(content.fields), userId, key, expectedVersion],
  );
  if (result.affectedRows !== 1) return { ok: false, conflict: true, current: await findDraft(userId, key, db) };
  return { ok: true, version: expectedVersion + 1, updatedAt: new Date() };
}

export async function deleteDraft(userId: number, key: string, db: Queryable = getDbPool()): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>("DELETE FROM request_drafts WHERE user_id = ? AND draft_key = ?", [userId, key]);
  return result.affectedRows > 0;
}

export interface DraftListItem {
  key: string;
  title: string;
  typeName: string;
  href: string;
  updatedAt: Date;
}

// My Work: the person's drafts, newest first, with the type's name. An
// amendment draft (A11) shows the request it amends.
export async function listDrafts(userId: number, limit = 20, db: Queryable = getDbPool()): Promise<DraftListItem[]> {
  const [rows] = await db.query<(RowDataPacket & { draft_key: string; title: string | null; updated_at: Date; type_name: string | null; amend_no: string | null; amend_title: string | null })[]>(
    `SELECT d.draft_key, d.title, d.updated_at, w.name AS type_name, a.request_no AS amend_no, a.title AS amend_title
     FROM request_drafts d
     LEFT JOIN workflow_definitions w ON d.draft_key LIKE 'WF:%' AND w.id = CAST(SUBSTRING(d.draft_key, 4) AS UNSIGNED)
     LEFT JOIN approval_requests a ON d.draft_key LIKE 'AM:%' AND a.id = CAST(SUBSTRING(d.draft_key, 4) AS UNSIGNED) AND a.requester_id = d.user_id AND a.deleted_at IS NULL AND a.status = 'APPROVED'
     WHERE d.user_id = ? AND d.expires_at > CURRENT_TIMESTAMP AND (d.draft_key = 'CUSTOM' OR (w.id IS NOT NULL AND w.active = TRUE) OR a.id IS NOT NULL)
     ORDER BY d.updated_at DESC LIMIT ?`,
    [userId, limit],
  );
  return rows.map((row) => {
    const amendment = row.draft_key.startsWith("AM:");
    return {
      key: row.draft_key,
      title: amendment ? (row.amend_title ?? "(amendment)") : row.title?.trim() || "(no title yet)",
      typeName: row.draft_key === "CUSTOM" ? "New request" : amendment ? `Amendment of ${row.amend_no ?? "a request"}` : (row.type_name ?? "Approval"),
      href: row.draft_key === "CUSTOM" ? "/users/custom" : amendment ? `/users/requests/${row.draft_key.slice(3)}/amend` : `/users/new/${row.draft_key.slice(3)}`,
      updatedAt: row.updated_at,
    };
  });
}

export async function pruneExpiredDrafts(db: Queryable = getDbPool()): Promise<number> {
  const [result] = await db.query<ResultSetHeader>("DELETE FROM request_drafts WHERE expires_at <= CURRENT_TIMESTAMP LIMIT 5000");
  return result.affectedRows;
}
