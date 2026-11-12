import { workMirrorLink } from "@/server/approvals/work-mirror";
import "server-only";
import { afterResponse } from "@/lib/http/after-response";
import type { RowDataPacket } from "mysql2/promise";
import type { Queryable } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { getDbPool } from "@/lib/db/client";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { insertOutbox } from "@/lib/db/repositories/outbox.repository";
import { canViewRequest, findRequest, nextRequestNumber } from "@/lib/db/repositories/approvals.repository";
import { appendTaskEvent, findTask, insertTask, personFacts, updateTask, type TaskRecord } from "@/lib/db/repositories/tasks.repository";
import * as repo from "@/lib/db/repositories/work.repository";
import { versionWithType } from "@/lib/db/repositories/module-types.repository";
import { deliverOutbox } from "@/server/approvals/service";
import { projectMessages, taskMessages } from "@/server/modules/messages";
import { actOnTask, type TaskActor } from "@/server/modules/tasks";
import { indiaLocalToUtc, mayCreate, parseTaskSettings, PRIORITY_LABEL, TASK_PRIORITIES, type TaskPriority } from "@/server/modules/settings";
import { mayAssignTo, OPEN_STATUSES } from "@/server/modules/task-rules";
import {
  mayShareTasks,
  mayUpdateField,
  parseProjectPermissions,
  PERMISSION_ROLE_LABEL,
  effectiveProjectRole,
  leavesAnOwner,
  PRIVACY,
  PROJECT_COLORS,
  PROJECT_ROLE_LABEL,
  PROJECT_ROLES,
  PROJECT_VIEWS,
  projectAbilities,
  STATUS_KIND_LABEL,
  STATUS_KINDS,
  type ProjectRole,
  type WorkViewer,
} from "@/server/work/access";
import { dependencyLoop, MAX_DEPENDENCIES, MAX_PROJECTS_PER_TASK, mentionedIds, needsRenumber, positionBetween, subtaskProblem } from "@/server/work/rules";
import { isAdminRoles, rightsOn, teamOf, workViewer } from "@/server/work/task-access";
import type { NotifyInput } from "@/server/notifications/notify";
import { checkHoliday, holidayMessage, nearestWorkingDay, type HolidayHit } from "@/server/work/holidays";
import { departmentOf, holidayContext, openTasksDueOn } from "@/server/work/holiday-store";

// D-215: Task & Project Management. Each operation checks the person's
// rights on the server (access.ts through task-access.ts), runs in one
// transaction with its history entry, and sends messages after the commit.
export type WorkResult<T = undefined> = { ok: true; value: T; message?: string } | { ok: false; message: string; fieldErrors?: Record<string, string>; holiday?: HolidayHit };
const fail = (message: string, fieldErrors?: Record<string, string>): { ok: false; message: string; fieldErrors?: Record<string, string> } => ({ ok: false, message, fieldErrors });
// D-217: a date on a holiday comes back to the person to keep or move.
const holidayFail = (hit: HolidayHit): { ok: false; message: string; holiday: HolidayHit } => ({ ok: false, message: holidayMessage(hit), holiday: hit });
const NOT_FOUND = "Not found.";

async function send(ids: number[]) {
  if (ids.length) await afterResponse("task messages", () => deliverOutbox(ids));
}
const clean = (value: string, max: number) => value.replace(/\s+/g, " ").trim().slice(0, max);
const info = (task: Pick<TaskRecord, "id" | "taskNo" | "title" | "dueAt">) => ({ id: task.id, taskNo: task.taskNo, title: task.title, dueAt: task.dueAt });

// A date-only due date means 6 pm India time that day (the working day's end).
export function dueFromDay(day: string): Date | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? indiaLocalToUtc(`${day}T18:00`) : null;
}

// ---- projects ------------------------------------------------------------------------
async function projectWithRole(projectId: number, actor: TaskActor) {
  const viewer = await workViewer(actor);
  const found = await repo.projectFor(projectId, viewer);
  return found ? { ...found, viewer, can: projectAbilities(found.role) } : null;
}

export interface ProjectInput {
  name: string;
  description: string;
  color: string;
  privacy: string;
  departmentId: number | null;
  defaultAccessRole: string;
  defaultView: string;
  startOn: string;
  dueOn: string;
  sections?: string; // D-220: the new-project steps' sections, one per line
  rowVersion?: number; // D-246 (audit DB-001): the version the editor saw
}
function checkProjectInput(input: ProjectInput): { errors: Record<string, string>; value: Omit<repo.NewProject, "ownerId"> } {
  const errors: Record<string, string> = {};
  const name = clean(input.name, 150);
  if (name.length < 2) errors.name = "Give the project a name of 2 to 150 characters.";
  const privacy = (PRIVACY as readonly string[]).includes(input.privacy) ? (input.privacy as repo.NewProject["privacy"]) : "PRIVATE";
  if (privacy === "DEPARTMENT" && !input.departmentId) errors.department = "Choose the department that shares this project.";
  const day = (value: string) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);
  const startOn = day(input.startOn);
  const dueOn = day(input.dueOn);
  if (startOn && dueOn && startOn > dueOn) errors.due_on = "The due date can't be before the start date.";
  const description = input.description.trim().slice(0, 4000);
  return {
    errors,
    value: {
      name,
      description: description || null,
      color: (PROJECT_COLORS as readonly string[]).includes(input.color) ? (input.color as repo.NewProject["color"]) : "green",
      departmentId: input.departmentId,
      privacy,
      defaultAccessRole: ["EDITOR", "COMMENTER", "VIEWER"].includes(input.defaultAccessRole) ? (input.defaultAccessRole as repo.NewProject["defaultAccessRole"]) : "COMMENTER",
      defaultView: (PROJECT_VIEWS as readonly string[]).includes(input.defaultView) ? (input.defaultView as repo.NewProject["defaultView"]) : "LIST",
      startOn,
      dueOn,
    },
  };
}

export const STARTER_SECTIONS = ["To do", "In progress", "Done"];

export async function createProject(input: ProjectInput, actor: TaskActor): Promise<WorkResult<{ id: number }>> {
  const { errors, value } = checkProjectInput(input);
  if (Object.keys(errors).length) return fail("Check the highlighted fields.", errors);
  const id = await withTransaction(async (connection) => {
    const projectId = await repo.insertProject({ ...value, ownerId: actor.id }, connection);
    await repo.setProjectMember(projectId, "USER", actor.id, "OWNER", actor.id, connection);
    const chosen = (input.sections ?? "")
      .split("\n")
      .map((name) => name.replace(/\s+/g, " ").trim().slice(0, 150))
      .filter(Boolean)
      .slice(0, 20);
    for (const [index, name] of (chosen.length ? chosen : STARTER_SECTIONS).entries()) await repo.insertSection(projectId, name, (index + 1) * 1024, actor.id, connection);
    await repo.appendProjectEvent(projectId, actor.id, "CREATED", value.name, connection);
    await recordAudit({ actorUserId: actor.id, action: "PROJECT_CREATED", entityType: "PROJECT", entityId: projectId, sessionId: actor.sessionId, ipAddress: actor.ipAddress ?? null, metadata: { privacy: value.privacy } }, connection);
    return projectId;
  });
  return { ok: true, value: { id } };
}

export async function updateProjectDetails(projectId: number, input: ProjectInput, actor: TaskActor): Promise<WorkResult> {
  const found = await projectWithRole(projectId, actor);
  if (!found) return fail(NOT_FOUND);
  if (!found.can.manage) return fail("Only the project's owners can change its details and privacy.");
  const { errors, value } = checkProjectInput(input);
  if (Object.keys(errors).length) return fail("Check the highlighted fields.", errors);
  // D-246 (audit DB-001): a save from an older version is refused, as for tasks.
  if (input.rowVersion !== undefined && input.rowVersion !== found.project.rowVersion) return fail("Someone changed this project while you were looking. Reload and try again.");
  const saved = await withTransaction(async (connection) => {
    const changed = await repo.updateProject(
      projectId,
      { name: value.name, description: value.description, color: value.color, department_id: value.departmentId, privacy: value.privacy, default_access_role: value.defaultAccessRole, default_view: value.defaultView, start_on: value.startOn, due_on: value.dueOn },
      connection,
      input.rowVersion,
    );
    if (!changed) return false;
    if (value.privacy !== found.project.privacy) await repo.appendProjectEvent(projectId, actor.id, "PRIVACY", `${found.project.privacy} → ${value.privacy}`, connection);
    await repo.appendProjectEvent(projectId, actor.id, "DETAILS", null, connection);
    await recordAudit({ actorUserId: actor.id, action: "PROJECT_UPDATED", entityType: "PROJECT", entityId: projectId, sessionId: actor.sessionId, ipAddress: actor.ipAddress ?? null, metadata: { privacy: value.privacy } }, connection);
    return true;
  });
  if (!saved) return fail("Someone changed this project while you were looking. Reload and try again.");
  return { ok: true, value: undefined, message: "Saved." };
}

export async function setMember(projectId: number, member: { type: "USER" | "DEPARTMENT"; id: number }, role: string | null, actor: TaskActor): Promise<WorkResult> {
  const found = await projectWithRole(projectId, actor);
  if (!found) return fail(NOT_FOUND);
  if (!found.can.share) return fail("Only owners and editors can change who is in the project.");
  const next = role === null ? null : (PROJECT_ROLES as readonly string[]).includes(role) ? (role as ProjectRole) : undefined;
  if (next === undefined) return fail("Choose a role.");
  const current = found.members.find((item) => item.type === member.type && item.id === member.id);
  // Owners are made, changed and removed by owners only.
  if ((next === "OWNER" || current?.role === "OWNER") && !found.can.manage) return fail("Only an owner can add, change or remove owners.");
  if (member.type === "DEPARTMENT" && next === "OWNER") return fail("A department can't own a project; choose a person.");
  if (!leavesAnOwner(found.members, { type: member.type, id: member.id, role: next })) return fail("A project needs at least one owner. Make someone else an owner first.");
  if (member.type === "USER") {
    const person = await personFacts(member.id);
    if (!person?.active && next !== null) return fail("Choose an active person.");
  }
  const outbox = await withTransaction(async (connection) => {
    if (next === null) await repo.removeProjectMember(projectId, member.type, member.id, connection);
    else await repo.setProjectMember(projectId, member.type, member.id, next, actor.id, connection);
    await repo.appendProjectEvent(projectId, actor.id, next === null ? "MEMBER_REMOVED" : current ? "MEMBER_ROLE" : "MEMBER_ADDED", `${member.type}:${member.id}${next ? ` ${next}` : ""}`, connection);
    await recordAudit({ actorUserId: actor.id, action: "PROJECT_MEMBER", entityType: "PROJECT", entityId: projectId, sessionId: actor.sessionId, ipAddress: actor.ipAddress ?? null, metadata: { member, role: next } }, connection);
    const messages = next && !current && member.type === "USER" && member.id !== actor.id && (await withProjects([member.id], connection)).includes(member.id) ? [projectMessages.added({ id: projectId, name: found.project.name }, member.id, actor.name, PROJECT_ROLE_LABEL[next])] : [];
    return insertOutbox(null, messages, connection);
  });
  await send(outbox);
  return { ok: true, value: undefined, message: next === null ? "Removed." : "Saved." };
}

// Join a project one can already see (shared with the department or everyone).
export async function joinProject(projectId: number, actor: TaskActor): Promise<WorkResult> {
  const found = await projectWithRole(projectId, actor);
  if (!found) return fail(NOT_FOUND);
  if (found.members.some((member) => member.type === "USER" && member.id === actor.id)) return { ok: true, value: undefined };
  const role = found.role === "OWNER" && !found.viewer.isAdmin ? "OWNER" : found.viewer.isAdmin ? "EDITOR" : found.role;
  await withTransaction(async (connection) => {
    await repo.setProjectMember(projectId, "USER", actor.id, role, actor.id, connection);
    await repo.appendProjectEvent(projectId, actor.id, "JOINED", role, connection);
    if (found.viewer.isAdmin) await recordAudit({ actorUserId: actor.id, action: "PROJECT_JOINED_AS_IT", entityType: "PROJECT", entityId: projectId, sessionId: actor.sessionId, ipAddress: actor.ipAddress ?? null }, connection);
  });
  return { ok: true, value: undefined, message: "You joined the project." };
}

export async function leaveProject(projectId: number, actor: TaskActor): Promise<WorkResult> {
  const found = await projectWithRole(projectId, actor);
  if (!found) return fail(NOT_FOUND);
  if (!leavesAnOwner(found.members, { type: "USER", id: actor.id, role: null })) return fail("You're the only owner. Make someone else an owner before you leave.");
  await withTransaction(async (connection) => {
    await repo.removeProjectMember(projectId, "USER", actor.id, connection);
    await repo.appendProjectEvent(projectId, actor.id, "LEFT", null, connection);
  });
  return { ok: true, value: undefined, message: "You left the project." };
}

export async function setProjectLifecycle(projectId: number, change: "ARCHIVE" | "UNARCHIVE" | "DELETE" | "RESTORE", actor: TaskActor): Promise<WorkResult> {
  const viewer = await workViewer(actor);
  const project = await repo.findProject(projectId);
  if (!project) return fail(NOT_FOUND);
  const members = await repo.listProjectMembers(projectId);
  const role = effectiveProjectRole(repo.projectFacts(project, members), viewer);
  const owner = role === "OWNER";
  if (change === "RESTORE") {
    if (!project.deletedAt) return fail("This project isn't deleted.");
    if (!(owner || project.deletedBy === actor.id)) return fail(NOT_FOUND);
  } else if (project.deletedAt || !role) return fail(NOT_FOUND);
  else if (!owner) return fail("Only the project's owners can archive or delete it.");
  await withTransaction(async (connection) => {
    const changes =
      change === "ARCHIVE" ? { archived_at: new Date() } : change === "UNARCHIVE" ? { archived_at: null } : change === "DELETE" ? { deleted_at: new Date(), deleted_by: actor.id } : { deleted_at: null, deleted_by: null };
    await repo.updateProject(projectId, changes, connection);
    await repo.appendProjectEvent(projectId, actor.id, change, null, connection);
    await recordAudit({ actorUserId: actor.id, action: `PROJECT_${change}`, entityType: "PROJECT", entityId: projectId, sessionId: actor.sessionId, ipAddress: actor.ipAddress ?? null }, connection);
  });
  const word = { ARCHIVE: "Archived.", UNARCHIVE: "Back from the archive.", DELETE: "Deleted. You can restore it for 30 days.", RESTORE: "Restored." }[change];
  return { ok: true, value: undefined, message: word };
}

// ---- sections --------------------------------------------------------------------------
export async function addSection(projectId: number, name: string, afterSectionId: number | null, actor: TaskActor): Promise<WorkResult<{ id: number }>> {
  const found = await projectWithRole(projectId, actor);
  if (!found) return fail(NOT_FOUND);
  if (!found.can.edit) return fail("Only owners and editors can add sections.");
  const title = clean(name, 150);
  if (!title) return fail("Give the section a name.");
  const sections = await repo.listSections(projectId);
  if (sections.length >= 100) return fail("A project has at most 100 sections.");
  const index = afterSectionId === null ? sections.length - 1 : sections.findIndex((section) => section.id === afterSectionId);
  const position = positionBetween(sections[index]?.position ?? null, sections[index + 1]?.position ?? null);
  const id = await withTransaction(async (connection) => {
    const sectionId = await repo.insertSection(projectId, title, position, actor.id, connection);
    await repo.appendProjectEvent(projectId, actor.id, "SECTION_ADDED", title, connection);
    return sectionId;
  });
  return { ok: true, value: { id } };
}

export async function changeSection(sectionId: number, change: { name?: string; beforeId?: number | null; afterId?: number | null; delete?: { moveTo: number } }, actor: TaskActor): Promise<WorkResult> {
  const section = await repo.findSection(sectionId);
  if (!section) return fail(NOT_FOUND);
  const found = await projectWithRole(section.projectId, actor);
  if (!found) return fail(NOT_FOUND);
  if (!found.can.edit) return fail("Only owners and editors can change sections.");
  const sections = await repo.listSections(section.projectId);
  if (change.delete) {
    if (sections.length <= 1) return fail("A project keeps at least one section.");
    if (!sections.some((item) => item.id === change.delete!.moveTo && item.id !== sectionId)) return fail("Choose the section its tasks move to.");
  }
  await withTransaction(async (connection) => {
    if (change.name !== undefined) {
      const name = clean(change.name, 150);
      if (name) await repo.updateSection(sectionId, { name }, connection);
    }
    if (change.beforeId !== undefined || change.afterId !== undefined) {
      const others = sections.filter((item) => item.id !== sectionId);
      const at = change.afterId ? others.findIndex((item) => item.id === change.afterId) + 1 : change.beforeId ? others.findIndex((item) => item.id === change.beforeId) : others.length;
      await repo.updateSection(sectionId, { position: positionBetween(others[at - 1]?.position ?? null, others[at]?.position ?? null) }, connection);
    }
    if (change.delete) {
      const target = sections.find((item) => item.id === change.delete!.moveTo)!;
      await repo.moveSectionTasks(section.projectId, sectionId, target.id, connection);
      await repo.updateSection(sectionId, { deleted: true }, connection);
      await repo.appendProjectEvent(section.projectId, actor.id, "SECTION_DELETED", `${section.name} → ${target.name}`, connection);
    }
  });
  return { ok: true, value: undefined };
}

// ---- tasks: create, move, place ---------------------------------------------------------
export interface QuickTaskInput {
  title: string;
  projectId: number | null;
  sectionId: number | null;
  parentId: number | null;
  assigneeId: number | null; // default: the creator
  dueDay: string; // YYYY-MM-DD or ""
  mySectionId: number | null; // My Tasks: where it goes
  description?: string;
  priority?: string;
  holidayOk?: boolean; // D-217: keep a due date that falls on a holiday
  // v1.50.3 (owner: follow-up tasks from a request): linked to this request,
  // which the person must be able to see; listed in its Work tasks card.
  relatedRequestId?: number | null;
}

// The form_data marker of a follow-up task raised from a request page.
export const REQUEST_FOLLOW_UP_KEY = "__requestFollowUp";

export async function quickAddTask(input: QuickTaskInput, actor: TaskActor): Promise<WorkResult<{ id: number; taskNo: string }>> {
  const title = clean(input.title, 200);
  if (title.length < 1) return fail("Write the task's name.", { title: "Write the task's name." });
  if (title.length > 200) return fail("Use 200 characters or fewer.");
  const viewer = await workViewer(actor);
  const general = await repo.generalTypeVersion();
  if (!general) return fail("The General task type is switched off. Ask IT to switch it on in Admin → Task types.");
  const ctx = await versionWithType(general.versionId);
  const settings = parseTaskSettings(ctx?.version.settings);
  const me = await personFacts(actor.id);
  if (!me || !mayCreate(settings.access, { id: actor.id, departmentId: me.departmentId })) return fail("You can't create tasks of the General type.");
  // Where it goes: a project section, under a parent, or just My Tasks.
  let sectionId: number | null = null;
  if (input.projectId !== null) {
    const found = await repo.projectFor(input.projectId, viewer);
    if (!found || !projectAbilities(found.role).edit) return fail("Only owners and editors can add tasks to this project.");
    const sections = await repo.listSections(input.projectId);
    sectionId = sections.find((section) => section.id === input.sectionId)?.id ?? sections[0]?.id ?? null;
    if (sectionId === null) return fail("Add a section to the project first.");
  }
  let parent: TaskRecord | null = null;
  if (input.parentId !== null) {
    parent = await findTask(input.parentId);
    if (!parent || parent.deletedAt) return fail(NOT_FOUND);
    const rights = await rightsOn(parent, viewer);
    // D-222: subtasks of an ad hoc task are its creator's to add.
    if (!(rights.adhoc ? rights.details : rights.edit || parent.assigneeId === actor.id)) return fail("You can't add subtasks to this task.");
    if (parent.depth + 1 > 5) return fail("Subtasks go at most 5 levels deep.");
  }
  const assigneeId = input.assigneeId ?? actor.id;
  const assignee = await personFacts(assigneeId);
  if (!assignee?.active) return fail("Choose an active person.", { assignee: "Choose an active person." });
  if (!mayAssignTo(settings, { creatorId: actor.id, creatorDepartmentId: me.departmentId, creatorTeamIds: viewer.teamIds, candidate: assignee }, isAdminRoles(actor.roles))) return fail("General tasks can't be assigned to that person.");
  const dueAt = input.dueDay ? dueFromDay(input.dueDay) : null;
  if (input.dueDay && !dueAt) return fail("Choose a valid due date.");
  if (input.dueDay) {
    const { settings: holidays, calendar } = await holidayContext(undefined, assignee.departmentId, assigneeId);
    const hit = checkHoliday(input.dueDay, "due", calendar, holidays, Boolean(input.holidayOk));
    if (hit) return holidayFail(hit);
  }
  const priority = (TASK_PRIORITIES as readonly string[]).includes(input.priority ?? "") ? (input.priority as TaskPriority) : settings.defaultPriority;
  const description = (input.description ?? "").trim().slice(0, 4000) || null;
  const relatedRequestId = input.relatedRequestId ?? null;
  if (relatedRequestId !== null) {
    const request = await findRequest(relatedRequestId);
    const visible = request && (request.requesterId === actor.id || isAdminRoles(actor.roles) || (await canViewRequest(relatedRequestId, actor.id)));
    if (!visible) return fail(NOT_FOUND);
  }

  const outcome = await withTransaction(async (connection) => {
    const taskNo = await nextRequestNumber("TSK", connection);
    const id = await insertTask(
      { taskNo, typeVersionId: general.versionId, title, description, priority, createdBy: actor.id, assigneeId, dueAt, startsOn: null, formData: relatedRequestId !== null ? { [REQUEST_FOLLOW_UP_KEY]: true } : {}, relatedRequestId, submissionKey: null },
      connection,
    );
    if (parent) {
      const top = await repo.lastSubtaskPosition(parent.id, connection);
      await repo.setTaskTree(id, { parentTaskId: parent.id, rootTaskId: parent.rootTaskId ?? parent.id, depth: parent.depth + 1, position: positionBetween(top, null) }, connection);
      await appendTaskEvent(parent.id, { actorId: actor.id, type: "SUBTASK_ADDED", body: `${taskNo} ${title}`, payload: { subtaskId: id } }, connection);
    }
    if (input.projectId !== null && sectionId !== null) {
      const rows = await repo.sectionPositions(input.projectId, sectionId, connection);
      await repo.placeTaskInProject(id, input.projectId, sectionId, positionBetween(rows.at(-1)?.position ?? null, null), actor.id, connection);
    }
    if (input.mySectionId !== null && assigneeId === actor.id) {
      const sections = await repo.ensureMySections(actor.id, connection);
      if (sections.some((section) => section.id === input.mySectionId)) await repo.placeMyTask(actor.id, id, input.mySectionId, Date.now() / 1000, connection);
    }
    await appendTaskEvent(id, { actorId: actor.id, type: "CREATED", to: "OPEN", payload: { assigneeId, dueAt: dueAt?.toISOString() ?? null, priority, projectId: input.projectId, parentId: input.parentId, ...(relatedRequestId !== null ? { requestId: relatedRequestId } : {}) } }, connection);
    await repo.addFollower(id, actor.id, "CREATOR", actor.id, connection);
    if (assigneeId !== actor.id) await repo.addFollower(id, assigneeId, "ASSIGNEE", actor.id, connection);
    await recordAudit({ actorUserId: actor.id, action: "TASK_CREATED", entityType: "TASK", entityId: id, sessionId: actor.sessionId, ipAddress: actor.ipAddress ?? null, metadata: { taskNo, projectId: input.projectId, parentId: input.parentId } }, connection);
    const messages = assigneeId === actor.id ? [] : [taskMessages.assigned({ id, taskNo, title, dueAt }, assigneeId, actor.name)];
    return { id, taskNo, outbox: await insertOutbox(null, messages, connection) };
  });
  await send(outcome.outbox);
  return { ok: true, value: { id: outcome.id, taskNo: outcome.taskNo } };
}

// Load a task with the person's rights (null: not visible, so "not found").
async function taskFor(taskId: number, actor: TaskActor) {
  const task = await findTask(taskId);
  if (!task || task.deletedAt) return null;
  const viewer = await workViewer(actor);
  const rights = await rightsOn(task, viewer);
  return rights.view ? { task, viewer, rights } : null;
}

// Move within or across a project's sections (List and Board).
export async function moveInProject(input: { taskId: number; projectId: number; sectionId: number; beforeId: number | null; afterId: number | null }, actor: TaskActor): Promise<WorkResult> {
  const viewer = await workViewer(actor);
  const found = await repo.projectFor(input.projectId, viewer);
  if (!found) return fail(NOT_FOUND);
  if (!projectAbilities(found.role).edit) return fail("Only owners and editors can move tasks in this project.");
  const section = await repo.findSection(input.sectionId);
  if (!section || section.projectId !== input.projectId) return fail(NOT_FOUND);
  const links = await repo.listTaskProjects(input.taskId);
  const link = links.find((item) => item.projectId === input.projectId);
  if (!link) return fail(NOT_FOUND);
  await withTransaction(async (connection) => {
    let rows = (await repo.sectionPositions(input.projectId, input.sectionId, connection)).filter((row) => row.taskId !== input.taskId);
    const slot = () => {
      const at = input.afterId !== null ? rows.findIndex((row) => row.taskId === input.afterId) + 1 : input.beforeId !== null ? rows.findIndex((row) => row.taskId === input.beforeId) : rows.length;
      const index = at < 0 ? rows.length : at;
      return { before: rows[index - 1]?.position ?? null, after: rows[index]?.position ?? null };
    };
    let { before, after } = slot();
    if (needsRenumber(before, after)) {
      await repo.renumberSection(input.projectId, input.sectionId, connection);
      rows = (await repo.sectionPositions(input.projectId, input.sectionId, connection)).filter((row) => row.taskId !== input.taskId);
      ({ before, after } = slot());
    }
    await repo.placeTaskInProject(input.taskId, input.projectId, input.sectionId, positionBetween(before, after), actor.id, connection);
    if (link.sectionId !== input.sectionId) await appendTaskEvent(input.taskId, { actorId: actor.id, type: "MOVED_SECTION", body: `${found.project.name}: ${link.sectionName} → ${section.name}` }, connection);
  });
  return { ok: true, value: undefined };
}

export async function addToProject(taskId: number, projectId: number, sectionId: number | null, actor: TaskActor): Promise<WorkResult> {
  const loaded = await taskFor(taskId, actor);
  if (!loaded) return fail(NOT_FOUND);
  if (!loaded.rights.edit && loaded.task.assigneeId !== actor.id) return fail("You can't change this task's projects.");
  // QA-SEC-05 (v1.42.1): a work step stays private to its request (a project would show its title to members).
  if (workMirrorLink(loaded.task.formData)) return fail(mirrorRefusal(loaded.task.relatedRequestNo));
  // D-222: each project the task is in says who may share its tasks with other projects.
  for (const link of await repo.listTaskProjects(taskId)) {
    if (link.projectId === projectId) continue;
    const source = await repo.projectFor(link.projectId, loaded.viewer);
    if (source && !mayShareTasks(source.project.permissions, source.role, loaded.viewer.isAdmin)) return fail(`${source.project.name} allows only ${PERMISSION_ROLE_LABEL[source.project.permissions.shareTasks].toLowerCase()} to share its tasks with other projects.`);
  }
  const found = await repo.projectFor(projectId, loaded.viewer);
  if (!found || !projectAbilities(found.role).edit) return fail("You need to be an owner or editor of that project to add tasks to it.");
  const sections = await repo.listSections(projectId);
  const section = sections.find((item) => item.id === sectionId) ?? sections[0];
  if (!section) return fail("That project has no sections yet.");
  const done = await withTransaction(async (connection) => {
    await findTask(taskId, connection, true);
    if ((await repo.countTaskProjects(taskId, connection)) >= MAX_PROJECTS_PER_TASK) return false;
    const rows = await repo.sectionPositions(projectId, section.id, connection);
    await repo.placeTaskInProject(taskId, projectId, section.id, positionBetween(rows.at(-1)?.position ?? null, null), actor.id, connection);
    await appendTaskEvent(taskId, { actorId: actor.id, type: "ADDED_TO_PROJECT", body: `${found.project.name} · ${section.name}` }, connection);
    return true;
  });
  return done ? { ok: true, value: undefined, message: `Added to ${found.project.name}.` } : fail(`A task can be in at most ${MAX_PROJECTS_PER_TASK} projects.`);
}

export async function removeFromProject(taskId: number, projectId: number, actor: TaskActor): Promise<WorkResult> {
  const loaded = await taskFor(taskId, actor);
  if (!loaded) return fail(NOT_FOUND);
  const found = await repo.projectFor(projectId, loaded.viewer);
  if (!found || !projectAbilities(found.role).edit) return fail("Only the project's owners and editors can take tasks out of it.");
  await withTransaction(async (connection) => {
    await repo.removeTaskFromProject(taskId, projectId, connection);
    await appendTaskEvent(taskId, { actorId: actor.id, type: "REMOVED_FROM_PROJECT", body: found.project.name }, connection);
  });
  return { ok: true, value: undefined, message: `Removed from ${found.project.name}.` };
}

// The checkbox: complete or reopen through the task's own rules.
export async function toggleComplete(taskId: number, actor: TaskActor): Promise<WorkResult> {
  const loaded = await taskFor(taskId, actor);
  if (!loaded) return fail(NOT_FOUND);
  const ctx = await versionWithType(loaded.task.typeVersionId);
  const settings = parseTaskSettings(ctx?.version.settings);
  const reopening = loaded.task.status === "COMPLETED";
  if (!reopening && settings.completion !== "NONE") return fail("This task needs a completion note or file. Open it to complete it.");
  const action = reopening ? "REOPEN" : loaded.task.status === "BLOCKED" ? "UNBLOCK" : "COMPLETE";
  if (action === "UNBLOCK") return fail("This task is blocked. Open it to unblock it first.");
  const result = await actOnTask({ taskId, action, rowVersion: null, reason: reopening ? "Reopened from the list" : "", assigneeId: null, files: [] }, actor);
  if (!result.ok) return fail(result.message);
  return { ok: true, value: undefined, message: reopening ? "Reopened." : "Completed." };
}

// Quick field changes from lists, boards and the calendar.
export async function setTaskFields(taskId: number, change: { dueDay?: string; startDay?: string; assigneeId?: number; priority?: string; title?: string; milestone?: boolean; holidayOk?: boolean }, actor: TaskActor): Promise<WorkResult> {
  const loaded = await taskFor(taskId, actor);
  if (!loaded) return fail(NOT_FOUND);
  const { task, rights } = loaded;
  if (!OPEN_STATUSES.includes(task.status) && change.title === undefined) return fail("Reopen the task to change it.");
  if (change.assigneeId !== undefined) {
    if (change.assigneeId === task.assigneeId) return { ok: true, value: undefined };
    const blocked = await fieldBlockedBy(task.id, "assignee", loaded.viewer);
    if (blocked) return fail(`In ${blocked}, only some people may change the assignee (Project permissions).`);
    const result = await actOnTask({ taskId, action: "REASSIGN", rowVersion: null, reason: "Assigned from the task list", assigneeId: change.assigneeId, files: [] }, actor);
    return result.ok ? { ok: true, value: undefined, message: "Assigned." } : fail(result.message);
  }
  // D-222: ad hoc tasks: only their creator (and IT) change details; and a
  // project may restrict who updates a field (Project permissions).
  if (!rights.planning) return fail(rights.adhoc ? "Only its creator can change an ad hoc task's details." : "You can't change this task.");
  for (const field of ["due", "start", "priority"] as const) {
    const given = field === "due" ? change.dueDay : field === "start" ? change.startDay : change.priority;
    if (given === undefined) continue;
    const blocked = await fieldBlockedBy(task.id, field, loaded.viewer);
    if (blocked) return fail(`In ${blocked}, only some people may change this field (Project permissions).`);
  }
  const changes: Record<string, unknown> = {};
  const work: Parameters<typeof repo.setTaskWorkFields>[1] = {};
  const notes: string[] = [];
  if (change.dueDay !== undefined) {
    const due = change.dueDay ? dueFromDay(change.dueDay) : null;
    if (change.dueDay && !due) return fail("Choose a valid date.");
    changes.due_at = due;
    notes.push(change.dueDay ? `Due date set to ${change.dueDay}` : "Due date removed");
  }
  if (change.startDay !== undefined) {
    if (task.isMilestone && change.startDay) return fail("A milestone has no start date.");
    const start = /^\d{4}-\d{2}-\d{2}$/.test(change.startDay) ? change.startDay : null;
    changes.starts_on = start;
    notes.push(start ? `Start date set to ${start}` : "Start date removed");
  }
  if (change.priority !== undefined) {
    if (!rights.details) return fail(rights.adhoc ? "Only its creator can change an ad hoc task's details." : "Only the task's owners and project editors can change its priority.");
    if (!(TASK_PRIORITIES as readonly string[]).includes(change.priority)) return fail("Choose a priority.");
    changes.priority = change.priority;
    notes.push(`Priority set to ${PRIORITY_LABEL[change.priority as TaskPriority] ?? change.priority}`);
  }
  if (change.title !== undefined) {
    if (!rights.details) return fail(rights.adhoc ? "Only its creator can change an ad hoc task's details." : "You can't rename this task.");
    const title = clean(change.title, 200);
    if (!title) return fail("A task needs a name.");
    changes.title = title;
    notes.push("Renamed");
  }
  if (change.milestone !== undefined) {
    if (!rights.details) return fail(rights.adhoc ? "Only its creator can change an ad hoc task's details." : "You can't change this task.");
    work.is_milestone = change.milestone;
    if (change.milestone) work.starts_on = null;
    notes.push(change.milestone ? "Marked as a milestone" : "No longer a milestone");
  }
  if (change.dueDay || change.startDay) {
    const { settings: holidays, calendar } = await holidayContext(undefined, await departmentOf(task.assigneeId), task.assigneeId);
    const hit = checkHoliday(change.dueDay || null, "due", calendar, holidays, Boolean(change.holidayOk)) ?? checkHoliday(change.startDay || null, "start", calendar, holidays, Boolean(change.holidayOk));
    if (hit) return holidayFail(hit);
  }
  const start = (changes.starts_on as string | null | undefined) === undefined ? task.startsOn : (changes.starts_on as string | null);
  const dueAt = changes.due_at === undefined ? task.dueAt : (changes.due_at as Date | null);
  if (start && dueAt && start > new Date(dueAt.getTime() + 330 * 60_000).toISOString().slice(0, 10)) return fail("The start date can't be after the due date.");
  const outbox = await withTransaction(async (connection) => {
    const fresh = await findTask(taskId, connection, true);
    if (!fresh) return [];
    if (Object.keys(changes).length) await updateTask(taskId, fresh.rowVersion, changes, connection);
    if (Object.keys(work).length) await repo.setTaskWorkFields(taskId, work, connection);
    await appendTaskEvent(taskId, { actorId: actor.id, type: "EDIT", from: fresh.status, to: fresh.status, body: notes.join("; "), payload: changes.due_at !== undefined ? { dueChanged: true } : null }, connection);
    const messages = changes.due_at !== undefined && fresh.assigneeId !== actor.id ? [taskMessages.updated(info({ ...fresh, dueAt }), fresh.assigneeId, notes[0]!.toLowerCase())] : [];
    return insertOutbox(null, messages, connection);
  });
  await send(outbox);
  return { ok: true, value: undefined, message: "Saved." };
}

// Make a task a subtask of another (or a top task again: parentId null).
export async function setParent(taskId: number, parentId: number | null, actor: TaskActor): Promise<WorkResult> {
  const loaded = await taskFor(taskId, actor);
  if (!loaded || !loaded.rights.edit) return fail(loaded ? "You can't move this task." : NOT_FOUND);
  // QA-WF-03 (v1.42.1): a work step isn't moved under another task (a parent's delete or repeat would carry it along).
  if (workMirrorLink(loaded.task.formData)) return fail(mirrorRefusal(loaded.task.relatedRequestNo));
  let parentDepth = -1;
  let rootId: number | null = null;
  if (parentId !== null) {
    const parent = await taskFor(parentId, actor);
    if (!parent) return fail("Choose a task you can see.");
    if (!parent.rights.edit) return fail("You can't add subtasks to that task.");
    if (workMirrorLink(parent.task.formData)) return fail(mirrorRefusal(parent.task.relatedRequestNo));
    const chain = (await repo.ancestors(parentId)).map((item) => item.id);
    const below = await repo.descendants(taskId);
    const problem = subtaskProblem({ taskId, parentId, parentDepth: parent.task.depth, ancestorsOfParent: chain, subtreeHeight: Math.max(0, ...below.map((item) => item.level)) });
    if (problem) return fail(problem);
    parentDepth = parent.task.depth;
    rootId = parent.task.rootTaskId ?? parent.task.id;
  }
  await withTransaction(async (connection) => {
    const top = parentId === null ? null : await repo.lastSubtaskPosition(parentId, connection);
    await repo.setTaskTree(taskId, { parentTaskId: parentId, rootTaskId: rootId, depth: parentDepth + 1, position: positionBetween(top, null) }, connection);
    // The task's own subtasks follow it.
    for (const item of await repo.descendants(taskId, connection)) {
      await connection.query("UPDATE tasks SET root_task_id = ?, depth = ? WHERE id = ?", [rootId ?? taskId, parentDepth + 1 + item.level, item.id]);
    }
    await appendTaskEvent(taskId, { actorId: actor.id, type: "PARENT_CHANGED", body: parentId === null ? "Now a top-level task" : "Now a subtask", payload: { parentId } }, connection);
  });
  return { ok: true, value: undefined, message: parentId === null ? "It's a top-level task now." : "It's a subtask now." };
}

export async function moveSubtask(taskId: number, beforeId: number | null, afterId: number | null, actor: TaskActor): Promise<WorkResult> {
  const loaded = await taskFor(taskId, actor);
  if (!loaded?.task.parentTaskId) return fail(NOT_FOUND);
  const parent = await taskFor(loaded.task.parentTaskId, actor);
  if (!parent?.rights.edit) return fail("You can't reorder these subtasks.");
  const siblings = (await repo.listSubtasks(parent.task.id)).filter((item) => item.id !== taskId);
  const at = afterId !== null ? siblings.findIndex((item) => item.id === afterId) + 1 : beforeId !== null ? siblings.findIndex((item) => item.id === beforeId) : siblings.length;
  const index = at < 0 ? siblings.length : at;
  await withTransaction(async (connection) => {
    await repo.setTaskTree(taskId, { parentTaskId: parent.task.id, rootTaskId: loaded.task.rootTaskId, depth: loaded.task.depth, position: positionBetween(siblings[index - 1]?.position ?? null, siblings[index]?.position ?? null) }, connection);
  });
  return { ok: true, value: undefined };
}

// QA-WF-03 / QA-SEC-05 (v1.42.1): what a work-step task refuses.
const mirrorRefusal = (requestNo: string | null) => `This task is a work step of ${requestNo ?? "a request"}; it follows the request (it can't be put in a project, under another task, made to repeat or deleted on its own).`;

// Delete keeps the task (and its subtasks) for 30 days; Restore brings them back.
export async function deleteTask(taskId: number, actor: TaskActor): Promise<WorkResult> {
  const loaded = await taskFor(taskId, actor);
  if (!loaded) return fail(NOT_FOUND);
  if (!(loaded.rights.edit)) return fail("Only the task's creator, project editors and IT can delete it.");
  // D-269: a request's work step closes with the request, not on its own.
  if (workMirrorLink(loaded.task.formData) && OPEN_STATUSES.includes(loaded.task.status)) return fail(`This task is a work step of ${loaded.task.relatedRequestNo ?? "a request"}; it closes on the request.`);
  const now = new Date();
  await withTransaction(async (connection) => {
    for (const id of [taskId, ...(await repo.descendants(taskId, connection)).map((item) => item.id)]) {
      const task = await findTask(id, connection, true);
      if (!task || task.deletedAt) continue;
      // QA-WF-03: a work step under the deleted task stays (it closes with its request).
      if (id !== taskId && workMirrorLink(task.formData)) continue;
      await repo.setTaskWorkFields(id, { deleted_at: now, deleted_by: actor.id }, connection);
      // An open task is closed as cancelled, so counts, reminders, calendars
      // and analytics everywhere leave it out; Restore puts its status back.
      if (OPEN_STATUSES.includes(task.status)) await updateTask(id, task.rowVersion, { status: "CANCELLED", cancelled_by: actor.id, cancelled_at: now }, connection);
      await appendTaskEvent(id, { actorId: actor.id, type: "DELETED", from: task.status, to: OPEN_STATUSES.includes(task.status) ? "CANCELLED" : task.status, payload: { status: task.status } }, connection);
    }
    await recordAudit({ actorUserId: actor.id, action: "TASK_DELETED", entityType: "TASK", entityId: taskId, sessionId: actor.sessionId, ipAddress: actor.ipAddress ?? null }, connection);
  });
  return { ok: true, value: undefined, message: "Deleted. You can restore it for 30 days." };
}

export async function restoreTask(taskId: number, actor: TaskActor): Promise<WorkResult> {
  const task = await findTask(taskId);
  if (!task?.deletedAt) return fail(NOT_FOUND);
  if (!(task.createdBy === actor.id || task.deletedBy === actor.id || isAdminRoles(actor.roles))) return fail(NOT_FOUND);
  await withTransaction(async (connection) => {
    for (const id of [taskId, ...(await repo.descendants(taskId, connection)).map((item) => item.id)]) {
      const current = await findTask(id, connection, true);
      if (!current?.deletedAt) continue;
      await repo.setTaskWorkFields(id, { deleted_at: null, deleted_by: null }, connection);
      const [rows] = await connection.query<RowDataPacket[]>("SELECT JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.status')) AS status FROM task_events WHERE task_id = ? AND event_type = 'DELETED' ORDER BY id DESC LIMIT 1", [id]);
      const before = String(rows[0]?.status ?? "");
      if (current.status === "CANCELLED" && (OPEN_STATUSES as readonly string[]).includes(before)) await updateTask(id, current.rowVersion, { status: before, cancelled_by: null, cancelled_at: null }, connection);
      await appendTaskEvent(id, { actorId: actor.id, type: "RESTORED", from: current.status, to: (OPEN_STATUSES as readonly string[]).includes(before) ? before : current.status }, connection);
    }
    await recordAudit({ actorUserId: actor.id, action: "TASK_RESTORED", entityType: "TASK", entityId: taskId, sessionId: actor.sessionId, ipAddress: actor.ipAddress ?? null }, connection);
  });
  return { ok: true, value: undefined, message: "Restored." };
}

// ---- collaboration -----------------------------------------------------------------------
export async function setFollower(taskId: number, userId: number, on: boolean, actor: TaskActor): Promise<WorkResult> {
  const loaded = await taskFor(taskId, actor);
  if (!loaded) return fail(NOT_FOUND);
  const self = userId === actor.id;
  if (!self && !loaded.rights.comment) return fail("You can't change this task's followers.");
  if (on && !self) {
    const person = await personFacts(userId);
    if (!person?.active) return fail("Choose an active person.");
  }
  const outbox = await withTransaction(async (connection) => {
    if (on) {
      const added = await repo.addFollower(taskId, userId, "MANUAL", actor.id, connection);
      if (added) await appendTaskEvent(taskId, { actorId: actor.id, type: "FOLLOWER_ADDED", payload: { userId } }, connection);
      return insertOutbox(null, added && !self ? [taskMessages.followed(info(loaded.task), userId, actor.name)] : [], connection);
    }
    await repo.removeFollower(taskId, userId, connection);
    await appendTaskEvent(taskId, { actorId: actor.id, type: "FOLLOWER_REMOVED", payload: { userId } }, connection);
    return [];
  });
  await send(outbox);
  return { ok: true, value: undefined, message: on ? (self ? "You follow this task." : "Follower added.") : self ? "You no longer follow it." : "Follower removed." };
}

export async function likeTask(taskId: number, actor: TaskActor): Promise<WorkResult<{ liked: boolean }>> {
  const loaded = await taskFor(taskId, actor);
  if (!loaded) return fail(NOT_FOUND);
  return { ok: true, value: { liked: await repo.toggleLike("TASK", taskId, actor.id) } };
}

export async function addComment(taskId: number, body: string, parentCommentId: number | null, actor: TaskActor, options: { addMentionedAsFollowers: boolean } = { addMentionedAsFollowers: true }): Promise<WorkResult<{ id: number; notSeeing: string[] }>> {
  const loaded = await taskFor(taskId, actor);
  if (!loaded) return fail(NOT_FOUND);
  if (!loaded.rights.comment) return fail("You can read this task but not comment on it.");
  const text = body.trim();
  if (!text) return fail("Write a comment.", { body: "Write a comment." });
  if (text.length > 4000) return fail("Use 4000 characters or fewer.", { body: "Use 4000 characters or fewer." });
  if (parentCommentId !== null) {
    const parent = await repo.findComment(parentCommentId);
    if (!parent || parent.taskId !== taskId) return fail(NOT_FOUND);
    if (parent.parentCommentId !== null) return fail("Reply to the first comment of the thread.");
  }
  // Mentioned people: those who can't see the task are added as followers
  // (so they can), unless the author chose not to.
  const mentioned = mentionedIds(text).filter((id) => id !== actor.id).slice(0, 20);
  const canSee: number[] = [];
  const notSeeing: string[] = [];
  for (const id of mentioned) {
    const person = await personFacts(id);
    if (!person?.active) continue;
    const rights = await rightsOn(loaded.task, { id, departmentId: person.departmentId, isAdmin: false, teamIds: await teamOf(id) });
    if (rights.view || options.addMentionedAsFollowers) canSee.push(id);
    else notSeeing.push(person.name);
  }
  const outcome = await withTransaction(async (connection) => {
    const id = await repo.insertComment(taskId, parentCommentId, actor.id, text, connection);
    await appendTaskEvent(taskId, { actorId: actor.id, type: "COMMENTED", body: text.slice(0, 2000), payload: { commentId: id } }, connection);
    await repo.addFollower(taskId, actor.id, "COMMENT", actor.id, connection);
    for (const person of canSee) await repo.addFollower(taskId, person, "MENTION", actor.id, connection);
    const followers = (await repo.listFollowers(taskId, connection)).map((item) => item.id);
    const recipients = new Set<number>([loaded.task.assigneeId, loaded.task.createdBy, ...followers]);
    recipients.delete(actor.id);
    const messages: NotifyInput[] = [];
    for (const person of canSee) {
      messages.push(taskMessages.mentioned(info(loaded.task), person, actor.name));
      recipients.delete(person);
    }
    for (const person of recipients) messages.push(taskMessages.comment(info(loaded.task), person, actor.name));
    return { id, outbox: await insertOutbox(null, messages, connection) };
  });
  await send(outcome.outbox);
  return { ok: true, value: { id: outcome.id, notSeeing } };
}

export async function changeComment(commentId: number, change: { body?: string; pinned?: boolean; delete?: boolean }, actor: TaskActor): Promise<WorkResult> {
  const comment = await repo.findComment(commentId);
  if (!comment || comment.deletedAt) return fail(NOT_FOUND);
  const loaded = await taskFor(comment.taskId, actor);
  if (!loaded) return fail(NOT_FOUND);
  const author = comment.authorId === actor.id;
  if (change.body !== undefined) {
    if (!author) return fail("Only its author can edit a comment.");
    const text = change.body.trim();
    if (!text || text.length > 4000) return fail("Write 1 to 4000 characters.");
    await repo.updateComment(commentId, { body: text }, getDbPool());
  }
  if (change.pinned !== undefined) {
    if (!(author || atLeastEditor(loaded.rights))) return fail("Only its author and the task's editors can pin a comment.");
    await repo.updateComment(commentId, { pinned: change.pinned }, getDbPool());
  }
  if (change.delete) {
    if (!(author || loaded.viewer.isAdmin)) return fail("Only its author can delete a comment.");
    await withTransaction(async (connection) => {
      await repo.updateComment(commentId, { deletedBy: actor.id }, connection);
      if (!author) await recordAudit({ actorUserId: actor.id, action: "TASK_COMMENT_REMOVED", entityType: "TASK", entityId: comment.taskId, sessionId: actor.sessionId, ipAddress: actor.ipAddress ?? null, metadata: { commentId } }, connection);
    });
  }
  return { ok: true, value: undefined };
}
const atLeastEditor = (rights: { edit: boolean }) => rights.edit;

export async function likeComment(commentId: number, actor: TaskActor): Promise<WorkResult<{ liked: boolean }>> {
  const comment = await repo.findComment(commentId);
  if (!comment || comment.deletedAt || !(await taskFor(comment.taskId, actor))) return fail(NOT_FOUND);
  return { ok: true, value: { liked: await repo.toggleLike("COMMENT", commentId, actor.id) } };
}

// ---- dependencies and tags ----------------------------------------------------------------
export async function setDependency(blockedId: number, blockerRef: string, on: boolean, actor: TaskActor): Promise<WorkResult> {
  const loaded = await taskFor(blockedId, actor);
  if (!loaded) return fail(NOT_FOUND);
  if (!loaded.rights.planning) return fail(loaded.rights.adhoc ? "Only its creator can change an ad hoc task's details." : "You can't change what blocks this task.");
  const ref = blockerRef.trim().toUpperCase();
  const [rows] = await getDbPool().query<RowDataPacket[]>("SELECT id FROM tasks WHERE task_no = ? OR id = ? LIMIT 1", [ref, /^\d{1,10}$/.test(ref) ? Number(ref) : 0]);
  const blockerId = rows[0] ? Number(rows[0].id) : null;
  const blocker = blockerId ? await taskFor(blockerId, actor) : null;
  if (!blocker) return fail("No task with that number that you can see.", { blocker: "No task with that number that you can see." });
  if (!on) {
    await withTransaction(async (connection) => {
      await repo.removeDependency(blocker.task.id, blockedId, connection);
      await appendTaskEvent(blockedId, { actorId: actor.id, type: "DEPENDENCY_REMOVED", body: blocker.task.taskNo }, connection);
    });
    return { ok: true, value: undefined, message: "Removed." };
  }
  const chain = (await repo.ancestors(blockedId)).map((item) => item.id);
  const below = (await repo.descendants(blockedId)).map((item) => item.id);
  if (chain.includes(blocker.task.id) || below.includes(blocker.task.id)) return fail("A task can't wait for its own parent or subtasks.", { blocker: "Choose a task outside this one's family." });
  const result = await withTransaction(async (connection) => {
    if ((await repo.countDependencies(blockedId, connection)) >= MAX_DEPENDENCIES) return `A task has at most ${MAX_DEPENDENCIES} dependencies.`;
    if (dependencyLoop(blocker.task.id, blockedId, await repo.dependencyEdges(connection))) return "That would make the tasks wait for each other in a loop.";
    await repo.addDependency(blocker.task.id, blockedId, actor.id, connection);
    await appendTaskEvent(blockedId, { actorId: actor.id, type: "DEPENDENCY_ADDED", body: `Waiting for ${blocker.task.taskNo}` }, connection);
    return null;
  });
  return result ? fail(result, { blocker: result }) : { ok: true, value: undefined, message: `Now waiting for ${blocker.task.taskNo}.` };
}

export async function setTag(taskId: number, name: string, on: boolean, actor: TaskActor): Promise<WorkResult> {
  const loaded = await taskFor(taskId, actor);
  if (!loaded) return fail(NOT_FOUND);
  if (!loaded.rights.planning) return fail(loaded.rights.adhoc ? "Only its creator can change an ad hoc task's details." : "You can't tag this task.");
  const tag = clean(name, 60).replace(/^#/, "");
  if (!tag) return fail("Write a tag.", { tag: "Write a tag." });
  await withTransaction(async (connection) => {
    const id = await repo.tagByName(tag, actor.id, "gray", connection);
    await repo.setTaskTag(taskId, id, on, actor.id, connection);
    await appendTaskEvent(taskId, { actorId: actor.id, type: on ? "TAG_ADDED" : "TAG_REMOVED", body: tag }, connection);
  });
  return { ok: true, value: undefined };
}

// ---- status updates ------------------------------------------------------------------------
export async function postStatus(projectId: number, input: { status: string; title: string; body: string }, actor: TaskActor): Promise<WorkResult> {
  const found = await projectWithRole(projectId, actor);
  if (!found) return fail(NOT_FOUND);
  if (!found.can.edit) return fail("Only owners and editors can post status updates.");
  if (!(STATUS_KINDS as readonly string[]).includes(input.status)) return fail("Choose a status.", { status: "Choose a status." });
  const status = input.status as (typeof STATUS_KINDS)[number];
  const title = clean(input.title, 200) || STATUS_KIND_LABEL[status];
  const body = input.body.trim().slice(0, 4000) || null;
  const outbox = await withTransaction(async (connection) => {
    const snapshot = await repo.projectCounts(projectId, connection);
    await repo.insertStatusUpdate(projectId, status, title, body, snapshot, actor.id, connection);
    await repo.updateProject(projectId, { current_status: status, completed_at: status === "COMPLETE" ? new Date() : null }, connection);
    await repo.appendProjectEvent(projectId, actor.id, "STATUS", `${STATUS_KIND_LABEL[status]}: ${title}`, connection);
    const people = await withProjects(found.members.filter((member) => member.type === "USER" && member.id !== actor.id).map((member) => member.id), connection);
    return insertOutbox(null, people.map((person) => projectMessages.status({ id: projectId, name: found.project.name }, person, actor.name, STATUS_KIND_LABEL[status], title)), connection);
  });
  await send(outbox);
  return { ok: true, value: undefined, message: "Status update posted." };
}

export async function removeStatus(statusId: number, actor: TaskActor): Promise<WorkResult> {
  const update = await repo.findStatusUpdate(statusId);
  if (!update) return fail(NOT_FOUND);
  const found = await projectWithRole(update.projectId, actor);
  if (!found) return fail(NOT_FOUND);
  if (update.authorId !== actor.id) return fail("Only its author can delete a status update.");
  await repo.deleteStatusUpdate(statusId, getDbPool());
  return { ok: true, value: undefined, message: "Deleted." };
}

// ---- My Tasks --------------------------------------------------------------------------
// My Tasks order is the person's own: the page sends the number between the
// neighbours it shows (only their own list is affected).
export async function placeMine(taskId: number, sectionId: number, position: number, actor: TaskActor): Promise<WorkResult> {
  const task = await findTask(taskId);
  if (!task || task.deletedAt || task.assigneeId !== actor.id) return fail(NOT_FOUND);
  const sections = await repo.ensureMySections(actor.id);
  if (!sections.some((section) => section.id === sectionId)) return fail(NOT_FOUND);
  if (!Number.isFinite(position)) return fail("Couldn't move it. Reload and try again.");
  await repo.placeMyTask(actor.id, taskId, sectionId, position);
  return { ok: true, value: undefined };
}

export type { WorkViewer };

// ---- holidays (D-217) ------------------------------------------------------------------
// IT moves every open task due on a holiday to the nearest working day
// (keeping its time), or tells the people they are assigned to.
export async function moveHolidayTasks(day: string, direction: "NEXT" | "PREVIOUS", actor: TaskActor): Promise<WorkResult<{ moved: number; to: string }>> {
  if (!isAdminRoles(actor.roles)) return fail(NOT_FOUND);
  const { settings, calendar } = await holidayContext();
  const name = calendar.holidays.get(day);
  if (!name) return fail("That day isn't a holiday.");
  const target = nearestWorkingDay(day, calendar, settings, direction);
  const shiftMs = new Date(`${target}T00:00:00Z`).getTime() - new Date(`${day}T00:00:00Z`).getTime();
  const tasks = await openTasksDueOn(day);
  const outbox = await withTransaction(async (connection) => {
    const messages: NotifyInput[] = [];
    for (const item of tasks) {
      const fresh = await findTask(item.id, connection, true);
      if (!fresh?.dueAt) continue;
      const dueAt = new Date(fresh.dueAt.getTime() + shiftMs);
      await updateTask(item.id, fresh.rowVersion, { due_at: dueAt }, connection);
      await appendTaskEvent(item.id, { actorId: actor.id, type: "EDIT", from: fresh.status, to: fresh.status, body: `Due date moved from ${day} (${name}) to ${target}`, payload: { dueChanged: true } }, connection);
      messages.push(taskMessages.updated(info({ ...fresh, dueAt }), fresh.assigneeId, `due date moved from ${day} (holiday: ${name}) to ${target}`));
    }
    await recordAudit({ actorUserId: actor.id, action: "TASKS_MOVED_OFF_HOLIDAY", entityType: "HOLIDAY", entityId: day, sessionId: actor.sessionId, ipAddress: actor.ipAddress ?? null, metadata: { to: target, tasks: tasks.length } }, connection);
    return insertOutbox(null, messages, connection);
  });
  await send(outbox);
  return { ok: true, value: { moved: tasks.length, to: target }, message: `Moved ${tasks.length} task${tasks.length === 1 ? "" : "s"} to ${target}; their assignees were told.` };
}

// v1.54.5 (owner: "when out of office dates are set, the tasks already falling
// on those dates move to the next day after the to-date"): the person's open
// tasks due within the dates move to the first working day after them (their
// own department's holidays count), keeping the time of day; whoever gave
// each task is told. Returns how many moved and where to.
export async function moveTasksOutOfAway(userId: number, startsOn: string, endsOn: string, actorId: number): Promise<{ moved: number; to: string }> {
  const dayAfter = new Date(new Date(`${endsOn}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
  const { settings, calendar } = await holidayContext(undefined, await departmentOf(userId));
  const target = nearestWorkingDay(dayAfter, calendar, settings, "NEXT");
  const [rows] = await getDbPool().query<RowDataPacket[]>(
    `SELECT id FROM tasks WHERE assignee_id = ? AND deleted_at IS NULL AND status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED') AND due_at IS NOT NULL
       AND DATE(DATE_ADD(due_at, INTERVAL 330 MINUTE)) BETWEEN ? AND ? ORDER BY id LIMIT 1000`,
    [userId, startsOn, endsOn],
  );
  if (!rows.length) return { moved: 0, to: target };
  let moved = 0;
  const outbox = await withTransaction(async (connection) => {
    const messages: NotifyInput[] = [];
    for (const row of rows) {
      const fresh = await findTask(Number(row.id), connection, true);
      if (!fresh?.dueAt) continue;
      const from = new Date(fresh.dueAt.getTime() + 330 * 60_000).toISOString().slice(0, 10); // the India day
      const shiftMs = new Date(`${target}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime();
      const dueAt = new Date(fresh.dueAt.getTime() + shiftMs);
      if (!(await updateTask(fresh.id, fresh.rowVersion, { due_at: dueAt }, connection))) continue;
      moved += 1;
      await appendTaskEvent(fresh.id, { actorId, type: "EDIT", from: fresh.status, to: fresh.status, body: `Due date moved from ${from} to ${target}: out of office ${startsOn} to ${endsOn}`, payload: { dueChanged: true } }, connection);
      if (fresh.assignedBy && fresh.assignedBy !== userId) messages.push(taskMessages.updated(info({ ...fresh, dueAt }), fresh.assignedBy, `due date moved from ${from} to ${target}: the assignee is out of office ${startsOn} to ${endsOn}`));
    }
    await recordAudit({ actorUserId: actorId, action: "TASKS_MOVED_OUT_OF_OFFICE", entityType: "USER", entityId: userId, metadata: { startsOn, endsOn, to: target, tasks: moved } }, connection);
    return insertOutbox(null, messages, connection);
  });
  await send(outbox);
  return { moved, to: target };
}

export async function tellHolidayTasks(day: string, actor: TaskActor | null): Promise<WorkResult<{ told: number }>> {
  if (actor && !isAdminRoles(actor.roles)) return fail(NOT_FOUND);
  const { calendar } = await holidayContext();
  const name = calendar.holidays.get(day);
  if (!name) return fail("That day isn't a holiday.");
  const tasks = await openTasksDueOn(day);
  const messages = tasks.map((task) => taskMessages.updated({ id: task.id, taskNo: task.taskNo, title: task.title, dueAt: task.dueAt }, task.assigneeId, `it is due on ${day}, a holiday (${name}); keep the date or change it`));
  if (messages.length) await send(await insertOutbox(null, messages, getDbPool()));
  return { ok: true, value: { told: messages.length }, message: `Told the assignees of ${messages.length} task${messages.length === 1 ? "" : "s"}.` };
}

// D-222: the first project (by name) whose permissions keep this person from
// updating `field` ("due", "assignee", "field:<id>"…) on the task, or null.
export async function fieldBlockedBy(taskId: number, field: string, viewer: WorkViewer): Promise<string | null> {
  for (const link of await repo.listTaskProjects(taskId)) {
    const found = await repo.projectFor(link.projectId, viewer);
    if (found && !mayUpdateField(found.project.permissions, field, found.role, viewer.isAdmin)) return found.project.name;
  }
  return null;
}

// D-222: Project permissions (owners): field restrictions and sharing tasks.
export async function setPermissions(projectId: number, raw: unknown, actor: TaskActor): Promise<WorkResult> {
  const found = await projectWithRole(projectId, actor);
  if (!found) return fail(NOT_FOUND);
  if (!found.can.manage) return fail("Only the project's admins (owners) change its permissions.");
  const permissions = parseProjectPermissions(raw);
  await withTransaction(async (connection) => {
    await repo.setProjectPermissions(projectId, permissions, connection);
    await repo.appendProjectEvent(projectId, actor.id, "PERMISSIONS", `${permissions.fields.length} field rule(s); sharing: ${permissions.shareTasks}`, connection);
    await recordAudit({ actorUserId: actor.id, action: "PROJECT_PERMISSIONS", entityType: "PROJECT", entityId: projectId, sessionId: actor.sessionId, ipAddress: actor.ipAddress ?? null, metadata: { ...permissions } }, connection);
  });
  return { ok: true, value: undefined, message: "Permissions saved." };
}

// D-222: an ad hoc task for several people: one copy each, linked as a group.
export async function quickAddForMany(input: QuickTaskInput, assigneeIds: readonly number[], actor: TaskActor): Promise<WorkResult<{ id: number; taskNo: string; ids: number[]; failed?: number }>> {
  const people = [...new Set(assigneeIds)].slice(0, 50);
  if (people.length < 2) {
    const one = await quickAddTask({ ...input, assigneeId: people[0] ?? input.assigneeId }, actor);
    return one.ok ? { ok: true, value: { ...one.value, ids: [one.value.id] } } : one;
  }
  // D-246 (audit DB-007): one person's problem doesn't stop the others, and
  // the answer names who was missed (the page shows it as a partial success).
  const ids: number[] = [];
  const missed: { id: number; message: string }[] = [];
  let first: { id: number; taskNo: string } | null = null;
  for (const person of people) {
    const made = await quickAddTask({ ...input, assigneeId: person }, actor);
    if (!made.ok) {
      missed.push({ id: person, message: made.message });
      continue;
    }
    ids.push(made.value.id);
    first ??= made.value;
  }
  if (!first) return fail(missed[0]?.message ?? "Couldn't create the task.");
  await getDbPool().query("UPDATE tasks SET assign_group_id = ? WHERE id IN (?)", [ids[0], ids]);
  if (!missed.length) return { ok: true, value: { ...first, ids }, message: `Created for ${ids.length} people: each has their own copy.` };
  const names = await Promise.all(missed.map(async (item) => (await personFacts(item.id))?.name ?? `person ${item.id}`));
  return {
    ok: true,
    value: { ...first, ids, failed: missed.length },
    message: `Created for ${ids.length} of ${people.length} people. Not for ${names.join(", ")}: ${[...new Set(missed.map((item) => item.message))].join(" ")}`,
  };
}

// D-308 (owner): project notifications (inbox, email, WhatsApp, push) go only
// to people with the Projects module (or the Super Admin) until it is released.
async function withProjects(userIds: readonly number[], db: Queryable): Promise<number[]> {
  if (!userIds.length) return [];
  const [rows] = await db.query<(RowDataPacket & { id: number })[]>(
    "SELECT u.id FROM users u WHERE u.id IN (?) AND (FIND_IN_SET('PROJECT', u.module_access) > 0 OR EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.code = 'SUPER_ADMIN'))",
    [userIds],
  );
  const allowed = new Set(rows.map((row) => Number(row.id)));
  return userIds.filter((id) => allowed.has(id));
}

