"use server";

import { revalidatePath } from "next/cache";
import { requireApiArea } from "@/server/authorization/guards";
import { runAutomations, AUTOMATIONS } from "@/server/ops/automation";
import { releaseOutboxForResend } from "@/lib/db/repositories/outbox.repository";
import { deliverOutbox } from "@/server/approvals/service";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";

// FN11 failed-automation recovery, Super Admin only: run the jobs now (all,
// or one), and resend a message the sender gave up on. Every step is safe to
// repeat (see the inventory's idempotency column).
async function superAdmin() {
  try {
    return await requireApiArea("superadmin");
  } catch {
    return null;
  }
}

export async function runJobsNowAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const session = await superAdmin();
  if (!session) return { ok: false, message: "Not found." };
  const job = String(formData.get("job") ?? "");
  if (job && !AUTOMATIONS.some((automation) => automation.key === job)) return { ok: false, message: "Not found." };
  try {
    const report = await runAutomations({ trigger: "MANUAL", only: job ? [job] : undefined });
    await recordAudit({ actorUserId: session.user.id, action: "JOBS_RUN_MANUALLY", entityType: "SYSTEM", entityId: job || "ALL", sessionId: session.sessionId, metadata: { runRef: report.runRef, failed: report.failed } });
    revalidatePath("/superadmin/automation");
    return report.failed.length ? { ok: false, message: `Finished with problems: ${report.failed.join(", ")}. See the run history.` } : { ok: true, message: job ? "Done." : "All jobs ran." };
  } catch (error) {
    logError("runJobsNowAction failed", error);
    return { ok: false, message: "Couldn't run the jobs. Please try again." };
  }
}

export async function resendOutboxAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const session = await superAdmin();
  const raw = formData.get("outboxId");
  const id = typeof raw === "string" && /^\d{1,12}$/.test(raw) ? Number(raw) : null;
  if (!session || id === null) return { ok: false, message: "Not found." };
  try {
    const ids = await releaseOutboxForResend({ ids: [id] });
    if (!ids.length) return { ok: false, message: "Nothing to resend: it was sent, or is being sent right now." };
    const sent = await deliverOutbox(ids);
    await recordAudit({ actorUserId: session.user.id, action: "OUTBOX_RESENT", entityType: "OUTBOX", entityId: id, sessionId: session.sessionId, metadata: { sent } });
    revalidatePath("/superadmin/automation");
    return sent ? { ok: true, message: "Sent." } : { ok: false, message: "Still failing. The job runner will try again; check the provider settings." };
  } catch (error) {
    logError("resendOutboxAction failed", error);
    return { ok: false, message: "Couldn't resend. Please try again." };
  }
}
