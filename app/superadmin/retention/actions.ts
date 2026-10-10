"use server";

import { revalidatePath } from "next/cache";
import { requireApiArea } from "@/server/authorization/guards";
import { createHold, releaseHold, type HoldScope } from "@/server/ops/governance";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";

// FN10 legal holds: Super Admin only, with a reason; audited.
async function superAdmin() {
  try {
    const session = await requireApiArea("superadmin");
    return { id: session.user.id, roles: session.user.roles, sessionId: session.sessionId };
  } catch {
    return null;
  }
}

export async function createHoldAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await superAdmin();
  if (!actor) return { ok: false, message: "Not found." };
  const scopeType = String(formData.get("scopeType")) as HoldScope;
  if (!["REQUEST", "REQUESTER", "WORKFLOW"].includes(scopeType)) return { ok: false, message: "Choose what the hold covers." };
  try {
    const result = await createHold({ reference: String(formData.get("reference") ?? ""), reason: String(formData.get("reason") ?? ""), scopeType, scope: String(formData.get("scope") ?? ""), ownerLogin: String(formData.get("ownerLogin") ?? "") }, actor);
    if (!result.ok) return { ok: false, message: result.message, fieldErrors: { [result.field]: result.message } };
  } catch (error) {
    logError("createHoldAction failed", error);
    return { ok: false, message: "Couldn't place the hold. Please try again." };
  }
  revalidatePath("/superadmin/retention");
  return { ok: true, message: "Hold placed. The records it covers can't be deleted until it is released." };
}

export async function releaseHoldAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await superAdmin();
  const raw = formData.get("holdId");
  const id = typeof raw === "string" && /^\d{1,10}$/.test(raw) ? Number(raw) : null;
  if (!actor || id === null) return { ok: false, message: "Not found." };
  try {
    const result = await releaseHold({ id, reason: String(formData.get("releaseReason") ?? "") }, actor);
    if (!result.ok) return { ok: false, message: result.message, fieldErrors: { releaseReason: result.message } };
  } catch (error) {
    logError("releaseHoldAction failed", error);
    return { ok: false, message: "Couldn't release. Please try again." };
  }
  revalidatePath("/superadmin/retention");
  return { ok: true, message: "Released." };
}
