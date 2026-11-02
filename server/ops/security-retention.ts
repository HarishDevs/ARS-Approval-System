import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { Queryable } from "@/lib/db/client";

// DR-06 (owner, 2 Nov 2026): security and sign-in records are kept 90 days,
// then deleted by the job runner, in batches, with the counts audited.
// Only these tables. Requests, their decisions and history, the audit log
// (append-only, D-012), devices (new-device detection) and notifications
// (their own retention setting) are never touched here. A person under an
// active legal hold (REQUESTER scope, D-126) keeps their records.
// The cutoff is worked out in SQL from CURRENT_TIMESTAMP, never a JS Date
// (the timestamps are written by MySQL; Power BI site lesson).
export const SECURITY_RETENTION_DAYS = 90;
export const SECURITY_RETENTION_BATCH = 1000;
// Per table per run; the rest goes on the next run (every 5 minutes).
export const SECURITY_RETENTION_MAX_BATCHES = 20;

export interface SecurityRetentionTarget {
  key: string; // the count's name in the job run
  table: string;
  label: string;
  // Rows past the cutoff ("{cutoff}" is replaced by the SQL expression).
  older: string;
  // The column naming the person, for legal holds; null = no person.
  userColumn: string | null;
}

export const SECURITY_RETENTION_TARGETS: readonly SecurityRetentionTarget[] = [
  { key: "loginLogs", table: "login_logs", label: "Sign-in attempts", older: "occurred_at < {cutoff}", userColumn: "user_id" },
  { key: "otpChallenges", table: "otp_challenges", label: "WhatsApp code records", older: "created_at < {cutoff}", userColumn: "user_id" },
  // Only sessions that ended (signed out / revoked, or expired) before the cutoff.
  { key: "endedSessions", table: "user_sessions", label: "Ended sessions", older: "((revoked_at IS NOT NULL AND revoked_at < {cutoff}) OR (revoked_at IS NULL AND expires_at < {cutoff}))", userColumn: "user_id" },
  // Every security link expires within days, so a used one older than this can't be replayed.
  { key: "usedSecurityLinks", table: "used_security_links", label: "Used security links", older: "used_at < {cutoff}", userColumn: null },
  { key: "passwordTokens", table: "password_tokens", label: "Set-password links (used or expired)", older: "((used_at IS NOT NULL AND used_at < {cutoff}) OR (used_at IS NULL AND expires_at < {cutoff}))", userColumn: "user_id" },
];

// Tables this job must never delete from (checked by a unit test).
export const NEVER_PURGED = ["approval_requests", "approval_tasks", "approval_events", "request_comments", "request_attachments", "request_revisions", "request_amendments", "audit_logs", "users", "user_devices", "notifications", "notification_deliveries"] as const;

export function cutoffSql(days = SECURITY_RETENTION_DAYS): string {
  if (!Number.isInteger(days) || days < 1) throw new Error("Retention days must be a whole number of days, at least 1.");
  return `DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ${days} DAY)`;
}

export function purgeStatement(target: SecurityRetentionTarget, days = SECURITY_RETENTION_DAYS, batch = SECURITY_RETENTION_BATCH): { sql: string; params: unknown[] } {
  const older = target.older.split("{cutoff}").join(cutoffSql(days));
  const held = target.userColumn
    ? ` AND (${target.userColumn} IS NULL OR ${target.userColumn} NOT IN (SELECT h.scope_id FROM legal_holds h WHERE h.released_at IS NULL AND h.scope_type = 'REQUESTER'))`
    : "";
  return { sql: `DELETE FROM ${target.table} WHERE ${older}${held} LIMIT ?`, params: [batch] };
}

export interface SecurityRetentionDeps {
  db: Queryable;
  // Has a run finished every table within the last 23 hours?
  doneRecently: () => Promise<boolean>;
  audit: (counts: Record<string, number>) => Promise<void>;
}

export type SecurityRetentionResult = { securityRetention: "DONE" | "PARTIAL" | "NOT_DUE"; deleted: number } & Record<string, number | string>;

// Deletes in batches until a table has nothing left past the cutoff (DONE),
// or the per-run cap is reached (PARTIAL: the next run continues).
export async function runSecurityRetentionWith(deps: SecurityRetentionDeps, options: { days?: number; batch?: number; maxBatches?: number } = {}): Promise<SecurityRetentionResult> {
  if (await deps.doneRecently()) return { securityRetention: "NOT_DUE", deleted: 0 };
  const batch = options.batch ?? SECURITY_RETENTION_BATCH;
  const maxBatches = options.maxBatches ?? SECURITY_RETENTION_MAX_BATCHES;
  const counts: Record<string, number> = {};
  let partial = false;
  for (const target of SECURITY_RETENTION_TARGETS) {
    const statement = purgeStatement(target, options.days, batch);
    let total = 0;
    let rounds = 0;
    for (;;) {
      const [result] = await deps.db.query<ResultSetHeader>(statement.sql, statement.params);
      total += result.affectedRows;
      rounds += 1;
      if (result.affectedRows < batch) break;
      if (rounds >= maxBatches) {
        partial = true;
        break;
      }
    }
    counts[target.key] = total;
  }
  const deleted = Object.values(counts).reduce((sum, value) => sum + value, 0);
  if (deleted > 0) await deps.audit(counts);
  return { securityRetention: partial ? "PARTIAL" : "DONE", deleted, ...counts };
}

// The daily gate: a run that finished every table (DONE) in the last 23 hours.
export async function securityRetentionDoneRecently(db: Queryable): Promise<boolean> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT 1 FROM job_runs WHERE job_key = 'securityRetention' AND status = 'OK'
       AND JSON_UNQUOTE(JSON_EXTRACT(counts_json, '$.securityRetention')) = 'DONE'
       AND finished_at > DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 23 HOUR) LIMIT 1`,
  );
  return rows.length > 0;
}
