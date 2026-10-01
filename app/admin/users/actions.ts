"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formFields, getAdminActor, parseId } from "@/server/admin/actor";
import { parseUserForm } from "@/server/admin/user-input";
import { createUser, forceSignOut, setActive, unlock, updateUser } from "@/server/admin/users";
import { sendSetPasswordLink } from "@/server/auth/set-password";
import { handOverPendingTasks } from "@/server/approvals/service";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";

// Server Actions for /admin/users (F-06, D-047, D-048).
const NOT_FOUND: ActionResult = { ok: false, message: "Not found." };
const USER_FIELDS = ["loginId", "name", "email", "whatsappNumber", "departmentId", "designationId", "reportingManagerId", "signInMethod"] as const;

export async function createUserAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor();
  if (!actor) return NOT_FOUND;
  const parsed = parseUserForm(formFields(formData, USER_FIELDS), formData.getAll("roles").map(String));
  if (!parsed.ok) return { ok: false, message: "Check the highlighted fields.", fieldErrors: parsed.fieldErrors };
  let newId: number;
  try {
    const result = await createUser(parsed.value, actor);
    if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fieldErrors };
    newId = result.value;
  } catch (error) {
    logError("createUserAction failed", error);
    return { ok: false, message: "Couldn't create the user. Please try again." };
  }
  revalidatePath("/admin/users");
  // redirect() throws on purpose, so it stays outside the try/catch.
  redirect(`/admin/users/${newId}?created=1`);
}

export async function updateUserAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor();
  if (!actor) return NOT_FOUND;
  const id = parseId(formData.get("id"));
  if (id === null) return NOT_FOUND;
  const parsed = parseUserForm(formFields(formData, USER_FIELDS), formData.getAll("roles").map(String));
  if (!parsed.ok) return { ok: false, message: "Check the highlighted fields.", fieldErrors: parsed.fieldErrors };
  try {
    const result = await updateUser(id, parsed.value, actor);
    if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fieldErrors };
  } catch (error) {
    logError("updateUserAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
  revalidatePath(`/admin/users/${id}`);
  revalidatePath("/admin/users");
  return { ok: true, message: "Saved." };
}

type Command = "deactivate" | "reactivate" | "unlock" | "signout" | "set-password-link";

async function runCommand(command: Command, id: number, actor: NonNullable<Awaited<ReturnType<typeof getAdminActor>>>): Promise<ActionResult> {
  switch (command) {
    case "deactivate": {
      const result = await setActive(id, false, actor);
      return result.ok ? { ok: true, message: "User deactivated and signed out everywhere." } : { ok: false, message: result.message };
    }
    case "reactivate": {
      const result = await setActive(id, true, actor);
      return result.ok ? { ok: true, message: "User reactivated." } : { ok: false, message: result.message };
    }
    case "unlock": {
      const result = await unlock(id, actor);
      return result.ok ? { ok: true, message: "Account unlocked." } : { ok: false, message: result.message };
    }
    case "signout": {
      const result = await forceSignOut(id, actor);
      if (!result.ok) return { ok: false, message: result.message };
      return { ok: true, message: result.value === 0 ? "No open sessions." : `Ended ${result.value} session${result.value === 1 ? "" : "s"}.` };
    }
    case "set-password-link": {
      const result = await sendSetPasswordLink(id, actor);
      return result.ok ? { ok: true, message: result.value } : { ok: false, message: result.message };
    }
    default:
      return NOT_FOUND;
  }
}

export async function userCommandAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor();
  if (!actor) return NOT_FOUND;
  const id = parseId(formData.get("id"));
  if (id === null) return NOT_FOUND;
  const command = String(formData.get("command") ?? "") as Command;
  try {
    const result = await runCommand(command, id, actor);
    revalidatePath(`/admin/users/${id}`);
    revalidatePath("/admin/users");
    return result;
  } catch (error) {
    logError("userCommandAction failed", error, { command });
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}

// F-16: move every pending approval of a person to someone else.
export async function handoverAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor();
  const fromId = parseId(formData.get("id"));
  const toId = parseId(formData.get("toUserId"));
  if (!actor || fromId === null) return NOT_FOUND;
  if (toId === null) return { ok: false, message: "Choose who takes them over.", fieldErrors: { toUserId: "Choose a person." } };
  try {
    const result = await handOverPendingTasks(fromId, toId, actor);
    if (!result.ok) return { ok: false, message: result.message };
    revalidatePath(`/admin/users/${fromId}`);
    const { moved, skipped } = result.value;
    const skippedText = skipped.length ? ` ${skipped.length} couldn't move: ${skipped.map((item) => `${item.requestNo} (${item.reason})`).join("; ")}` : "";
    return { ok: skipped.length === 0, message: `Handed over ${moved} approval${moved === 1 ? "" : "s"}.${skippedText}` };
  } catch (error) {
    logError("handoverAction failed", error);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}
