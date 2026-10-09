"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireApiArea } from "@/server/authorization/guards";
import { submitCustomRequest, type Actor } from "@/server/approvals/service";
import { addComment, createDelegation, stopDelegation } from "@/server/approvals/collab";
import { markAllReadReturningIds, markRead, markUnread } from "@/lib/db/repositories/collab.repository";
import { builderSpecSchema } from "@/server/workflows/builder";
import { addAttachments, filesFrom, prepareFiles } from "@/server/attachments/service";
import { logError } from "@/lib/logging/logger";
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
  let requestId: number;
  let filesSaved = true;
  try {
    const result = await submitCustomRequest(
      {
        title: String(formData.get("title") ?? ""),
        builder,
        fields: { details: String(formData.get("details") ?? ""), amount: String(formData.get("amount") ?? "") },
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
    if (result.value.repeated) files.files.length = 0;
    await deleteDraft(me.id, "CUSTOM").catch((error) => logError("submitCustomAction: draft cleanup failed", error));
  } catch (error) {
    logError("submitCustomAction failed", error);
    return { ok: false, message: "Couldn't submit. Please try again." };
  }
  try {
    filesSaved = (await addAttachments(requestId, files.files, me, { requesterOnly: true })).ok;
  } catch (error) {
    logError("submitCustomAction: attachments failed", error, { requestId });
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
