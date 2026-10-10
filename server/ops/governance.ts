import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { getNumberSetting } from "@/server/settings/values";

// Retention and legal holds (unified prompt FN10, D-126). Holds are real
// and enforced: a held request can't be deleted, and housekeeping skips its
// related rows. Retention is policy plus a dry run only: no archival or
// deletion runs until the owner approves durations (they default to 0 =
// keep for ever), and even then a run needs a separate, explicit decision.
export type HoldScope = "REQUEST" | "REQUESTER" | "WORKFLOW";

export interface LegalHold {
  id: number;
  reference: string;
  reason: string;
  scopeType: HoldScope;
  scopeId: number;
  scopeLabel: string;
  ownerName: string;
  createdByName: string;
  createdAt: Date;
  releasedAt: Date | null;
  releaseReason: string | null;
  covered: number; // requests covered right now
}

// The SQL condition "this request (alias r) is under an active hold".
export const HELD_SQL = (alias = "r") => `EXISTS (SELECT 1 FROM legal_holds h WHERE h.released_at IS NULL AND (
  (h.scope_type = 'REQUEST' AND h.scope_id = ${alias}.id) OR
  (h.scope_type = 'REQUESTER' AND h.scope_id = ${alias}.requester_id) OR
  (h.scope_type = 'WORKFLOW' AND h.scope_id = (SELECT v.workflow_id FROM workflow_versions v WHERE v.id = ${alias}.workflow_version_id))))`;

export async function isHeld(requestId: number, db: Queryable = getDbPool()): Promise<boolean> {
  const [rows] = await db.query<RowDataPacket[]>(`SELECT 1 FROM approval_requests r WHERE r.id = ? AND ${HELD_SQL("r")} LIMIT 1`, [requestId]);
  return rows.length > 0;
}

export async function listHolds(includeReleased = true): Promise<LegalHold[]> {
  const [rows] = await getDbPool().query<RowDataPacket[]>(
    `SELECT h.*, o.name AS owner_name, c.name AS created_name,
            CASE h.scope_type WHEN 'REQUEST' THEN (SELECT request_no FROM approval_requests WHERE id = h.scope_id)
                              WHEN 'REQUESTER' THEN (SELECT CONCAT(name, ' (', login_id, ')') FROM users WHERE id = h.scope_id)
                              ELSE (SELECT name FROM workflow_definitions WHERE id = h.scope_id) END AS scope_label,
            (SELECT COUNT(*) FROM approval_requests r WHERE (h.scope_type = 'REQUEST' AND r.id = h.scope_id) OR (h.scope_type = 'REQUESTER' AND r.requester_id = h.scope_id)
               OR (h.scope_type = 'WORKFLOW' AND r.workflow_version_id IN (SELECT id FROM workflow_versions WHERE workflow_id = h.scope_id))) AS covered
     FROM legal_holds h JOIN users o ON o.id = h.owner_user_id JOIN users c ON c.id = h.created_by
     ${includeReleased ? "" : "WHERE h.released_at IS NULL"} ORDER BY h.released_at IS NULL DESC, h.id DESC LIMIT 200`,
  );
  return rows.map((row) => ({
    id: row.id,
    reference: row.reference,
    reason: row.reason,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    scopeLabel: row.scope_label ?? `#${row.scope_id}`,
    ownerName: row.owner_name,
    createdByName: row.created_name,
    createdAt: row.created_at,
    releasedAt: row.released_at,
    releaseReason: row.release_reason,
    covered: Number(row.covered),
  }));
}

export async function createHold(input: { reference: string; reason: string; scopeType: HoldScope; scope: string; ownerLogin: string }, actor: { id: number; roles: readonly string[]; sessionId?: string | null }): Promise<{ ok: true; id: number } | { ok: false; field: string; message: string }> {
  if (!actor.roles.includes("SUPER_ADMIN")) return { ok: false, field: "reference", message: "Only the Super Admin can place a hold." };
  const reference = input.reference.replace(/\s+/g, " ").trim().slice(0, 80);
  const reason = input.reason.replace(/\s+/g, " ").trim().slice(0, 500);
  if (reference.length < 3) return { ok: false, field: "reference", message: "Give the matter reference." };
  if (reason.length < 10) return { ok: false, field: "reason", message: "Say why (at least 10 characters)." };
  const db = getDbPool();
  const [owners] = await db.query<RowDataPacket[]>("SELECT id FROM users WHERE login_id = ? AND active = TRUE", [input.ownerLogin.trim()]);
  if (!owners[0]) return { ok: false, field: "ownerLogin", message: "No active person with that user id." };
  const scope = input.scope.trim();
  const [rows] =
    input.scopeType === "REQUEST"
      ? await db.query<RowDataPacket[]>("SELECT id FROM approval_requests WHERE request_no = ?", [scope.toUpperCase()])
      : input.scopeType === "REQUESTER"
        ? await db.query<RowDataPacket[]>("SELECT id FROM users WHERE login_id = ?", [scope])
        : await db.query<RowDataPacket[]>("SELECT id FROM workflow_definitions WHERE code = ?", [scope.toUpperCase()]);
  if (!rows[0]) return { ok: false, field: "scope", message: input.scopeType === "REQUEST" ? "No request with that number." : input.scopeType === "REQUESTER" ? "No person with that user id." : "No approval type with that code." };
  const [result] = await db.query<ResultSetHeader>("INSERT INTO legal_holds (reference, reason, scope_type, scope_id, owner_user_id, created_by) VALUES (?, ?, ?, ?, ?, ?)", [reference, reason, input.scopeType, rows[0].id, owners[0].id, actor.id]);
  await recordAudit({ actorUserId: actor.id, action: "LEGAL_HOLD_CREATED", entityType: "LEGAL_HOLD", entityId: result.insertId, sessionId: actor.sessionId ?? null, metadata: { reference, scopeType: input.scopeType, scopeId: rows[0].id } });
  return { ok: true, id: result.insertId };
}

export async function releaseHold(input: { id: number; reason: string }, actor: { id: number; roles: readonly string[]; sessionId?: string | null }): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!actor.roles.includes("SUPER_ADMIN")) return { ok: false, message: "Only the Super Admin can release a hold." };
  const reason = input.reason.replace(/\s+/g, " ").trim().slice(0, 500);
  if (reason.length < 10) return { ok: false, message: "Say why it can be released (at least 10 characters)." };
  const [result] = await getDbPool().query<ResultSetHeader>("UPDATE legal_holds SET released_at = CURRENT_TIMESTAMP, released_by = ?, release_reason = ? WHERE id = ? AND released_at IS NULL", [actor.id, reason, input.id]);
  if (result.affectedRows !== 1) return { ok: false, message: "This hold isn't active." };
  await recordAudit({ actorUserId: actor.id, action: "LEGAL_HOLD_RELEASED", entityType: "LEGAL_HOLD", entityId: input.id, sessionId: actor.sessionId ?? null, metadata: { reason } });
  return { ok: true };
}

// ---- retention policy and dry run ------------------------------------------------
export const RETENTION_CLASSES = [
  { key: "requests", setting: "retention.requests_years", label: "Finished requests, their decisions, comments and files", unit: "years" },
  { key: "notifications", setting: "retention.notifications_days", label: "In-app notifications and delivery records", unit: "days" },
] as const;

export interface DryRun {
  key: string;
  label: string;
  duration: number; // 0 = not set (keep for ever)
  unit: string;
  eligible: number; // past the retention date and not held
  held: number; // past the date but covered by a hold (conflict avoided)
  oldest: Date | null;
}

// Counts only: nothing is changed.
export async function retentionDryRun(): Promise<DryRun[]> {
  const db = getDbPool();
  const out: DryRun[] = [];
  for (const item of RETENTION_CLASSES) {
    const duration = (await getNumberSetting(item.setting).catch(() => 0)) || 0;
    if (!duration) {
      out.push({ key: item.key, label: item.label, duration: 0, unit: item.unit, eligible: 0, held: 0, oldest: null });
      continue;
    }
    if (item.key === "requests") {
      const [[row]] = await db.query<RowDataPacket[]>(
        `SELECT SUM(NOT ${HELD_SQL("r")}) AS eligible, SUM(${HELD_SQL("r")}) AS held, MIN(r.closed_at) AS oldest
         FROM approval_requests r WHERE r.status IN ('APPROVED', 'REJECTED', 'CANCELLED') AND r.closed_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? YEAR)`,
        [duration],
      );
      out.push({ key: item.key, label: item.label, duration, unit: item.unit, eligible: Number(row?.eligible ?? 0), held: Number(row?.held ?? 0), oldest: row?.oldest ?? null });
    } else {
      const [[row]] = await db.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS eligible, MIN(n.created_at) AS oldest FROM notifications n WHERE n.created_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? DAY)`,
        [duration],
      );
      out.push({ key: item.key, label: item.label, duration, unit: item.unit, eligible: Number(row?.eligible ?? 0), held: 0, oldest: row?.oldest ?? null });
    }
  }
  return out;
}
