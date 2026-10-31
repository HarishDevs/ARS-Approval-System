import "server-only";
import { createHash } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getDbPool, type Queryable } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { decryptSecret, encryptSecret } from "@/lib/security/encryption";
import { sealPayload, openPayload } from "@/lib/security/delivery-payload";

// D-252: browser push subscriptions (one row per endpoint; several per person)
// and the push queue (notification_deliveries rows with channel PUSH).

export type DeviceType = "PHONE" | "TABLET" | "DESKTOP";
export type SubscriptionStatus = "ACTIVE" | "EXPIRED" | "REMOVED";

export interface PushKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushDevice {
  id: number;
  userId: number;
  deviceType: DeviceType;
  browser: string | null;
  operatingSystem: string | null;
  installed: boolean;
  permission: string;
  status: SubscriptionStatus;
  createdAt: Date;
  lastSeenAt: Date;
  lastUsedAt: Date | null;
  lastFailureCode: string | null;
  endpointHost: string; // shown instead of the endpoint (it works like a key)
  endpointHash: string; // lets this browser recognise its own row
}

export const endpointHash = (endpoint: string) => createHash("sha256").update(endpoint).digest("hex");

const hostOf = (endpoint: string) => {
  try {
    return new URL(endpoint).host;
  } catch {
    return "unknown";
  }
};

type DeviceRow = RowDataPacket & {
  id: number;
  user_id: number;
  endpoint: string;
  endpoint_hash: string;
  device_type: DeviceType;
  browser: string | null;
  operating_system: string | null;
  installed: number;
  permission: string;
  status: SubscriptionStatus;
  created_at: Date;
  last_seen_at: Date;
  last_used_at: Date | null;
  last_failure_code: string | null;
};

const toDevice = (row: DeviceRow): PushDevice => ({
  id: row.id,
  userId: row.user_id,
  deviceType: row.device_type,
  browser: row.browser,
  operatingSystem: row.operating_system,
  installed: Boolean(row.installed),
  permission: row.permission,
  status: row.status,
  createdAt: row.created_at,
  lastSeenAt: row.last_seen_at,
  lastUsedAt: row.last_used_at,
  lastFailureCode: row.last_failure_code,
  endpointHost: hostOf(row.endpoint),
  endpointHash: row.endpoint_hash,
});

const DEVICE_COLUMNS = "id, user_id, endpoint, endpoint_hash, device_type, browser, operating_system, installed, permission, status, created_at, last_seen_at, last_used_at, last_failure_code";

// Register (or refresh) this browser for this person. The endpoint is
// unique: the same browser registering again updates its row, and if another
// person now signs in on it, the row moves to them (so the previous person's
// messages stop arriving on a device they no longer use).
export async function upsertSubscription(
  input: { userId: number; keys: PushKeys; deviceType: DeviceType; browser: string | null; operatingSystem: string | null; installed: boolean; permission: string },
): Promise<{ id: number; created: boolean; movedFrom: number | null }> {
  const hash = endpointHash(input.keys.endpoint);
  return withTransaction(async (connection) => {
    const [existing] = await connection.query<(RowDataPacket & { id: number; user_id: number })[]>("SELECT id, user_id FROM push_subscriptions WHERE endpoint_hash = ? FOR UPDATE", [hash]);
    const values = [input.userId, input.keys.endpoint, encryptSecret(input.keys.p256dh), encryptSecret(input.keys.auth), input.deviceType, input.browser, input.operatingSystem, input.installed, input.permission.slice(0, 20)];
    if (existing[0]) {
      await connection.query<ResultSetHeader>(
        `UPDATE push_subscriptions SET user_id = ?, endpoint = ?, p256dh_enc = ?, auth_enc = ?, device_type = ?, browser = ?, operating_system = ?, installed = ?, permission = ?,
           status = 'ACTIVE', failure_count = 0, last_failure_code = NULL, last_seen_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [...values, existing[0].id],
      );
      return { id: existing[0].id, created: false, movedFrom: existing[0].user_id === input.userId ? null : existing[0].user_id };
    }
    const [result] = await connection.query<ResultSetHeader>(
      `INSERT INTO push_subscriptions (user_id, endpoint, endpoint_hash, p256dh_enc, auth_enc, device_type, browser, operating_system, installed, permission)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [input.userId, input.keys.endpoint, hash, encryptSecret(input.keys.p256dh), encryptSecret(input.keys.auth), input.deviceType, input.browser, input.operatingSystem, input.installed, input.permission.slice(0, 20)],
    );
    return { id: result.insertId, created: true, movedFrom: null };
  });
}

export async function listDevicesForUser(userId: number, db: Queryable = getDbPool()): Promise<PushDevice[]> {
  const [rows] = await db.query<DeviceRow[]>(`SELECT ${DEVICE_COLUMNS} FROM push_subscriptions WHERE user_id = ? AND status <> 'REMOVED' ORDER BY status = 'ACTIVE' DESC, last_seen_at DESC`, [userId]);
  return rows.map(toDevice);
}

// This browser's row, only if it belongs to this person.
export async function findDeviceByEndpoint(userId: number, endpoint: string, db: Queryable = getDbPool()): Promise<PushDevice | null> {
  const [rows] = await db.query<DeviceRow[]>(`SELECT ${DEVICE_COLUMNS} FROM push_subscriptions WHERE endpoint_hash = ? AND user_id = ? LIMIT 1`, [endpointHash(endpoint), userId]);
  return rows[0] ? toDevice(rows[0]) : null;
}

// Remove: only the owner's own row (user_id from the session, never the request).
export async function removeDevice(userId: number, id: number, db: Queryable = getDbPool()): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>("UPDATE push_subscriptions SET status = 'REMOVED' WHERE id = ? AND user_id = ? AND status <> 'REMOVED'", [id, userId]);
  return result.affectedRows === 1;
}

// The browser replaced its subscription (pushsubscriptionchange). Proven by
// the old endpoint, which only that browser and the server know. The row
// keeps its owner; nothing else can be changed this way.
export async function replaceSubscription(oldEndpoint: string, keys: PushKeys, db: Queryable = getDbPool()): Promise<number | null> {
  const [result] = await db.query<ResultSetHeader>(
    `UPDATE push_subscriptions SET endpoint = ?, endpoint_hash = ?, p256dh_enc = ?, auth_enc = ?, status = 'ACTIVE', failure_count = 0, last_failure_code = NULL, last_seen_at = CURRENT_TIMESTAMP
     WHERE endpoint_hash = ? AND status <> 'REMOVED'`,
    [keys.endpoint, endpointHash(keys.endpoint), encryptSecret(keys.p256dh), encryptSecret(keys.auth), endpointHash(oldEndpoint)],
  );
  if (result.affectedRows !== 1) return null;
  const [rows] = await db.query<(RowDataPacket & { user_id: number })[]>("SELECT user_id FROM push_subscriptions WHERE endpoint_hash = ? LIMIT 1", [endpointHash(keys.endpoint)]);
  return rows[0]?.user_id ?? null;
}

export async function activeDeviceIds(userId: number, db: Queryable = getDbPool()): Promise<number[]> {
  const [rows] = await db.query<(RowDataPacket & { id: number })[]>("SELECT id FROM push_subscriptions WHERE user_id = ? AND status = 'ACTIVE'", [userId]);
  return rows.map((row) => row.id);
}

export async function countActiveDevices(userIds: readonly number[], db: Queryable = getDbPool()): Promise<number> {
  if (!userIds.length) return 0;
  const [rows] = await db.query<(RowDataPacket & { n: number })[]>("SELECT COUNT(*) AS n FROM push_subscriptions WHERE status = 'ACTIVE' AND user_id IN (?)", [userIds]);
  return Number(rows[0]?.n ?? 0);
}

// ---- the queue --------------------------------------------------------

// One QUEUED delivery per active device. The message is sealed (encrypted)
// while it waits, like other unsent messages, and wiped once sent.
export async function queuePush(notificationId: number, deviceIds: readonly number[], payload: Record<string, unknown>, db: Queryable = getDbPool()): Promise<number> {
  if (!deviceIds.length) return 0;
  const sealed = JSON.stringify(sealPayload(payload));
  const rows = deviceIds.map((id) => [notificationId, "PUSH", id, "WEBPUSH", "QUEUED", sealed]);
  const [result] = await db.query<ResultSetHeader>(
    "INSERT INTO notification_deliveries (notification_id, channel, subscription_id, provider, status, payload_json, next_retry_at) VALUES " + rows.map(() => "(?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)").join(", "),
    rows.flat(),
  );
  return result.affectedRows;
}

export async function recordPushSkipped(notificationId: number, code: string, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>("INSERT INTO notification_deliveries (notification_id, channel, provider, status, failure_code) VALUES (?, 'PUSH', 'WEBPUSH', 'SKIPPED', ?)", [notificationId, code]);
}

export interface DuePush {
  id: number;
  attemptCount: number;
  subscriptionId: number;
  keys: PushKeys;
  payload: Record<string, unknown>;
}

const LEASE_MINUTES = 10;

// Take up to `limit` due pushes. Each is leased (next_retry_at moves 10
// minutes ahead) so two drains never send the same one; a drain that dies
// mid-send lets it come due again (a repeat push carries the same tag, so the
// device shows it once).
export async function leaseDuePushes(limit: number): Promise<DuePush[]> {
  return withTransaction(async (connection) => {
    const [rows] = await connection.query<
      (RowDataPacket & { id: number; attempt_count: number; subscription_id: number; payload_json: unknown; endpoint: string | null; p256dh_enc: string | null; auth_enc: string | null; status: string | null })[]
    >(
      `SELECT d.id, d.attempt_count, d.subscription_id, d.payload_json, s.endpoint, s.p256dh_enc, s.auth_enc, s.status
       FROM notification_deliveries d LEFT JOIN push_subscriptions s ON s.id = d.subscription_id
       WHERE d.channel = 'PUSH' AND d.status = 'QUEUED' AND d.next_retry_at <= CURRENT_TIMESTAMP
       ORDER BY d.next_retry_at, d.id LIMIT ? FOR UPDATE OF d SKIP LOCKED`,
      [limit],
    );
    if (!rows.length) return [];
    await connection.query<ResultSetHeader>(`UPDATE notification_deliveries SET next_retry_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ${LEASE_MINUTES} MINUTE) WHERE id IN (?)`, [rows.map((row) => row.id)]);
    const due: DuePush[] = [];
    const gone: number[] = [];
    for (const row of rows) {
      if (!row.endpoint || row.status !== "ACTIVE" || !row.p256dh_enc || !row.auth_enc) {
        gone.push(row.id);
        continue;
      }
      const stored = typeof row.payload_json === "string" ? (JSON.parse(row.payload_json) as Record<string, unknown>) : (row.payload_json as Record<string, unknown> | null);
      due.push({ id: row.id, attemptCount: row.attempt_count, subscriptionId: row.subscription_id, keys: { endpoint: row.endpoint, p256dh: decryptSecret(row.p256dh_enc), auth: decryptSecret(row.auth_enc) }, payload: openPayload(stored) ?? {} });
    }
    // The device was removed or expired while the message waited.
    if (gone.length) await connection.query<ResultSetHeader>("UPDATE notification_deliveries SET status = 'SKIPPED', failure_code = 'DEVICE_GONE', next_retry_at = NULL, payload_json = NULL WHERE id IN (?)", [gone]);
    return due;
  });
}

// "SENT" = the push service accepted it (201). It does not mean the person saw it.
export async function markPushSent(id: number, subscriptionId: number, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>(
    `UPDATE notification_deliveries SET status = 'SENT', attempt_count = attempt_count + 1, last_attempt_at = CURRENT_TIMESTAMP, sent_at = CURRENT_TIMESTAMP,
       next_retry_at = NULL, failure_code = NULL, payload_json = NULL WHERE id = ?`,
    [id],
  );
  await db.query<ResultSetHeader>("UPDATE push_subscriptions SET last_used_at = CURRENT_TIMESTAMP, failure_count = 0, last_failure_code = NULL WHERE id = ?", [subscriptionId]);
}

// retryInSeconds null = give up (FAILED, kept on the delivery log).
export async function markPushFailed(id: number, code: string, retryInSeconds: number | null, db: Queryable = getDbPool()): Promise<void> {
  if (retryInSeconds === null) {
    await db.query<ResultSetHeader>(
      "UPDATE notification_deliveries SET status = 'FAILED', attempt_count = attempt_count + 1, last_attempt_at = CURRENT_TIMESTAMP, failure_code = ?, next_retry_at = NULL, payload_json = NULL WHERE id = ?",
      [code.slice(0, 100), id],
    );
    return;
  }
  await db.query<ResultSetHeader>(
    "UPDATE notification_deliveries SET attempt_count = attempt_count + 1, last_attempt_at = CURRENT_TIMESTAMP, failure_code = ?, next_retry_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? SECOND) WHERE id = ?",
    [code.slice(0, 100), retryInSeconds, id],
  );
}

// 404 / 410 from the push service: this subscription is gone for good. Its
// other waiting messages are dropped; the app registers the device again on
// its next visit.
export async function expireSubscription(subscriptionId: number, code: string, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>("UPDATE push_subscriptions SET status = 'EXPIRED', failure_count = failure_count + 1, last_failure_code = ? WHERE id = ? AND status = 'ACTIVE'", [code.slice(0, 60), subscriptionId]);
  await db.query<ResultSetHeader>(
    "UPDATE notification_deliveries SET status = 'SKIPPED', failure_code = 'DEVICE_GONE', next_retry_at = NULL, payload_json = NULL WHERE channel = 'PUSH' AND status = 'QUEUED' AND subscription_id = ?",
    [subscriptionId],
  );
}

export async function noteSubscriptionFailure(subscriptionId: number, code: string, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>("UPDATE push_subscriptions SET failure_count = failure_count + 1, last_failure_code = ? WHERE id = ?", [code.slice(0, 60), subscriptionId]);
}

export async function pendingPushCount(db: Queryable = getDbPool()): Promise<number> {
  const [rows] = await db.query<(RowDataPacket & { n: number })[]>("SELECT COUNT(*) AS n FROM notification_deliveries WHERE channel = 'PUSH' AND status = 'QUEUED'");
  return Number(rows[0]?.n ?? 0);
}

// Housekeeping: rows removed or expired more than 90 days ago are deleted
// (nothing points at them any more but old delivery rows, which keep the id).
export async function prunePushSubscriptions(db: Queryable = getDbPool()): Promise<number> {
  const [result] = await db.query<ResultSetHeader>(
    "DELETE s FROM push_subscriptions s WHERE s.status <> 'ACTIVE' AND s.updated_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 90 DAY) AND NOT EXISTS (SELECT 1 FROM notification_deliveries d WHERE d.subscription_id = s.id AND d.status = 'QUEUED')",
  );
  return result.affectedRows;
}

export async function countAllActiveDevices(db: Queryable = getDbPool()): Promise<number> {
  const [rows] = await db.query<(RowDataPacket & { n: number })[]>("SELECT COUNT(*) AS n FROM push_subscriptions WHERE status = 'ACTIVE'");
  return Number(rows[0]?.n ?? 0);
}
