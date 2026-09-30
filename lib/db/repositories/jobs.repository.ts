import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";

// Data for the cron job runner (F-41, F-09). Times are MySQL's (never JS).

// ---- rate limiting (D-059) ----------------------------------------------------
export async function hitRateLimit(bucket: string, windowSeconds: number, db: Queryable = getDbPool()): Promise<number> {
  await db.query<ResultSetHeader>("INSERT INTO rate_limit_hits (bucket) VALUES (?)", [bucket.slice(0, 190)]);
  const [rows] = await db.query<(RowDataPacket & { total: number })[]>(
    "SELECT COUNT(*) AS total FROM rate_limit_hits WHERE bucket = ? AND occurred_at > DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL ? SECOND)",
    [bucket.slice(0, 190), windowSeconds],
  );
  return Number(rows[0]?.total ?? 0);
}

export async function pruneRateLimitHits(db: Queryable = getDbPool()): Promise<number> {
  const [result] = await db.query<ResultSetHeader>("DELETE FROM rate_limit_hits WHERE occurred_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 DAY) LIMIT 10000");
  return result.affectedRows;
}

// ---- delivery retries (D-058) -------------------------------------------------
export interface DueDelivery {
  id: number;
  channel: "EMAIL" | "WHATSAPP";
  attemptCount: number;
  payload: Record<string, unknown> | null;
}

// Leases due FAILED deliveries: pushes their next_retry_at 10 minutes
// ahead inside the same transaction, so two runner calls never send the
// same message twice (SKIP LOCKED lets a second runner take other rows).
export async function leaseDueDeliveries(limit: number, onlyIds?: readonly number[]): Promise<DueDelivery[]> {
  return withTransaction(async (connection) => {
    const [rows] = await connection.query<(RowDataPacket & { id: number; channel: "EMAIL" | "WHATSAPP"; attempt_count: number; payload_json: Record<string, unknown> | string | null })[]>(
      `SELECT id, channel, attempt_count, payload_json FROM notification_deliveries
       WHERE status = 'FAILED' AND next_retry_at IS NOT NULL AND next_retry_at <= CURRENT_TIMESTAMP
       ${onlyIds?.length ? "AND id IN (?)" : ""}
       ORDER BY next_retry_at LIMIT ? FOR UPDATE SKIP LOCKED`,
      onlyIds?.length ? [onlyIds, limit] : [limit],
    );
    if (rows.length) {
      await connection.query<ResultSetHeader>("UPDATE notification_deliveries SET next_retry_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 10 MINUTE) WHERE id IN (?)", [rows.map((row) => row.id)]);
    }
    return rows.map((row) => ({
      id: row.id,
      channel: row.channel,
      attemptCount: row.attempt_count,
      payload: typeof row.payload_json === "string" ? (JSON.parse(row.payload_json) as Record<string, unknown>) : row.payload_json,
    }));
  });
}

export async function markRetrySent(id: number, providerReference: string | null, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>(
    `UPDATE notification_deliveries SET status = 'SENT', provider_reference = ?, attempt_count = attempt_count + 1,
       last_attempt_at = CURRENT_TIMESTAMP, sent_at = CURRENT_TIMESTAMP, next_retry_at = NULL, failure_code = NULL
     WHERE id = ?`,
    [providerReference, id],
  );
}

// retryInMinutes null = give up (stays FAILED, shown on the delivery log).
export async function markRetryFailed(id: number, failureCode: string, retryInMinutes: number | null, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>(
    `UPDATE notification_deliveries SET attempt_count = attempt_count + 1, last_attempt_at = CURRENT_TIMESTAMP, failure_code = ?,
       next_retry_at = IF(? IS NULL, NULL, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? MINUTE))
     WHERE id = ?`,
    [failureCode, retryInMinutes, retryInMinutes ?? 0, id],
  );
}

// Super Admin "Retry now": due immediately, if it can be retried at all.
export async function makeDeliveryDue(id: number, db: Queryable = getDbPool()): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>(
    "UPDATE notification_deliveries SET next_retry_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'FAILED' AND payload_json IS NOT NULL",
    [id],
  );
  return result.affectedRows === 1;
}

export async function findTemplateById(id: number, db: Queryable = getDbPool()): Promise<{ providerName: string; language: string } | null> {
  const [rows] = await db.query<(RowDataPacket & { provider_name: string | null; language: string })[]>(
    "SELECT provider_name, language FROM whatsapp_templates WHERE id = ? AND status = 'ACTIVE' AND approval_status = 'APPROVED' LIMIT 1",
    [id],
  );
  return rows[0]?.provider_name ? { providerName: rows[0].provider_name, language: rows[0].language } : null;
}
