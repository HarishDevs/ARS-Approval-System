import "server-only";
import { workMirrorLink, WORK_MIRROR_KEY } from "@/server/approvals/work-mirror";
import { afterResponse } from "@/lib/http/after-response";

import type { RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { insertOutbox } from "@/lib/db/repositories/outbox.repository";
import { nextRequestNumber } from "@/lib/db/repositories/approvals.repository";
import { appendTaskEvent, findTask, insertTask, type TaskRecord } from "@/lib/db/repositories/tasks.repository";
import * as repo from "@/lib/db/repositories/work.repository";
import { deliverOutbox } from "@/server/approvals/service";
import { taskMessages } from "@/server/modules/messages";
import { OPEN_STATUSES } from "@/server/modules/task-rules";
import { indiaDate } from "@/server/workflows/calendar";
import { nearestWorkingDay } from "@/server/work/holidays";
import { departmentOf, holidayContext, loadSetting } from "@/server/work/holiday-store";
import { daysBetween, nextOccurrence, parseRecurrence, parseRecurrenceSettings, RECURRENCE_SETTINGS_KEY } from "@/server/work/more-rules";
import { positionBetween } from "@/server/work/rules";
import { logError } from "@/lib/logging/logger";
import type { NotifyInput } from "@/server/notifications/notify";

// QA-WF-03 (v1.42.1): a repeat or copy of a task is never a request's work step.
const withoutMirrorLink = (formData: Record<string, unknown>) => Object.fromEntries(Object.entries(formData).filter(([key]) => key !== WORK_MIRROR_KEY));

// D-218: what happens after a task is completed, however it was completed
// (the tick in a list, the task page): people waiting for it hear when it
// was the last task they waited for, and a repeating task makes its next one.
const info = (task: Pick<TaskRecord, "id" | "taskNo" | "title" | "dueAt">) => ({ id: task.id, taskNo: task.taskNo, title: task.title, dueAt: task.dueAt });

export async function afterTaskCompleted(taskId: number, actor: { id: number; name: string }): Promise<void> {
  try {
    await tellUnblocked(taskId);
  } catch (error) {
    logError("tellUnblocked failed", error);
  }
  try {
    await createNextOccurrence(taskId, actor);
  } catch (error) {
    logError("createNextOccurrence failed", error, { taskId });
  }
}

async function tellUnblocked(taskId: number): Promise<void> {
  const deps = await repo.listDependencies(taskId);
  const messages: NotifyInput[] = [];
  for (const blocked of deps.blocking) {
    if (!OPEN_STATUSES.includes(blocked.status)) continue;
    const others = await repo.listDependencies(blocked.id);
    if (others.blockedBy.every((item) => !OPEN_STATUSES.includes(item.status))) {
      const full = await findTask(blocked.id);
      if (full) messages.push(taskMessages.unblocked(info(full), full.assigneeId));
    }
  }
  if (messages.length) {
    const ids = await insertOutbox(null, messages, getDbPool());
    await afterResponse("task completion messages", () => deliverOutbox(ids));
  }
}

// The next task of a series. The rule moves to the new task (the completed
// one keeps none), so reopening and completing again never makes two.
export async function createNextOccurrence(taskId: number, actor: { id: number; name: string }): Promise<number | null> {
  const settings = parseRecurrenceSettings(await loadSetting(RECURRENCE_SETTINGS_KEY));
  if (!settings.enabled) return null;
  const outcome = await withTransaction(async (connection) => {
    const task = await findTask(taskId, connection, true);
    if (!task || task.deletedAt || task.status !== "COMPLETED") return null;
    const [rows] = await connection.query<RowDataPacket[]>("SELECT recurrence_json, series_id FROM tasks WHERE id = ?", [taskId]);
    const rule = parseRecurrence(rows[0]?.recurrence_json ?? null);
    if (!rule) return null;
    const dueDay = task.dueAt ? indiaDate(task.dueAt) : null;
    // QA-WF-04 (v1.42.1): from the series' planned day and day of the month, not the last (moved) due day.
    const occurrence = nextOccurrence(rule, dueDay, indiaDate(task.completedAt ?? new Date()));
    let next = occurrence.planned;
    if (settings.skipHolidays) {
      const { settings: holidays, calendar } = await holidayContext(connection, await departmentOf(task.assigneeId, connection));
      if (holidays.mode !== "OFF") next = nearestWorkingDay(next, calendar, holidays, "NEXT");
    }
    const shift = dueDay ? daysBetween(dueDay, next) : 0;
    const dueAt = task.dueAt ? new Date(task.dueAt.getTime() + shift * 86_400_000) : new Date(`${next}T23:59:00+05:30`);
    const seriesId = rows[0]?.series_id ? Number(rows[0].series_id) : task.id;
    const newId = await cloneTask(task, { parentId: task.parentTaskId, rootId: task.rootTaskId, depth: task.depth, dueAt, shiftDays: shift, recurrence: JSON.stringify(occurrence.rule), seriesId, withProjects: true }, actor.id, connection);
    await connection.query("UPDATE tasks SET recurrence_json = NULL, series_id = ? WHERE id = ?", [seriesId, task.id]);
    const created = (await findTask(newId, connection))!;
    await appendTaskEvent(task.id, { actorId: actor.id, type: "RECURRED", body: `Next: ${created.taskNo}, due ${next}`, payload: { nextId: newId } }, connection);
    await recordAudit({ actorUserId: actor.id, action: "TASK_RECURRED", entityType: "TASK", entityId: newId, metadata: { from: task.id, due: next } }, connection);
    const messages = created.assigneeId !== actor.id ? [taskMessages.assigned(info(created), created.assigneeId, `${actor.name} (repeating task)`)] : [];
    return { newId, outbox: await insertOutbox(null, messages, connection) };
  });
  if (!outcome) return null;
  if (outcome.outbox.length) await afterResponse("next occurrence messages", () => deliverOutbox(outcome.outbox));
  return outcome.newId;
}

// A fresh, open copy of a task and its subtasks: title, description,
// priority, assignee, form values, tags, followers, (optionally) projects.
async function cloneTask(
  source: TaskRecord,
  place: { parentId: number | null; rootId: number | null; depth: number; dueAt: Date | null; shiftDays: number; recurrence: unknown; seriesId: number | null; withProjects: boolean },
  actorId: number,
  db: Queryable,
): Promise<number> {
  const taskNo = await nextRequestNumber("TSK", db);
  const id = await insertTask(
    { taskNo, typeVersionId: source.typeVersionId, title: source.title, description: source.description, priority: source.priority, createdBy: actorId, assigneeId: source.assigneeId, dueAt: place.dueAt, startsOn: source.startsOn ? shiftDay(source.startsOn, place.shiftDays) : null, formData: withoutMirrorLink(source.formData), relatedRequestId: workMirrorLink(source.formData) ? null : source.relatedRequestId, submissionKey: null },
    db,
  );
  const position = place.parentId === null ? 0 : positionBetween(await repo.lastSubtaskPosition(place.parentId, db), null);
  await repo.setTaskTree(id, { parentTaskId: place.parentId, rootTaskId: place.rootId, depth: place.depth, position }, db);
  await db.query("UPDATE tasks SET recurrence_json = ?, series_id = ?, is_milestone = ? WHERE id = ?", [place.recurrence === null || place.recurrence === undefined ? null : typeof place.recurrence === "string" ? place.recurrence : JSON.stringify(place.recurrence), place.seriesId, source.isMilestone, id]);
  await appendTaskEvent(id, { actorId, type: "CREATED", to: "OPEN", body: place.seriesId ? "Repeats" : null, payload: { copiedFrom: source.id } }, db);
  if (place.withProjects) {
    for (const link of await repo.listTaskProjects(source.id, db)) {
      const rows = await repo.sectionPositions(link.projectId, link.sectionId, db);
      await repo.placeTaskInProject(id, link.projectId, link.sectionId, positionBetween(rows.at(-1)?.position ?? null, null), actorId, db);
    }
  }
  await db.query("INSERT IGNORE INTO task_tags (task_id, tag_id, added_by) SELECT ?, tag_id, ? FROM task_tags WHERE task_id = ?", [id, actorId, source.id]);
  await db.query("INSERT IGNORE INTO task_followers (task_id, user_id, source, added_by) SELECT ?, user_id, source, ? FROM task_followers WHERE task_id = ?", [id, actorId, source.id]);
  await db.query("INSERT IGNORE INTO task_field_values (task_id, field_id, value, updated_by) SELECT ?, field_id, value, ? FROM task_field_values WHERE task_id = ?", [id, actorId, source.id]);
  for (const child of await repo.listSubtasks(source.id, db)) {
    const full = await findTask(child.id, db);
    if (!full || full.status === "CANCELLED") continue;
    const dueAt = full.dueAt ? new Date(full.dueAt.getTime() + place.shiftDays * 86_400_000) : null;
    await cloneTask(full, { parentId: id, rootId: place.rootId ?? id, depth: place.depth + 1, dueAt, shiftDays: place.shiftDays, recurrence: null, seriesId: null, withProjects: false }, actorId, db);
  }
  return id;
}

function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
