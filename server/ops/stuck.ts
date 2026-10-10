import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import { getNumberSetting } from "@/server/settings/values";

// FN2 stuck-request detection. Read-only: finds open requests that need
// IT, with the reason, since when, and what to do. Nothing is changed here;
// each fix goes through the normal audited actions (move a blocked step on,
// hand over tasks, resend messages). A finding can be snoozed.
export type StuckReason = "BLOCKED_STEP" | "INACTIVE_APPROVER" | "NO_ACTIVITY" | "WAITING_REQUESTER" | "MESSAGES_UNSENT" | "INCONSISTENT";

export const STUCK_REASONS: Record<StuckReason, { label: string; action: string }> = {
  BLOCKED_STEP: { label: "A step nobody can act on", action: "Open the request and give the step to someone, or skip it." },
  INACTIVE_APPROVER: { label: "Waiting on someone who is inactive", action: "Hand their open tasks to someone else (Users → the person → Hand over)." },
  NO_ACTIVITY: { label: "No activity for a long time", action: "Check with the approver, or remind them." },
  WAITING_REQUESTER: { label: "Sent back, not resubmitted", action: "Ask the requester to resubmit or withdraw it." },
  MESSAGES_UNSENT: { label: "Messages not sent", action: "Resend the messages from Automation." },
  INCONSISTENT: { label: "Workflow state doesn't add up", action: "Don't change it by hand: report it to the developer with the request number. Moving a blocked step on or a hand-over may fix it." },
};

export interface StuckItem {
  requestId: number;
  requestNo: string;
  title: string;
  reason: StuckReason;
  since: Date;
  days: number;
  detail: string;
  personId: number | null; // the inactive approver, for the hand-over link
}

type Row = RowDataPacket & { id: number; request_no: string; title: string; since: Date; days: number; detail: string | null; person_id: number | null };

const OPEN = "r.deleted_at IS NULL AND r.status IN ('IN_PROGRESS', 'ON_HOLD', 'CHANGES_REQUIRED')";
const NOT_SNOOZED = (reason: StuckReason) =>
  `NOT EXISTS (SELECT 1 FROM stuck_snoozes s WHERE s.request_id = r.id AND s.reason_code = '${reason}' AND s.until_at > CURRENT_TIMESTAMP)`;

export async function findStuckRequests(options: { idleDays?: number; limit?: number; asOf?: Date } = {}, db: Queryable = getDbPool()): Promise<StuckItem[]> {
  const idleDays = options.idleDays ?? ((await getNumberSetting("general.stuck_idle_days").catch(() => 7)) || 7);
  const limit = Math.min(options.limit ?? 200, 500);
  // Tests look ahead with asOf; normally the database clock is used.
  const asOfSql = options.asOf ? "?" : "CURRENT_TIMESTAMP";
  const asOfParam = options.asOf ? [options.asOf] : [];
  const items: StuckItem[] = [];
  const push = (reason: StuckReason, rows: Row[]) => {
    for (const row of rows)
      items.push({ requestId: row.id, requestNo: row.request_no, title: row.title, reason, since: row.since, days: Number(row.days), detail: row.detail ?? "", personId: row.person_id ?? null });
  };

  // A step the engine marked BLOCKED (nobody eligible, no path matches).
  const [blocked] = await db.query<Row[]>(
    `SELECT r.id, r.request_no, r.title, r.updated_at AS since, DATEDIFF(CURRENT_TIMESTAMP, r.updated_at) AS days, NULL AS detail, NULL AS person_id
     FROM approval_requests r
     WHERE r.deleted_at IS NULL AND r.status = 'IN_PROGRESS' AND JSON_SEARCH(r.state_json, 'one', 'BLOCKED', NULL, '$.nodes.*.status') IS NOT NULL AND ${NOT_SNOOZED("BLOCKED_STEP")}
     ORDER BY r.updated_at LIMIT ?`,
    [limit],
  );
  push("BLOCKED_STEP", blocked);

  // A pending task held by an inactive person with no active delegate.
  const [inactive] = await db.query<Row[]>(
    `SELECT r.id, r.request_no, r.title, MIN(t.created_at) AS since, DATEDIFF(CURRENT_TIMESTAMP, MIN(t.created_at)) AS days,
            CONCAT(u.name, ' (', MIN(t.node_label), ')') AS detail, u.id AS person_id
     FROM approval_tasks t JOIN approval_requests r ON r.id = t.request_id JOIN users u ON u.id = t.approver_id
     WHERE t.status = 'PENDING' AND ${OPEN} AND u.active = FALSE
       AND NOT EXISTS (SELECT 1 FROM delegations d JOIN users du ON du.id = d.delegate_id
                       WHERE d.user_id = u.id AND d.ended_at IS NULL AND du.active = TRUE AND CURRENT_DATE BETWEEN d.starts_on AND d.ends_on)
       AND ${NOT_SNOOZED("INACTIVE_APPROVER")}
     GROUP BY r.id, r.request_no, r.title, u.id, u.name ORDER BY since LIMIT ?`,
    [limit],
  );
  push("INACTIVE_APPROVER", inactive);

  // Open and waiting on approvers, but nothing has happened for idleDays.
  const [idle] = await db.query<Row[]>(
    `SELECT r.id, r.request_no, r.title, last.at AS since, DATEDIFF(CURRENT_TIMESTAMP, last.at) AS days, NULL AS detail, NULL AS person_id
     FROM approval_requests r JOIN (SELECT request_id, MAX(created_at) AS at FROM approval_events GROUP BY request_id) last ON last.request_id = r.id
     WHERE r.deleted_at IS NULL AND r.status IN ('IN_PROGRESS', 'ON_HOLD') AND last.at < DATE_SUB(${asOfSql}, INTERVAL ? DAY) AND ${NOT_SNOOZED("NO_ACTIVITY")}
     ORDER BY last.at LIMIT ?`,
    [...asOfParam, idleDays, limit],
  );
  push("NO_ACTIVITY", idle);

  // Sent back to the requester and not resubmitted for idleDays.
  const [waiting] = await db.query<Row[]>(
    `SELECT r.id, r.request_no, r.title, r.updated_at AS since, DATEDIFF(CURRENT_TIMESTAMP, r.updated_at) AS days, NULL AS detail, NULL AS person_id
     FROM approval_requests r
     WHERE r.deleted_at IS NULL AND r.status = 'CHANGES_REQUIRED' AND r.updated_at < DATE_SUB(${asOfSql}, INTERVAL ? DAY) AND ${NOT_SNOOZED("WAITING_REQUESTER")}
     ORDER BY r.updated_at LIMIT ?`,
    [...asOfParam, idleDays, limit],
  );
  push("WAITING_REQUESTER", waiting);

  // Messages for the request that the sender gave up on, or that are over
  // 30 minutes late.
  const [unsent] = await db.query<Row[]>(
    `SELECT r.id, r.request_no, r.title, MIN(o.created_at) AS since, DATEDIFF(CURRENT_TIMESTAMP, MIN(o.created_at)) AS days,
            CONCAT(COUNT(*), ' message', IF(COUNT(*) = 1, '', 's')) AS detail, NULL AS person_id
     FROM notification_outbox o JOIN approval_requests r ON r.id = o.request_id
     WHERE o.sent_at IS NULL AND r.deleted_at IS NULL AND (o.attempts >= 5 OR o.created_at < DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 30 MINUTE)) AND ${NOT_SNOOZED("MESSAGES_UNSENT")}
     GROUP BY r.id, r.request_no, r.title ORDER BY since LIMIT ?`,
    [limit],
  );
  push("MESSAGES_UNSENT", unsent);

  // Reconciliation (BA-08): an in-progress request must have an open step,
  // and its task rows must match the engine state.
  const [open] = await db.query<(RowDataPacket & { id: number; request_no: string; title: string; updated_at: Date; state_json: unknown; pending_rows: number; snoozed: number })[]>(
    `SELECT r.id, r.request_no, r.title, r.updated_at, r.state_json,
            (SELECT COUNT(*) FROM approval_tasks t WHERE t.request_id = r.id AND t.status = 'PENDING') AS pending_rows,
            NOT ${NOT_SNOOZED("INCONSISTENT")} AS snoozed
     FROM approval_requests r WHERE r.deleted_at IS NULL AND r.status = 'IN_PROGRESS' ORDER BY r.id DESC LIMIT 2000`,
  );
  for (const row of open) {
    if (Number(row.snoozed)) continue;
    const state = (typeof row.state_json === "string" ? JSON.parse(row.state_json) : row.state_json) as { nodes?: Record<string, { status: string }>; tasks?: { status: string }[] };
    const openSteps = Object.values(state.nodes ?? {}).filter((node) => node.status === "ACTIVE" || node.status === "BLOCKED").length;
    const statePending = (state.tasks ?? []).filter((task) => task.status === "PENDING").length;
    const detail = openSteps === 0 ? "In progress, but no step is open" : statePending !== Number(row.pending_rows) ? `Task records don't match the workflow (${Number(row.pending_rows)} recorded, ${statePending} in the workflow)` : null;
    if (detail) items.push({ requestId: row.id, requestNo: row.request_no, title: row.title, reason: "INCONSISTENT", since: row.updated_at, days: Math.floor((Date.now() - new Date(row.updated_at).getTime()) / 86_400_000), detail, personId: null });
  }
  return items.sort((a, b) => a.since.getTime() - b.since.getTime());
}

export function countByReason(items: readonly StuckItem[]): Record<StuckReason, number> {
  const out = Object.fromEntries(Object.keys(STUCK_REASONS).map((key) => [key, 0])) as Record<StuckReason, number>;
  for (const item of items) out[item.reason] += 1;
  return out;
}

export async function snoozeStuck(input: { requestId: number; reason: StuckReason; days: number; note: string | null; userId: number }, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>(
    `INSERT INTO stuck_snoozes (request_id, reason_code, until_at, note, created_by) VALUES (?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? DAY), ?, ?)
     ON DUPLICATE KEY UPDATE until_at = VALUES(until_at), note = VALUES(note), created_by = VALUES(created_by), created_at = CURRENT_TIMESTAMP`,
    [input.requestId, input.reason, input.days, input.note, input.userId],
  );
}
