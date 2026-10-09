import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { withTransaction } from "@/lib/db/transaction";
import { appendEvents, findWorkflowVersion, lockRequest, saveRequestState, syncTasks } from "@/lib/db/repositories/approvals.repository";
import { markRequestDeleted } from "@/lib/db/repositories/request-admin.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { loadWorkingCalendar } from "@/lib/db/repositories/calendar.repository";
import { cancelForDeletion } from "@/server/engine";
import { deliverOutbox, queueMessages, type Actor, type Result } from "@/server/approvals/service";

// Super Admin deletes a request (S11-08, D-086, F-73). Soft delete: hidden
// from every screen, queue, job and report; the row, timeline and audit log
// stay. An open request is first closed through the engine (audit R-04), so
// its saved state and its task rows agree, and the approvers waiting on it
// and the requester are told. No undo.
export async function deleteRequest(
  input: { requestId: number; reason: string },
  actor: Actor & { sessionId?: string | null; ipAddress?: string | null },
): Promise<Result<{ requestNo: string; cancelledTasks: number }>> {
  if (!actor.roles.includes("SUPER_ADMIN")) return { ok: false, code: "NOT_FOUND", message: "Not found." };
  const reason = input.reason.trim();
  if (reason.length < 5) return { ok: false, code: "REASON_REQUIRED", message: "Give a reason of at least 5 characters.", fieldErrors: { reason: "Give a reason of at least 5 characters." } };
  const done = await withTransaction(async (db) => {
    const request = await lockRequest(input.requestId, db);
    if (!request) return { ok: false, code: "NOT_FOUND", message: "This request doesn't exist or was already deleted." } as const;
    const version = await findWorkflowVersion(request.workflowVersionId, db);
    const result = cancelForDeletion(request.state, { actorId: actor.id, reason: reason.slice(0, 500) });
    if (result.state !== request.state) {
      await saveRequestState(request.id, request.stateVersion, result.state, null, db);
      await syncTasks(request.id, result.state, version?.definition.nodes ?? [], db, await loadWorkingCalendar(db));
    }
    await appendEvents(request.id, result.events, actor.id, db);
    await markRequestDeleted(request.id, actor.id, reason.slice(0, 500), db);
    const event = result.events[0] as { closedTaskIds: string[] };
    const [names] = await db.query<(RowDataPacket & { name: string })[]>("SELECT name FROM users WHERE id = ?", [request.requesterId]);
    const outboxIds = await queueMessages(
      { request: { ...request, state: result.state, status: result.state.status }, events: result.events, requesterName: names[0]?.name ?? "Someone", nodes: version?.definition.nodes ?? [] },
      db,
    );
    await recordAudit(
      {
        actorUserId: actor.id,
        action: "REQUEST_DELETED",
        entityType: "REQUEST",
        entityId: request.id,
        sessionId: actor.sessionId ?? null,
        ipAddress: actor.ipAddress ?? null,
        metadata: { requestNo: request.requestNo, title: request.title, status: request.status, requesterId: request.requesterId, reason, cancelledTasks: event.closedTaskIds.length },
      },
      db,
    );
    return { ok: true, value: { requestNo: request.requestNo, cancelledTasks: event.closedTaskIds.length }, outboxIds } as const;
  });
  if (!done.ok) return done;
  await deliverOutbox(done.outboxIds);
  return { ok: true, value: done.value };
}
