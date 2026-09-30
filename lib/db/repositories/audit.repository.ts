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
