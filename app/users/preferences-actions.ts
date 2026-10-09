"use server";

import { revalidatePath } from "next/cache";
import { requireApiArea } from "@/server/authorization/guards";
import { EVENT_GROUPS } from "@/server/notifications/preferences";
import { saveOptOuts } from "@/lib/db/repositories/preferences.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";

// #6: a person's own email / WhatsApp choices. A ticked box = send.
export async function savePreferencesAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let session;
  try {
    session = await requireApiArea("users");
  } catch {
    return { ok: false, message: "Not found." };
  }
  const off = new Set<string>();
  for (const group of EVENT_GROUPS.filter((item) => !item.mandatory)) {
    for (const channel of ["EMAIL", "WHATSAPP"] as const) {
      if (formData.get(`${group.key}:${channel}`) !== "on") off.add(`${group.key}:${channel}`);
    }
  }
  try {
    await saveOptOuts(session.user.id, off);
    await recordAudit({ actorUserId: session.user.id, action: "NOTIFICATION_PREFERENCES_CHANGED", entityType: "USER", entityId: session.user.id, sessionId: session.sessionId, metadata: { off: [...off] } });
  } catch (error) {
    logError("savePreferencesAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
  revalidatePath("/users/notifications/settings");
  return { ok: true, message: "Saved. Everything still appears under Notifications here." };
}
