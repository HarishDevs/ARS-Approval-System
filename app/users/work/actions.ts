"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireApiArea } from "@/server/authorization/guards";
import { featureOn } from "@/server/settings/features";
import { getActionContext } from "@/lib/http/request-context";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";
import type { TaskActor } from "@/server/modules/tasks";
import * as work from "@/server/work/service";
import * as repo from "@/lib/db/repositories/work.repository";
import { parseWorkSearch, workSearchQuery } from "@/server/work/rules";
import { workViewer } from "@/server/work/task-access";
import * as more from "@/server/work/service-more";
import { getDbPool } from "@/lib/db/client";
import type { RowDataPacket } from "mysql2/promise";
import type { HolidayHit } from "@/server/work/holidays";

// D-215: Task & Project Management actions. Each checks the session and the
// page's access (requireApiArea), then the service checks the person's
// rights on the project or task. Answers are plain ActionResults.
async function actor(): Promise<TaskActor | null> {
  try {
    const session = await requireApiArea("users");
    if (!(await featureOn("tasks", session.user))) return null;
    const { ipAddress } = await getActionContext();
    return { id: session.user.id, name: session.user.name, roles: session.user.roles, sessionId: session.sessionId, ipAddress };
  } catch {
    return null;
  }
}

const id = (value: unknown) => (typeof value === "number" && Number.isInteger(value) && value > 0 && value < 1e10 ? value : typeof value === "string" && /^\d{1,10}$/.test(value) ? Number(value) : null);
const text = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};
const NOT_FOUND: ActionResult = { ok: false, message: "Not found." };

function refresh() {
  revalidatePath("/users/work", "layout");
  revalidatePath("/users/tasks", "layout");
}

// Each action names its caller first (await actor()), then runs here.
async function run<T>(label: string, me: TaskActor | null, work: (me: TaskActor) => Promise<{ ok: true; value: T; message?: string } | { ok: false; message: string; fieldErrors?: Record<string, string>; holiday?: HolidayHit }>): Promise<ActionResult & { value?: T; holiday?: HolidayHit }> {
  if (!me) return NOT_FOUND;
  try {
    const result = await work(me);
    // D-217: a date on a holiday goes back to the person to keep or move.
    if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fieldErrors, ...(result.holiday ? { holiday: result.holiday } : {}) };
    refresh();
    return { ok: true, message: result.message ?? "Saved.", value: result.value };
  } catch (error) {
    logError(`work action ${label} failed`, error);
    return { ok: false, message: "Couldn't do that. Please try again." };
  }
}

// ---- projects ------------------------------------------------------------------------
function projectInput(formData: FormData): work.ProjectInput {
  return {
    name: text(formData, "name"),
    description: text(formData, "description"),
    color: text(formData, "color"),
    privacy: text(formData, "privacy"),
    departmentId: id(text(formData, "department")),
    defaultAccessRole: text(formData, "default_access_role"),
    defaultView: text(formData, "default_view"),
    startOn: text(formData, "start_on"),
    dueOn: text(formData, "due_on"),
  };
}

export async function createProjectAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const result = await run("createProject", await actor(), (me) => work.createProject(projectInput(formData), me));
  if (!result.ok || !result.value) return result;
  redirect(`/users/work/projects/${(result.value as { id: number }).id}?created=1`);
}

export async function updateProjectAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const projectId = id(text(formData, "projectId"));
  if (!projectId) return NOT_FOUND;
  return run("updateProject", await actor(), (me) => work.updateProjectDetails(projectId, projectInput(formData), me));
}

export async function memberAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const projectId = id(text(formData, "projectId"));
  const [type, raw] = text(formData, "member").split(":");
  const memberId = id(raw);
  if (!projectId || !memberId || (type !== "USER" && type !== "DEPARTMENT")) return { ok: false, message: "Choose a person or department.", fieldErrors: { member: "Choose a person or department." } };
  const role = text(formData, "role");
  return run("member", await actor(), (me) => work.setMember(projectId, { type, id: memberId }, role === "REMOVE" ? null : role, me));
}

export async function projectCommand(projectId: number, command: "JOIN" | "LEAVE" | "ARCHIVE" | "UNARCHIVE" | "DELETE" | "RESTORE" | "STAR"): Promise<ActionResult> {
  const project = id(projectId);
  if (!project) return NOT_FOUND;
  if (command === "STAR") {
    const me = await actor();
    if (!me) return NOT_FOUND;
    const found = await repo.projectFor(project, await workViewer(me));
    if (!found) return NOT_FOUND;
    const on = await repo.toggleFavourite(me.id, "PROJECT", project);
    refresh();
    return { ok: true, message: on ? "Starred." : "Unstarred." };
  }
  return run(command, await actor(), (me) => (command === "JOIN" ? work.joinProject(project, me) : command === "LEAVE" ? work.leaveProject(project, me) : work.setProjectLifecycle(project, command, me)));
}

export async function statusAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const projectId = id(text(formData, "projectId"));
  if (!projectId) return NOT_FOUND;
  return run("status", await actor(), (me) => work.postStatus(projectId, { status: text(formData, "status"), title: text(formData, "title"), body: text(formData, "body") }, me));
}

export async function removeStatusAction(statusId: number): Promise<ActionResult> {
  const update = id(statusId);
  return update ? run("removeStatus", await actor(), (me) => work.removeStatus(update, me)) : NOT_FOUND;
}

// ---- sections --------------------------------------------------------------------------
export async function addSectionAction(projectId: number, name: string, afterSectionId: number | null): Promise<ActionResult> {
  const project = id(projectId);
  return project ? run("addSection", await actor(), (me) => work.addSection(project, String(name ?? ""), id(afterSectionId), me)) : NOT_FOUND;
}

export async function sectionAction(sectionId: number, change: { name?: string; beforeId?: number | null; afterId?: number | null; deleteMoveTo?: number }): Promise<ActionResult> {
  const section = id(sectionId);
  if (!section) return NOT_FOUND;
  const moveTo = change.deleteMoveTo === undefined ? undefined : id(change.deleteMoveTo);
  return run("section", await actor(), (me) =>
    work.changeSection(
      section,
      {
        ...(typeof change.name === "string" ? { name: change.name } : {}),
        ...(change.beforeId !== undefined ? { beforeId: id(change.beforeId) } : {}),
        ...(change.afterId !== undefined ? { afterId: id(change.afterId) } : {}),
        ...(moveTo ? { delete: { moveTo } } : {}),
      },
      me,
    ),
  );
}

// ---- tasks -----------------------------------------------------------------------------
export async function quickAddAction(input: { title: string; projectId?: number | null; sectionId?: number | null; parentId?: number | null; assigneeId?: number | null; dueDay?: string; mySectionId?: number | null; holidayOk?: boolean }): Promise<ActionResult & { value?: { id: number; taskNo: string }; holiday?: HolidayHit }> {
  return run("quickAdd", await actor(), (me) =>
    work.quickAddTask(
      {
        title: String(input.title ?? ""),
        projectId: id(input.projectId),
        sectionId: id(input.sectionId),
        parentId: id(input.parentId),
        assigneeId: id(input.assigneeId),
        dueDay: typeof input.dueDay === "string" ? input.dueDay : "",
        mySectionId: id(input.mySectionId),
        holidayOk: input.holidayOk === true,
      },
      me,
    ),
  );
}

// Several lines pasted at once: one task per line (at most 50).
export async function quickAddManyAction(input: { titles: string[]; projectId?: number | null; sectionId?: number | null; parentId?: number | null; mySectionId?: number | null }): Promise<ActionResult> {
  if (!(await actor())) return NOT_FOUND;
  const titles = (Array.isArray(input.titles) ? input.titles : []).map((title) => String(title).trim()).filter(Boolean).slice(0, 50);
  if (!titles.length) return { ok: false, message: "Nothing to add." };
  let added = 0;
  for (const title of titles) {
    const result = await quickAddAction({ title, projectId: input.projectId, sectionId: input.sectionId, parentId: input.parentId, mySectionId: input.mySectionId });
    if (!result.ok) return { ok: false, message: added ? `Added ${added}; then: ${result.message}` : result.message };
    added += 1;
  }
  return { ok: true, message: `Added ${added} tasks.` };
}

export async function moveTaskAction(input: { taskId: number; projectId: number; sectionId: number; beforeId: number | null; afterId: number | null }): Promise<ActionResult> {
  const taskId = id(input.taskId);
  const projectId = id(input.projectId);
  const sectionId = id(input.sectionId);
  if (!taskId || !projectId || !sectionId) return NOT_FOUND;
  return run("move", await actor(), (me) => work.moveInProject({ taskId, projectId, sectionId, beforeId: id(input.beforeId), afterId: id(input.afterId) }, me));
}

export async function completeAction(taskId: number): Promise<ActionResult> {
  const task = id(taskId);
  return task ? run("complete", await actor(), (me) => work.toggleComplete(task, me)) : NOT_FOUND;
}

export async function taskFieldsAction(taskId: number, change: { dueDay?: string; startDay?: string; assigneeId?: number; priority?: string; title?: string; milestone?: boolean; holidayOk?: boolean }): Promise<ActionResult & { holiday?: HolidayHit }> {
  const task = id(taskId);
  if (!task) return NOT_FOUND;
  const clean: Parameters<typeof work.setTaskFields>[1] = {};
  if (typeof change.dueDay === "string") clean.dueDay = change.dueDay;
  if (typeof change.startDay === "string") clean.startDay = change.startDay;
  if (change.assigneeId !== undefined) {
    const person = id(change.assigneeId);
    if (!person) return { ok: false, message: "Choose a person." };
    clean.assigneeId = person;
  }
  if (typeof change.priority === "string") clean.priority = change.priority;
  if (typeof change.title === "string") clean.title = change.title;
  if (typeof change.milestone === "boolean") clean.milestone = change.milestone;
  if (change.holidayOk === true) clean.holidayOk = true;
  return run("fields", await actor(), (me) => work.setTaskFields(task, clean, me));
}

export async function taskProjectAction(taskId: number, projectId: number, on: boolean, sectionId: number | null = null): Promise<ActionResult> {
  const task = id(taskId);
  const project = id(projectId);
  if (!task || !project) return NOT_FOUND;
  return run("taskProject", await actor(), (me) => (on ? work.addToProject(task, project, id(sectionId), me) : work.removeFromProject(task, project, me)));
}

export async function parentAction(taskId: number, parentRef: string | null): Promise<ActionResult> {
  const task = id(taskId);
  if (!task) return NOT_FOUND;
  const me = await actor();
  if (!me) return NOT_FOUND;
  let parentId: number | null = null;
  if (parentRef) {
    const ref = parentRef.trim().toUpperCase();
    const [rows] = await getDbPool().query<RowDataPacket[]>("SELECT id FROM tasks WHERE task_no = ? AND deleted_at IS NULL", [ref]);
    parentId = rows[0] ? Number(rows[0].id) : null;
    if (!parentId) return { ok: false, message: "No task with that number that you can see.", fieldErrors: { parent: "No task with that number that you can see." } };
  }
  return run("parent", me, (who) => work.setParent(task, parentId, who));
}

export async function subtaskOrderAction(taskId: number, beforeId: number | null, afterId: number | null): Promise<ActionResult> {
  const task = id(taskId);
  return task ? run("subtaskOrder", await actor(), (me) => work.moveSubtask(task, id(beforeId), id(afterId), me)) : NOT_FOUND;
}

export async function deleteTaskAction(taskId: number, restore = false): Promise<ActionResult> {
  const task = id(taskId);
  return task ? run(restore ? "restore" : "delete", await actor(), (me) => (restore ? work.restoreTask(task, me) : work.deleteTask(task, me))) : NOT_FOUND;
}

// ---- collaboration -----------------------------------------------------------------------
export async function followAction(taskId: number, userId: number, on: boolean): Promise<ActionResult> {
  const task = id(taskId);
  const person = id(userId);
  return task && person ? run("follow", await actor(), (me) => work.setFollower(task, person, on, me)) : NOT_FOUND;
}

export async function likeAction(target: "TASK" | "COMMENT", targetId: number): Promise<ActionResult & { liked?: boolean }> {
  const item = id(targetId);
  if (!item) return NOT_FOUND;
  const result = await run("like", await actor(), (me) => (target === "COMMENT" ? work.likeComment(item, me) : work.likeTask(item, me)));
  return { ...result, liked: (result.value as { liked: boolean } | undefined)?.liked };
}

export async function commentAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const taskId = id(text(formData, "taskId"));
  if (!taskId) return NOT_FOUND;
  const result = await run("comment", await actor(), (me) => work.addComment(taskId, text(formData, "body"), id(text(formData, "parentId")), me, { addMentionedAsFollowers: text(formData, "mentionAccess") === "yes" }));
  const notSeeing = (result.value as { notSeeing: string[] } | undefined)?.notSeeing ?? [];
  return result.ok ? { ok: true, message: notSeeing.length ? `Posted. ${notSeeing.join(", ")} can't see this task, so they weren't told.` : "Posted." } : result;
}

export async function commentChangeAction(commentId: number, change: { body?: string; pinned?: boolean; delete?: boolean }): Promise<ActionResult> {
  const comment = id(commentId);
  if (!comment) return NOT_FOUND;
  const clean: { body?: string; pinned?: boolean; delete?: boolean } = {};
  if (typeof change.body === "string") clean.body = change.body;
  if (typeof change.pinned === "boolean") clean.pinned = change.pinned;
  if (change.delete === true) clean.delete = true;
  return run("commentChange", await actor(), (me) => work.changeComment(comment, clean, me));
}

export async function dependencyAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const taskId = id(text(formData, "taskId"));
  if (!taskId) return NOT_FOUND;
  return run("dependency", await actor(), (me) => work.setDependency(taskId, text(formData, "blocker"), text(formData, "on") !== "0", me));
}

export async function tagAction(taskId: number, name: string, on: boolean): Promise<ActionResult> {
  const task = id(taskId);
  return task ? run("tag", await actor(), (me) => work.setTag(task, String(name ?? ""), on, me)) : NOT_FOUND;
}

// ---- My Tasks --------------------------------------------------------------------------
export async function myPlaceAction(taskId: number, sectionId: number, position: number): Promise<ActionResult> {
  const task = id(taskId);
  const section = id(sectionId);
  if (!task || !section || typeof position !== "number") return NOT_FOUND;
  return run("myPlace", await actor(), (me) => work.placeMine(task, section, position, me));
}

export async function mySectionAction(command: "ADD" | "RENAME" | "DELETE", sectionId: number | null, name: string): Promise<ActionResult> {
  const me = await actor();
  if (!me) return NOT_FOUND;
  const title = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
  try {
    const sections = await repo.ensureMySections(me.id);
    if (command === "ADD") {
      if (!title) return { ok: false, message: "Give the section a name." };
      if (sections.length >= 30) return { ok: false, message: "You have 30 sections already." };
      await repo.insertMySection(me.id, title, (sections.at(-1)?.position ?? 0) + 1024);
    } else if (command === "RENAME") {
      if (!title || !id(sectionId) || !(await repo.updateMySection(me.id, id(sectionId)!, { name: title }))) return { ok: false, message: "Give the section a name." };
    } else if (!id(sectionId) || !(await repo.deleteMySection(me.id, id(sectionId)!))) return { ok: false, message: "Built-in sections can't be deleted." };
    revalidatePath("/users/work/my-tasks");
    return { ok: true, message: command === "DELETE" ? "Section deleted; its tasks are back by date." : "Saved." };
  } catch (error) {
    logError("mySectionAction failed", error);
    return { ok: false, message: "Couldn't do that. Please try again." };
  }
}

// ---- saved searches ----------------------------------------------------------------------
export async function saveSearchAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await actor();
  if (!me) return NOT_FOUND;
  const name = text(formData, "name").replace(/\s+/g, " ").trim().slice(0, 80);
  if (name.length < 2) return { ok: false, message: "Give the search a name.", fieldErrors: { name: "Use 2 to 80 characters." } };
  const { page: _page, ...query } = workSearchQuery(parseWorkSearch(Object.fromEntries(new URLSearchParams(text(formData, "query")))));
  void _page;
  const result = await repo.insertSavedSearch(me.id, name, new URLSearchParams(query).toString());
  if (result === "DUPLICATE") return { ok: false, message: "You have a search with that name.", fieldErrors: { name: "Choose another name." } };
  if (result === "TOO_MANY") return { ok: false, message: "You have 50 saved searches. Delete one first." };
  revalidatePath("/users/work", "layout");
  return { ok: true, message: `Saved as "${name}".` };
}

export async function savedSearchCommand(searchId: number, command: "DELETE" | "STAR"): Promise<ActionResult> {
  const me = await actor();
  const search = id(searchId);
  if (!me || !search) return NOT_FOUND;
  if (!(await repo.listSavedSearches(me.id)).some((item) => item.id === search)) return NOT_FOUND;
  if (command === "DELETE") await repo.deleteSavedSearch(me.id, search);
  else await repo.toggleFavourite(me.id, "SEARCH", search);
  revalidatePath("/users/work", "layout");
  return { ok: true, message: command === "DELETE" ? "Deleted." : "Saved." };
}

// ---- D-218: recurring tasks, fields, templates, bulk, inbox, digest --------------------
export async function recurrenceAction(taskId: number, rule: { kind: string; every: number; weekdays?: number[] } | null): Promise<ActionResult> {
  const task = id(taskId);
  return task ? run("recurrence", await actor(), (me) => more.setRecurrence(task, rule, me)) : NOT_FOUND;
}

export async function addFieldAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const projectId = id(text(formData, "projectId"));
  if (!projectId) return NOT_FOUND;
  return run("addField", await actor(), (me) => more.addField(projectId, { name: text(formData, "name"), kind: text(formData, "kind"), options: text(formData, "options") }, me));
}

export async function removeFieldAction(fieldId: number): Promise<ActionResult> {
  const field = id(fieldId);
  return field ? run("removeField", await actor(), (me) => more.removeField(field, me)) : NOT_FOUND;
}

export async function fieldValueAction(taskId: number, fieldId: number, value: string): Promise<ActionResult> {
  const task = id(taskId);
  const field = id(fieldId);
  return task && field ? run("fieldValue", await actor(), (me) => more.setTaskField(task, field, String(value ?? ""), me)) : NOT_FOUND;
}

export async function saveTemplateAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const projectId = id(text(formData, "projectId"));
  if (!projectId) return NOT_FOUND;
  const result = await run("saveTemplate", await actor(), (me) => more.saveAsTemplate(projectId, text(formData, "name"), me));
  if (!result.ok || !result.value) return result;
  redirect(`/users/work/projects/${(result.value as { id: number }).id}`);
}

export async function fromTemplateAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const templateId = id(text(formData, "templateId"));
  const copyFrom = id(text(formData, "copyFrom"));
  if (!templateId && !copyFrom) return { ok: false, message: "Choose a template.", fieldErrors: { templateId: "Choose a template." } };
  const result = await run("fromTemplate", await actor(), (me) =>
    more.createFromTemplate(
      { templateId: templateId ?? undefined, copyFrom: copyFrom ?? undefined, copyMembers: text(formData, "copyMembers") === "on" },
      { name: text(formData, "name"), startOn: text(formData, "start_on"), privacy: text(formData, "privacy"), departmentId: id(text(formData, "department")) },
      me,
    ),
  );
  if (!result.ok || !result.value) return result;
  redirect(`/users/work/projects/${(result.value as { id: number }).id}?created=1`);
}

export async function bulkAction(ids: number[], op: string, value: { assigneeId?: number; dueDay?: string; priority?: string; projectId?: number; sectionId?: number; tag?: string; holidayOk?: boolean } = {}): Promise<ActionResult & { holiday?: HolidayHit }> {
  const me = await actor();
  if (!me) return NOT_FOUND;
  if (!(more.BULK_OPS as readonly string[]).includes(op)) return NOT_FOUND;
  const clean = (Array.isArray(ids) ? ids : []).map((item) => id(item)).filter((item): item is number => item !== null);
  return run("bulk", me, (who) =>
    more.bulkTasks(
      clean,
      op as more.BulkOp,
      {
        assigneeId: id(value.assigneeId) ?? undefined,
        dueDay: typeof value.dueDay === "string" ? value.dueDay : undefined,
        priority: typeof value.priority === "string" ? value.priority : undefined,
        projectId: id(value.projectId) ?? undefined,
        sectionId: id(value.sectionId) ?? undefined,
        tag: typeof value.tag === "string" ? value.tag : undefined,
        holidayOk: value.holidayOk === true,
      },
      who,
    ),
  );
}

export async function inboxAction(ids: number[] | null, command: string): Promise<ActionResult> {
  const me = await actor();
  if (!me || !repo.INBOX_COMMANDS.includes(command)) return NOT_FOUND;
  const clean = ids === null ? null : (Array.isArray(ids) ? ids : []).map((item) => id(item)).filter((item): item is number => item !== null).slice(0, 500);
  try {
    const changed = await repo.setInbox(me.id, clean, command);
    revalidatePath("/users/work/inbox");
    return { ok: true, message: changed ? "Done." : "Nothing to change." };
  } catch (error) {
    logError("inboxAction failed", error);
    return { ok: false, message: "Couldn't do that. Please try again." };
  }
}

export async function digestChoiceAction(on: boolean): Promise<ActionResult> {
  const me = await actor();
  if (!me) return NOT_FOUND;
  try {
    if (on) await getDbPool().query("DELETE FROM user_settings WHERE user_id = ? AND setting_key = 'work.digest'", [me.id]);
    else await getDbPool().query("INSERT INTO user_settings (user_id, setting_key, value) VALUES (?, 'work.digest', 'OFF') ON DUPLICATE KEY UPDATE value = 'OFF'", [me.id]);
    revalidatePath("/users/work/my-tasks");
    return { ok: true, message: on ? "You'll get the morning summary." : "Morning summary switched off." };
  } catch (error) {
    logError("digestChoiceAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
}
