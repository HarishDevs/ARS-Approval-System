import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";

// Set-password links (D-049). Expiry is computed by MySQL (never JS Dates).
export interface PasswordTokenRecord {
  id: number;
  userId: number;
  used: boolean;
  secondsUntilExpiry: number;
}

export async function createPasswordToken(
  input: { userId: number; tokenHash: string; ttlHours: number; createdBy: number | null },
  db: Queryable = getDbPool(),
): Promise<void> {
  // A newer link replaces any unused older one.
  await db.query<ResultSetHeader>("UPDATE password_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL", [input.userId]);
  await db.query<ResultSetHeader>(
    "INSERT INTO password_tokens (token_hash, user_id, created_by, expires_at) VALUES (?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? HOUR))",
    [input.tokenHash, input.userId, input.createdBy, input.ttlHours],
  );
}

export async function findPasswordToken(tokenHash: string, db: Queryable = getDbPool()): Promise<PasswordTokenRecord | null> {
  const [rows] = await db.query<(RowDataPacket & { id: number; user_id: number; used_at: Date | null; seconds_until_expiry: number })[]>(
    `SELECT id, user_id, used_at, TIMESTAMPDIFF(SECOND, CURRENT_TIMESTAMP, expires_at) AS seconds_until_expiry
     FROM password_tokens WHERE token_hash = ? LIMIT 1`,
    [tokenHash],
  );
  const row = rows[0];
  return row ? { id: row.id, userId: row.user_id, used: row.used_at !== null, secondsUntilExpiry: Number(row.seconds_until_expiry) } : null;
}

// true only for the caller that actually used it (single use under races).
export async function markPasswordTokenUsed(id: number, db: Queryable = getDbPool()): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>(
    "UPDATE password_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP",
    [id],
  );
  return result.affectedRows === 1;
}

// Sets a new password. Clears a wrong-password lock but never a security
// lock from "This wasn't me" (only an admin unlock clears that).
export async function setPasswordHash(userId: number, passwordHash: string, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>(
    `UPDATE users SET password_hash = ?, password_set_at = CURRENT_TIMESTAMP, failed_login_count = 0,
       locked_until = IF(locked_until > DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 1 YEAR), locked_until, NULL)
     WHERE id = ?`,
    [passwordHash, userId],
  );
}
