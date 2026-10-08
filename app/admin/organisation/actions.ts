"use server";

import { revalidatePath } from "next/cache";
import { formFields, getAdminActor, parseId } from "@/server/admin/actor";
import { saveDepartment, saveDesignation } from "@/server/admin/organisation";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";

const NOT_FOUND: ActionResult = { ok: false, message: "Not found." };

export async function saveDepartmentAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor();
  if (!actor) return NOT_FOUND;
  try {
    const result = await saveDepartment(parseId(formData.get("id")), formFields(formData, ["code", "name", "hodUserId", "active"]), actor);
    if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fieldErrors };
  } catch (error) {
    logError("saveDepartmentAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
  revalidatePath("/admin/organisation");
  return { ok: true, message: "Saved." };
}

export async function saveDesignationAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor();
  if (!actor) return NOT_FOUND;
  try {
    const result = await saveDesignation(parseId(formData.get("id")), formFields(formData, ["code", "name", "isApprover", "active"]), actor);
    if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fieldErrors };
  } catch (error) {
    logError("saveDesignationAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
  revalidatePath("/admin/organisation");
  return { ok: true, message: "Saved." };
}
