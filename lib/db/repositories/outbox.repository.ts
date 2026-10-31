import "server-only";
import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import type { NotifyInput } from "@/server/notifications/notify";
import { HELD_SQL } from "@/server/ops/governance";

// Notification outbox (D-QA-06). Written inside the action's transaction,
// so a committed decision always has its messages on record.
export async function insertOutbox(requestId: number | null, messages: readonly NotifyInput[], db: Queryable): Promise<number[]> {
  const ids: number[] = [];
  for (const message of messages) {
    const [result] = await db.query<ResultSetHeader>("INSERT INTO notification_outbox (request_id, payload_json) VALUES (?, ?)", [requestId, JSON.stringify(message)]);
    ids.push(result.insertId);
  }
  return ids;
}

export interface OutboxClaim {
  message: NotifyInput;
  claimToken: string;
}

// Take a row for sending. Only one sender wins. D-243: a claimed, unsent row
// is "sending, or stopped mid-send" and is never taken again by itself (it
// may already have been delivered): it waits for IT's Resend
// (releaseOutboxForResend). Before, a claim older than 10 minutes was taken
// again, which could send a message twice.
export async function claimOutbox(id: number, db: Queryable = getDbPool()): Promise<OutboxClaim | null> {
  const claimToken = randomUUID();
  const [result] = await db.query<ResultSetHeader>(
    `UPDATE notification_outbox SET claimed_at = CURRENT_TIMESTAMP(3), claim_token = ?, attempts = attempts + 1
     WHERE id = ? AND sent_at IS NULL AND claimed_at IS NULL`,
    [claimToken, id],
  );
  if (result.affectedRows !== 1) return null;
  const [rows] = await db.query<(RowDataPacket & { payload_json: NotifyInput | string })[]>("SELECT payload_json FROM notification_outbox WHERE id = ?", [id]);
  const payload = rows[0]?.payload_json;
  if (!payload) return null;
  return { message: typeof payload === "string" ? (JSON.parse(payload) as NotifyInput) : payload, claimToken };
}

export async function markOutboxSent(id: number, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>("UPDATE notification_outbox SET sent_at = CURRENT_TIMESTAMP(3), claim_token = NULL WHERE id = ?", [id]);
}

// D-243: the sender knows nothing went out (nothing was recorded, so notify
// sent nothing): it gives the row back for the job runner to try again. Only
// the sender's own claim is released.
export async function releaseOutboxClaim(id: number, claimToken: string, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>(
    "UPDATE notification_outbox SET claimed_at = NULL, claim_token = NULL WHERE id = ? AND claim_token = ? AND sent_at IS NULL",
    [id, claimToken],
  );
}

// Rows the in-process sender didn't take: older than 2 minutes, unsent,
// never claimed (or given back), at most 5 attempts. D-243: a row still
// claimed is left for IT (see claimOutbox).
export async function listStaleOutbox(limit: number, db: Queryable = getDbPool()): Promise<number[]> {
  const [rows] = await db.query<(RowDataPacket & { id: number })[]>(
    `SELECT id FROM notification_outbox
     WHERE sent_at IS NULL AND attempts < 5 AND created_at < DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 2 MINUTE)
       AND claimed_at IS NULL
     ORDER BY id LIMIT ?`,
    [limit],
  );
  return rows.map((row) => row.id);
}

// Messages queued for a request before it was deleted are dropped (marked
// sent, never delivered); the deletion's own messages, queued after, still go.
export async function dropOutboxForDeletedRequests(db: Queryable = getDbPool()): Promise<number> {
  const [result] = await db.query<ResultSetHeader>(
    `UPDATE notification_outbox o JOIN approval_requests r ON r.id = o.request_id
     SET o.sent_at = CURRENT_TIMESTAMP(3)
     WHERE o.sent_at IS NULL AND r.deleted_at IS NOT NULL AND o.created_at < r.deleted_at`,
  );
  return result.affectedRows;
}

export async function pruneOutbox(db: Queryable = getDbPool()): Promise<number> {
  // FN10: rows of a request under a legal hold are kept.
  const [result] = await db.query<ResultSetHeader>(
    `DELETE o FROM notification_outbox o LEFT JOIN approval_requests r ON r.id = o.request_id
     WHERE o.sent_at IS NOT NULL AND o.sent_at < DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 30 DAY) AND (r.id IS NULL OR NOT ${HELD_SQL("r")})`,
  );
  return result.affectedRows;
}

// ---- FN11 failed-automation recovery -----------------------------------------
export interface UnsentOutbox {
  id: number;
  requestId: number | null;
  requestNo: string | null;
  eventType: string;
  attempts: number;
  createdAt: Date;
  gaveUp: boolean; // 5 tries used: the runner no longer picks it up
  // D-243: a send started over 10 minutes ago and was never confirmed. It may
  // have been delivered; check before using Resend.
  unconfirmed: boolean;
}

// Unsent rows older than 30 minutes, or that the runner gave up on. Event
// type only, never the message text or the recipient.
export async function listUnsentOutbox(limit = 100, db: Queryable = getDbPool()): Promise<UnsentOutbox[]> {
  const [rows] = await db.query<(RowDataPacket & { id: number; request_id: number | null; request_no: string | null; event_type: string | null; attempts: number; created_at: Date; unconfirmed: number | null })[]>(
    `SELECT o.id, o.request_id, r.request_no, JSON_UNQUOTE(JSON_EXTRACT(o.payload_json, '$.eventType')) AS event_type, o.attempts, o.created_at,
            (o.claimed_at IS NOT NULL AND o.claimed_at < DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 10 MINUTE)) AS unconfirmed
     FROM notification_outbox o LEFT JOIN approval_requests r ON r.id = o.request_id
     WHERE o.sent_at IS NULL AND (o.attempts >= 5 OR o.created_at < DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 30 MINUTE))
     ORDER BY o.id LIMIT ?`,
    [Math.min(limit, 500)],
  );
  return rows.map((row) => ({ id: row.id, requestId: row.request_id, requestNo: row.request_no, eventType: row.event_type ?? "UNKNOWN", attempts: Number(row.attempts), createdAt: row.created_at, gaveUp: Number(row.attempts) >= 5, unconfirmed: Boolean(Number(row.unconfirmed)) }));
}

// Resend: give an unsent row fresh tries. A row being sent right now (claimed
// in the last 10 minutes) or already sent is left alone. D-243: a row claimed
// longer ago may have been delivered (the sender stopped before confirming);
// releasing it is IT's decision after checking. Returns the ids released.
export async function releaseOutboxForResend(input: { ids?: readonly number[]; requestId?: number }, db: Queryable = getDbPool()): Promise<number[]> {
  const where = input.ids?.length ? "o.id IN (?)" : input.requestId ? "o.request_id = ?" : null;
  if (!where) return [];
  const [rows] = await db.query<(RowDataPacket & { id: number })[]>(
    `SELECT o.id FROM notification_outbox o LEFT JOIN approval_requests r ON r.id = o.request_id
     WHERE ${where} AND o.sent_at IS NULL AND (r.id IS NULL OR r.deleted_at IS NULL)
       AND (o.claimed_at IS NULL OR o.claimed_at < DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 10 MINUTE))`,
    [input.ids?.length ? input.ids : input.requestId],
  );
  const ids = rows.map((row) => row.id);
  if (!ids.length) return [];
  await db.query<ResultSetHeader>("UPDATE notification_outbox SET attempts = 0, claimed_at = NULL, claim_token = NULL WHERE id IN (?) AND sent_at IS NULL", [ids]);
  return ids;
}
