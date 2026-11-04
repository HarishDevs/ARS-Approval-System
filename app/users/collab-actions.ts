"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireApiArea } from "@/server/authorization/guards";
import { submitCustomRequest, type Actor } from "@/server/approvals/service";
import { addComment, createDelegation, stopDelegation } from "@/server/approvals/collab";
import { answerConsultation, consult, linkRequests } from "@/server/approvals/consult";
import { markAllReadReturningIds, markRead, markUnread } from "@/lib/db/repositories/collab.repository";
import { INBOX_COMMANDS, setInbox } from "@/lib/db/repositories/work.repository";
import { builderSpecSchema } from "@/server/workflows/builder";
import { addAttachments, filesFrom, prepareFiles } from "@/server/attachments/service";
import { addCollaborators, collaboratorIdsFrom, removeCollaborator } from "@/server/approvals/collaborators";
import { logError } from "@/lib/logging/logger";
import { isStorageError, reportStorageFailure } from "@/server/attachments/storage";
import { loadCustomConfig } from "@/server/approvals/custom-config";
import { prepareFieldFiles, saveFieldFiles } from "@/server/attachments/field-files";
import { deleteDraft } from "@/lib/db/repositories/drafts.repository";
import type { ActionResult } from "@/lib/http/action-result";

// Custom approvals (F-33), comments (F-15), out-of-office (F-30), inbox.
const NOT_FOUND: ActionResult = { ok: false, message: "Not found." };

async function actor(): Promise<Actor | null> {
  try {
    const session = await requireApiArea("users");
    return { id: session.user.id, roles: session.user.roles };
  } catch {
    return null;
  }
}

const num = (value: FormDataEntryValue | null) => (typeof value === "string" && /^\d+$/.test(value) ? Number(value) : null);

export async function submitCustomAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await actor();
  if (!me) return NOT_FOUND;
  let builder;
  try {
    const parsed = builderSpecSchema.safeParse(JSON.parse(String(formData.get("spec") ?? "null")));
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Add at least one approver." };
    builder = parsed.data;
  } catch {
    return { ok: false, message: "The levels couldn't be read. Reload the page and try again." };
  }
  // S8-02: files on a custom approval, checked before anything is saved (F-18).
  const files = await prepareFiles(filesFrom(formData));
  if (!files.ok) return { ok: false, message: files.message, fieldErrors: { attachments: files.message } };
  // v1.8.0: the fields IT set up (Admin → Custom approval), and their files.
  const { form } = await loadCustomConfig();
  const fieldFiles = await prepareFieldFiles(formData, form);
  if (!fieldFiles.ok) return { ok: false, message: fieldFiles.message, fieldErrors: { [fieldFiles.field]: fieldFiles.message } };
  const fields: Record<string, string> = {};
  for (const field of form) {
    for (const key of [field.key, `${field.key}__lines`]) {
      const value = formData.get(key);
      if (typeof value === "string") fields[key] = value;
    }
  }
  let requestId: number;
  let filesSaved = true;
  try {
    const result = await submitCustomRequest(
      {
        title: String(formData.get("title") ?? ""),
        builder,
        fields: { ...fields, ...fieldFiles.values },
        submissionKey: (() => {
          const value = formData.get("submissionKey");
          return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? value.toLowerCase() : null;
        })(),
        allowDuplicate: formData.get("allowDuplicate") === "on",
      },
      me,
    );
    if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fieldErrors };
    requestId = result.value.requestId;
    if (result.value.repeated) {
      files.files.length = 0;
      fieldFiles.byField.clear();
    }
    // v1.6.1: people the requester chose to follow it.
    const collaborators = collaboratorIdsFrom(formData);
    if (collaborators.length && !result.value.repeated) await addCollaborators(requestId, collaborators, me).catch((error) => logError("custom: collaborators failed", error, { requestId }));
    await deleteDraft(me.id, "CUSTOM").catch((error) => logError("submitCustomAction: draft cleanup failed", error));
  } catch (error) {
    logError("submitCustomAction failed", error);
    return { ok: false, message: "Couldn't submit. Please try again." };
  }
  try {
    filesSaved = (await addAttachments(requestId, files.files, me, { requesterOnly: true })).ok && (await saveFieldFiles(requestId, fieldFiles.byField, me));
  } catch (error) {
    logError("submitCustomAction: attachments failed", error, { requestId });
    if (isStorageError(error)) await reportStorageFailure(error, { requestId });
    filesSaved = false;
  }
  revalidatePath("/users");
  redirect(`/users/requests/${requestId}?submitted=1${filesSaved ? "" : "&files=failed"}`);
}

export async function commentAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await actor();
  const requestId = num(formData.get("requestId"));
  if (!me || requestId === null) return NOT_FOUND;
  let notVisible: string[] = [];
  try {
    const result = await addComment(requestId, String(formData.get("body") ?? ""), me);
    if (!result.ok) return { ok: false, message: result.message, fieldErrors: { body: result.message } };
    notVisible = result.value.notVisible;
  } catch (error) {
    logError("commentAction failed", error);
    return { ok: false, message: "Couldn't post. Please try again." };
  }
  revalidatePath(`/users/requests/${requestId}`);
  // #9: say plainly who wasn't told (they can't see this request).
  if (notVisible.length > 0) return { ok: true, message: `Posted. Not notified (they can't see this request, or the User ID is wrong): ${notVisible.map((id) => `@${id}`).join(", ")}.` };
  return { ok: true, message: "Posted." };
}

export async function createDelegationAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await actor();
  const delegateId = num(formData.get("delegateId"));
  if (!me) return NOT_FOUND;
  if (delegateId === null) return { ok: false, message: "Choose a delegate.", fieldErrors: { delegateId: "Choose a person." } };
  // IT can set one for someone else (userId); everyone else only for themselves.
  const userId = num(formData.get("userId")) ?? me.id;
  // G-2 (v1.10.0): for someone else this is user management, so it also
  // needs the Admin area and Full access to Users & roles.
  if (userId !== me.id) {
    try {
      await requireApiArea("admin", { change: true, page: "admin.users" });
    } catch {
      return { ok: false, message: "You can only set your own out-of-office." };
    }
  }
  try {
    const result = await createDelegation(
      { userId, delegateId, startsOn: String(formData.get("startsOn") ?? ""), endsOn: String(formData.get("endsOn") ?? ""), reason: String(formData.get("reason") ?? "") },
      me,
    );
    if (!result.ok) return { ok: false, message: result.message };
  } catch (error) {
    logError("createDelegationAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
  revalidatePath("/users/delegation");
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true, message: "Saved. Both of you have been told." };
}

export async function stopDelegationAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await actor();
  const id = num(formData.get("delegationId"));
  if (!me || id === null) return NOT_FOUND;
  try {
    const result = await stopDelegation(id, me);
    if (!result.ok) return { ok: false, message: result.message };
  } catch (error) {
    logError("stopDelegationAction failed", error);
    return { ok: false, message: "Couldn't end it. Please try again." };
  }
  revalidatePath("/users/delegation");
  return { ok: true, message: "Ended." };
}

export async function markAllReadAction(): Promise<ActionResult> {
  const me = await actor();
  if (!me) return NOT_FOUND;
  try {
    const ids = await markAllReadReturningIds(me.id);
    revalidatePath("/users", "layout");
    return { ok: true, message: "All caught up.", data: { ids } };
  } catch (error) {
    logError("markAllReadAction failed", error);
    return { ok: false, message: "Couldn't mark them as read. Please try again." };
  }
}

// Ids come from the browser: the repository only touches the person's own.
const idList = (value: FormDataEntryValue | null) =>
  String(value ?? "")
    .split(",")
    .filter((part) => /^\d{1,12}$/.test(part))
    .map(Number)
    .slice(0, 1000);

// D-237: the one Inbox's bookmark and archive (any notice of one's own).
export async function inboxStateAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await actor();
  const command = String(formData.get("command") ?? "");
  if (!me || !INBOX_COMMANDS.includes(command)) return NOT_FOUND;
  const ids = idList(formData.get("ids"));
  if (!ids.length) return { ok: false, message: "Choose a notification first." };
  try {
    const changed = await setInbox(me.id, ids, command, undefined, true);
    revalidatePath("/users", "layout");
    return { ok: true, message: changed ? "Done." : "Nothing to change." };
  } catch (error) {
    logError("inboxStateAction failed", error);
    return { ok: false, message: "Couldn't do that. Please try again." };
  }
}

export async function markReadAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await actor();
  if (!me) return NOT_FOUND;
  try {
    await markRead(me.id, idList(formData.get("ids")));
    revalidatePath("/users", "layout");
    return { ok: true, message: "Marked as read." };
  } catch (error) {
    logError("markReadAction failed", error);
    return { ok: false, message: "Couldn't mark it as read." };
  }
}

export async function markUnreadAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await actor();
  if (!me) return NOT_FOUND;
  try {
    await markUnread(me.id, idList(formData.get("ids")));
    revalidatePath("/users", "layout");
    return { ok: true, message: "Marked as unread." };
  } catch (error) {
    logError("markUnreadAction failed", error);
    return { ok: false, message: "Couldn't undo. Please try again." };
  }
}

// ---- v1.6.0 consultation and links (EN-06, EN-08) ------------------------------
export async function consultAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await actor();
  const requestId = num(formData.get("requestId"));
  const consulteeId = num(formData.get("consulteeId"));
  if (!me || requestId === null) return NOT_FOUND;
  if (consulteeId === null) return { ok: false, message: "Choose a colleague.", fieldErrors: { consulteeId: "Choose a colleague." } };
  try {
    const result = await consult({ requestId, consulteeId, question: String(formData.get("question") ?? "") }, me);
    if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.code === "EMPTY" || result.code === "TOO_LONG" ? { question: result.message } : undefined };
  } catch (error) {
    logError("consultAction failed", error);
    return { ok: false, message: "Couldn't send. Please try again." };
  }
  revalidatePath(`/users/requests/${requestId}`);
  return { ok: true, message: "Asked. You'll be told when they answer." };
}

export async function answerConsultAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await actor();
  const consultationId = num(formData.get("consultationId"));
  const requestId = num(formData.get("requestId"));
  if (!me || consultationId === null || requestId === null) return NOT_FOUND;
  try {
    const result = await answerConsultation({ consultationId, answer: String(formData.get("answer") ?? "") }, me);
    if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.code === "EMPTY" || result.code === "TOO_LONG" ? { answer: result.message } : undefined };
  } catch (error) {
    logError("answerConsultAction failed", error);
    return { ok: false, message: "Couldn't send. Please try again." };
  }
  revalidatePath(`/users/requests/${requestId}`);
  return { ok: true, message: "Thanks, your advice was sent." };
}

export async function linkAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await actor();
  const requestId = num(formData.get("requestId"));
  const otherNo = String(formData.get("otherRequestNo") ?? "").trim();
  if (!me || requestId === null) return NOT_FOUND;
  if (!/^[A-Za-z0-9-]{4,40}$/.test(otherNo)) return { ok: false, message: "Search and pick a request.", fieldErrors: { otherRequestNo: "Type a number or title, then pick from the list." } };
  try {
    const result = await linkRequests({ requestId, otherRequestNo: otherNo }, me);
    if (!result.ok) return { ok: false, message: result.message, fieldErrors: { otherRequestNo: result.message } };
  } catch (error) {
    logError("linkAction failed", error);
    return { ok: false, message: "Couldn't link. Please try again." };
  }
  revalidatePath(`/users/requests/${requestId}`);
  return { ok: true, message: "Linked." };
}

// v1.6.1 collaborators on the request page: the requester or IT adds people;
// the requester, IT or the person themselves removes them.
export async function addCollaboratorsAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await actor();
  const requestId = num(formData.get("requestId"));
  if (!me || requestId === null) return NOT_FOUND;
  try {
    const result = await addCollaborators(requestId, collaboratorIdsFrom(formData), me);
    if (!result.ok) return { ok: false, message: result.message, fieldErrors: { collaborator: result.message } };
    revalidatePath(`/users/requests/${requestId}`);
    const skipped = result.skipped.length ? ` Not added: ${result.skipped.join(", ")}.` : "";
    return result.added.length ? { ok: true, message: `Added ${result.added.length} collaborator${result.added.length === 1 ? "" : "s"}; they have been told.${skipped}` } : { ok: false, message: `Nobody new to add.${skipped}` };
  } catch (error) {
    logError("addCollaboratorsAction failed", error);
    return { ok: false, message: "Couldn't add. Please try again." };
  }
}

export async function removeCollaboratorAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await actor();
  const requestId = num(formData.get("requestId"));
  const userId = num(formData.get("userId"));
  if (!me || requestId === null || userId === null) return NOT_FOUND;
  try {
    const result = await removeCollaborator(requestId, userId, me);
    if (!result.ok) return { ok: false, message: result.message };
  } catch (error) {
    logError("removeCollaboratorAction failed", error);
    return { ok: false, message: "Couldn't remove. Please try again." };
  }
  revalidatePath(`/users/requests/${requestId}`);
  return { ok: true, message: userId === me.id ? "You no longer follow this request." : "Removed." };
}
