import "server-only";
import { withTransaction } from "@/lib/db/transaction";
import { lockRequest } from "@/lib/db/repositories/approvals.repository";
import { cancelPendingTasks, markRequestDeleted } from "@/lib/db/repositories/request-admin.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import type { Actor, Result } from "@/server/approvals/service";

// Super Admin deletes a request (S11-08, D-086, F-73). Soft delete: hidden
// from every screen, queue, job and report; pending approvals cancelled;
// the row, timeline and audit log stay. No undo.
export async function deleteRequest(
  input: { requestId: number; reason: string },
  actor: Actor & { sessionId?: string | null; ipAddress?: string | null },
): Promise<Result<{ requestNo: string; cancelledTasks: number }>> {
  if (!actor.roles.includes("SUPER_ADMIN")) return { ok: false, code: "NOT_FOUND", message: "Not found." };
  const reason = input.reason.trim();
  if (reason.length < 5) return { ok: false, code: "REASON_REQUIRED", message: "Give a reason of at least 5 characters.", fieldErrors: { reason: "Give a reason of at least 5 characters." } };
  return withTransaction(async (db) => {
    const request = await lockRequest(input.requestId, db);
    if (!request) return { ok: false, code: "NOT_FOUND", message: "This request doesn't exist or was already deleted." } as const;
    await markRequestDeleted(request.id, actor.id, reason.slice(0, 500), db);
    const cancelledTasks = await cancelPendingTasks(request.id, db);
    await recordAudit(
      {
        actorUserId: actor.id,
        action: "REQUEST_DELETED",
        entityType: "REQUEST",
        entityId: request.id,
        sessionId: actor.sessionId ?? null,
        ipAddress: actor.ipAddress ?? null,
        metadata: { requestNo: request.requestNo, title: request.title, status: request.status, requesterId: request.requesterId, reason, cancelledTasks },
      },
      db,
    );
    return { ok: true, value: { requestNo: request.requestNo, cancelledTasks } } as const;
  });
}
