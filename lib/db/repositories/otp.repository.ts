import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";

export type OtpPurpose = "LOGIN" | "PASSWORD_RESET" | "VERIFY_WHATSAPP";

export interface CreateChallengeInput {
  challengeTokenHash: string;
  userId: number;
  purpose: OtpPurpose;
  otpHash: string;
  ttlSeconds: number;
  maxAttempts: number;
  ipAddress: string | null;
}

// expires_at uses MySQL's clock (DATE_ADD on CURRENT_TIMESTAMP).
export async function createChallenge(input: CreateChallengeInput, db: Queryable = getDbPool()): Promise<number> {
  const [result] = await db.query<ResultSetHeader>(
    `INSERT INTO otp_challenges (challenge_token_hash, user_id, purpose, otp_hash, expires_at, max_attempts, ip_address)
     VALUES (?, ?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? SECOND), ?, ?)`,
    [input.challengeTokenHash, input.userId, input.purpose, input.otpHash, input.ttlSeconds, input.maxAttempts, input.ipAddress],
  );
  return result.insertId;
}

export interface ChallengeRecord {
  id: number;
  userId: number;
  purpose: OtpPurpose;
  otpHash: string;
  attemptCount: number;
  maxAttempts: number;
  consumed: boolean;
  secondsUntilExpiry: number;
  secondsSinceCreated: number;
}

interface ChallengeRow extends RowDataPacket {
  id: number;
  user_id: number;
  purpose: OtpPurpose;
  otp_hash: string;
  attempt_count: number;
  max_attempts: number;
  consumed_at: Date | null;
  seconds_until_expiry: number;
  seconds_since_created: number;
}

export async function findChallengeByTokenHash(tokenHash: string, db: Queryable = getDbPool()): Promise<ChallengeRecord | null> {
  const [rows] = await db.query<ChallengeRow[]>(
    `SELECT id, user_id, purpose, otp_hash, attempt_count, max_attempts, consumed_at,
            TIMESTAMPDIFF(SECOND, CURRENT_TIMESTAMP, expires_at) AS seconds_until_expiry,
            TIMESTAMPDIFF(SECOND, created_at, CURRENT_TIMESTAMP) AS seconds_since_created
     FROM otp_challenges WHERE challenge_token_hash = ? LIMIT 1`,
    [tokenHash],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    purpose: row.purpose,
    otpHash: row.otp_hash,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    consumed: row.consumed_at !== null,
    secondsUntilExpiry: Number(row.seconds_until_expiry),
    secondsSinceCreated: Number(row.seconds_since_created),
  };
}

export interface RecentOtpStats {
  countLastHour: number;
  secondsSinceLast: number | null;
}

export async function getRecentOtpStats(userId: number, purpose: OtpPurpose, db: Queryable = getDbPool()): Promise<RecentOtpStats> {
  const [rows] = await db.query<(RowDataPacket & { count_last_hour: number; seconds_since_last: number | null })[]>(
    `SELECT COUNT(*) AS count_last_hour,
            TIMESTAMPDIFF(SECOND, MAX(created_at), CURRENT_TIMESTAMP) AS seconds_since_last
     FROM otp_challenges
     WHERE user_id = ? AND purpose = ? AND created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 HOUR)`,
    [userId, purpose],
  );
  const row = rows[0];
  return {
    countLastHour: Number(row?.count_last_hour ?? 0),
    secondsSinceLast: row?.seconds_since_last === null || row?.seconds_since_last === undefined ? null : Number(row.seconds_since_last),
  };
}

export async function incrementChallengeAttempt(id: number, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>("UPDATE otp_challenges SET attempt_count = attempt_count + 1 WHERE id = ?", [id]);
}

// Conditional update so the same code can never be used twice, even with
// two simultaneous requests. Returns false if it was already consumed.
export async function consumeChallenge(id: number, db: Queryable = getDbPool()): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>(
    "UPDATE otp_challenges SET consumed_at = CURRENT_TIMESTAMP WHERE id = ? AND consumed_at IS NULL",
    [id],
  );
  return result.affectedRows === 1;
}
