"use server";

import { revalidatePath } from "next/cache";
import { requireApiArea } from "@/server/authorization/guards";
import { makeDeliveryDue } from "@/lib/db/repositories/jobs.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { runDeliveryRetries } from "@/server/jobs/retry-deliveries";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";

// "Retry now" on the delivery log (P1-45, F-41): Super Admin only.
export async function retryNowAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let session;
  try {
    session = await requireApiArea("superadmin");
  } catch {
    return { ok: false, message: "Not found." };
  }
  const raw = formData.get("deliveryId");
  const id = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : null;
  if (id === null) return { ok: false, message: "Not found." };
  try {
    if (!(await makeDeliveryDue(id))) return { ok: false, message: "This message can't be retried (already sent, or nothing stored to resend)." };
    const report = await runDeliveryRetries({ onlyIds: [id] });
    await recordAudit({ actorUserId: session.user.id, action: "DELIVERY_RETRIED", entityType: "DELIVERY", entityId: id, sessionId: session.sessionId, metadata: { ...report } });
    revalidatePath("/superadmin/deliveries");
    return report.sent ? { ok: true, message: "Sent." } : { ok: false, message: "Still failing. See the reason in the list." };
  } catch (error) {
    logError("retryNowAction failed", error);
    return { ok: false, message: "Couldn't retry. Please try again." };
  }
}
