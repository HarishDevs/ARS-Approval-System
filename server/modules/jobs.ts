import "server-only";
import { claimTaskReminder, listTasksForReminders } from "@/lib/db/repositories/tasks.repository";
import { claimAckReminder, listAckReminders } from "@/lib/db/repositories/info.repository";
import { insertOutbox } from "@/lib/db/repositories/outbox.repository";
import { getDbPool } from "@/lib/db/client";
import { deliverOutbox } from "@/server/approvals/service";
import { infoMessages, taskMessages } from "@/server/modules/messages";
import { parseInfoSettings, parseTaskSettings } from "@/server/modules/settings";
import { departmentOf, holidayContext } from "@/server/work/holiday-store";
import type { RowDataPacket } from "mysql2/promise";
import { holidayName } from "@/server/work/holidays";
import { runWorkDigest } from "@/server/work/service-more";
import { sendMeetingReminders } from "@/server/meetings/service";
import { indiaDate } from "@/server/workflows/calendar";

// v1.9.0: reminders of the Task and Information modules (job runner step
// "modules"). Each reminder is claimed first (a unique key per task, kind
// and due time; a timestamp per recipient), so overlapping runs never send
// the same one twice. A new due time gives a new reminder.
export async function runModuleReminders(now = new Date()): Promise<{ taskDueSoon: number; taskOverdue: number; infoAckReminders: number; taskDigests: number; meetingReminders: number }> {
  let taskDueSoon = 0;
  let taskOverdue = 0;
  let infoAckReminders = 0;
  const queued: number[] = [];
  const db = getDbPool();

  // D-217: on a holiday, task reminders wait for the next working day (Admin → Task holidays).
  const { settings: holidays, calendar } = await holidayContext();
  const holidayToday = holidays.holdReminders && holidays.mode !== "OFF" && holidayName(indiaDate(now), calendar, holidays) !== null;
  // D-218: a department's own holiday holds its people's reminders too.
  const [deptRows] = await db.query<RowDataPacket[]>("SELECT department_id FROM department_holidays WHERE holiday_on = ?", [indiaDate(now)]);
  const deptOff = new Set(deptRows.map((row) => Number(row.department_id)));
  const deptOf = new Map<number, number | null>();
  for (const task of holidayToday ? [] : await listTasksForReminders(500)) {
    if (holidays.holdReminders && holidays.mode !== "OFF" && deptOff.size) {
      if (!deptOf.has(task.assigneeId)) deptOf.set(task.assigneeId, await departmentOf(task.assigneeId));
      const dept = deptOf.get(task.assigneeId);
      if (dept && deptOff.has(dept)) continue;
    }
    const settings = parseTaskSettings(task.settings);
    const stamp = Math.floor(task.dueAt.getTime() / 60_000).toString(36);
    const info = { id: task.id, taskNo: task.taskNo, title: task.title, dueAt: task.dueAt };
    if (task.dueAt.getTime() < now.getTime()) {
      if (settings.overdueReminder && (await claimTaskReminder(task.id, `OVERDUE:${stamp}`))) {
        const to = [...new Set([task.assigneeId, task.createdBy])];
        queued.push(...(await insertOutbox(null, to.map((userId) => taskMessages.overdue(info, userId)), db)));
        taskOverdue += 1;
      }
    } else if (settings.reminderHoursBefore !== null && task.dueAt.getTime() - now.getTime() <= settings.reminderHoursBefore * 3_600_000) {
      if (await claimTaskReminder(task.id, `DUE_SOON:${stamp}`)) {
        queued.push(...(await insertOutbox(null, [taskMessages.dueSoon(info, task.assigneeId)], db)));
        taskDueSoon += 1;
      }
    }
  }

  for (const row of await listAckReminders(1000)) {
    const settings = parseInfoSettings(row.settings);
    if (settings.ackReminderDays === null) continue;
    if (now.getTime() - row.publishedAt.getTime() < settings.ackReminderDays * 86_400_000) continue;
    if (await claimAckReminder(row.infoId, row.userId)) {
      queued.push(...(await insertOutbox(null, [infoMessages.ackReminder({ id: row.infoId, infoNo: row.infoNo, title: row.title, ackRequired: true }, row.userId)], db)));
      infoAckReminders += 1;
    }
  }
  // A few straight away; the outbox step sends the rest on this or the next run.
  if (queued.length) await deliverOutbox(queued.slice(0, 50)).catch(() => undefined);
  // D-218: the morning task summary (Admin → Task settings).
  const taskDigests = (await runWorkDigest(now).catch(() => ({ digests: 0 }))).digests;
  // v1.51.0 (D-300): meeting points and MOM deadline reminders to the Coordinator (once per deadline).
  const meetingReminders = await sendMeetingReminders().catch(() => 0);
  return { taskDueSoon, taskOverdue, infoAckReminders, taskDigests, meetingReminders };
}
