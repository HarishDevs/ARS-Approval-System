import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import type { NotifyInput } from "@/server/notifications/notify";

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

// Take a row for sending. Only one sender wins; a claim older than 10
// minutes (sender died) can be taken again.
export async function claimOutbox(id: number, db: Queryable = getDbPool()): Promise<NotifyInput | null> {
  const [result] = await db.query<ResultSetHeader>(
    `UPDATE notification_outbox SET claimed_at = CURRENT_TIMESTAMP(3), attempts = attempts + 1
     WHERE id = ? AND sent_at IS NULL AND (claimed_at IS NULL OR claimed_at < DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 10 MINUTE))`,
    [id],
  );
  if (result.affectedRows !== 1) return null;
  const [rows] = await db.query<(RowDataPacket & { payload_json: NotifyInput | string })[]>("SELECT payload_json FROM notification_outbox WHERE id = ?", [id]);
  const payload = rows[0]?.payload_json;
  if (!payload) return null;
  return typeof payload === "string" ? (JSON.parse(payload) as NotifyInput) : payload;
}

export async function markOutboxSent(id: number, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>("UPDATE notification_outbox SET sent_at = CURRENT_TIMESTAMP(3) WHERE id = ?", [id]);
}

// Rows the in-process sender didn't finish: older than 2 minutes, unsent,
// not claimed recently, at most 5 attempts.
export async function listStaleOutbox(limit: number, db: Queryable = getDbPool()): Promise<number[]> {
  const [rows] = await db.query<(RowDataPacket & { id: number })[]>(
    `SELECT id FROM notification_outbox
     WHERE sent_at IS NULL AND attempts < 5 AND created_at < DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 2 MINUTE)
       AND (claimed_at IS NULL OR claimed_at < DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 10 MINUTE))
     ORDER BY id LIMIT ?`,
    [limit],
  );
  return rows.map((row) => row.id);
}

export async function pruneOutbox(db: Queryable = getDbPool()): Promise<number> {
  const [result] = await db.query<ResultSetHeader>("DELETE FROM notification_outbox WHERE sent_at IS NOT NULL AND sent_at < DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 30 DAY)");
  return result.affectedRows;
}
