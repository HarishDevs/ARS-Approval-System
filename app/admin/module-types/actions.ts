"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminActor, parseId } from "@/server/admin/actor";
import { createModuleType, discardTypeDraft, publishTypeDraft, saveTypeDraft, setTypeActive, startTypeDraft } from "@/server/modules/config";
import { MODULE_ADMIN_PATH, type ModuleKind } from "@/server/modules/settings";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";

// v1.9.0 (D-144): Admin → Task types / Information types. IT Admin and Super
// Admin only; every change is checked again and audited on the server.
function moduleOf(formData: FormData): ModuleKind | null {
  const value = formData.get("module");
  return value === "TASK" || value === "INFO" ? value : null;
}

// G-3 (v1.10.0): each module's set-up page has its own access rule.
const PAGE_KEY: Record<ModuleKind, string> = { TASK: "admin.task_types", INFO: "admin.information_types" };

const NOT_FOUND: ActionResult = { ok: false, message: "Not found." };

export async function createModuleTypeAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const kind = moduleOf(formData);
  const actor = kind ? await getAdminActor(PAGE_KEY[kind]) : null;
  if (!actor || !kind) return NOT_FOUND;
  let id: number;
  try {
    const result = await createModuleType(kind, { code: String(formData.get("code") ?? ""), name: String(formData.get("name") ?? ""), description: String(formData.get("description") ?? "") }, actor);
    if (!result.ok) return { ok: false, message: result.message };
    id = result.value.id;
  } catch (error) {
    logError("createModuleTypeAction failed", error);
    return { ok: false, message: "Couldn't create it. Please try again." };
  }
  revalidatePath(MODULE_ADMIN_PATH[kind]);
  redirect(`${MODULE_ADMIN_PATH[kind]}/${id}?created=1`);
}

export async function saveModuleTypeDraftAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const kind = moduleOf(formData);
  const actor = kind ? await getAdminActor(PAGE_KEY[kind]) : null;
  const typeId = parseId(formData.get("typeId"));
  if (!actor || !kind || !typeId) return NOT_FOUND;
  let form: unknown;
  let settings: unknown;
  try {
    form = JSON.parse(String(formData.get("form") ?? "[]"));
    settings = JSON.parse(String(formData.get("settings") ?? "{}"));
  } catch {
    return { ok: false, message: "The set-up couldn't be read. Reload the page and try again." };
  }
  try {
    const result = await saveTypeDraft(kind, typeId, { name: String(formData.get("name") ?? ""), description: String(formData.get("description") ?? ""), form, settings }, actor);
    if (!result.ok) return { ok: false, message: result.message };
    revalidatePath(`${MODULE_ADMIN_PATH[kind]}/${typeId}`);
    return result.value.problems.length
      ? { ok: true, message: `Draft saved. Before it can be published: ${result.value.problems.join(" ")}` }
      : { ok: true, message: "Draft saved. It passes every check: publish it when ready." };
  } catch (error) {
    logError("saveModuleTypeDraftAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
}

export async function moduleTypeCommandAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const kind = moduleOf(formData);
  const actor = kind ? await getAdminActor(PAGE_KEY[kind]) : null;
  const typeId = parseId(formData.get("typeId"));
  const command = String(formData.get("command") ?? "");
  if (!actor || !kind || !typeId) return NOT_FOUND;
  try {
    let message: string;
    if (command === "publish") {
      const result = await publishTypeDraft(kind, typeId, actor);
      if (!result.ok) return { ok: false, message: result.message };
      message = `Version ${result.value.versionNo} is live. New records use it; earlier ones keep their own version.`;
    } else if (command === "new-draft") {
      const result = await startTypeDraft(kind, typeId, actor);
      if (!result.ok) return { ok: false, message: result.message };
      message = `Draft version ${result.value.versionNo} started from the live version.`;
    } else if (command === "discard") {
      const result = await discardTypeDraft(kind, typeId, actor);
      if (!result.ok) return { ok: false, message: result.message };
      message = "Draft discarded.";
    } else if (command === "retire" || command === "reactivate") {
      const result = await setTypeActive(kind, typeId, command === "reactivate", actor);
      if (!result.ok) return { ok: false, message: result.message };
      message = command === "retire" ? "Retired: no new records of this type. Existing ones carry on." : "Reactivated: people can create these again.";
    } else return NOT_FOUND;
    revalidatePath(MODULE_ADMIN_PATH[kind]);
    revalidatePath(`${MODULE_ADMIN_PATH[kind]}/${typeId}`);
    return { ok: true, message };
  } catch (error) {
    logError("moduleTypeCommandAction failed", error, { command });
    return { ok: false, message: "Couldn't do that. Please try again." };
  }
}
