import "server-only";
import { categoryOf, entityFromLink, type EntityRef } from "@/server/notifications/categories";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import { sealPayload } from "@/lib/security/delivery-payload";
import { logError } from "@/lib/logging/logger";

export interface NotificationRecipient {
  id: number;
  name: string;
  email: string;
  whatsappNumber: string | null;
  active: boolean;
}

export async function findRecipient(userId: number): Promise<NotificationRecipient | null> {
  const [rows] = await getDbPool().query<
    (RowDataPacket & { id: number; name: string; email: string; whatsapp_number: string | null; active: number })[]
  >("SELECT id, name, email, whatsapp_number, active FROM users WHERE id = ? LIMIT 1", [userId]);
  const row = rows[0];
  return row ? { id: row.id, name: row.name, email: row.email, whatsappNumber: row.whatsapp_number, active: row.active === 1 } : null;
}

// v1.9.0 (D-146): the module (category) and the record it is about are
// stored with it, so the bell can filter and open the right record.
export async function createNotification(input: {
  eventType: string;
  userId: number;
  title: string;
  message: string;
  deepLink: string | null;
  entity?: EntityRef | null;
  priority?: "NORMAL" | "HIGH"; // D-252
  broadcastId?: number | null; // D-252
}): Promise<number> {
  const entity = input.entity ?? entityFromLink(input.deepLink);
  const [result] = await getDbPool().query<ResultSetHeader>(
    "INSERT INTO notifications (event_type, category, user_id, title, message, deep_link, entity_type, entity_id, priority, broadcast_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [input.eventType, categoryOf(input.eventType), input.userId, input.title.slice(0, 200), input.message.slice(0, 1000), input.deepLink, entity?.type ?? null, entity?.id ?? null, input.priority ?? "NORMAL", input.broadcastId ?? null],
  );
  return result.insertId;
}

// D-231: a message whose app alert the person switched off is kept, read.
export async function markNotificationRead(notificationId: number): Promise<void> {
  await getDbPool().query<ResultSetHeader>("UPDATE notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE id = ?", [notificationId]);
}

export type DeliveryStatus = "QUEUED" | "SENT" | "FAILED" | "SKIPPED";

export async function createDelivery(input: {
  notificationId: number;
  channel: "EMAIL" | "WHATSAPP";
  provider: "RESEND" | "CEOITBOX";
  status: DeliveryStatus;
  providerReference?: string | null;
  failureCode?: string | null;
  payload?: Record<string, unknown> | null;
  retryInSeconds?: number | null;
}): Promise<number> {
  const [result] = await getDbPool().query<ResultSetHeader>(
    `INSERT INTO notification_deliveries
       (notification_id, channel, provider, status, provider_reference, attempt_count, last_attempt_at, sent_at, failure_code, payload_json, next_retry_at)
     VALUES (?, ?, ?, ?, ?, ?, IF(? > 0, CURRENT_TIMESTAMP, NULL), IF(? = 'SENT', CURRENT_TIMESTAMP, NULL), ?, ?,
             IF(? IS NULL, NULL, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? SECOND)))`,
    [
      input.notificationId,
      input.channel,
      input.provider,
      input.status,
      input.providerReference ?? null,
      input.status === "SKIPPED" ? 0 : 1,
      input.status === "SKIPPED" ? 0 : 1,
      input.status,
      input.failureCode ?? null,
      storedPayload(input.payload),
      input.retryInSeconds ?? null,
      input.retryInSeconds ?? 0,
    ],
  );
  return result.insertId;
}

// Encrypted at rest (S-01). If it can't be sealed, nothing is kept: the
// delivery is still logged, it just can't be retried.
function storedPayload(payload: Record<string, unknown> | null | undefined): string | null {
  if (!payload) return null;
  try {
    return JSON.stringify(sealPayload(payload));
  } catch (error) {
    logError("delivery payload not stored", error);
    return null;
  }
}

export interface DeliveryListItem {
  id: number;
  createdAt: Date;
  eventType: string;
  recipientName: string;
  channel: "EMAIL" | "WHATSAPP";
  status: string;
  attemptCount: number;
  failureCode: string | null;
  canRetry: boolean;
  nextRetryAt: Date | null;
}

// Super Admin delivery log (P1-45). Never returns payloads.
export async function listRecentDeliveries(limit: number): Promise<DeliveryListItem[]> {
  const [rows] = await getDbPool().query<
    (RowDataPacket & { id: number; created_at: Date; event_type: string; name: string; channel: "EMAIL" | "WHATSAPP"; status: string; attempt_count: number; failure_code: string | null; has_payload: number; next_retry_at: Date | null })[]
  >(
    `SELECT d.id, d.created_at, n.event_type, u.name, d.channel, d.status, d.attempt_count, d.failure_code,
            (d.payload_json IS NOT NULL) AS has_payload, d.next_retry_at
     FROM notification_deliveries d
     JOIN notifications n ON n.id = d.notification_id
     JOIN users u ON u.id = n.user_id
     ORDER BY d.id DESC LIMIT ?`,
    [limit],
  );
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    eventType: row.event_type,
    recipientName: row.name,
    channel: row.channel,
    status: row.status,
    attemptCount: row.attempt_count,
    failureCode: row.failure_code,
    canRetry: row.status === "FAILED" && Number(row.has_payload) === 1,
    nextRetryAt: row.next_retry_at,
  }));
}

// S8-03: WhatsApp delivery and read receipts, matched by the provider's
// message id. A receipt never moves a status backwards (read stays read).
export async function recordDeliveryReceipt(providerReference: string, status: "DELIVERED" | "READ", db: Queryable = getDbPool()): Promise<number> {
  const [result] = await db.query<ResultSetHeader>(
    status === "READ"
      ? `UPDATE notification_deliveries SET status = 'READ', read_at = COALESCE(read_at, CURRENT_TIMESTAMP), delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP)
         WHERE provider = 'CEOITBOX' AND provider_reference = ? AND status IN ('SENT', 'DELIVERED', 'READ')`
      : `UPDATE notification_deliveries SET status = IF(status = 'READ', 'READ', 'DELIVERED'), delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP)
         WHERE provider = 'CEOITBOX' AND provider_reference = ? AND status IN ('SENT', 'DELIVERED', 'READ')`,
    [providerReference],
  );
  return result.affectedRows;
}
