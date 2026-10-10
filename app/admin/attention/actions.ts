"use server";

import { revalidatePath } from "next/cache";
import { getAdminActor, parseId } from "@/server/admin/actor";
import { snoozeStuck, STUCK_REASONS, type StuckReason } from "@/server/ops/stuck";
import { releaseOutboxForResend } from "@/lib/db/repositories/outbox.repository";
import { deliverOutbox } from "@/server/approvals/service";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";

// FN2 / FN11: IT's actions on the Needs attention list. Snoozing hides a
// finding for a while (audited); Resend gives a request's unsent messages
// fresh tries without ever sending one twice.
export async function snoozeStuckAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor();
  const requestId = parseId(formData.get("requestId"));
  const reason = String(formData.get("reason") ?? "") as StuckReason;
  const days = Number(formData.get("days"));
  if (!actor || requestId === null || !(reason in STUCK_REASONS)) return { ok: false, message: "Not found." };
  if (![1, 3, 7, 14, 30].includes(days)) return { ok: false, message: "Choose how long.", fieldErrors: { days: "Choose 1, 3, 7, 14 or 30 days." } };
  const note = String(formData.get("note") ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (note.length < 3) return { ok: false, message: "Say why.", fieldErrors: { note: "Say why, e.g. waiting for the vendor's quote." } };
  try {
    await snoozeStuck({ requestId, reason, days, note, userId: actor.id });
    await recordAudit({ actorUserId: actor.id, action: "STUCK_SNOOZED", entityType: "REQUEST", entityId: requestId, sessionId: actor.sessionId, ipAddress: actor.ipAddress, metadata: { reason, days, note } });
  } catch (error) {
    logError("snoozeStuckAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
  revalidatePath("/admin/attention");
  return { ok: true, message: `Hidden for ${days} day${days === 1 ? "" : "s"}.` };
}

export async function resendRequestMessagesAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor();
  const requestId = parseId(formData.get("requestId"));
  if (!actor || requestId === null) return { ok: false, message: "Not found." };
  try {
    const ids = await releaseOutboxForResend({ requestId });
    if (!ids.length) return { ok: false, message: "Nothing to resend: the messages were sent, or are being sent right now." };
    const sent = await deliverOutbox(ids);
    await recordAudit({ actorUserId: actor.id, action: "OUTBOX_RESENT", entityType: "REQUEST", entityId: requestId, sessionId: actor.sessionId, ipAddress: actor.ipAddress, metadata: { released: ids.length, sent } });
    revalidatePath("/admin/attention");
    return sent === ids.length ? { ok: true, message: `Sent ${sent} message${sent === 1 ? "" : "s"}.` } : { ok: false, message: `Sent ${sent} of ${ids.length}. The rest will be tried again by the job runner.` };
  } catch (error) {
    logError("resendRequestMessagesAction failed", error);
    return { ok: false, message: "Couldn't resend. Please try again." };
  }
}
