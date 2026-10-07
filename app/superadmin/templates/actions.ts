"use server";

import { revalidatePath } from "next/cache";
import { requireApiArea } from "@/server/authorization/guards";
import { withTransaction } from "@/lib/db/transaction";
import { saveRegisteredTemplate } from "@/lib/db/repositories/whatsapp.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { findTemplateEntry } from "@/server/notifications/templates";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";

// /superadmin/templates (S6-04, F-42): record the Meta-approved name of a
// catalogue template and switch it on or off. Super Admin only.
export async function saveTemplateAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let session;
  try {
    session = await requireApiArea("superadmin");
  } catch {
    return { ok: false, message: "Not found." };
  }
  const entry = findTemplateEntry(String(formData.get("code") ?? ""));
  if (!entry) return { ok: false, message: "Not found." };
  const providerName = String(formData.get("providerName") ?? "").trim();
  const on = formData.get("on") === "on";
  if (providerName && !/^[a-z0-9_]{1,512}$/.test(providerName)) {
    return { ok: false, message: "Check the name.", fieldErrors: { providerName: "Use the exact name from CEOITBox: lowercase letters, numbers and _." } };
  }
  if (on && !providerName) return { ok: false, message: "Check the name.", fieldErrors: { providerName: "Enter the approved template name before switching it on." } };
  try {
    await withTransaction(async (connection) => {
      await saveRegisteredTemplate({ code: entry.code, eventType: entry.eventType, providerName: providerName || null, on, variables: entry.variables }, session.user.id, connection);
      await recordAudit(
        { actorUserId: session.user.id, action: "WHATSAPP_TEMPLATE_SAVED", entityType: "WHATSAPP_TEMPLATE", entityId: entry.code, sessionId: session.sessionId, metadata: { providerName: providerName || null, on } },
        connection,
      );
    });
  } catch (error) {
    logError("saveTemplateAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
  revalidatePath("/superadmin/templates");
  return { ok: true, message: on ? "Saved and switched on. WhatsApp messages for this event now use it." : "Saved. It stays off until you tick \"Approved by Meta\"." };
}
