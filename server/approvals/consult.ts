import "server-only";
import { findRequest, isParticipant } from "@/lib/db/repositories/approvals.repository";
import { answerConsultationRow, findConsultation, hasOpenConsultation, insertConsultation, insertLink, listLinkedIds, type LinkedRequest } from "@/lib/db/repositories/consult.repository";
import { findUserById } from "@/lib/db/repositories/users.repository";
import { findRequestByNumber } from "@/lib/db/repositories/approvals.repository";
import { getDbPool } from "@/lib/db/client";
import { activeDelegatorsFor } from "@/lib/db/repositories/collab.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { appendEvents } from "@/lib/db/repositories/approvals.repository";
import { notify } from "@/server/notifications/notify";
import { requestLink } from "@/server/approvals/messages";
import { logError } from "@/lib/logging/logger";
import type { Actor, Result } from "@/server/approvals/service";
import { appBaseUrl } from "@/lib/http/app-url";

const isAdmin = (actor: Actor) => actor.roles.includes("IT_ADMIN") || actor.roles.includes("SUPER_ADMIN");
const baseUrl = () => appBaseUrl();
const canSee = async (requestId: number, requesterId: number, actor: Actor) => requesterId === actor.id || isAdmin(actor) || (await isParticipant(requestId, actor.id));

// Who may ask for advice: someone this request is waiting on right now (or
// their delegate) - the person who has to decide.
async function holdsPendingTask(requestId: number, actor: Actor): Promise<boolean> {
  const request = await findRequest(requestId);
  if (!request || (request.state.status !== "IN_PROGRESS" && request.state.status !== "ON_HOLD")) return false;
  const delegators = await activeDelegatorsFor(actor.id);
  return request.state.tasks.some((task) => task.status === "PENDING" && (task.approverId === actor.id || delegators.has(task.approverId)));
}

// EN-06 (BD-9): ask a colleague for advice. They can then read the request
// and answer; they never get a decision.
export async function consult(input: { requestId: number; consulteeId: number; question: string }, actor: Actor): Promise<Result<{ id: number }>> {
  const question = input.question.trim();
  if (question.length < 3) return { ok: false, code: "EMPTY", message: "Write your question." };
  if (question.length > 2000) return { ok: false, code: "TOO_LONG", message: "Keep it under 2,000 characters." };
  const request = await findRequest(input.requestId);
  if (!request || !(await holdsPendingTask(input.requestId, actor))) return { ok: false, code: "NOT_FOUND", message: "Only the person this request is waiting for can ask for advice." };
  const consultee = await findUserById(input.consulteeId);
  if (!consultee || !consultee.active || consultee.isBreakGlass) return { ok: false, code: "INVALID", message: "Choose an active person." };
  if (consultee.id === actor.id || consultee.id === request.requesterId) return { ok: false, code: "INVALID", message: "Choose someone other than yourself or the requester." };
  if (await hasOpenConsultation(input.requestId, consultee.id)) return { ok: false, code: "DUPLICATE", message: `${consultee.name} has already been asked and hasn't answered yet.` };
  const id = await insertConsultation({ requestId: input.requestId, requestedBy: actor.id, consulteeId: consultee.id, question });
  await appendEvents(input.requestId, [{ type: "CONSULTED", consultationId: id, consulteeId: consultee.id, actorId: actor.id, question }], actor.id, getDbPool());
  await recordAudit({ actorUserId: actor.id, action: "REQUEST_CONSULTED", entityType: "REQUEST", entityId: input.requestId, metadata: { consultationId: id, consultee: consultee.id } });
  try {
    const asker = (await findUserById(actor.id))?.name ?? "An approver";
    const link = requestLink(baseUrl(), input.requestId);
    await notify({
      eventType: "CONSULTATION_REQUESTED",
      userId: consultee.id,
      title: "Your advice is asked",
      message: `${asker} asks your advice on ${request.requestNo}: ${question.slice(0, 140)}`,
      deepLink: link,
      email: { subject: `Your advice on ${request.requestNo}`, text: `${asker} would like your advice before deciding. You can read the request and answer; the decision stays with them.\n\n${request.requestNo} · ${request.title}\nQuestion: ${question}\n\n${link}` },
      whatsappVariables: null,
    });
  } catch (error) {
    logError("consult: notify failed", error, { requestId: input.requestId });
  }
  return { ok: true, value: { id } };
}

export async function answerConsultation(input: { consultationId: number; answer: string }, actor: Actor): Promise<Result<null>> {
  const answer = input.answer.trim();
  if (answer.length < 1) return { ok: false, code: "EMPTY", message: "Write your advice." };
  if (answer.length > 2000) return { ok: false, code: "TOO_LONG", message: "Keep it under 2,000 characters." };
  const consultation = await findConsultation(input.consultationId);
  if (!consultation || consultation.consulteeId !== actor.id) return { ok: false, code: "NOT_FOUND", message: "Not found." };
  if (!(await answerConsultationRow(consultation.id, actor.id, answer))) return { ok: false, code: "ANSWERED", message: "You've already answered this." };
  await appendEvents(consultation.requestId, [{ type: "CONSULT_ANSWERED", consultationId: consultation.id, actorId: actor.id, answer }], actor.id, getDbPool());
  await recordAudit({ actorUserId: actor.id, action: "REQUEST_CONSULT_ANSWERED", entityType: "REQUEST", entityId: consultation.requestId, metadata: { consultationId: consultation.id } });
  try {
    const request = await findRequest(consultation.requestId);
    const link = requestLink(baseUrl(), consultation.requestId);
    await notify({
      eventType: "CONSULTATION_ANSWERED",
      userId: consultation.requestedBy,
      title: "Advice received",
      message: `${consultation.consulteeName} answered about ${request?.requestNo ?? "a request"}: ${answer.slice(0, 140)}`,
      deepLink: link,
      email: { subject: `Advice on ${request?.requestNo ?? "your approval"}`, text: `${consultation.consulteeName} answered your question.\n\nAdvice: ${answer}\n\n${link}` },
      whatsappVariables: null,
    });
  } catch (error) {
    logError("consult answer: notify failed", error, { consultationId: consultation.id });
  }
  return { ok: true, value: null };
}

// EN-08 links. Both requests must be visible to the person linking them.
export async function linkRequests(input: { requestId: number; otherRequestNo: string }, actor: Actor): Promise<Result<null>> {
  const request = await findRequest(input.requestId);
  const other = await findRequestByNumber(input.otherRequestNo.trim().toUpperCase());
  if (!request || !(await canSee(request.id, request.requesterId, actor))) return { ok: false, code: "NOT_FOUND", message: "Not found." };
  if (!other || !(await canSee(other.id, other.requesterId, actor))) return { ok: false, code: "NOT_FOUND", message: "No request with that number that you can see." };
  if (other.id === request.id) return { ok: false, code: "INVALID", message: "That's this request." };
  const result = await insertLink({ fromId: request.id, toId: other.id, kind: "RELATED", userId: actor.id });
  if (result === "EXISTS") return { ok: false, code: "EXISTS", message: "These are already linked." };
  await recordAudit({ actorUserId: actor.id, action: "REQUEST_LINKED", entityType: "REQUEST", entityId: request.id, metadata: { other: other.id } });
  return { ok: true, value: null };
}

export async function linkFollowUp(input: { sourceId: number; followUpId: number }, actor: Actor): Promise<boolean> {
  const source = await findRequest(input.sourceId);
  if (!source || source.state.status !== "APPROVED" || !(await canSee(source.id, source.requesterId, actor))) return false;
  await insertLink({ fromId: source.id, toId: input.followUpId, kind: "FOLLOW_UP", userId: actor.id });
  await recordAudit({ actorUserId: actor.id, action: "REQUEST_FOLLOW_UP_RAISED", entityType: "REQUEST", entityId: source.id, metadata: { followUp: input.followUpId } });
  return true;
}

// Linked requests, only those the viewer can see (a link gives no access).
export async function visibleLinks(requestId: number, actor: Actor): Promise<LinkedRequest[]> {
  const links = await listLinkedIds(requestId);
  const out: LinkedRequest[] = [];
  for (const link of links) {
    const other = await findRequest(link.id);
    if (other && (await canSee(other.id, other.requesterId, actor))) out.push(link);
  }
  return out;
}
