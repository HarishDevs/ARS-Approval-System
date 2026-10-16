"use server";

import { revalidatePath } from "next/cache";
import { getAdminActor, parseId } from "@/server/admin/actor";
import { findBudget, saveBudget } from "@/lib/db/repositories/budgets.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";

// EN-09: IT keeps department budgets per financial year. Audited with the
// old and new values.
export async function saveBudgetAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor("admin.budgets");
  const departmentId = parseId(formData.get("departmentId"));
  const fy = parseId(formData.get("fy"));
  if (!actor || departmentId === null || fy === null || fy < 2020 || fy > 2100) return { ok: false, message: "Not found." };
  const amountText = String(formData.get("amount") ?? "").replace(/[,\s₹]/g, "");
  if (!/^\d{1,13}(\.\d{1,2})?$/.test(amountText)) return { ok: false, message: "Enter the budget in rupees.", fieldErrors: { amount: "Enter an amount, e.g. 25,00,000." } };
  const warn = Number(formData.get("warnPercent"));
  if (!Number.isInteger(warn) || warn < 50 || warn > 100) return { ok: false, message: "Warn at 50 to 100 %.", fieldErrors: { warnPercent: "50 to 100." } };
  const [whole, fraction = ""] = amountText.split(".");
  const amountPaise = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  try {
    const before = await findBudget(departmentId, fy);
    await saveBudget({ departmentId, fy, amountPaise, warnPercent: warn, userId: actor.id });
    await recordAudit({ actorUserId: actor.id, action: "BUDGET_SAVED", entityType: "DEPARTMENT", entityId: departmentId, sessionId: actor.sessionId, ipAddress: actor.ipAddress, metadata: { fy, before, after: { amountPaise, warnPercent: warn } } });
  } catch (error) {
    logError("saveBudgetAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
  revalidatePath("/admin/budgets");
  return { ok: true, message: "Saved." };
}
