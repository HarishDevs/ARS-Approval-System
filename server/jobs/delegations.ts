import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { INDIA_TODAY_SQL } from "@/lib/db/repositories/directory.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { tellBoth } from "@/server/approvals/collab";

// #8: out of office starts and ends by date. The job runner writes each
// start and end to the audit log once, so the history shows when cover
// really began and stopped (creation and early end are audited when they
// happen, in server/approvals/collab.ts).
export async function auditDelegationDates(): Promise<{ delegationsStarted: number; delegationsEnded: number }> {
  const db = getDbPool();
  const [starting] = await db.query<(RowDataPacket & { id: number; user_id: number; delegate_id: number })[]>(
    `SELECT id, user_id, delegate_id FROM delegations
     WHERE activation_logged_at IS NULL AND ended_at IS NULL AND starts_on <= ${INDIA_TODAY_SQL} LIMIT 200`,
  );
  let started = 0;
  for (const row of starting) {
    const [claim] = await db.query<ResultSetHeader>("UPDATE delegations SET activation_logged_at = CURRENT_TIMESTAMP WHERE id = ? AND activation_logged_at IS NULL", [row.id]);
    if (claim.affectedRows !== 1) continue;
    await recordAudit({ actorUserId: null, action: "DELEGATION_ACTIVE", entityType: "USER", entityId: row.user_id, metadata: { delegationId: row.id, delegateId: row.delegate_id } });
    started += 1;
  }
  const [ending] = await db.query<(RowDataPacket & { id: number; user_id: number; delegate_id: number; user_name: string; delegate_name: string })[]>(
    `SELECT d.id, d.user_id, d.delegate_id, u.name AS user_name, g.name AS delegate_name FROM delegations d
     JOIN users u ON u.id = d.user_id JOIN users g ON g.id = d.delegate_id
     WHERE d.expiry_logged_at IS NULL AND d.ended_at IS NULL AND d.ends_on < ${INDIA_TODAY_SQL} LIMIT 200`,
  );
  let ended = 0;
  for (const row of ending) {
    const [claim] = await db.query<ResultSetHeader>("UPDATE delegations SET expiry_logged_at = CURRENT_TIMESTAMP WHERE id = ? AND expiry_logged_at IS NULL", [row.id]);
    if (claim.affectedRows !== 1) continue;
    await recordAudit({ actorUserId: null, action: "DELEGATION_EXPIRED", entityType: "USER", entityId: row.user_id, metadata: { delegationId: row.id, delegateId: row.delegate_id } });
    // A7: both are told, with what is back with the person.
    await tellBoth(row.user_id, row.user_name, row.delegate_id, row.delegate_name, "", false);
    ended += 1;
  }
  return { delegationsStarted: started, delegationsEnded: ended };
}
