"use server";

import { revalidatePath } from "next/cache";
import { getAdminActor } from "@/server/admin/actor";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";
import { holidaySettingsSchema, HOLIDAY_MODES } from "@/server/work/holidays";
import { addDepartmentHoliday, loadHolidaySettings, loadSetting, removeDepartmentHoliday, saveHolidaySettings, saveJsonSetting } from "@/server/work/holiday-store";
import { DIGEST_SETTINGS_KEY, digestSettingsSchema, parseDigestSettings, parseRecurrenceSettings, RECURRENCE_SETTINGS_KEY, recurrenceSettingsSchema } from "@/server/work/more-rules";
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

// D-218: the morning summary and repeating tasks.
export async function saveTaskExtrasAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor("admin.task_holidays");
  if (!actor) return NOT_FOUND;
  const hour = Number(formData.get("digestHour"));
  const digest = digestSettingsSchema.safeParse({ enabled: formData.get("digestEnabled") === "on", hour: Number.isInteger(hour) ? hour : 9, workingDaysOnly: formData.get("digestWorkingDays") === "on" });
  const recurrence = recurrenceSettingsSchema.safeParse({ enabled: formData.get("recurrenceEnabled") === "on", skipHolidays: formData.get("recurrenceSkipHolidays") === "on" });
  if (!digest.success || !recurrence.success) return { ok: false, message: "Check the choices (the summary hour is 5 to 12)." };
  try {
    const before = { digest: parseDigestSettings(await loadSetting(DIGEST_SETTINGS_KEY)), recurrence: parseRecurrenceSettings(await loadSetting(RECURRENCE_SETTINGS_KEY)) };
    await saveJsonSetting(DIGEST_SETTINGS_KEY, digest.data, actor.id);
    await saveJsonSetting(RECURRENCE_SETTINGS_KEY, recurrence.data, actor.id);
    await recordAudit({ actorUserId: actor.id, action: "TASK_SETTINGS", entityType: "SETTING", entityId: "tasks.digest+recurrence", sessionId: actor.sessionId, ipAddress: actor.ipAddress, metadata: { before, after: { digest: digest.data, recurrence: recurrence.data } } });
  } catch (error) {
    logError("saveTaskExtrasAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
  revalidatePath("/admin/task-holidays");
  return { ok: true, message: "Saved." };
}

// D-218: holidays of one department (on top of the organisation's).
export async function departmentHolidayAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor("admin.task_holidays");
  if (!actor) return NOT_FOUND;
  const date = day(formData.get("date"));
  const department = Number(formData.get("department"));
  const command = String(formData.get("command") ?? "add");
  if (!date) return { ok: false, message: "Choose a date.", fieldErrors: { date: "Choose a date." } };
  if (!Number.isInteger(department) || department <= 0) return { ok: false, message: "Choose a department.", fieldErrors: { department: "Choose a department." } };
  try {
    if (command === "remove") {
      if (!(await removeDepartmentHoliday(department, date))) return { ok: false, message: "That holiday isn't in the list." };
      await recordAudit({ actorUserId: actor.id, action: "DEPARTMENT_HOLIDAY_REMOVED", entityType: "CALENDAR", entityId: `${department}:${date}`, sessionId: actor.sessionId, ipAddress: actor.ipAddress });
    } else {
      const name = String(formData.get("name") ?? "").trim();
      if (name.length < 2 || name.length > 100) return { ok: false, message: "Give the holiday a name.", fieldErrors: { name: "Enter a name." } };
      if (!(await addDepartmentHoliday(department, date, name, actor.id))) return { ok: false, message: "That department already has a holiday that day.", fieldErrors: { date: "Already a holiday." } };
      await recordAudit({ actorUserId: actor.id, action: "DEPARTMENT_HOLIDAY_ADDED", entityType: "CALENDAR", entityId: `${department}:${date}`, sessionId: actor.sessionId, ipAddress: actor.ipAddress, metadata: { name } });
    }
  } catch (error) {
    logError("departmentHolidayAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
  revalidatePath("/admin/task-holidays");
  return { ok: true, message: command === "remove" ? "Removed." : "Added." };
}
