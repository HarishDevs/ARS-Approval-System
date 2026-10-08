"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireApiArea } from "@/server/authorization/guards";
import { submitCustomRequest, type Actor } from "@/server/approvals/service";
import { addComment, createDelegation, stopDelegation } from "@/server/approvals/collab";
import { markAllRead } from "@/lib/db/repositories/collab.repository";
import { builderSpecSchema } from "@/server/workflows/builder";
import { logError } from "@/lib/logging/logger";
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
  let requestId: number;
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
  } catch (error) {
    logError("submitCustomAction failed", error);
    return { ok: false, message: "Couldn't submit. Please try again." };
  }
  revalidatePath("/users");
  redirect(`/users/requests/${requestId}?submitted=1`);
}

export async function commentAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await actor();
  const requestId = num(formData.get("requestId"));
  if (!me || requestId === null) return NOT_FOUND;
  try {
    const result = await addComment(requestId, String(formData.get("body") ?? ""), me);
    if (!result.ok) return { ok: false, message: result.message, fieldErrors: { body: result.message } };
  } catch (error) {
    logError("commentAction failed", error);
    return { ok: false, message: "Couldn't post. Please try again." };
  }
  revalidatePath(`/users/requests/${requestId}`);
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
  await markAllRead(me.id);
  revalidatePath("/users", "layout");
  return { ok: true, message: "All caught up." };
}
