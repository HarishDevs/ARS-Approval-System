import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import type { AuthMethod } from "@/types/auth";

// ---- devices ----------------------------------------------------------
export interface DeviceRecord {
  id: number;
  trustedSecondsRemaining: number;
}

export async function findDevice(userId: number, deviceKeyHash: string, db: Queryable = getDbPool()): Promise<DeviceRecord | null> {
  const [rows] = await db.query<(RowDataPacket & { id: number; trusted_seconds_remaining: number | null })[]>(
    `SELECT id, GREATEST(COALESCE(TIMESTAMPDIFF(SECOND, CURRENT_TIMESTAMP, trusted_until), 0), 0) AS trusted_seconds_remaining
     FROM user_devices WHERE user_id = ? AND device_key_hash = ? LIMIT 1`,
    [userId, deviceKeyHash],
  );
  const row = rows[0];
  return row ? { id: row.id, trustedSecondsRemaining: Number(row.trusted_seconds_remaining ?? 0) } : null;
}

export async function createDevice(
  input: { userId: number; deviceKeyHash: string; userAgent: string | null; ipAddress: string | null; trustedDays: number },
  db: Queryable = getDbPool(),
): Promise<number> {
  const [result] = await db.query<ResultSetHeader>(
    `INSERT INTO user_devices (user_id, device_key_hash, user_agent, last_ip, trusted_until)
     VALUES (?, ?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? DAY))`,
    [input.userId, input.deviceKeyHash, input.userAgent, input.ipAddress, input.trustedDays],
  );
  return result.insertId;
}

export async function touchDevice(
  input: { deviceId: number; userAgent: string | null; ipAddress: string | null; trustedDays: number },
  db: Queryable = getDbPool(),
): Promise<void> {
  await db.query<ResultSetHeader>(
    `UPDATE user_devices SET last_seen_at = CURRENT_TIMESTAMP, user_agent = ?, last_ip = ?,
       trusted_until = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? DAY) WHERE id = ?`,
    [input.userAgent, input.ipAddress, input.trustedDays, input.deviceId],
  );
}

// ---- sessions ---------------------------------------------------------
export async function createSession(
  input: {
    id: string;
    userId: number;
    deviceId: number | null;
    authMethod: AuthMethod;
    ipAddress: string | null;
    userAgent: string | null;
    ttlSeconds: number;
  },
  db: Queryable = getDbPool(),
): Promise<void> {
  await db.query<ResultSetHeader>(
    `INSERT INTO user_sessions (id, user_id, device_id, auth_method, ip_address, user_agent, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? SECOND))`,
    [input.id, input.userId, input.deviceId, input.authMethod, input.ipAddress, input.userAgent, input.ttlSeconds],
  );
}

// Live = not revoked, not past its absolute expiry, and used within the
// idle limit (audit S-05; last_seen_at is refreshed at most once a minute).
export async function isSessionActive(sessionId: string, userId: number, idleMinutes: number, db: Queryable = getDbPool()): Promise<boolean> {
  const [rows] = await db.query<(RowDataPacket & { id: string })[]>(
    `SELECT id FROM user_sessions
     WHERE id = ? AND user_id = ? AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
       AND last_seen_at > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? MINUTE) LIMIT 1`,
    [sessionId, userId, idleMinutes],
  );
  return rows.length === 1;
}

export async function touchSession(sessionId: string, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>(
    "UPDATE user_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ? AND last_seen_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 MINUTE)",
    [sessionId],
  );
}

export async function revokeSession(sessionId: string, reason: string, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>(
    "UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP, revoke_reason = ? WHERE id = ? AND revoked_at IS NULL",
    [reason, sessionId],
  );
}

export async function revokeAllSessionsForUser(userId: number, reason: string, db: Queryable = getDbPool()): Promise<number> {
  const [result] = await db.query<ResultSetHeader>(
    "UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP, revoke_reason = ? WHERE user_id = ? AND revoked_at IS NULL",
    [reason, userId],
  );
  return result.affectedRows;
}
