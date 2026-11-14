import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import type { AuthMethod } from "@/types/auth";

// Append-only (D-012): this module only ever INSERTs. There is deliberately
// no update or delete function for audit_logs anywhere in the codebase.
export interface AuditEntry {
  actorUserId: number | null;
  onBehalfOfUserId?: number | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  result?: "SUCCESS" | "FAILURE";
  ipAddress?: string | null;
  sessionId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function recordAudit(entry: AuditEntry, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>(
    `INSERT INTO audit_logs (actor_user_id, on_behalf_of_user_id, action, entity_type, entity_id, result, ip_address, session_id, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.actorUserId,
      entry.onBehalfOfUserId ?? null,
      entry.action,
      entry.entityType,
      entry.entityId === undefined || entry.entityId === null ? null : String(entry.entityId),
      entry.result ?? "SUCCESS",
      entry.ipAddress ?? null,
      entry.sessionId ?? null,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
    ],
  );
}

export interface LoginLogEntry {
  userId: number | null;
  authMethod: AuthMethod;
  step: "PASSWORD" | "OTP" | "GOOGLE";
  success: boolean;
  failureReason?: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  deviceId?: number | null;
  newDevice?: boolean;
  sessionId?: string | null;
}

export async function recordLogin(entry: LoginLogEntry, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>(
    `INSERT INTO login_logs (user_id, auth_method, step, success, failure_reason, ip_address, user_agent, device_id, new_device, session_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.userId,
      entry.authMethod,
      entry.step,
      entry.success,
      entry.failureReason ?? null,
      entry.ipAddress,
      entry.userAgent?.slice(0, 500) ?? null,
      entry.deviceId ?? null,
      entry.newDevice ?? false,
      entry.sessionId ?? null,
    ],
  );
}

export interface AuditListItem {
  id: number;
  occurredAt: Date;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  result: "SUCCESS" | "FAILURE";
  ipAddress: string | null;
  metadata: unknown;
}

// Read-only viewer for the Super Admin (P1-57).
export async function listAuditEntries(
  filter: { action?: string; actorUserId?: number; beforeId?: number },
  limit: number,
  db: Queryable = getDbPool(),
): Promise<AuditListItem[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.action) {
    where.push("a.action = ?");
    params.push(filter.action);
  }
  if (filter.actorUserId) {
    where.push("a.actor_user_id = ?");
    params.push(filter.actorUserId);
  }
  if (filter.beforeId) {
    where.push("a.id < ?");
    params.push(filter.beforeId);
  }
  params.push(limit);
  const [rows] = await db.query<
    (RowDataPacket & { id: number; occurred_at: Date; name: string | null; action: string; entity_type: string; entity_id: string | null; result: "SUCCESS" | "FAILURE"; ip_address: string | null; metadata_json: unknown })[]
  >(
    `SELECT a.id, a.occurred_at, u.name, a.action, a.entity_type, a.entity_id, a.result, a.ip_address, a.metadata_json
     FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY a.id DESC LIMIT ?`,
    params,
  );
  return rows.map((row) => ({
    id: row.id,
    occurredAt: row.occurred_at,
    actorName: row.name,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    result: row.result,
    ipAddress: row.ip_address,
    metadata: row.metadata_json,
  }));
}

export async function listAuditActions(db: Queryable = getDbPool()): Promise<string[]> {
  const [rows] = await db.query<(RowDataPacket & { action: string })[]>("SELECT DISTINCT action FROM audit_logs ORDER BY action");
  return rows.map((row) => row.action);
}

// S8-02: the audit log as CSV, newest first, between two dates (India time).
export async function listAuditForExport(filter: { action?: string; from: string; to: string }, limit: number, db: Queryable = getDbPool()): Promise<AuditListItem[]> {
  // occurred_at is UTC; the dates are India dates (UTC+5:30).
  const where = ["a.occurred_at >= DATE_SUB(?, INTERVAL 330 MINUTE)", "a.occurred_at < DATE_SUB(DATE_ADD(?, INTERVAL 1 DAY), INTERVAL 330 MINUTE)"];
  const params: unknown[] = [`${filter.from} 00:00:00`, `${filter.to} 00:00:00`];
  if (filter.action) {
    where.push("a.action = ?");
    params.push(filter.action);
  }
  params.push(limit);
  const [rows] = await db.query<
    (RowDataPacket & { id: number; occurred_at: Date; name: string | null; action: string; entity_type: string; entity_id: string | null; result: "SUCCESS" | "FAILURE"; ip_address: string | null; metadata_json: unknown })[]
  >(
    `SELECT a.id, a.occurred_at, u.name, a.action, a.entity_type, a.entity_id, a.result, a.ip_address, a.metadata_json
     FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id
     WHERE ${where.join(" AND ")}
     ORDER BY a.id DESC LIMIT ?`,
    params,
  );
  return rows.map((row) => ({
    id: row.id,
    occurredAt: row.occurred_at,
    actorName: row.name,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    result: row.result,
    ipAddress: row.ip_address,
    metadata: row.metadata_json,
  }));
}

// S8-02 login history: sign-in attempts, newest first.
export interface LoginHistoryItem {
  id: number;
  occurredAt: Date;
  userId: number | null;
  userName: string | null;
  loginId: string | null;
  method: "GOOGLE" | "PASSWORD_OTP";
  step: string;
  success: boolean;
  failureReason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  newDevice: boolean;
}

export async function listLoginHistory(filter: { userId?: number; outcome?: "SUCCESS" | "FAILURE"; beforeId?: number }, limit: number, db: Queryable = getDbPool()): Promise<LoginHistoryItem[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.userId) {
    where.push("l.user_id = ?");
    params.push(filter.userId);
  }
  if (filter.outcome) where.push(filter.outcome === "SUCCESS" ? "l.success = TRUE" : "l.success = FALSE");
  if (filter.beforeId) {
    where.push("l.id < ?");
    params.push(filter.beforeId);
  }
  params.push(limit);
  const [rows] = await db.query<
    (RowDataPacket & { id: number; occurred_at: Date; user_id: number | null; name: string | null; login_id: string | null; auth_method: "GOOGLE" | "PASSWORD_OTP"; step: string; success: number; failure_reason: string | null; ip_address: string | null; user_agent: string | null; new_device: number })[]
  >(
    `SELECT l.id, l.occurred_at, l.user_id, u.name, u.login_id, l.auth_method, l.step, l.success, l.failure_reason, l.ip_address, l.user_agent, l.new_device
     FROM login_logs l LEFT JOIN users u ON u.id = l.user_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY l.id DESC LIMIT ?`,
    params,
  );
  return rows.map((row) => ({
    id: row.id,
    occurredAt: row.occurred_at,
    userId: row.user_id,
    userName: row.name,
    loginId: row.login_id,
    method: row.auth_method,
    step: row.step,
    success: Number(row.success) === 1,
    failureReason: row.failure_reason,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    newDevice: Number(row.new_device) === 1,
  }));
}

// v1.9.0: one record's history (e.g. a task type's configuration changes).
export async function listAuditForEntity(entityTypes: readonly string[], entityId: string | number, limit: number, db: Queryable = getDbPool()): Promise<AuditListItem[]> {
  const [rows] = await db.query<
    (RowDataPacket & { id: number; occurred_at: Date; name: string | null; action: string; entity_type: string; entity_id: string | null; result: "SUCCESS" | "FAILURE"; ip_address: string | null; metadata_json: unknown })[]
  >(
    `SELECT a.id, a.occurred_at, u.name, a.action, a.entity_type, a.entity_id, a.result, a.ip_address, a.metadata_json
     FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id
     WHERE a.entity_type IN (?) AND a.entity_id = ? ORDER BY a.id DESC LIMIT ?`,
    [entityTypes, String(entityId), limit],
  );
  return rows.map((row) => ({ id: row.id, occurredAt: row.occurred_at, actorName: row.name, action: row.action, entityType: row.entity_type, entityId: row.entity_id, result: row.result, ipAddress: row.ip_address, metadata: row.metadata_json }));
}

// v1.54.14: how many times this person did `action` in the last `minutes` (rate limits).
export async function countRecentActions(userId: number, action: string, minutes: number, db: Queryable = getDbPool()): Promise<number> {
  const [rows] = await db.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM audit_logs WHERE actor_user_id = ? AND action = ? AND occurred_at >= (UTC_TIMESTAMP() - INTERVAL ? MINUTE)", [userId, action, minutes]);
  return Number(rows[0]?.n ?? 0);
}
