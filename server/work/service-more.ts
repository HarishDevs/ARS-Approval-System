import "server-only";
import { workMirrorLink } from "@/server/approvals/work-mirror";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { appBaseUrl } from "@/lib/http/app-url";
import { getDbPool, type Queryable } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { insertOutbox } from "@/lib/db/repositories/outbox.repository";
import { nextRequestNumber } from "@/lib/db/repositories/approvals.repository";
import { appendTaskEvent, findTask, insertTask } from "@/lib/db/repositories/tasks.repository";
import * as repo from "@/lib/db/repositories/work.repository";
import { deliverOutbox } from "@/server/approvals/service";
import { indiaDate } from "@/server/workflows/calendar";
import { OPEN_STATUSES } from "@/server/modules/task-rules";
import type { TaskActor } from "@/server/modules/tasks";
import { projectAbilities, type ProjectRole } from "@/server/work/access";
import { DEFAULT_HOLIDAY_SETTINGS, holidayName, nearestWorkingDay } from "@/server/work/holidays";
import { holidayContext, loadSetting } from "@/server/work/holiday-store";
import {
  checkFieldValue,
  cleanFieldOptions,
  countTemplateTasks,
  daysBetween,
  DIGEST_SETTINGS_KEY,
  digestText,
  FIELD_KINDS,
  MAX_FIELDS_PER_PROJECT,
  parseDigestSettings,
  parseRecurrence,
  parseRecurrenceSettings,
  parseTemplate,
  RECURRENCE_SETTINGS_KEY,
  recurrenceLabel,
  shiftDays,
  type FieldKind,
  type ProjectTemplate,
  type Recurrence,
  type TemplateTask,
} from "@/server/work/more-rules";
import { rightsOn, workViewer } from "@/server/work/task-access";
import * as work from "@/server/work/service";
import type { HolidayHit } from "@/server/work/holidays";
import type { NotifyInput } from "@/server/notifications/notify";

// D-218: the rest of Task & Project Management: recurring tasks, custom
// fields, project templates and duplication, bulk actions, the daily digest.
type Result<T = undefined> = { ok: true; value: T; message?: string } | { ok: false; message: string; fieldErrors?: Record<string, string>; holiday?: HolidayHit };
const fail = (message: string, fieldErrors?: Record<string, string>): { ok: false; message: string; fieldErrors?: Record<string, string> } => ({ ok: false, message, fieldErrors });
const NOT_FOUND = "Not found.";

// ---- recurring tasks -------------------------------------------------------------------
export async function setRecurrence(taskId: number, raw: unknown, actor: TaskActor): Promise<Result> {
  const task = await findTask(taskId);
  if (!task || task.deletedAt) return fail(NOT_FOUND);
  const rights = await rightsOn(task, await workViewer(actor));
  if (!rights.view) return fail(NOT_FOUND);
  // QA-WF-03 (v1.42.1): a work step doesn't repeat (its request decides when there's work).
  if (workMirrorLink(task.formData)) return fail(`This task is a work step of ${task.relatedRequestNo ?? "a request"}; it can't be made to repeat.`);
  // D-222: making a task periodic or ad hoc is a detail: an ad hoc task's creator decides.
  if (!rights.planning) return fail(rights.adhoc ? "Only its creator can change an ad hoc task's details." : "You can't change how this task repeats.");
  const settings = parseRecurrenceSettings(await loadSetting(RECURRENCE_SETTINGS_KEY));
  if (!settings.enabled && raw !== null) return fail("Repeating tasks are switched off (Admin → Task settings).");
  if (!OPEN_STATUSES.includes(task.status) && raw !== null) return fail("Reopen the task first.");
  // v1.54.4 (owner): "a periodic task can be created only for oneself; given to others it is ad hoc".
  if (raw !== null && task.assigneeId !== task.createdBy) return fail("Only a task you give yourself can repeat. A task for someone else is ad hoc.");
  const rule: Recurrence | null = raw === null ? null : parseRecurrence(raw);
  if (raw !== null && !rule) return fail("Choose how often it repeats.");
  await withTransaction(async (connection) => {
    await connection.query("UPDATE tasks SET recurrence_json = ?, series_id = COALESCE(series_id, id) WHERE id = ?", [rule ? JSON.stringify(rule) : null, taskId]);
    // D-219: a task that never repeated becomes ad hoc again when the rule is removed.
    if (!rule) await connection.query("UPDATE tasks t SET t.series_id = NULL WHERE t.id = ? AND t.series_id = t.id AND NOT EXISTS (SELECT 1 FROM (SELECT id FROM tasks WHERE series_id = ? AND id <> ?) other)", [taskId, taskId, taskId]);
    await appendTaskEvent(taskId, { actorId: actor.id, type: "REPEAT_SET", body: rule ? recurrenceLabel(rule) : "No longer repeats" }, connection);
  });
  return { ok: true, value: undefined, message: rule ? `Repeats: ${recurrenceLabel(rule)}. The next one is made when this one is completed.` : "It no longer repeats." };
}

export async function recurrenceOf(taskId: number, db: Queryable = getDbPool()): Promise<Recurrence | null> {
  const [rows] = await db.query<RowDataPacket[]>("SELECT recurrence_json FROM tasks WHERE id = ?", [taskId]);
  return parseRecurrence(rows[0]?.recurrence_json ?? null);
}

// ---- custom fields --------------------------------------------------------------------
async function editableProject(projectId: number, actor: TaskActor) {
  const viewer = await workViewer(actor);
  const found = await repo.projectFor(projectId, viewer);
  return found && projectAbilities(found.role).edit ? found : null;
}

export async function addField(projectId: number, input: { name: string; kind: string; options: string }, actor: TaskActor): Promise<Result<{ id: number }>> {
  const found = await editableProject(projectId, actor);
  if (!found) return fail("Only the project's owners and editors can add fields.");
  const name = input.name.replace(/\s+/g, " ").trim().slice(0, 60);
  if (name.length < 1) return fail("Give the field a name.", { name: "Give the field a name." });
  if (!(FIELD_KINDS as readonly string[]).includes(input.kind)) return fail("Choose a kind of field.");
  const kind = input.kind as FieldKind;
  const options = cleanFieldOptions(kind, input.options);
  if (kind === "SELECT" && options.length < 2) return fail("Give at least two choices, one per line.", { options: "Give at least two choices." });
  const fields = await repo.listProjectFields(projectId);
  if (fields.length >= MAX_FIELDS_PER_PROJECT) return fail(`A project has at most ${MAX_FIELDS_PER_PROJECT} fields.`);
  if (fields.some((field) => field.name.toLowerCase() === name.toLowerCase())) return fail("The project has a field with that name.", { name: "Choose another name." });
  const id = await repo.insertProjectField(projectId, name, kind, options, actor.id);
  await repo.appendProjectEvent(projectId, actor.id, "FIELD_ADDED", name, getDbPool());
  return { ok: true, value: { id }, message: `Field "${name}" added.` };
}

export async function removeField(fieldId: number, actor: TaskActor): Promise<Result> {
  const field = await repo.findProjectField(fieldId);
  if (!field || !(await editableProject(field.projectId, actor))) return fail(NOT_FOUND);
  await repo.removeProjectField(fieldId);
  await repo.appendProjectEvent(field.projectId, actor.id, "FIELD_REMOVED", field.name, getDbPool());
  return { ok: true, value: undefined, message: `Field "${field.name}" removed.` };
}

export async function setTaskField(taskId: number, fieldId: number, raw: string, actor: TaskActor): Promise<Result> {
  const field = await repo.findProjectField(fieldId);
  const task = await findTask(taskId);
  if (!field || !task || task.deletedAt) return fail(NOT_FOUND);
  const links = await repo.listTaskProjects(taskId);
  if (!links.some((link) => link.projectId === field.projectId)) return fail(NOT_FOUND);
  const rights = await rightsOn(task, await workViewer(actor));
  if (!rights.view) return fail(NOT_FOUND);
  if (!rights.planning) return fail(rights.adhoc ? "Only its creator can change an ad hoc task's details." : "You can't change this task.");
  const viewer = await workViewer(actor);
  const blocked = await work.fieldBlockedBy(taskId, `field:${fieldId}`, viewer);
  if (blocked) return fail(`In ${blocked}, only some people may change ${field.name} (Project permissions).`);
  const checked = checkFieldValue(field.kind, field.options, String(raw ?? ""));
  if (!checked.ok) return fail(`${field.name}: ${checked.message}`);
  await withTransaction(async (connection) => {
    await repo.setFieldValue(taskId, fieldId, checked.value, actor.id, connection);
    await appendTaskEvent(taskId, { actorId: actor.id, type: "FIELD_SET", body: `${field.name}: ${checked.value ?? "cleared"}` }, connection);
  });
  return { ok: true, value: undefined };
}

// ---- templates and duplication ----------------------------------------------------------
// A project's shape: sections, fields, open and completed tasks (not
// cancelled) with their subtasks; dates as days from the project's start.
async function projectShape(projectId: number, startOn: string | null): Promise<{ template: ProjectTemplate; start: string }> {
  const sections = await repo.listSections(projectId);
  const fields = await repo.listProjectFields(projectId);
  const items = (await repo.listProjectTasks(projectId)).filter((task) => task.status !== "CANCELLED" && task.parentTaskId === null);
  const dueDays = items.map((task) => (task.dueAt ? indiaDate(task.dueAt) : null)).filter((day): day is string => day !== null);
  const start = startOn ?? dueDays.sort()[0] ?? indiaDate(new Date());
  const values = await repo.fieldValues(items.map((task) => task.id));
  const byId = new Map(fields.map((field) => [field.id, field.name]));
  const toTemplate = async (id: number, section: number, level: number): Promise<TemplateTask | null> => {
    const task = await findTask(id);
    if (!task || task.deletedAt || task.status === "CANCELLED") return null;
    const subtasks = level < 5 ? (await Promise.all((await repo.listSubtasks(id)).map((child) => toTemplate(child.id, section, level + 1)))).filter((item): item is TemplateTask => item !== null) : [];
    const ownValues = values.get(id) ?? (await repo.fieldValues([id])).get(id) ?? {};
    return {
      title: task.title,
      description: task.description,
      priority: task.priority,
      section,
      dueOffset: task.dueAt ? daysBetween(start, indiaDate(task.dueAt)) : null,
      startOffset: task.startsOn ? daysBetween(start, task.startsOn) : null,
      isMilestone: task.isMilestone,
      tags: (await repo.listTaskItems(["t.id = ?"], [id], "t.id", 1)).items[0]?.tags.map((tag) => tag.name) ?? [],
      fields: Object.fromEntries(Object.entries(ownValues).flatMap(([fieldId, value]) => (byId.has(Number(fieldId)) ? [[byId.get(Number(fieldId))!, value]] : []))),
      subtasks,
    };
  };
  const tasks: TemplateTask[] = [];
  for (const item of items.sort((a, b) => a.position - b.position)) {
    const index = Math.max(0, sections.findIndex((section) => section.id === item.sectionId));
    const made = await toTemplate(item.id, index, 0);
    if (made) tasks.push(made);
  }
  return { template: { sections: sections.map((section) => section.name), fields: fields.map((field) => ({ name: field.name, kind: field.kind, options: field.options })), tasks }, start };
}

export async function saveAsTemplate(projectId: number, name: string, actor: TaskActor): Promise<Result<{ id: number }>> {
  const viewer = await workViewer(actor);
  const found = await repo.projectFor(projectId, viewer);
  if (!found || found.project.isTemplate) return fail(NOT_FOUND);
  if (!projectAbilities(found.role).edit) return fail("Only the project's owners and editors can save it as a template.");
  const title = name.replace(/\s+/g, " ").trim().slice(0, 150) || `${found.project.name} (template)`;
  const { template } = await projectShape(projectId, found.project.startOn);
  const id = await withTransaction(async (connection) => {
    const newId = await repo.insertProject(
      { name: title, description: found.project.description, color: found.project.color, departmentId: found.project.departmentId, privacy: found.project.privacy, defaultAccessRole: found.project.defaultAccessRole, defaultView: found.project.defaultView, ownerId: actor.id, startOn: null, dueOn: null },
      connection,
    );
    await repo.setTemplateBody(newId, template, connection);
    // The project's people may use the template; the one who saved it owns it.
    for (const member of found.members) await repo.setProjectMember(newId, member.type, member.id, "VIEWER", actor.id, connection);
    await repo.setProjectMember(newId, "USER", actor.id, "OWNER", actor.id, connection);
    await repo.appendProjectEvent(newId, actor.id, "TEMPLATE_SAVED", `From ${found.project.name}`, connection);
    await recordAudit({ actorUserId: actor.id, action: "PROJECT_TEMPLATE_SAVED", entityType: "PROJECT", entityId: newId, metadata: { from: projectId, tasks: countTemplateTasks(template.tasks) } }, connection);
    return newId;
  });
  return { ok: true, value: { id }, message: `Saved as the template "${title}".` };
}

export interface FromTemplateInput {
  name: string;
  startOn: string; // YYYY-MM-DD; "" = today
  privacy: string;
  departmentId: number | null;
}

// A new project from a template (or a copy of a project, `copyFrom`).
export async function createFromTemplate(source: { templateId?: number; copyFrom?: number; copyMembers?: boolean }, input: FromTemplateInput, actor: TaskActor): Promise<Result<{ id: number; tasks: number }>> {
  const viewer = await workViewer(actor);
  let template: ProjectTemplate | null = null;
  let base: repo.ProjectRecord | null = null;
  let members: repo.ProjectMember[] = [];
  let shapeStart: string | null = null;
  if (source.templateId) {
    const found = await repo.projectFor(source.templateId, viewer);
    if (!found?.project.isTemplate) return fail(NOT_FOUND);
    template = parseTemplate(await repo.templateBody(source.templateId));
    base = found.project;
  } else if (source.copyFrom) {
    const found = await repo.projectFor(source.copyFrom, viewer);
    if (!found || found.project.isTemplate) return fail(NOT_FOUND);
    if (!projectAbilities(found.role).edit) return fail("Only the project's owners and editors can copy it.");
    const shape = await projectShape(source.copyFrom, found.project.startOn);
    template = shape.template;
    shapeStart = shape.start;
    base = found.project;
    members = found.members;
  }
  if (!template || !base) return fail("That template can't be read.");
  const start = /^\d{4}-\d{2}-\d{2}$/.test(input.startOn) ? input.startOn : (shapeStart && !source.templateId ? shapeStart : indiaDate(new Date()));
  const created = await work.createProject(
    { name: input.name, description: base.description ?? "", color: base.color, privacy: input.privacy || base.privacy, departmentId: input.departmentId ?? base.departmentId, defaultAccessRole: base.defaultAccessRole, defaultView: base.defaultView, startOn: start, dueOn: "" },
    actor,
  );
  if (!created.ok) return created;
  const projectId = created.value.id;
  const general = await repo.generalTypeVersion();
  if (!general) return fail("The General task type is switched off.");
  const { settings: holidays, calendar } = await holidayContext();
  const onWorkingDay = (day: string) => (holidays.mode === "OFF" ? day : nearestWorkingDay(day, calendar, holidays, "NEXT"));
  let made = 0;
  await withTransaction(async (connection) => {
    // The template's sections replace the starter ones.
    const starter = await repo.listSections(projectId, connection);
    const sectionIds: number[] = [];
    for (const [index, name] of template!.sections.entries()) sectionIds.push(starter[index] ? starter[index]!.id : await repo.insertSection(projectId, name, (index + 1) * 1024, actor.id, connection));
    for (const [index, name] of template!.sections.entries()) await repo.updateSection(sectionIds[index]!, { name }, connection);
    for (const extra of starter.slice(template!.sections.length)) await repo.updateSection(extra.id, { deleted: true }, connection);
    const fieldIds = new Map<string, { id: number; kind: FieldKind; options: string[] }>();
    for (const field of template!.fields) fieldIds.set(field.name, { id: await repo.insertProjectField(projectId, field.name, field.kind, field.options, actor.id, connection), kind: field.kind, options: field.options });
    const make = async (item: TemplateTask, parent: { id: number; root: number; depth: number } | null) => {
      const taskNo = await nextRequestNumber("TSK", connection);
      const due = item.dueOffset === null ? null : onWorkingDay(shiftDays(start, item.dueOffset));
      const id = await insertTask(
        { taskNo, typeVersionId: general.versionId, title: item.title, description: item.description, priority: item.priority, createdBy: actor.id, assigneeId: actor.id, dueAt: due ? new Date(`${due}T23:59:00+05:30`) : null, startsOn: item.startOffset === null || item.isMilestone ? null : shiftDays(start, item.startOffset), formData: {}, relatedRequestId: null, submissionKey: null },
        connection,
      );
      made += 1;
      if (parent) await repo.setTaskTree(id, { parentTaskId: parent.id, rootTaskId: parent.root, depth: parent.depth + 1, position: made * 1024 }, connection);
      else await repo.placeTaskInProject(id, projectId, sectionIds[Math.min(item.section, sectionIds.length - 1)]!, made * 1024, actor.id, connection);
      if (item.isMilestone) await repo.setTaskWorkFields(id, { is_milestone: true }, connection);
      for (const tag of item.tags) await repo.setTaskTag(id, await repo.tagByName(tag, actor.id, "gray", connection), true, actor.id, connection);
      for (const [name, value] of Object.entries(item.fields)) {
        const field = fieldIds.get(name);
        const checked = field ? checkFieldValue(field.kind, field.options, value) : null;
        if (field && checked?.ok && checked.value !== null) await repo.setFieldValue(id, field.id, checked.value, actor.id, connection);
      }
      await repo.addFollower(id, actor.id, "CREATOR", actor.id, connection);
      await appendTaskEvent(id, { actorId: actor.id, type: "CREATED", to: "OPEN", body: source.templateId ? `From the template ${base!.name}` : `Copied with the project ${base!.name}` }, connection);
      for (const child of item.subtasks) await make(child, { id, root: parent?.root ?? id, depth: parent ? parent.depth + 1 : 0 });
    };
    for (const item of template!.tasks) await make(item, null);
    if (source.copyMembers)
      for (const member of members) if (!(member.type === "USER" && member.id === actor.id)) await repo.setProjectMember(projectId, member.type, member.id, member.role as ProjectRole, actor.id, connection);
    await repo.appendProjectEvent(projectId, actor.id, source.templateId ? "FROM_TEMPLATE" : "COPIED", base!.name, connection);
  });
  return { ok: true, value: { id: projectId, tasks: made }, message: `Project created with ${made} task${made === 1 ? "" : "s"}.` };
}

// ---- bulk actions ----------------------------------------------------------------------
export const BULK_OPS = ["COMPLETE", "ASSIGN", "DUE", "PRIORITY", "SECTION", "TAG", "DELETE"] as const;
export type BulkOp = (typeof BULK_OPS)[number];
export async function bulkTasks(ids: readonly number[], op: BulkOp, value: { assigneeId?: number; dueDay?: string; priority?: string; projectId?: number; sectionId?: number; tag?: string; holidayOk?: boolean }, actor: TaskActor): Promise<Result<{ done: number; failed: number }>> {
  const unique = [...new Set(ids)].slice(0, 200);
  if (!unique.length) return fail("Choose some tasks first.");
  let done = 0;
  let failed = 0;
  let firstProblem = "";
  for (const id of unique) {
    let result: { ok: boolean; message?: string; holiday?: HolidayHit };
    switch (op) {
      case "COMPLETE": {
        const task = await findTask(id);
        result = task && OPEN_STATUSES.includes(task.status) ? await work.toggleComplete(id, actor) : { ok: true };
        break;
      }
      case "ASSIGN":
        result = await work.setTaskFields(id, { assigneeId: value.assigneeId ?? 0 }, actor);
        break;
      case "DUE":
        result = await work.setTaskFields(id, { dueDay: value.dueDay ?? "", holidayOk: value.holidayOk }, actor);
        if (!result.ok && result.holiday && !value.holidayOk) return { ok: false, message: result.message ?? "", holiday: result.holiday };
        break;
      case "PRIORITY":
        result = await work.setTaskFields(id, { priority: value.priority ?? "" }, actor);
        break;
      case "SECTION":
        result = await work.moveInProject({ taskId: id, projectId: value.projectId ?? 0, sectionId: value.sectionId ?? 0, beforeId: null, afterId: null }, actor);
        break;
      case "TAG":
        result = await work.setTag(id, value.tag ?? "", true, actor);
        break;
      case "DELETE":
        result = await work.deleteTask(id, actor);
        break;
    }
    if (result.ok) done += 1;
    else {
      failed += 1;
      firstProblem ||= result.message ?? "";
    }
  }
  if (!done) return fail(firstProblem || "None of them could be changed.");
  return { ok: true, value: { done, failed }, message: `${done} task${done === 1 ? "" : "s"} changed${failed ? `; ${failed} not (${firstProblem})` : ""}.` };
}

// ---- daily digest ----------------------------------------------------------------------
// Each morning (India time, from the hour IT set, working days only if set)
// every active person with something due, overdue or newly given to them gets
// one summary (in-app and email), once a day; anyone may switch it off.
export async function runWorkDigest(now = new Date()): Promise<{ digests: number }> {
  const settings = parseDigestSettings(await loadSetting(DIGEST_SETTINGS_KEY));
  if (!settings.enabled) return { digests: 0 };
  const local = new Date(now.getTime() + 330 * 60_000);
  if (local.getUTCHours() < settings.hour) return { digests: 0 };
  const today = indiaDate(now);
  if (settings.workingDaysOnly) {
    const { calendar } = await holidayContext();
    if (holidayName(today, calendar, { ...DEFAULT_HOLIDAY_SETTINGS, weeklyOff: true }) !== null) return { digests: 0 };
  }
  const db = getDbPool();
  const dayStart = new Date(`${today}T00:00:00+05:30`);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const [people] = await db.query<RowDataPacket[]>(
    `SELECT u.id, u.name FROM users u WHERE u.active = TRUE AND u.is_break_glass = FALSE
       AND NOT EXISTS (SELECT 1 FROM user_settings s WHERE s.user_id = u.id AND s.setting_key = 'work.digest' AND s.value = 'OFF')
       AND NOT EXISTS (SELECT 1 FROM work_digest_sends d WHERE d.user_id = u.id AND d.day = ?)
       AND EXISTS (SELECT 1 FROM tasks t WHERE t.assignee_id = u.id AND t.deleted_at IS NULL AND t.status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED') AND (t.due_at < ? OR t.assigned_at >= ?))
     LIMIT 500`,
    [today, dayEnd, new Date(now.getTime() - 86_400_000)],
  );
  let sent = 0;
  const queued: number[] = [];
  for (const person of people) {
    const userId = Number(person.id);
    const [claim] = await db.query<ResultSetHeader>("INSERT IGNORE INTO work_digest_sends (user_id, day) VALUES (?, ?)", [userId, today]);
    if (claim.affectedRows !== 1) continue;
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT task_no, title, due_at, assigned_at, created_by FROM tasks WHERE assignee_id = ? AND deleted_at IS NULL AND status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED') AND (due_at < ? OR assigned_at >= ?) ORDER BY due_at LIMIT 200`,
      [userId, dayEnd, new Date(now.getTime() - 86_400_000)],
    );
    const item = (row: RowDataPacket) => ({ taskNo: String(row.task_no), title: String(row.title), dueDay: row.due_at ? indiaDate(row.due_at as Date) : null });
    const overdue = rows.filter((row) => row.due_at && (row.due_at as Date).getTime() < dayStart.getTime()).map(item);
    const due = rows.filter((row) => row.due_at && (row.due_at as Date).getTime() >= dayStart.getTime() && (row.due_at as Date).getTime() < dayEnd.getTime()).map(item);
    const fresh = rows.filter((row) => row.assigned_at && (row.assigned_at as Date).getTime() >= now.getTime() - 86_400_000 && Number(row.created_by) !== userId && !(row.due_at && (row.due_at as Date).getTime() < dayEnd.getTime())).map(item);
    const digest = digestText({ name: String(person.name).split(" ")[0]!, overdue, today: due, assigned: fresh });
    if (!digest) continue;
    const link = `${appBaseUrl()}/users/work/my-tasks`;
    const message: NotifyInput = {
      eventType: "WORK_TASK_DIGEST",
      userId,
      title: digest.title.slice(0, 200),
      message: digest.text.slice(0, 1000),
      deepLink: link,
      entity: null,
      email: { subject: digest.title.slice(0, 180), text: `${digest.text}\n\nOpen My Tasks: ${link}\n\nTurn this summary off in My Tasks. This message can't be answered.` },
      whatsappVariables: { title: digest.title.slice(0, 120), link },
    };
    queued.push(...(await insertOutbox(null, [message], db)));
    sent += 1;
  }
  if (queued.length) await deliverOutbox(queued.slice(0, 50)).catch(() => undefined);
  return { digests: sent };
}

