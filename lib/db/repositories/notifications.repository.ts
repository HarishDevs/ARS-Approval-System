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
  provider: "RESEND" | "CEOITBOX" | "SMTP" | "SENDMAIL";
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
  provider: string;
  providerReference: string | null;
  status: string;
  attemptCount: number;
  failureCode: string | null;
  canRetry: boolean;
  nextRetryAt: Date | null;
}

// v1.54.16 (owner: "a dashboard for message deliveries"): the filters the
// dashboard and the list share. Values are checked against fixed lists.
export const DELIVERY_PERIODS = [1, 7, 30, 90] as const;
export const DELIVERY_CHANNELS = ["EMAIL", "WHATSAPP"] as const;
export const DELIVERY_STATUSES = ["SENT", "DELIVERED", "READ", "FAILED", "SKIPPED", "QUEUED"] as const;
export interface DeliveryFilter {
  days: (typeof DELIVERY_PERIODS)[number];
  channel: (typeof DELIVERY_CHANNELS)[number] | null;
  status: (typeof DELIVERY_STATUSES)[number] | null;
  provider: string | null; // checked: letters only
}
export function parseDeliveryFilter(params: Record<string, string | string[] | undefined>): DeliveryFilter {
  const one = (key: string) => (Array.isArray(params[key]) ? params[key]![0] : params[key]) ?? "";
  const days = Number(one("days"));
  return {
    days: (DELIVERY_PERIODS as readonly number[]).includes(days) ? (days as DeliveryFilter["days"]) : 7,
    channel: (DELIVERY_CHANNELS as readonly string[]).includes(one("channel")) ? (one("channel") as DeliveryFilter["channel"]) : null,
    status: (DELIVERY_STATUSES as readonly string[]).includes(one("status")) ? (one("status") as DeliveryFilter["status"]) : null,
    provider: /^[A-Z]{2,20}$/.test(one("provider")) ? one("provider") : null,
  };
}
function deliveryWhere(filter: DeliveryFilter): { sql: string; params: unknown[] } {
  const where = ["d.created_at >= (UTC_TIMESTAMP() - INTERVAL ? DAY)"];
  const params: unknown[] = [filter.days];
  if (filter.channel) {
    where.push("d.channel = ?");
    params.push(filter.channel);
  }
  if (filter.status) {
    where.push("d.status = ?");
    params.push(filter.status);
  }
  if (filter.provider) {
    where.push("d.provider = ?");
    params.push(filter.provider);
  }
  return { sql: where.join(" AND "), params };
}

export interface DeliverySummary {
  byChannelStatus: { channel: string; provider: string; status: string; n: number }[];
  daily: { day: string; channel: string; n: number }[]; // India days
  failures: { channel: string; code: string; n: number }[];
  events: { eventType: string; n: number }[];
  retryPending: number;
  providers: string[];
}
export async function deliverySummary(filter: DeliveryFilter, db: Queryable = getDbPool()): Promise<DeliverySummary> {
  const { sql, params } = deliveryWhere(filter);
  const [mix, daily, failures, events, retry, providers] = await Promise.all([
    db.query<RowDataPacket[]>(`SELECT d.channel, d.provider, d.status, COUNT(*) AS n FROM notification_deliveries d WHERE ${sql} GROUP BY d.channel, d.provider, d.status`, params),
    db.query<RowDataPacket[]>(`SELECT DATE_FORMAT(d.created_at + INTERVAL 330 MINUTE, '%Y-%m-%d') AS day, d.channel, COUNT(*) AS n FROM notification_deliveries d WHERE ${sql} GROUP BY day, d.channel`, params),
    db.query<RowDataPacket[]>(`SELECT d.channel, COALESCE(d.failure_code, 'UNKNOWN') AS code, COUNT(*) AS n FROM notification_deliveries d WHERE ${sql} AND d.status IN ('FAILED', 'SKIPPED') GROUP BY d.channel, code ORDER BY n DESC LIMIT 12`, params),
    db.query<RowDataPacket[]>(`SELECT nt.event_type, COUNT(*) AS cnt FROM notification_deliveries d JOIN notifications nt ON nt.id = d.notification_id WHERE ${sql} GROUP BY nt.event_type ORDER BY cnt DESC LIMIT 10`, params),
    db.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM notification_deliveries d WHERE ${sql} AND d.status = 'FAILED' AND d.next_retry_at IS NOT NULL`, params),
    db.query<RowDataPacket[]>("SELECT DISTINCT provider FROM notification_deliveries ORDER BY provider"),
  ]);
  return {
    byChannelStatus: mix[0].map((row) => ({ channel: String(row.channel), provider: String(row.provider), status: String(row.status), n: Number(row.n) })),
    daily: daily[0].map((row) => ({ day: String(row.day), channel: String(row.channel), n: Number(row.n) })),
    failures: failures[0].map((row) => ({ channel: String(row.channel), code: String(row.code), n: Number(row.n) })),
    events: events[0].map((row) => ({ eventType: String(row.event_type), n: Number(row.cnt) })),
    retryPending: Number(retry[0][0]?.n ?? 0),
    providers: providers[0].map((row) => String(row.provider)).filter((value) => /^[A-Z]{2,20}$/.test(value)),
  };
}

// Super Admin delivery log (P1-45). Never returns payloads.
// v1.54.16: the dashboard's filters apply to the list too.
export async function listRecentDeliveries(limit: number, filter?: DeliveryFilter): Promise<DeliveryListItem[]> {
  const where = filter ? deliveryWhere(filter) : { sql: "1 = 1", params: [] as unknown[] };
  const [rows] = await getDbPool().query<
    (RowDataPacket & { id: number; created_at: Date; event_type: string; name: string; channel: "EMAIL" | "WHATSAPP"; provider: string; provider_reference: string | null; status: string; attempt_count: number; failure_code: string | null; has_payload: number; next_retry_at: Date | null })[]
  >(
    `SELECT d.id, d.created_at, n.event_type, u.name, d.channel, d.provider, d.provider_reference, d.status, d.attempt_count, d.failure_code,
            (d.payload_json IS NOT NULL) AS has_payload, d.next_retry_at
     FROM notification_deliveries d
     JOIN notifications n ON n.id = d.notification_id
     JOIN users u ON u.id = n.user_id
     WHERE ${where.sql}
     ORDER BY d.id DESC LIMIT ?`,
    [...where.params, limit],
  );
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    eventType: row.event_type,
    recipientName: row.name,
    channel: row.channel,
    provider: row.provider,
    providerReference: row.provider_reference,
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

// v1.54.8: emails sent through SMTP in the last hour (the hourly limit).
export async function countSmtpEmailsLastHour(db: Queryable = getDbPool()): Promise<number> {
  const [rows] = await db.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM notification_deliveries WHERE channel = 'EMAIL' AND provider IN ('SMTP', 'SENDMAIL') AND status = 'SENT' AND created_at >= (UTC_TIMESTAMP() - INTERVAL 1 HOUR)");
  return Number(rows[0]?.n ?? 0);
}
