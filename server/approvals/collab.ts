import "server-only";
import { checkChosenApprover } from "@/server/approvals/approver-check";
import { findRequest, isParticipant } from "@/lib/db/repositories/approvals.repository";
import {
  commentAudience,
  endDelegation,
  findDelegation,
  hasOverlappingDelegation,
  indiaToday,
  insertComment,
  insertDelegation,
} from "@/lib/db/repositories/collab.repository";
import { findUserById } from "@/lib/db/repositories/users.repository";
import { withTransaction } from "@/lib/db/transaction";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { getEnv } from "@/config/environment";
import { notify } from "@/server/notifications/notify";
import { requestLink } from "@/server/approvals/messages";
import { logError } from "@/lib/logging/logger";
import type { Actor, Result } from "@/server/approvals/service";

const isAdmin = (actor: Actor) => actor.roles.includes("IT_ADMIN") || actor.roles.includes("SUPER_ADMIN");
const baseUrl = () => getEnv().APP_BASE_URL ?? "https://approval.arssteels.net";

// ---- comments (F-15, D-061) -------------------------------------------------------
export async function addComment(requestId: number, body: string, actor: Actor): Promise<Result<{ id: number }>> {
  const text = body.trim();
  if (text.length < 1) return { ok: false, code: "EMPTY", message: "Write a comment first." };
  if (text.length > 2000) return { ok: false, code: "TOO_LONG", message: "Keep it under 2,000 characters." };
  const request = await findRequest(requestId);
  const allowed = request && (request.requesterId === actor.id || isAdmin(actor) || (await isParticipant(requestId, actor.id)));
  if (!request || !allowed) return { ok: false, code: "NOT_FOUND", message: "Not found." };

  const id = await insertComment(requestId, actor.id, text);
  await recordAudit({ actorUserId: actor.id, action: "REQUEST_COMMENTED", entityType: "REQUEST", entityId: requestId, metadata: { commentId: id } });
  try {
    const author = (await findUserById(actor.id))?.name ?? "Someone";
    const link = requestLink(baseUrl(), requestId);
    const audience = (await commentAudience(requestId)).filter((userId) => userId !== actor.id);
    for (const userId of audience) {
      await notify({
        eventType: "REQUEST_COMMENT",
        userId,
        title: "New comment",
        message: `${author} on ${request.requestNo}: ${text.slice(0, 140)}`,
        deepLink: link,
        email: { subject: `New comment on ${request.requestNo}`, text: `${author} commented on ${request.requestNo} · ${request.title}:\n\n${text}\n\n${link}` },
        whatsappVariables: { request_no: request.requestNo, title: request.title, link, author },
      });
    }
  } catch (error) {
    logError("addComment: notify failed", error, { requestId });
  }
  return { ok: true, value: { id } };
}

// ---- delegation (F-30, D-062) ---------------------------------------------------------
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 90;

// Pure checks (unit-tested).
export function checkDelegationInput(input: { userId: number; delegateId: number; startsOn: string; endsOn: string }, today: string): string | null {
  if (input.userId === input.delegateId) return "You can't be your own delegate.";
  if (!DATE.test(input.startsOn) || !DATE.test(input.endsOn)) return "Choose both dates.";
  if (input.endsOn < input.startsOn) return "The end date is before the start date.";
  if (input.endsOn < today) return "The end date is in the past.";
  const days = (Date.parse(`${input.endsOn}T00:00:00Z`) - Date.parse(`${input.startsOn}T00:00:00Z`)) / 86_400_000 + 1;
  if (days > MAX_DAYS) return `Keep it to ${MAX_DAYS} days or fewer.`;
  return null;
}

export async function createDelegation(
  input: { userId: number; delegateId: number; startsOn: string; endsOn: string; reason?: string },
  actor: Actor,
): Promise<Result<{ id: number }>> {
  if (input.userId !== actor.id && !isAdmin(actor)) return { ok: false, code: "FORBIDDEN", message: "You can only set your own out-of-office." };
  const problem = checkDelegationInput(input, await indiaToday());
  if (problem) return { ok: false, code: "INVALID", message: problem };
  const [person, delegate] = await Promise.all([findUserById(input.userId), findUserById(input.delegateId)]);
  if (!person || !delegate || !delegate.active || delegate.isBreakGlass) return { ok: false, code: "INVALID", message: "Choose an active person as the delegate." };
  // D-085: the delegate approves for you, so they must be an approver.
  const notApprover = await checkChosenApprover(input.delegateId);
  if (notApprover) return { ok: false, code: "NOT_APPROVER", message: notApprover };
  // The person's row is locked while checking and saving, so two requests at
  // once can't both pass the overlap check (audit gap: overlap was code-only).
  const id = await withTransaction(async (db) => {
    await db.query("SELECT id FROM users WHERE id = ? FOR UPDATE", [input.userId]);
    if (await hasOverlappingDelegation(input.userId, input.startsOn, input.endsOn, db)) return null;
    return insertDelegation({ ...input, reason: input.reason?.trim().slice(0, 200) || null, createdBy: actor.id }, db);
  });
  if (id === null) return { ok: false, code: "OVERLAP", message: "These dates overlap an existing out-of-office. End that one first." };
  await recordAudit({ actorUserId: actor.id, action: "DELEGATION_CREATED", entityType: "USER", entityId: input.userId, metadata: { delegationId: id, delegateId: input.delegateId, startsOn: input.startsOn, endsOn: input.endsOn } });
  await tellBoth(person.id, person.name, delegate.id, delegate.name, `from ${input.startsOn} to ${input.endsOn}`, true);
  return { ok: true, value: { id } };
}

export async function stopDelegation(id: number, actor: Actor): Promise<Result<null>> {
  const delegation = await findDelegation(id);
  if (!delegation || (delegation.userId !== actor.id && !isAdmin(actor))) return { ok: false, code: "NOT_FOUND", message: "Not found." };
  if (!(await endDelegation(id, actor.id))) return { ok: false, code: "ALREADY_ENDED", message: "This out-of-office has already ended." };
  await recordAudit({ actorUserId: actor.id, action: "DELEGATION_ENDED", entityType: "USER", entityId: delegation.userId, metadata: { delegationId: id } });
  await tellBoth(delegation.userId, delegation.userName, delegation.delegateId, delegation.delegateName, "", false);
  return { ok: true, value: null };
}

async function tellBoth(userId: number, userName: string, delegateId: number, delegateName: string, when: string, started: boolean): Promise<void> {
  try {
    const title = started ? "Out-of-office set" : "Out-of-office ended";
    await notify({
      eventType: started ? "DELEGATION_STARTED" : "DELEGATION_ENDED",
      userId,
      title,
      message: started ? `${delegateName} can approve for you ${when}.` : `${delegateName} can no longer approve for you.`,
      email: { subject: title, text: started ? `${delegateName} can approve on your behalf ${when}.` : `${delegateName} can no longer approve on your behalf.` },
      whatsappVariables: null,
    });
    await notify({
      eventType: started ? "DELEGATION_STARTED" : "DELEGATION_ENDED",
      userId: delegateId,
      title: started ? `You're covering for ${userName}` : `No longer covering for ${userName}`,
      message: started ? `You can approve for ${userName} ${when}. Their approvals appear in Waiting for me.` : `You no longer approve for ${userName}.`,
      email: {
        subject: started ? `You're covering for ${userName}` : `No longer covering for ${userName}`,
        text: started ? `${userName} named you as their delegate ${when}. Their pending approvals appear in "Waiting for me".` : `You no longer approve on behalf of ${userName}.`,
      },
      whatsappVariables: null,
    });
  } catch (error) {
    logError("delegation: notify failed", error);
  }
}
