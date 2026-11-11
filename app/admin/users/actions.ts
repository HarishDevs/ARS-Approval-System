"use server";

import { revalidatePath } from "next/cache";
import { afterResponse } from "@/lib/http/after-response";
import { appBaseUrl } from "@/lib/http/app-url";
import { createTryAsLink } from "@/server/auth/try-as";
import { redirect } from "next/navigation";
import { formFields, getAdminActor, parseId } from "@/server/admin/actor";
import { parseUserForm } from "@/server/admin/user-input";
import { bulkChangeModules, createUser, forceSignOut, setActive, unlock, updateUser } from "@/server/admin/users";
import { normaliseModules } from "@/server/modules/modules";
import { sendInvitation, sendSetPasswordLink } from "@/server/auth/set-password";
import { handOverPendingTasks } from "@/server/approvals/service";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";

// Server Actions for /admin/users (F-06, D-047, D-048).
const NOT_FOUND: ActionResult = { ok: false, message: "Not found." };
const USER_FIELDS = ["loginId", "name", "email", "whatsappNumber", "departmentId", "designationId", "reportingManagerId", "signInMethod"] as const;

// D-168: module access is saved only when the form carried the module
// check boxes (marked by "modulesShown"); otherwise it is left as it is.
function modulesFrom(formData: FormData): string[] | null {
  return formData.get("modulesShown") === "1" ? formData.getAll("modules").map(String) : null;
}

// D-172: Pic bot chat access, the same way (marked by "chatShown").
function chatFrom(formData: FormData): { modes: string[]; salesforceScope: string } | null {
  return formData.get("chatShown") === "1" ? { modes: formData.getAll("chatModes").map(String), salesforceScope: String(formData.get("salesforceScope") ?? "NONE") } : null;
}

export async function createUserAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor("admin.users");
  if (!actor) return NOT_FOUND;
  const parsed = parseUserForm(formFields(formData, USER_FIELDS), formData.getAll("roles").map(String), modulesFrom(formData), chatFrom(formData));
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
  // v1.13.0 (D-166); v1.49.6 (owner): every new user gets the welcome email
  // (set-password link valid 12 hours). v1.50.2 (owner: "it first shows a
  // failure message but creates the user"): the email went out while the page
  // waited, and a slow mail or WhatsApp provider ran past the page's time
  // limit. It is now sent just after the answer; a failure is logged and shows
  // in Super Admin → Message deliveries, and Re-invite sends it again.
  const userId = newId;
  await afterResponse("welcome email", async () => {
    const sent = await sendInvitation(userId, actor);
    if (!sent.ok) logError("createUserAction: invitation not sent", new Error(sent.message), { userId });
  });
  revalidatePath("/admin/users");
  // redirect() throws on purpose, so it stays outside the try/catch.
  redirect(`/admin/users/${newId}?created=1&invite=queued`);
}

export async function updateUserAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor("admin.users");
  if (!actor) return NOT_FOUND;
  const id = parseId(formData.get("id"));
  if (id === null) return NOT_FOUND;
  const parsed = parseUserForm(formFields(formData, USER_FIELDS), formData.getAll("roles").map(String), modulesFrom(formData), chatFrom(formData));
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

type Command = "deactivate" | "reactivate" | "unlock" | "signout" | "set-password-link" | "invite" | "reset-password";

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
    // v1.13.0 (D-166): by email, from the user page and the users list.
    case "invite": {
      const result = await sendInvitation(id, actor);
      return result.ok ? { ok: true, message: result.value } : { ok: false, message: result.message };
    }
    case "reset-password": {
      const result = await sendSetPasswordLink(id, actor, "RESET");
      return result.ok ? { ok: true, message: result.value } : { ok: false, message: result.message };
    }
    default:
      return NOT_FOUND;
  }
}

export async function userCommandAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor("admin.users");
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

// v1.49.6 (owner: "multiselect and action should be needed in user page as
// well"): the ticked users of the list, one action for all of them. Each goes
// through runCommand, so the same checks apply per person (yourself, another
// IT Admin, Google-only for links); the answer counts what was done and says
// why the rest weren't.
const BULK_COMMANDS = ["invite", "set-password-link", "deactivate", "reactivate"] as const;
const BULK_LIMIT = 100;
export async function bulkUserCommandAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor("admin.users");
  if (!actor) return NOT_FOUND;
  // v1.51.1: "Modules" shares the ticked rows of the same form.
  if (formData.get("command") === "modules") return bulkModulesAction(_previous, formData);
  const command = String(formData.get("command") ?? "") as (typeof BULK_COMMANDS)[number];
  if (!BULK_COMMANDS.includes(command)) return NOT_FOUND;
  const ids = [...new Set(formData.getAll("ids").map((value) => parseId(value)))].filter((id): id is number => id !== null);
  if (ids.length === 0) return { ok: false, message: "Tick at least one user." };
  if (ids.length > BULK_LIMIT) return { ok: false, message: `Act on up to ${BULK_LIMIT} users at a time.` };
  // v1.50.2: emails to many people would keep the page waiting past its time
  // limit, so Re-invite and set-password links go out just after the answer.
  if (command === "invite" || command === "set-password-link") {
    await afterResponse("bulk user emails", async () => {
      for (const id of ids) {
        const result = await runCommand(command, id, actor).catch((error: unknown) => ({ ok: false as const, message: String((error as Error)?.message ?? error) }));
        if (!result.ok) logError("bulkUserCommandAction: one user not sent", new Error(result.message), { command, userId: id });
      }
    });
    revalidatePath("/admin/users");
    const what = command === "invite" ? "Welcome emails" : "Set-password links";
    return { ok: true, message: `${what} are being sent to ${ids.length} user${ids.length === 1 ? "" : "s"}. Anyone who can't get one (for example a Google-only user for a password link) is skipped; see Super Admin → Message deliveries.`, data: { done: ids.length } };
  }
  let done = 0;
  const reasons = new Map<string, number>();
  for (const id of ids) {
    const result = await runCommand(command, id, actor).catch((error: unknown) => {
      logError("bulkUserCommandAction: one user failed", error, { command, userId: id });
      return { ok: false as const, message: "Something went wrong." };
    });
    if (result.ok) done += 1;
    else reasons.set(result.message, (reasons.get(result.message) ?? 0) + 1);
  }
  revalidatePath("/admin/users");
  const verb = { invite: "Invited", "set-password-link": "Set-password link sent to", deactivate: "Deactivated", reactivate: "Activated" }[command];
  const head = `${verb} ${done} of ${ids.length} user${ids.length === 1 ? "" : "s"}.`;
  const tail = [...reasons].map(([message, count]) => `${count} not done: ${message}`).join(" ");
  return { ok: done > 0, message: tail ? `${head} ${tail}` : head, data: { done } };
}

// v1.51.1 (owner: "multi select the employees and assign modules"): Add,
// Remove or Set modules for the ticked users; every person is checked as on
// the user page (bulkChangeModules) and audited.
export async function bulkModulesAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor("admin.users");
  if (!actor) return NOT_FOUND;
  const change = String(formData.get("change") ?? "");
  if (change !== "ADD" && change !== "REMOVE" && change !== "SET") return NOT_FOUND;
  const ids = [...new Set(formData.getAll("ids").map((value) => parseId(value)))].filter((id): id is number => id !== null);
  if (ids.length === 0) return { ok: false, message: "Tick at least one user." };
  if (ids.length > BULK_LIMIT) return { ok: false, message: `Act on up to ${BULK_LIMIT} users at a time.` };
  const modules = normaliseModules(formData.getAll("modules").map(String));
  if (!modules.ok) return NOT_FOUND;
  if (modules.value.length === 0 && change !== "SET") return { ok: false, message: "Choose at least one module." };
  try {
    const result = await bulkChangeModules(ids, change, modules.value, actor);
    revalidatePath("/admin/users");
    const head = `Modules changed for ${result.changed} of ${ids.length} user${ids.length === 1 ? "" : "s"}.${result.unchanged ? ` ${result.unchanged} already had them.` : ""}`;
    const tail = [...result.refused].map(([message, count]) => `${count} not changed: ${message}`).join(" ");
    return { ok: result.changed > 0 || result.unchanged > 0, message: tail ? `${head} ${tail}` : head, data: { done: result.changed + result.unchanged } };
  } catch (error) {
    logError("bulkModulesAction failed", error);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}

// F-16: move every pending approval of a person to someone else.
export async function handoverAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor("admin.users");
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

// D-185 (owner): a one-time link to try the app as this person, view-only,
// in a private window. IT Admin and Super Admin; the rules are in try-as.ts.
export async function tryAsLinkAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor("admin.users");
  if (!actor) return NOT_FOUND;
  const id = parseId(formData.get("id"));
  if (id === null) return NOT_FOUND;
  try {
    // v1.50.0 (security review): the configured address, never the request's Host header.
    const result = await createTryAsLink(actor, id, appBaseUrl());
    if (!result.ok) return { ok: false, message: result.message };
    return { ok: true, data: { url: result.url, name: result.name } };
  } catch (error) {
    logError("tryAsLinkAction failed", error);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}
