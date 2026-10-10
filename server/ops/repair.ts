import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { withTransaction } from "@/lib/db/transaction";
import { findWorkflowVersion, lockRequest, syncTasks } from "@/lib/db/repositories/approvals.repository";
import { loadWorkingCalendar } from "@/lib/db/repositories/calendar.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import type { Actor } from "@/server/approvals/service";
import { diagnoseState, type Diagnosis } from "@/server/ops/repair-rules";

export { diagnoseState, type Diagnosis };

// v1.7.0 (A6): "Re-check and fix" for a request flagged INCONSISTENT. The
// workflow state (state_json) is the record; the task rows are a copy used
// by queues and reminders. The only fix applied is making the copy match
// the record again: task rows are rewritten from the state, and pending
// rows the state no longer has are closed (CANCELLED, never deleted). The
// state itself is never changed here. A request with no open step can't be
// fixed safely by a button: it is reported for the developer.
export type RepairOutcome = { ok: true; fixed: boolean; message: string; diagnosis: Diagnosis } | { ok: false; message: string };

const isAdmin = (actor: Actor) => actor.roles.includes("IT_ADMIN") || actor.roles.includes("SUPER_ADMIN");

export async function recheckAndFix(requestId: number, actor: Actor & { sessionId?: string; ipAddress?: string | null }): Promise<RepairOutcome> {
  if (!isAdmin(actor)) return { ok: false, message: "Not found." };
  return withTransaction(async (connection) => {
    const request = await lockRequest(requestId, connection);
    if (!request) return { ok: false as const, message: "Not found." };
    const version = await findWorkflowVersion(request.workflowVersionId, connection);
    if (!version) return { ok: false as const, message: "The request's workflow version is missing: report it to the developer." };
    const [rows] = await connection.query<(RowDataPacket & { task_key: string; status: string })[]>("SELECT task_key, status FROM approval_tasks WHERE request_id = ?", [requestId]);
    const diagnosis = diagnoseState(request.state, rows.map((row) => ({ taskKey: row.task_key, status: row.status })));
    if (diagnosis.kind === "OK") return { ok: true as const, fixed: false, message: "Checked: the request's records agree. Nothing to fix.", diagnosis };
    if (diagnosis.kind === "NO_OPEN_STEP") {
      await recordAudit({ actorUserId: actor.id, action: "REQUEST_RECHECKED", entityType: "REQUEST", entityId: requestId, sessionId: actor.sessionId, ipAddress: actor.ipAddress, metadata: { diagnosis: diagnosis.kind } }, connection);
      return { ok: true as const, fixed: false, message: "In progress with no open step: this can't be fixed safely by a button. Nothing was changed. Report the request number to the developer.", diagnosis };
    }
    const calendar = await loadWorkingCalendar(connection);
    await syncTasks(requestId, request.state, version.definition.nodes, connection, calendar);
    let closed = 0;
    if (diagnosis.orphanKeys.length) {
      const [result] = await connection.query<ResultSetHeader>("UPDATE approval_tasks SET status = 'CANCELLED' WHERE request_id = ? AND status = 'PENDING' AND task_key IN (?)", [requestId, diagnosis.orphanKeys]);
      closed = result.affectedRows;
    }
    await recordAudit(
      {
        actorUserId: actor.id,
        action: "REQUEST_REPAIRED",
        entityType: "REQUEST",
        entityId: requestId,
        sessionId: actor.sessionId,
        ipAddress: actor.ipAddress,
        metadata: { diagnosis: diagnosis.kind, mismatched: diagnosis.mismatchedKeys.length, missing: diagnosis.missingKeys.length, orphansClosed: closed },
      },
      connection,
    );
    return { ok: true as const, fixed: true, message: `Fixed: the task records now match the workflow (${diagnosis.missingKeys.length + diagnosis.mismatchedKeys.length} rewritten, ${closed} closed). The workflow itself wasn't changed.`, diagnosis };
  });
}
