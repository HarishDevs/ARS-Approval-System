"use server";

import { revalidatePath } from "next/cache";
import { getAdminActor } from "@/server/admin/actor";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";
import { holidaySettingsSchema, HOLIDAY_MODES } from "@/server/work/holidays";
import { loadHolidaySettings, saveHolidaySettings } from "@/server/work/holiday-store";
import { personFacts } from "@/lib/db/repositories/tasks.repository";
import { moveHolidayTasks, tellHolidayTasks } from "@/server/work/service";

// D-217: Admin → Task holidays. IT (with access to the page) sets what tasks
// do on holidays, and moves or tells about tasks due on a holiday.
const NOT_FOUND: ActionResult = { ok: false, message: "Not found." };
const day = (value: FormDataEntryValue | null) => (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);

export async function saveTaskHolidaySettingsAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor("admin.task_holidays");
  if (!actor) return NOT_FOUND;
  const mode = String(formData.get("mode") ?? "");
  const parsed = holidaySettingsSchema.safeParse({
    mode: (HOLIDAY_MODES as readonly string[]).includes(mode) ? mode : "WARN",
    weeklyOff: formData.get("weeklyOff") === "on",
    suggest: formData.get("suggest") === "PREVIOUS" ? "PREVIOUS" : "NEXT",
    checkStart: formData.get("checkStart") === "on",
    holdReminders: formData.get("holdReminders") === "on",
    showOnCalendars: formData.get("showOnCalendars") === "on",
    notifyNewHoliday: formData.get("notifyNewHoliday") === "on",
  });
  if (!parsed.success) return { ok: false, message: "Check the choices." };
  try {
    const before = await loadHolidaySettings();
    await saveHolidaySettings(parsed.data, actor.id);
    await recordAudit({ actorUserId: actor.id, action: "TASK_HOLIDAY_SETTINGS", entityType: "SETTING", entityId: "tasks.holidays", sessionId: actor.sessionId, ipAddress: actor.ipAddress, metadata: { before, after: parsed.data } });
  } catch (error) {
    logError("saveTaskHolidaySettingsAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
  revalidatePath("/admin/task-holidays");
  return { ok: true, message: "Saved. Task dates are checked this way from now on." };
}

export async function holidayTasksAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor("admin.task_holidays");
  if (!actor) return NOT_FOUND;
  const date = day(formData.get("date"));
  const command = String(formData.get("command") ?? "");
  if (!date) return NOT_FOUND;
  try {
    const who = { id: actor.id, name: (await personFacts(actor.id))?.name ?? "IT", roles: actor.roles, sessionId: actor.sessionId, ipAddress: actor.ipAddress };
    const result = command === "TELL" ? await tellHolidayTasks(date, who) : await moveHolidayTasks(date, command === "PREVIOUS" ? "PREVIOUS" : "NEXT", who);
    if (!result.ok) return { ok: false, message: result.message };
    revalidatePath("/admin/task-holidays");
    return { ok: true, message: result.message ?? "Done." };
  } catch (error) {
    logError("holidayTasksAction failed", error);
    return { ok: false, message: "Couldn't do that. Please try again." };
  }
}
