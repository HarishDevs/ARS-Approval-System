import "server-only";
import type { ResultSetHeader } from "mysql2/promise";
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
