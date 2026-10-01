"use server";

import { revalidatePath } from "next/cache";
import { getAdminActor } from "@/server/admin/actor";
import { addHoliday, getWorkingDays, removeHoliday, setWorkingDays } from "@/lib/db/repositories/calendar.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { WEEKDAYS, type Weekday } from "@/server/workflows/calendar";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";

// Working calendar (F-31, D-067). Applies to approvals that start after the
// change; existing due times stay as they were.
const NOT_FOUND: ActionResult = { ok: false, message: "Not found." };

export async function saveWorkingDaysAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor();
  if (!actor) return NOT_FOUND;
  const days = formData.getAll("day").map(String).filter((day): day is Weekday => (WEEKDAYS as readonly string[]).includes(day));
  if (days.length === 0) return { ok: false, message: "Choose at least one working day." };
  try {
    const before = await getWorkingDays();
    await setWorkingDays(days, actor.id);
    await recordAudit({ actorUserId: actor.id, action: "WORKING_DAYS_CHANGED", entityType: "CALENDAR", entityId: "working_days", sessionId: actor.sessionId, ipAddress: actor.ipAddress, metadata: { before, after: days } });
  } catch (error) {
    logError("saveWorkingDaysAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
  revalidatePath("/admin/calendar");
  return { ok: true, message: "Saved. New approvals use these days." };
}

export async function holidayAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor();
  if (!actor) return NOT_FOUND;
  const date = String(formData.get("date") ?? "");
  const command = formData.get("command");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, message: "Choose a date.", fieldErrors: { date: "Choose a date." } };
  try {
    if (command === "remove") {
      if (!(await removeHoliday(date))) return { ok: false, message: "That holiday isn't in the list." };
      await recordAudit({ actorUserId: actor.id, action: "HOLIDAY_REMOVED", entityType: "CALENDAR", entityId: date, sessionId: actor.sessionId, ipAddress: actor.ipAddress });
    } else {
      const name = String(formData.get("name") ?? "").trim();
      if (name.length < 2 || name.length > 100) return { ok: false, message: "Give the holiday a name.", fieldErrors: { name: "Enter a name." } };
      await addHoliday(date, name, actor.id);
      await recordAudit({ actorUserId: actor.id, action: "HOLIDAY_ADDED", entityType: "CALENDAR", entityId: date, sessionId: actor.sessionId, ipAddress: actor.ipAddress, metadata: { name } });
    }
  } catch (error) {
    if ((error as { code?: string })?.code === "ER_DUP_ENTRY") return { ok: false, message: "That date is already a holiday.", fieldErrors: { date: "Already a holiday." } };
    logError("holidayAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
  revalidatePath("/admin/calendar");
  return { ok: true, message: command === "remove" ? "Removed." : "Added." };
}
