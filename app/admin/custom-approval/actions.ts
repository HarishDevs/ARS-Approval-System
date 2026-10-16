"use server";

import { revalidatePath } from "next/cache";
import { getAdminActor } from "@/server/admin/actor";
import { saveCustomConfig } from "@/server/approvals/custom-config";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";

// v1.8.0 (owner): Admin → Custom approval. IT Admin / Super Admin only; the
// set-up is checked again on the server and audited.
export async function saveCustomApprovalAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor("admin.custom_approval");
  if (!actor) return { ok: false, message: "Not found." };
  let form: unknown;
  let policy: unknown;
  try {
    form = JSON.parse(String(formData.get("form") ?? "[]"));
    policy = JSON.parse(String(formData.get("policy") ?? "{}"));
  } catch {
    return { ok: false, message: "The set-up couldn't be read. Reload the page and try again." };
  }
  try {
    const result = await saveCustomConfig({ form, policy }, actor);
    if (!result.ok) return result;
  } catch (error) {
    logError("saveCustomApprovalAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
  revalidatePath("/admin/custom-approval");
  revalidatePath("/users/custom");
  return { ok: true, message: "Saved. New custom approvals use this set-up; requests already raised keep their own fields." };
}
