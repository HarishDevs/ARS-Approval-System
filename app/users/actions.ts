"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireApiArea } from "@/server/authorization/guards";
import { decideTask, holdTask, reopenRequest, resolveBlockedStep, resubmitRequest, resumeRequest, submitRequest, withdrawRequest, type Actor } from "@/server/approvals/service";
import { addAttachments, filesFrom, prepareFiles } from "@/server/attachments/service";
import { logError } from "@/lib/logging/logger";
import { deleteDraft } from "@/lib/db/repositories/drafts.repository";
import type { ActionResult } from "@/lib/http/action-result";

// Server Actions for requests (F-14). Every one re-checks the session; the
// service then enforces who may do what on the record (F-12, D-057).
const NOT_FOUND: ActionResult = { ok: false, message: "Not found." };
const RESERVED = new Set(["workflowId", "requestId", "title", "taskKey", "decision", "comment", "attachments", "submissionKey", "allowDuplicate"]);
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
    if (!RESERVED.has(key) && !key.startsWith("$") && typeof value === "string") fields[key] = value;
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
  let requestId: number;
  let filesSaved = true;
  try {
    const result = await submitRequest(
      { workflowId, title: String(formData.get("title") ?? ""), fields: fieldsFrom(formData), submissionKey: submissionKeyOf(formData), allowDuplicate: formData.get("allowDuplicate") === "on" },
      me,
    );
    if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fieldErrors };
    requestId = result.value.requestId;
    // A repeated submit already has its files from the first time.
    if (result.value.repeated) files.files.length = 0;
    // The draft has become a request (#3).
    await deleteDraft(me.id, `WF:${workflowId}`).catch((error) => logError("submitRequestAction: draft cleanup failed", error));
  } catch (error) {
    logError("submitRequestAction failed", error);
    return { ok: false, message: "Couldn't submit. Please try again." };
  }
  try {
    const saved = await addAttachments(requestId, files.files, me, { requesterOnly: true });
    filesSaved = saved.ok;
  } catch (error) {
    logError("submitRequestAction: attachments failed", error, { requestId });
    filesSaved = false;
  }
  revalidatePath("/users");
  redirect(`/users/requests/${requestId}?submitted=1${filesSaved ? "" : "&files=failed"}`);
}

const DECISIONS = new Set(["APPROVE", "REJECT", "REQUEST_CHANGES", "HOLD"]);
const DONE: Record<string, string> = {
  APPROVE: "Approved.",
  REJECT: "Rejected. The requester has been told.",
  REQUEST_CHANGES: "Sent back for changes. The requester has been told.",
  HOLD: "Put on hold.",
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
  try {
    const result = await resubmitRequest({ requestId, fields: fieldsFrom(formData) }, me);
    if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fieldErrors };
  } catch (error) {
    logError("resubmitAction failed", error);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
  let filesNote = "";
  try {
    const saved = await addAttachments(requestId, files.files, me, { requesterOnly: true });
    if (!saved.ok) filesNote = ` The files weren't attached: ${saved.message}`;
  } catch (error) {
    logError("resubmitAction: attachments failed", error, { requestId });
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
    return { ok: false, message: "Couldn't save the files. Please try again." };
  }
  revalidatePath(`/users/requests/${requestId}`);
  const already = duplicates.length ? ` Already attached, so not added again: ${duplicates.join(", ")}.` : "";
  if (added === 0) return { ok: true, message: `Nothing new to attach.${already}` };
  return { ok: true, message: `${added === 1 ? "File attached." : `${added} files attached.`}${already}` };
}
