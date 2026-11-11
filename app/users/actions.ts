"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireApiArea } from "@/server/authorization/guards";
import { answerInfo, askForInfo, decideTask, delegateTask, holdTask, recallRequest, reopenRequest, resolveBlockedStep, resubmitRequest, resumeRequest, submitRequest, withdrawRequest, type Actor } from "@/server/approvals/service";
import { linkFollowUp } from "@/server/approvals/consult";
import { followUpSource } from "@/server/approvals/follow-up";
import { cleanExpiredReason, expiredReasonError } from "@/server/approvals/expiry-rules";
import { assessReadiness } from "@/server/approvals/readiness";
import { previewRoute, type StepPreview } from "@/server/approvals/route-preview";
import { loadDirectorySnapshot, toDirectory } from "@/lib/db/repositories/directory.repository";
import type { BuilderStage } from "@/server/workflows/builder";
import { amendmentPlan, amendmentTitle, mergeAmendmentFields, submitAmendment } from "@/server/approvals/amendments";
import { findPublishedVersion, findWorkflow } from "@/lib/db/repositories/approvals.repository";
import { addAttachments, deleteAttachment, filesFrom, prepareFiles } from "@/server/attachments/service";
import { existingFieldCounts, prepareFieldFiles, reportedFieldCounts, saveFieldFiles } from "@/server/attachments/field-files";
import { addCollaborators, collaboratorIdsFrom } from "@/server/approvals/collaborators";
import { findRequest, findWorkflowVersion, userNames } from "@/lib/db/repositories/approvals.repository";
import { logError } from "@/lib/logging/logger";
import { isStorageError, reportStorageFailure, STORAGE_USER_MESSAGE } from "@/server/attachments/storage";
import { deleteDraft } from "@/lib/db/repositories/drafts.repository";
import { hitRateLimit } from "@/lib/db/repositories/jobs.repository";
import { bulkApprove, BULK_MAX } from "@/server/approvals/bulk";
import type { ActionResult } from "@/lib/http/action-result";

// Server Actions for requests (F-14). Every one re-checks the session; the
// service then enforces who may do what on the record (F-12, D-057).
const NOT_FOUND: ActionResult = { ok: false, message: "Not found." };
const RESERVED = new Set(["workflowId", "requestId", "title", "taskKey", "decision", "comment", "attachments", "submissionKey", "allowDuplicate", "acknowledged", "overrideReason", "followUpOf", "attachmentCount", "templateName", "amendmentOf", "amendReason", "amendment", "collaborator", "expiredReason"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// D-QA-01: the form's one-time key (anything else is ignored).
function submissionKeyOf(formData: FormData): string | null {
  const value = formData.get("submissionKey");
  return typeof value === "string" && UUID.test(value) ? value.toLowerCase() : null;
}

async function actor(): Promise<Actor | null> {
  try {
    const session = await requireApiArea("users");
    return { id: session.user.id, roles: session.user.roles };
  } catch {
    return null;
  }
}

function num(value: FormDataEntryValue | null): number | null {
  return typeof value === "string" && /^\d+$/.test(value) ? Number(value) : null;
}

function fieldsFrom(formData: FormData): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!RESERVED.has(key) && !key.startsWith("$") && !key.startsWith("fileCount:") && typeof value === "string") fields[key] = value;
  }
  return fields;
}

export async function submitRequestAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await actor();
  const workflowId = num(formData.get("workflowId"));
  if (!me || workflowId === null) return NOT_FOUND;
  // Files are checked before the request exists, so a bad file never
  // leaves a half-made request behind (F-18).
  const files = await prepareFiles(filesFrom(formData));
  if (!files.ok) return { ok: false, message: files.message, fieldErrors: { attachments: files.message } };
  // v1.6.1 attachment fields: checked now; the count goes in the field.
  const workflowRecord = await findWorkflow(workflowId);
  const liveVersion = workflowRecord ? await findPublishedVersion(workflowRecord.id) : null;
  const fieldFiles = await prepareFieldFiles(formData, liveVersion?.form ?? []);
  if (!fieldFiles.ok) return { ok: false, message: fieldFiles.message, fieldErrors: { [fieldFiles.field]: fieldFiles.message } };
  // DR-05 (owner, 2 Nov 2026): a follow-up from an expired approval isn't
  // blocked, but needs a reason, recorded on the expired request's history.
  const followUpOf = num(formData.get("followUpOf"));
  const followUpFrom = followUpOf !== null ? await followUpSource(followUpOf, me) : null;
  const expiredReason = followUpFrom?.expired ? cleanExpiredReason(String(formData.get("expiredReason") ?? "")) : "";
  const expiredProblem = followUpFrom?.expired ? expiredReasonError(expiredReason) : null;
  if (expiredProblem) return { ok: false, message: expiredProblem, fieldErrors: { expiredReason: expiredProblem } };
  let requestId: number;
  let filesSaved = true;
  try {
    const result = await submitRequest(
      {
        workflowId,
        title: String(formData.get("title") ?? ""),
        fields: { ...fieldsFrom(formData), ...fieldFiles.values },
        submissionKey: submissionKeyOf(formData),
        allowDuplicate: formData.get("allowDuplicate") === "on",
        acknowledged: formData.get("acknowledged") === "on",
        overrideReason: String(formData.get("overrideReason") ?? "").slice(0, 500),
        attachmentCount: files.files.length + fieldFiles.total,
      },
      me,
    );
    // FN1: the server's readiness result comes back for the panel.
    if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fieldErrors, data: result.readiness ? { readiness: result.readiness } : undefined };
    requestId = result.value.requestId;
    // EN-08: raised as a follow-up of an approved request the person can see.
    if (followUpOf !== null && !result.value.repeated) {
      await linkFollowUp({ sourceId: followUpOf, followUpId: requestId, followUpNo: result.value.requestNo, ...(expiredReason ? { expiredReason } : {}) }, me).catch((error) => logError("follow-up link failed", error));
    }
    // A repeated submit already has its files from the first time.
    if (result.value.repeated) {
      files.files.length = 0;
      fieldFiles.byField.clear();
    }
    // v1.6.1: people the requester chose to follow it.
    const collaborators = collaboratorIdsFrom(formData);
    if (collaborators.length && !result.value.repeated) await addCollaborators(requestId, collaborators, me).catch((error) => logError("submit: collaborators failed", error, { requestId }));
    // The draft has become a request (#3).
    await deleteDraft(me.id, `WF:${workflowId}`).catch((error) => logError("submitRequestAction: draft cleanup failed", error));
  } catch (error) {
    logError("submitRequestAction failed", error);
    return { ok: false, message: "Couldn't submit. Please try again." };
  }
  try {
    const saved = await addAttachments(requestId, files.files, me, { requesterOnly: true });
    filesSaved = saved.ok && (await saveFieldFiles(requestId, fieldFiles.byField, me));
  } catch (error) {
    logError("submitRequestAction: attachments failed", error, { requestId });
    if (isStorageError(error)) await reportStorageFailure(error, { requestId });
    filesSaved = false;
  }
  revalidatePath("/users");
  redirect(`/users/requests/${requestId}?submitted=1${filesSaved ? "" : "&files=failed"}`);
}

// FN5: amend an approved request (D-120). Files go on the amendment.
export async function submitAmendmentAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await actor();
  const originalId = num(formData.get("amendmentOf"));
  if (!me || originalId === null) return NOT_FOUND;
  const files = await prepareFiles(filesFrom(formData));
  if (!files.ok) return { ok: false, message: files.message, fieldErrors: { attachments: files.message } };
  let requestId: number;
  let filesSaved = true;
  try {
    const result = await submitAmendment(
      {
        originalId,
        fields: fieldsFrom(formData),
        reason: String(formData.get("amendReason") ?? ""),
        expiredReason: String(formData.get("expiredReason") ?? ""), // DR-05: required when the approval has expired
        submissionKey: submissionKeyOf(formData),
        acknowledged: formData.get("acknowledged") === "on",
        overrideReason: String(formData.get("overrideReason") ?? "").slice(0, 500),
        attachmentCount: files.files.length,
      },
      me,
    );
    if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fieldErrors, data: result.readiness ? { readiness: result.readiness } : undefined };
    requestId = result.value.requestId;
    if (result.value.repeated) files.files.length = 0;
    // A11: the amendment draft has become a request.
    await deleteDraft(me.id, `AM:${originalId}`).catch((error) => logError("submitAmendmentAction: draft cleanup failed", error));
  } catch (error) {
    logError("submitAmendmentAction failed", error);
    return { ok: false, message: "Couldn't submit. Please try again." };
  }
  try {
    filesSaved = (await addAttachments(requestId, files.files, me, { requesterOnly: true })).ok;
  } catch (error) {
    logError("submitAmendmentAction: attachments failed", error, { requestId });
    if (isStorageError(error)) await reportStorageFailure(error, { requestId });
    filesSaved = false;
  }
  revalidatePath("/users");
  redirect(`/users/requests/${requestId}?submitted=1${filesSaved ? "" : "&files=failed"}`);
}

const DECISIONS = new Set(["APPROVE", "REJECT", "REQUEST_CHANGES", "HOLD", "INFO"]);
const DONE: Record<string, string> = {
  APPROVE: "Approved.",
  REJECT: "Rejected. The requester has been told.",
  REQUEST_CHANGES: "Sent back for changes. The requester has been told.",
  HOLD: "Put on hold.",
  INFO: "Question sent. The request waits for the answer.",
};

export async function decideAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await actor();
  const requestId = num(formData.get("requestId"));
  const taskKey = String(formData.get("taskKey") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!me || requestId === null || !taskKey || !DECISIONS.has(decision)) return NOT_FOUND;
  const comment = String(formData.get("comment") ?? "").trim();
  if (comment.length > 2000) return { ok: false, message: "Keep the comment under 2,000 characters.", fieldErrors: { comment: `Keep it under 2,000 characters (now ${comment.length.toLocaleString("en-IN")}).` } };
  if (decision !== "APPROVE" && decision !== "HOLD" && !comment) return { ok: false, message: "Give a reason.", fieldErrors: { comment: "A reason is required." } };
  try {
    const result =
      decision === "HOLD"
        ? await holdTask({ requestId, taskKey, reason: comment || undefined }, me)
        : decision === "INFO"
          ? await askForInfo({ requestId, taskKey, question: comment }, me)
          : await decideTask({ requestId, taskKey, decision: decision as "APPROVE" | "REJECT" | "REQUEST_CHANGES", comment: comment || undefined }, me);
    if (!result.ok) return { ok: false, message: result.message };
  } catch (error) {
    logError("decideAction failed", error, { decision });
    return { ok: false, message: "Something went wrong. Please try again." };
  }
  revalidatePath(`/users/requests/${requestId}`);
  revalidatePath("/users");
  return { ok: true, message: decision === "APPROVE" && formData.get("work") === "1" ? "Marked as done." : DONE[decision] };
}

// IT moves a blocked step on (D-098). The service checks the role again.
const BLOCK_ACTIONS = new Set(["ASSIGN", "SKIP", "RETRY", "TAKE_PATH"]);

export async function resolveBlockedAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await actor();
  const requestId = num(formData.get("requestId"));
  const nodeId = String(formData.get("nodeId") ?? "");
  const action = String(formData.get("action") ?? "");
  if (!me || requestId === null || !/^[A-Za-z0-9_-]{1,80}$/.test(nodeId) || !BLOCK_ACTIONS.has(action)) return NOT_FOUND;
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 3 || reason.length > 500) return { ok: false, message: "Give a short reason.", fieldErrors: { reason: "Give a reason (3 to 500 characters)." } };
  const userIds = formData
    .getAll("userIds")
    .map((value) => num(value))
    .filter((value): value is number => value !== null);
  if (action === "ASSIGN" && userIds.length === 0) return { ok: false, message: "Choose at least one person.", fieldErrors: { userIds: "Choose at least one person." } };
  const edgeId = String(formData.get("edgeId") ?? "");
  try {
    const how =
      action === "ASSIGN"
        ? { action: "ASSIGN" as const, userIds }
        : action === "TAKE_PATH"
          ? { action: "TAKE_PATH" as const, edgeId }
          : { action: action as "SKIP" | "RETRY" };
    const result = await resolveBlockedStep({ requestId, nodeId, reason, ...how }, me);
    if (!result.ok) return { ok: false, message: result.message };
  } catch (error) {
    logError("resolveBlockedAction failed", error, { action });
    return { ok: false, message: "Something went wrong. Please try again." };
  }
  revalidatePath(`/users/requests/${requestId}`);
  return { ok: true, message: "Done. The request is moving again." };
}

export async function resumeAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await actor();
  const requestId = num(formData.get("requestId"));
  if (!me || requestId === null) return NOT_FOUND;
  try {
    const result = await resumeRequest(requestId, me);
    if (!result.ok) return { ok: false, message: result.message };
  } catch (error) {
    logError("resumeAction failed", error);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
  revalidatePath(`/users/requests/${requestId}`);
  return { ok: true, message: "Resumed." };
}

export async function resubmitAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await actor();
  const requestId = num(formData.get("requestId"));
  if (!me || requestId === null) return NOT_FOUND;
  const files = await prepareFiles(filesFrom(formData));
  if (!files.ok) return { ok: false, message: files.message, fieldErrors: { attachments: files.message } };
  const current = await findRequest(requestId);
  const currentVersion = current ? await findWorkflowVersion(current.workflowVersionId) : null;
  const fieldFiles = await prepareFieldFiles(formData, currentVersion?.form ?? [], await existingFieldCounts(requestId));
  if (!fieldFiles.ok) return { ok: false, message: fieldFiles.message, fieldErrors: { [fieldFiles.field]: fieldFiles.message } };
  try {
    const result = await resubmitRequest({ requestId, fields: { ...fieldsFrom(formData), ...fieldFiles.values } }, me);
    if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fieldErrors };
  } catch (error) {
    logError("resubmitAction failed", error);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
  let filesNote = "";
  try {
    const saved = await addAttachments(requestId, files.files, me, { requesterOnly: true });
    if (!saved.ok) filesNote = ` The files weren't attached: ${saved.message}`;
    else if (!(await saveFieldFiles(requestId, fieldFiles.byField, me))) filesNote = " Some files weren't attached; add them again below.";
  } catch (error) {
    logError("resubmitAction: attachments failed", error, { requestId });
    if (isStorageError(error)) await reportStorageFailure(error, { requestId });
    filesNote = " The files couldn't be saved; add them again below.";
  }
  revalidatePath(`/users/requests/${requestId}`);
  revalidatePath("/users");
  return { ok: true, message: `Resubmitted. The approvers have been told.${filesNote}` };
}

export async function withdrawAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await actor();
  const requestId = num(formData.get("requestId"));
  if (!me || requestId === null) return NOT_FOUND;
  try {
    const reason = String(formData.get("reason") ?? "").trim();
    if (reason.length > 500) return { ok: false, message: "Keep the reason under 500 characters." };
    const result = await withdrawRequest({ requestId, reason: reason || undefined }, me);
    if (!result.ok) return { ok: false, message: result.message };
  } catch (error) {
    logError("withdrawAction failed", error);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
  revalidatePath(`/users/requests/${requestId}`);
  revalidatePath("/users");
  return { ok: true, message: "Withdrawn. The approvers have been told." };
}

export async function reopenAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await actor();
  const requestId = num(formData.get("requestId"));
  if (!me || requestId === null) return NOT_FOUND;
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { ok: false, message: "Give a reason.", fieldErrors: { reason: "A reason is required." } };
  if (reason.length > 500) return { ok: false, message: "Keep the reason under 500 characters.", fieldErrors: { reason: "Keep it under 500 characters." } };
  try {
    const result = await reopenRequest({ requestId, reason }, me);
    if (!result.ok) return { ok: false, message: result.message };
  } catch (error) {
    logError("reopenAction failed", error);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
  revalidatePath(`/users/requests/${requestId}`);
  return { ok: true, message: "Reopened. It goes through approval again from the first level." };
}

// Add files to an open request (F-18): anyone who can see it.
// v1.52.3 (owner): delete a request's file until the first approval, or while changes are asked for.
export async function deleteAttachmentAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await actor();
  const attachmentId = num(formData.get("attachmentId"));
  if (!me || attachmentId === null) return NOT_FOUND;
  try {
    const result = await deleteAttachment(attachmentId, me);
    if (!result.ok) return { ok: false, message: result.message };
    revalidatePath(`/users/requests/${result.value.requestId}`);
    return { ok: true, message: `Deleted ${result.value.name}.` };
  } catch (error) {
    logError("deleteAttachmentAction failed", error);
    return { ok: false, message: "Couldn't delete the file. Please try again." };
  }
}

export async function addFilesAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await actor();
  const requestId = num(formData.get("requestId"));
  if (!me || requestId === null) return NOT_FOUND;
  const files = await prepareFiles(filesFrom(formData));
  if (!files.ok) return { ok: false, message: files.message, fieldErrors: { attachments: files.message } };
  if (files.files.length === 0) return { ok: false, message: "Choose a file first.", fieldErrors: { attachments: "Choose a file first." } };
  let added = 0;
  let duplicates: string[] = [];
  try {
    const result = await addAttachments(requestId, files.files, me);
    if (!result.ok) return { ok: false, message: result.message };
    added = result.value.count;
    duplicates = result.value.duplicates;
  } catch (error) {
    logError("addFilesAction failed", error);
    if (isStorageError(error)) {
      await reportStorageFailure(error, { requestId });
      return { ok: false, message: STORAGE_USER_MESSAGE };
    }
    return { ok: false, message: "Couldn't save the files. Please try again." };
  }
  revalidatePath(`/users/requests/${requestId}`);
  const already = duplicates.length ? ` Already attached, so not added again: ${duplicates.join(", ")}.` : "";
  if (added === 0) return { ok: true, message: `Nothing new to attach.${already}` };
  return { ok: true, message: `${added === 1 ? "File attached." : `${added} files attached.`}${already}` };
}

// Bulk approval (#7): "requestId:taskKey" values from the queue's checkboxes.
export async function bulkApproveAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await actor();
  if (!me) return NOT_FOUND;
  const items = formData
    .getAll("item")
    .map((value) => (typeof value === "string" ? /^(\d{1,10}):([A-Za-z0-9_-]{1,40})$/.exec(value) : null))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ requestId: Number(match[1]), taskKey: match[2]! }));
  if (items.length === 0) return { ok: false, message: "Tick at least one approval." };
  if (items.length > BULK_MAX) return { ok: false, message: `Approve at most ${BULK_MAX} at a time.` };
  const comment = String(formData.get("comment") ?? "").trim();
  if (comment.length > 2000) return { ok: false, message: "Keep the comment under 2,000 characters." };
  try {
    const outcomes = await bulkApprove(items, me, comment || undefined);
    revalidatePath("/users/queue");
    revalidatePath("/users");
    const approved = outcomes.filter((outcome) => outcome.result === "APPROVED").length;
    return {
      ok: approved > 0,
      message: approved === outcomes.length ? `Approved ${approved}.` : `Approved ${approved} of ${outcomes.length}. See the list for the others.`,
      data: { outcomes },
    };
  } catch (error) {
    logError("bulkApproveAction failed", error);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}

// ---- v1.6.0 (EN-04, EN-05, EN-07) -------------------------------------------------
const text = (value: FormDataEntryValue | null, max = 2000) => String(value ?? "").trim().slice(0, max + 1);

export async function recallAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await actor();
  const requestId = num(formData.get("requestId"));
  if (!me || requestId === null) return NOT_FOUND;
  const reason = text(formData.get("reason"), 500);
  if (reason.length < 3) return { ok: false, message: "Say why you're recalling it.", fieldErrors: { reason: "Give a reason (3 to 500 characters)." } };
  try {
    const result = await recallRequest({ requestId, reason }, me);
    if (!result.ok) return { ok: false, message: result.message };
  } catch (error) {
    logError("recallAction failed", error);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
  revalidatePath(`/users/requests/${requestId}`);
  revalidatePath("/users");
  return { ok: true, message: "Recalled. Change it below, then resubmit." };
}

export async function answerInfoAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await actor();
  const requestId = num(formData.get("requestId"));
  if (!me || requestId === null) return NOT_FOUND;
  const answer = text(formData.get("answer"));
  if (!answer) return { ok: false, message: "Write your answer.", fieldErrors: { answer: "Write your answer." } };
  if (answer.length > 2000) return { ok: false, message: "Keep it under 2,000 characters.", fieldErrors: { answer: "Keep it under 2,000 characters." } };
  try {
    const result = await answerInfo({ requestId, answer }, me);
    if (!result.ok) return { ok: false, message: result.message };
  } catch (error) {
    logError("answerInfoAction failed", error);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
  revalidatePath(`/users/requests/${requestId}`);
  return { ok: true, message: "Answer sent. The approver can decide now." };
}

export async function delegateTaskAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await actor();
  const requestId = num(formData.get("requestId"));
  const taskKey = String(formData.get("taskKey") ?? "");
  const toUserId = num(formData.get("toUserId"));
  if (!me || requestId === null || !taskKey) return NOT_FOUND;
  if (toUserId === null) return { ok: false, message: "Choose a colleague.", fieldErrors: { toUserId: "Choose a colleague." } };
  const reason = text(formData.get("reason"), 500);
  if (reason.length < 3) return { ok: false, message: "Say why.", fieldErrors: { reason: "Give a reason (3 to 500 characters)." } };
  try {
    const result = await delegateTask({ requestId, taskKey, toUserId, reason }, me);
    if (!result.ok) return { ok: false, message: result.message };
  } catch (error) {
    logError("delegateTaskAction failed", error);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
  revalidatePath(`/users/requests/${requestId}`);
  revalidatePath("/users");
  return { ok: true, message: "Passed on. They've been told." };
}

// FN1 "Check before submitting": the same checks as the submit, nothing
// saved. attachmentCount is how many files are chosen in the form.
const READINESS_PER_MINUTE = 20;

export async function checkReadinessAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await actor();
  const workflowId = num(formData.get("workflowId"));
  if (!me || workflowId === null) return NOT_FOUND;
  // C04: the check runs the whole submission logic; 20 a minute per person.
  if ((await hitRateLimit(`readiness:${me.id}`, 60).catch(() => 0)) > READINESS_PER_MINUTE) return { ok: false, message: "Checked many times in the last minute. Wait a moment and try again." };
  const workflow = await findWorkflow(workflowId);
  const version = workflow && workflow.active && workflow.kind === "PREDEFINED" ? await findPublishedVersion(workflow.id) : null;
  if (!workflow || !version) return NOT_FOUND;
  // FN5: an amendment is checked as it will be submitted (merged values,
  // the original excluded from duplicates, the budget change only).
  const amendmentOf = num(formData.get("amendmentOf"));
  const planned = amendmentOf !== null ? await amendmentPlan(amendmentOf, me) : null;
  if (planned && !planned.ok) return { ok: false, message: planned.reason };
  const plan = planned?.ok ? planned.plan : null;
  if (plan && plan.workflow.id !== workflow.id) return NOT_FOUND;
  try {
    const { readiness } = await assessReadiness({
      workflow,
      version,
      title: plan ? amendmentTitle(plan.original) : String(formData.get("title") ?? ""),
      fields: plan ? mergeAmendmentFields(plan, fieldsFrom(formData)) : { ...fieldsFrom(formData), ...reportedFieldCounts(formData, version.form) },
      amendment: plan ? { originalId: plan.original.id, basePaise: plan.basePaise } : undefined,
      attachmentCount: Math.max(0, Math.min(50, Number(formData.get("attachmentCount")) || 0)),
      requester: me,
    });
    return { ok: true, message: readiness.status === "READY" ? "Ready to submit." : readiness.status === "WARNINGS" ? "Ready, with warnings to review." : "Not ready yet: fix the problems below.", data: { readiness } };
  } catch (error) {
    logError("checkReadinessAction failed", error);
    return { ok: false, message: "The check couldn't run. You can still submit; the server checks everything again." };
  }
}

// v1.54.0 (owner): the review step names who each level goes to. Read only;
// the server resolves again on submit.
export async function previewRouteAction(specJson: string): Promise<{ ok: true; steps: Record<string, StepPreview> } | { ok: false }> {
  const me = await actor();
  if (!me) return { ok: false };
  if ((await hitRateLimit(`route-preview:${me.id}`, 60).catch(() => 0)) > 60) return { ok: false };
  try {
    const raw = JSON.parse(String(specJson ?? "").slice(0, 200_000)) as { stages?: unknown };
    const stages = Array.isArray(raw?.stages) ? (raw.stages as BuilderStage[]) : [];
    const snapshot = await loadDirectorySnapshot();
    const directory = toDirectory(snapshot);
    const ids = new Set<number>();
    const first = previewRoute(stages, me.id, directory, (id) => {
      ids.add(id);
      return String(id);
    });
    const names = await userNames([...ids]);
    const named = Object.fromEntries(Object.entries(first).map(([key, value]) => [key, { ...value, names: value.names.map((id) => names.get(Number(id)) ?? `User #${id}`) }]));
    return { ok: true, steps: named };
  } catch (error) {
    logError("previewRouteAction failed", error);
    return { ok: false };
  }
}

