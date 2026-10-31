"use server";

import { revalidatePath } from "next/cache";
import { requireApiArea } from "@/server/authorization/guards";
import { CHANNELS, DND_SETTING, EVENT_GROUPS, parseDnd } from "@/server/notifications/preferences";
import { saveOptOuts } from "@/lib/db/repositories/preferences.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { getDbPool } from "@/lib/db/client";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";

// #6 / D-231: a person's own notification choices: every kind of message for
// the app, email and WhatsApp (a ticked box = send), the morning summary and
// Do not disturb. A group with every kind off is kept as one group choice.
const HOUR = 3_600_000;
function pauseUntil(choice: string, now: Date): string | null | undefined {
  if (choice === "resume") return null;
  if (choice === "1h") return new Date(now.getTime() + HOUR).toISOString();
  if (choice === "3h") return new Date(now.getTime() + 3 * HOUR).toISOString();
  if (choice === "week") return new Date(now.getTime() + 7 * 24 * HOUR).toISOString();
  if (choice === "tomorrow") {
    // 9:00 India time tomorrow (03:30 UTC).
    const india = new Date(now.getTime() + 330 * 60_000);
    return new Date(Date.UTC(india.getUTCFullYear(), india.getUTCMonth(), india.getUTCDate() + 1, 3, 30)).toISOString();
  }
  return undefined; // keep what was there
}

export async function savePreferencesAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let session;
  try {
    session = await requireApiArea("users");
  } catch {
    return { ok: false, message: "Not found." };
  }
  const userId = session.user.id;
  const off = new Set<string>();
  for (const group of EVENT_GROUPS.filter((item) => !item.mandatory)) {
    for (const channel of CHANNELS) {
      const offEvents = group.events.filter((event) => formData.get(`E:${event}:${channel}`) !== "on");
      if (offEvents.length === group.events.length) off.add(`${group.key}:${channel}`);
      else for (const event of offEvents) off.add(`E:${event}:${channel}`);
    }
  }
  try {
    const db = getDbPool();
    await saveOptOuts(userId, off);
    // The morning summary of tasks (D-218 work.digest).
    if (formData.get("digest") === "on") await db.query("DELETE FROM user_settings WHERE user_id = ? AND setting_key = 'work.digest'", [userId]);
    else await db.query("INSERT INTO user_settings (user_id, setting_key, value) VALUES (?, 'work.digest', 'OFF') ON DUPLICATE KEY UPDATE value = 'OFF'", [userId]);
    // Do not disturb.
    const [rows] = await db.query<import("mysql2/promise").RowDataPacket[]>("SELECT value FROM user_settings WHERE user_id = ? AND setting_key = ?", [userId, DND_SETTING]);
    const before = parseDnd(rows[0]?.value ?? null);
    const paused = pauseUntil(String(formData.get("pause") ?? "keep"), new Date());
    const dnd = parseDnd({
      pausedUntil: paused === undefined ? before.pausedUntil : paused,
      quiet: formData.get("quiet") === "on" ? { from: String(formData.get("quietFrom") ?? ""), to: String(formData.get("quietTo") ?? "") } : null,
      daysOff: formData.getAll("dayOff").map((value) => Number(value)),
    });
    await db.query("INSERT INTO user_settings (user_id, setting_key, value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [userId, DND_SETTING, JSON.stringify(dnd)]);
    await recordAudit({ actorUserId: userId, action: "NOTIFICATION_PREFERENCES_CHANGED", entityType: "USER", entityId: userId, sessionId: session.sessionId, metadata: { off: [...off], dnd } });
  } catch (error) {
    logError("savePreferencesAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
  revalidatePath("/users/notifications/settings");
  return { ok: true, message: "Saved. Everything still appears under Notifications here." };
}
