import { workMirrorLink } from "@/server/approvals/work-mirror";
import "server-only";
import { withTransaction } from "@/lib/db/transaction";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { insertOutbox } from "@/lib/db/repositories/outbox.repository";
import { findRequest, findRequestByNumber, nextRequestNumber } from "@/lib/db/repositories/approvals.repository";
import { loadFieldLookups } from "@/lib/db/repositories/lookups.repository";
import { listActiveUserOptions } from "@/lib/db/repositories/admin-users.repository";
import { findLiveType, versionWithType } from "@/lib/db/repositories/module-types.repository";
import { appendTaskEvent, findTask, findTaskBySubmissionKey, insertTask, personFacts, updateTask } from "@/lib/db/repositories/tasks.repository";
import { countEvidence, discardStaged, insertRecordFiles, RecordFileError, type StagedFile } from "@/server/modules/files";
import { taskMessages } from "@/server/modules/messages";
import { indiaLocalToUtc, mayCreate, parseTaskSettings, TASK_PRIORITIES, type TaskPriority, type TaskSettings } from "@/server/modules/settings";
import { allowedTaskActions, canSeeTask, completionProblems, mayAssignTo, NEXT_STATUS, needsReason, type TaskAction } from "@/server/modules/task-rules";
import { parseFormSubmission, type FormField } from "@/server/forms/fields";
import { canSeeRequest } from "@/server/attachments/service";
import { deliverOutbox } from "@/server/approvals/service";
import type { NotifyInput } from "@/server/notifications/notify";
import type { RoleCode } from "@/types/auth";
import { addFollower, clearPlacements } from "@/lib/db/repositories/work.repository";
import { taskViewerFor, teamOf } from "@/server/work/task-access";
import { checkHoliday, holidayMessage } from "@/server/work/holidays";
import { departmentOf, holidayContext } from "@/server/work/holiday-store";
import { afterTaskCompleted } from "@/server/work/on-complete";
import { indiaDate } from "@/server/workflows/calendar";

const utcToIndiaLocalDay = (value: Date | null) => (value ? indiaDate(value) : null);

// D-217: the holiday rule of Admin → Task holidays, as form errors.
// The assignee's department holidays count too (D-218).
async function holidayErrors(day: string, keep: boolean, errors: Record<string, string>, assigneeId: number | null): Promise<void> {
  const { settings, calendar } = await holidayContext(undefined, assigneeId ? await departmentOf(assigneeId) : null);
  const hit = checkHoliday(day, "due", calendar, settings, keep);
  if (!hit) return;
  errors.due = holidayMessage(hit);
  if (hit.mode === "WARN") errors.holiday_ok = "1";
}

// v1.9.0 (D-143): Task Management. Every change runs in one transaction:
// lock the task, check the rules for this person (task-rules.ts), write the
// change with its row version, add the history entry and audit row, queue
// the messages; the messages are sent after the commit (outbox).
export interface TaskActor {
  id: number;
  name: string;
  roles: readonly string[];
  sessionId?: string;
  ipAddress?: string | null;
}
export type TaskResult<T = undefined> = { ok: true; value: T } | { ok: false; message: string; fieldErrors?: Record<string, string> };

export const isAdminActor = (actor: { roles: readonly string[] }) => actor.roles.includes("IT_ADMIN") || actor.roles.includes("SUPER_ADMIN");

// The task and its settings, if this person may see it (else null: a 404).
// D-215: projects, followers and the top task count too (taskViewerFor); a
// deleted task is shown only to its creator, its deleter and IT (to restore).
export async function loadTaskFor(id: number, actor: { id: number; roles: readonly string[] }) {
  const task = await findTask(id);
  if (!task) return null;
  if (task.deletedAt && !(task.createdBy === actor.id || task.deletedBy === actor.id || isAdminActor(actor))) return null;
  const viewer = await taskViewerFor(task, actor);
  const ctx = await versionWithType(task.typeVersionId);
  if (!ctx) return null;
  const settings = parseTaskSettings(ctx.version.settings);
  if (!canSeeTask(task, viewer)) return null;
  const actions = task.deletedAt ? new Set<TaskAction>() : allowedTaskActions(task, viewer, settings);
  return { task, settings, form: ctx.version.form, versionNo: ctx.version.versionNo, actions, viewer };
}

async function send(ids: number[]) {
  if (ids.length) await deliverOutbox(ids).catch(() => undefined);
}

// ---- create -------------------------------------------------------------------------
export interface CreateTaskInput {
  typeId: number;
  title: string;
  description: string;
  priority: string;
  assigneeId: number | null;
  due: string; // India local "YYYY-MM-DDTHH:mm" or ""
  startsOn: string;
  related: string; // request number, or ""
  fields: Record<string, string | undefined>;
  submissionKey: string | null;
  files: StagedFile[];
  holidayOk?: boolean; // D-217: keep a due date on a holiday
}

export async function createTask(input: CreateTaskInput, actor: TaskActor): Promise<TaskResult<{ id: number; taskNo: string }>> {
  const fail = (message: string, fieldErrors?: Record<string, string>): TaskResult<{ id: number; taskNo: string }> => ({ ok: false, message, fieldErrors });
  try {
    if (input.submissionKey) {
      const earlier = await findTaskBySubmissionKey(actor.id, input.submissionKey);
      if (earlier) {
        await discardStaged(input.files);
        return { ok: true, value: earlier };
      }
    }
    const type = await findLiveType("TASK", input.typeId);
    if (!type) return fail("That task type isn't available.");
    const settings = parseTaskSettings(type.settings);
    const me = await personFacts(actor.id);
    if (!me || !mayCreate(settings.access, { id: actor.id, departmentId: me.departmentId })) return fail("You can't create tasks of this type.");

    const errors: Record<string, string> = {};
    const title = input.title.trim();
    if (title.length < 3 || title.length > 200) errors.title = "Give the task a title of 3 to 200 characters.";
    const description = input.description.trim();
    if (description.length > 4000) errors.description = "Use 4000 characters or fewer.";
    const priority = (TASK_PRIORITIES as readonly string[]).includes(input.priority) ? (input.priority as TaskPriority) : settings.defaultPriority;
    let dueAt: Date | null = null;
    if (input.due) {
      dueAt = indiaLocalToUtc(input.due);
      if (!dueAt) errors.due = "Choose a valid due date and time.";
    } else if (settings.requireDueDate) errors.due = "This type needs a due date.";
    if (dueAt) await holidayErrors(input.due.slice(0, 10), Boolean(input.holidayOk), errors, input.assigneeId);
    const startsOn = /^\d{4}-\d{2}-\d{2}$/.test(input.startsOn) ? input.startsOn : null;
    // Assignee: within the type's scope.
    const assignee = input.assigneeId ? await personFacts(input.assigneeId) : null;
    if (!assignee) errors.assignee = "Choose who should do it.";
    else if (!mayAssignTo(settings, { creatorId: actor.id, creatorDepartmentId: me.departmentId, creatorTeamIds: await teamOf(actor.id), candidate: assignee }, isAdminActor(actor))) errors.assignee = "This type can't be assigned to that person.";
    // Related approval request: must exist and be visible to the creator.
    let relatedRequestId: number | null = null;
    if (input.related.trim()) {
      if (!settings.allowRelatedRequest) errors.related = "This type doesn't link to requests.";
      else {
        const request = await findRequestByNumber(input.related.trim().toUpperCase());
        if (!request || !(await canSeeRequest(request, { id: actor.id, roles: actor.roles as readonly RoleCode[] }))) errors.related = "No request with that number that you can see.";
        else relatedRequestId = request.id;
      }
    }
    const active = new Set((await listActiveUserOptions()).map((person) => person.id));
    const fields = withFileCounts(type.form, input.fields, input.files);
    const parsed = parseFormSubmission(type.form, fields, active, await loadFieldLookups());
    if (!parsed.ok) Object.assign(errors, parsed.errors);
    if (Object.keys(errors).length) {
      await discardStaged(input.files);
      return fail("Check the highlighted fields.", errors);
    }

    const outcome = await withTransaction(async (connection) => {
      // QA-DB-04 (v1.42.1): the linked request first, then the task number,
      // the same order as a decision on that request (which may make a work
      // step's task), so the two never wait on each other.
      if (relatedRequestId) await connection.query("SELECT id FROM approval_requests WHERE id = ? LOCK IN SHARE MODE", [relatedRequestId]);
      const taskNo = await nextRequestNumber("TSK", connection);
      const id = await insertTask(
        { taskNo, typeVersionId: type.versionId, title, description: description || null, priority, createdBy: actor.id, assigneeId: assignee!.id, dueAt, startsOn, formData: parsed.data, relatedRequestId, submissionKey: input.submissionKey },
        connection,
      );
      await appendTaskEvent(id, { actorId: actor.id, type: "CREATED", to: "OPEN", payload: { assigneeId: assignee!.id, dueAt: dueAt?.toISOString() ?? null, priority } }, connection);
      // D-215: the creator and the assignee follow the task.
      await addFollower(id, actor.id, "CREATOR", actor.id, connection);
      if (assignee!.id !== actor.id) await addFollower(id, assignee!.id, "ASSIGNEE", actor.id, connection);
      await insertRecordFiles("TASK", id, input.files, actor.id, "GENERAL", connection);
      await recordAudit({ actorUserId: actor.id, action: "TASK_CREATED", entityType: "TASK", entityId: id, sessionId: actor.sessionId, ipAddress: actor.ipAddress ?? null, metadata: { taskNo, typeVersionId: type.versionId, assigneeId: assignee!.id, relatedRequestId, files: input.files.length } }, connection);
      const messages = assignee!.id === actor.id ? [] : [taskMessages.assigned({ id, taskNo, title, dueAt }, assignee!.id, actor.name)];
      const outbox = await insertOutbox(null, messages, connection);
      return { id, taskNo, outbox };
    });
    await send(outcome.outbox);
    return { ok: true, value: { id: outcome.id, taskNo: outcome.taskNo } };
  } catch (error) {
    await discardStaged(input.files);
    if ((error as { code?: string }).code === "ER_DUP_ENTRY" && input.submissionKey) {
      const earlier = await findTaskBySubmissionKey(actor.id, input.submissionKey);
      if (earlier) return { ok: true, value: earlier };
    }
    if (error instanceof RecordFileError) return fail(error.message);
    throw error;
  }
}

// Attachment fields count the files the server received for them (never what the browser says).
export function withFileCounts(form: readonly FormField[], fields: Record<string, string | undefined>, files: readonly StagedFile[]): Record<string, string | undefined> {
  const out = { ...fields };
  for (const field of form) if (field.type === "ATTACHMENT") out[field.key] = String(files.filter((file) => file.fieldKey === field.key).length);
  return out;
}

// ---- act on a task ---------------------------------------------------------------------
export interface TaskActionInput {
  taskId: number;
  action: TaskAction;
  rowVersion: number | null; // what the person saw; a stale page is refused
  reason: string;
  assigneeId: number | null; // REASSIGN
  edit?: { title: string; description: string; priority: string; due: string; fields: Record<string, string | undefined>; holidayOk?: boolean };
  files: StagedFile[];
}

const ACTION_WORD: Record<TaskAction, string> = {
  START: "started",
  BLOCK: "marked blocked",
  UNBLOCK: "back in progress",
  COMPLETE: "completed",
  REOPEN: "reopened",
  CANCEL: "cancelled",
  REASSIGN: "reassigned",
  EDIT: "details changed",
  COMMENT: "commented",
};

export async function actOnTask(input: TaskActionInput, actor: TaskActor): Promise<TaskResult<{ message: string }>> {
  const fail = (message: string, fieldErrors?: Record<string, string>): TaskResult<{ message: string }> => ({ ok: false, message, fieldErrors });
  try {
    const reason = input.reason.trim();
    if (needsReason(input.action) && reason.length < 3) {
      await discardStaged(input.files);
      return fail("Give a short reason.", { reason: "Give a short reason (3 characters or more)." });
    }
    if (input.action === "COMMENT" && reason.length < 1 && input.files.length === 0) return fail("Write a comment or attach a file.", { reason: "Write a comment." });
    if (reason.length > 2000) {
      await discardStaged(input.files);
      return fail("Use 2000 characters or fewer.", { reason: "Use 2000 characters or fewer." });
    }
    // Facts needed before the lock (people, lookups).
    const newAssignee = input.action === "REASSIGN" && input.assigneeId ? await personFacts(input.assigneeId) : null;
    const actorFacts = await personFacts(actor.id);
    const team = input.action === "REASSIGN" ? await teamOf(actor.id) : [];
    const active = input.action === "EDIT" ? new Set((await listActiveUserOptions()).map((person) => person.id)) : new Set<number>();
    const lookups = input.action === "EDIT" ? await loadFieldLookups() : undefined;
    // D-217: a new due date on a holiday is checked before anything changes.
    if (input.action === "EDIT" && input.edit?.due) {
      const errors: Record<string, string> = {};
      const current = await findTask(input.taskId);
      if (current && utcToIndiaLocalDay(current.dueAt) !== input.edit.due.slice(0, 10)) await holidayErrors(input.edit.due.slice(0, 10), Boolean(input.edit.holidayOk), errors, current.assigneeId);
      if (errors.due) return fail(errors.due, errors);
    }

    // D-269: a task that mirrors a request's work step follows the request.
    // Ticking it done records "done" on the request (which completes the task);
    // handing over, cancelling and reopening happen on the request.
    const mirrored = await findTask(input.taskId);
    const link = mirrored && !mirrored.deletedAt ? workMirrorLink(mirrored.formData) : null;
    if (link && mirrored) {
      const where = mirrored.relatedRequestNo ?? "its request";
      if (input.action === "COMPLETE") {
        if (mirrored.assigneeId !== actor.id) {
          await discardStaged(input.files);
          return fail(`Only ${mirrored.assigneeName} can mark this work done (a step of ${where}).`);
        }
        // QA-WF-05 (v1.42.1): files sent with "done" are kept as the task's evidence.
        if (input.files.length) await withTransaction((connection) => insertRecordFiles("TASK", mirrored.id, input.files, actor.id, "EVIDENCE", connection));
        const { decideTask } = await import("@/server/approvals/service");
        const done = await decideTask({ requestId: link.requestId, taskKey: link.taskKey, decision: "APPROVE", comment: reason || "Done (ticked in Task Management)." }, { id: actor.id, roles: actor.roles as never });
        if (!done.ok) return fail(done.message);
        // The task is now completed (by the request); tasks waiting for it are told, as for any task.
        await afterTaskCompleted(mirrored.id, actor);
        return { ok: true, value: { message: `Done. ${where} moves on.` } };
      }
      if (input.action === "REASSIGN" || input.action === "CANCEL" || input.action === "REOPEN") {
        await discardStaged(input.files);
        return fail(`This task is a work step of ${where}: ${input.action === "REASSIGN" ? "hand it over" : input.action === "CANCEL" ? "close it" : "change it"} on the request.`);
      }
    }

    const outcome = await withTransaction(async (connection) => {
      const task = await findTask(input.taskId, connection, true);
      if (!task || task.deletedAt) return { error: "Not found." } as const;
      const ctx = await versionWithType(task.typeVersionId, connection);
      if (!ctx) return { error: "Not found." } as const;
      const settings = parseTaskSettings(ctx.version.settings);
      const allowed = allowedTaskActions(task, await taskViewerFor(task, actor, connection), settings);
      if (!allowed.has(input.action)) return { error: allowed.size ? "That can't be done to this task now. Reload to see its latest state." : "Not found." } as const;
      if (input.rowVersion !== null && input.rowVersion !== task.rowVersion && input.action !== "COMMENT") return { error: "Someone changed this task while you were looking. Reload and try again." } as const;

      const changes: Record<string, unknown> = {};
      const next = NEXT_STATUS[input.action];
      if (next) changes.status = next;
      let payload: Record<string, unknown> | null = null;
      const notifyTo = new Set<number>([task.createdBy, task.assigneeId, task.assignedBy]);
      const messages: NotifyInput[] = [];
      const info = { id: task.id, taskNo: task.taskNo, title: task.title, dueAt: task.dueAt };

      switch (input.action) {
        case "COMPLETE": {
          const evidence = (await countEvidence("TASK", task.id, connection)) + input.files.length;
          const problems = completionProblems(settings.completion, reason, evidence);
          if (problems.length) return { error: problems.join(" "), field: "reason" } as const;
          Object.assign(changes, { completed_by: actor.id, completed_at: new Date(), completion_note: reason || null });
          break;
        }
        case "REOPEN":
          Object.assign(changes, { completed_by: null, completed_at: null });
          break;
        case "CANCEL":
          Object.assign(changes, { cancelled_by: actor.id, cancelled_at: new Date() });
          break;
        case "REASSIGN": {
          if (!newAssignee) return { error: "Choose who should do it.", field: "assignee" } as const;
          if (newAssignee.id === task.assigneeId) return { error: "It's already assigned to that person.", field: "assignee" } as const;
          if (!mayAssignTo(settings, { creatorId: actor.id, creatorDepartmentId: actorFacts?.departmentId ?? null, creatorTeamIds: team, candidate: newAssignee }, isAdminActor(actor))) return { error: "This type can't be assigned to that person.", field: "assignee" } as const;
          Object.assign(changes, { assignee_id: newAssignee.id, assigned_by: actor.id, assigned_at: new Date(), status: task.status === "BLOCKED" ? "BLOCKED" : task.status });
          // D-215: the new assignee follows it and finds it in "Recently assigned".
          await addFollower(task.id, newAssignee.id, "ASSIGNEE", actor.id, connection);
          await clearPlacements(task.id, connection);
          payload = { from: task.assigneeId, to: newAssignee.id };
          notifyTo.add(newAssignee.id);
          break;
        }
        case "EDIT": {
          if (!input.edit) return { error: "Nothing to change." } as const;
          const errors: Record<string, string> = {};
          const title = input.edit.title.trim();
          if (title.length < 3 || title.length > 200) errors.title = "Give the task a title of 3 to 200 characters.";
          const description = input.edit.description.trim();
          if (description.length > 4000) errors.description = "Use 4000 characters or fewer.";
          let dueAt: Date | null = null;
          if (input.edit.due) {
            dueAt = indiaLocalToUtc(input.edit.due);
            if (!dueAt) errors.due = "Choose a valid due date and time.";
          } else if (settings.requireDueDate) errors.due = "This type needs a due date.";
          // Only fields marked "can be changed" are read; the rest keep their values.
          const editable = ctx.version.form.filter((field) => field.editable && field.type !== "ATTACHMENT" && field.type !== "CALC");
          const raw: Record<string, string | undefined> = {};
          for (const field of ctx.version.form) raw[field.key] = editable.includes(field) ? input.edit.fields[field.key] : stored(task.formData[field.key]);
          const parsed = parseFormSubmission(ctx.version.form, raw, active, lookups);
          if (!parsed.ok) for (const field of editable) if (parsed.errors[field.key]) errors[field.key] = parsed.errors[field.key]!;
          if (Object.keys(errors).length) return { error: "Check the highlighted fields.", fields: errors } as const;
          const priority = (TASK_PRIORITIES as readonly string[]).includes(input.edit.priority) ? input.edit.priority : task.priority;
          const formData = { ...task.formData };
          for (const field of editable) {
            if (parsed.data[field.key] === undefined) delete formData[field.key];
            else formData[field.key] = parsed.data[field.key];
          }
          Object.assign(changes, { title, description: description || null, priority, due_at: dueAt, form_data_json: formData });
          payload = {
            before: { title: task.title, priority: task.priority, dueAt: task.dueAt?.toISOString() ?? null, fields: pick(task.formData, editable) },
            after: { title, priority, dueAt: dueAt?.toISOString() ?? null, fields: pick(formData, editable) },
          };
          if (task.dueAt?.getTime() !== dueAt?.getTime()) payload.dueChanged = true;
          break;
        }
        default:
          break;
      }

      if (Object.keys(changes).length && !(await updateTask(task.id, task.rowVersion, changes, connection))) return { error: "Someone changed this task while you were looking. Reload and try again." } as const;
      await appendTaskEvent(task.id, { actorId: actor.id, type: input.action, from: task.status, to: (changes.status as string | undefined) ?? task.status, body: reason || null, payload }, connection);
      await insertRecordFiles("TASK", task.id, input.files, actor.id, input.action === "COMPLETE" ? "EVIDENCE" : "GENERAL", connection);
      await recordAudit(
        { actorUserId: actor.id, action: `TASK_${input.action}`, entityType: "TASK", entityId: task.id, sessionId: actor.sessionId, ipAddress: actor.ipAddress ?? null, metadata: { taskNo: task.taskNo, from: task.status, to: changes.status ?? task.status, files: input.files.length, ...(payload ?? {}) } },
        connection,
      );
      notifyTo.delete(actor.id);
      for (const to of notifyTo) {
        if (input.action === "COMMENT") messages.push(taskMessages.comment(info, to, actor.name));
        else if (input.action === "COMPLETE") messages.push(taskMessages.completed(info, to, actor.name));
        else if (input.action === "REOPEN") messages.push(taskMessages.reopened(info, to, actor.name));
        else if (input.action === "CANCEL") messages.push(taskMessages.cancelled(info, to, actor.name));
        else if (input.action === "REASSIGN" && to === newAssignee?.id) messages.push(taskMessages.assigned({ ...info }, to, actor.name));
        else messages.push(taskMessages.updated(info, to, ACTION_WORD[input.action]));
      }
      return { outbox: await insertOutbox(null, messages, connection) } as const;
    });
    if ("error" in outcome) {
      await discardStaged(input.files);
      const field = "field" in outcome ? outcome.field : undefined;
      return fail(outcome.error!, "fields" in outcome ? outcome.fields : field ? { [field]: outcome.error! } : undefined);
    }
    await send(outcome.outbox);
    // D-218: waiting tasks hear about it; a repeating task makes its next one.
    if (input.action === "COMPLETE") await afterTaskCompleted(input.taskId, actor);
    return { ok: true, value: { message: `Done: ${ACTION_WORD[input.action]}.` } };
  } catch (error) {
    await discardStaged(input.files);
    if (error instanceof RecordFileError) return fail(error.message);
    throw error;
  }
}

function stored(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return JSON.stringify(value);
  return String(value);
}

function pick(data: Record<string, unknown>, fields: readonly FormField[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [field.key, data[field.key] ?? null]));
}

// For the request page: tasks that point at a request (only those the viewer may see).
export async function relatedRequestVisible(requestId: number, actor: { id: number; roles: readonly string[] }): Promise<boolean> {
  const request = await findRequest(requestId);
  return Boolean(request && (await canSeeRequest(request, { id: actor.id, roles: actor.roles as readonly RoleCode[] })));
}

export type { TaskSettings };
