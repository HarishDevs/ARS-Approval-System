"use server";

import { revalidatePath } from "next/cache";
import { getAdminActor, parseId } from "@/server/admin/actor";
import { bulkReassign, BULK_REASSIGN_MAX } from "@/server/approvals/service";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";

// v1.7.0 (A3): bulk reassignment. Each item is moved on its own; the result
// lists every one.
export async function bulkReassignAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor("admin.workload");
  if (!actor) return { ok: false, message: "Not found." };
  const toUserId = parseId(formData.get("toUserId"));
  if (toUserId === null) return { ok: false, message: "Choose who takes them.", fieldErrors: { toUserId: "Choose a person." } };
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 3 || reason.length > 500) return { ok: false, message: "Say why they're being moved.", fieldErrors: { reason: "Give a reason (3 to 500 characters)." } };
  const items = formData
    .getAll("item")
    .map((value) => (typeof value === "string" ? /^(\d{1,10}):([A-Za-z0-9_-]{1,40})$/.exec(value) : null))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ requestId: Number(match[1]), taskKey: match[2]! }));
  if (items.length === 0) return { ok: false, message: "Tick at least one task." };
  if (items.length > BULK_REASSIGN_MAX) return { ok: false, message: `Move at most ${BULK_REASSIGN_MAX} at a time.` };
  try {
    const result = await bulkReassign(items, toUserId, reason, actor);
    if (!result.ok) return { ok: false, message: result.message };
    revalidatePath("/admin/workload");
    const moved = result.value.filter((outcome) => outcome.ok).length;
    return {
      ok: moved > 0,
      message: moved === result.value.length ? `Moved ${moved}.` : `Moved ${moved} of ${result.value.length}. See the list for the others.`,
      data: { outcomes: result.value },
    };
  } catch (error) {
    logError("bulkReassignAction failed", error);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}
