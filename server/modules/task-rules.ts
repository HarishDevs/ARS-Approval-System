import type { CompletionRule, TaskSettings } from "@/server/modules/settings";

// v1.9.0 (D-143): the task lifecycle. Pure and unit-tested; the service
// checks the same rules inside a locked transaction before any change.
//   OPEN → IN_PROGRESS → (BLOCKED ⇄ IN_PROGRESS) → COMPLETED
//   OPEN / IN_PROGRESS / BLOCKED → CANCELLED
//   COMPLETED → OPEN (reopen, when the type allows it)
// A task's completion never approves anything (D-143).
export const TASK_STATUSES = ["OPEN", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = { OPEN: "Open", IN_PROGRESS: "In progress", BLOCKED: "Blocked", COMPLETED: "Completed", CANCELLED: "Cancelled" };
export const OPEN_STATUSES: readonly TaskStatus[] = ["OPEN", "IN_PROGRESS", "BLOCKED"];

export const TASK_ACTIONS = ["START", "BLOCK", "UNBLOCK", "COMPLETE", "REOPEN", "CANCEL", "REASSIGN", "EDIT", "COMMENT"] as const;
export type TaskAction = (typeof TASK_ACTIONS)[number];

export interface TaskFacts {
  status: TaskStatus;
  createdBy: number;
  assigneeId: number;
  assignedBy: number;
}

export interface TaskViewer {
  id: number;
  isAdmin: boolean; // IT Admin or Super Admin
  managesAssignee: boolean; // the assignee reports to this person
}

export const isParty = (task: TaskFacts, viewer: TaskViewer) => viewer.id === task.createdBy || viewer.id === task.assigneeId || viewer.id === task.assignedBy;

// Who may see a task at all: its creator, assigner and assignee, the
// assignee's manager (team tasks) and IT.
export function canSeeTask(task: TaskFacts, viewer: TaskViewer): boolean {
  return isParty(task, viewer) || viewer.isAdmin || viewer.managesAssignee;
}

// The actions this person may take now. Every one is checked again on the server.
export function allowedTaskActions(task: TaskFacts, viewer: TaskViewer, settings: Pick<TaskSettings, "allowBlocked" | "allowReopen" | "allowReassign" | "assigneeMayCancel">): Set<TaskAction> {
  const actions = new Set<TaskAction>();
  if (!canSeeTask(task, viewer)) return actions;
  const assignee = viewer.id === task.assigneeId;
  const owner = viewer.id === task.createdBy || viewer.id === task.assignedBy || viewer.isAdmin;
  const open = OPEN_STATUSES.includes(task.status);
  if (assignee && task.status === "OPEN") actions.add("START");
  if (assignee && settings.allowBlocked && (task.status === "OPEN" || task.status === "IN_PROGRESS")) actions.add("BLOCK");
  if (assignee && task.status === "BLOCKED") actions.add("UNBLOCK");
  if (assignee && (task.status === "OPEN" || task.status === "IN_PROGRESS")) actions.add("COMPLETE");
  if (owner && settings.allowReopen && task.status === "COMPLETED") actions.add("REOPEN");
  if (open && (owner || (assignee && settings.assigneeMayCancel))) actions.add("CANCEL");
  if (open && owner && settings.allowReassign) actions.add("REASSIGN");
  if (open && owner) actions.add("EDIT");
  if (isParty(task, viewer) || viewer.isAdmin) actions.add("COMMENT");
  return actions;
}

export const NEXT_STATUS: Partial<Record<TaskAction, TaskStatus>> = { START: "IN_PROGRESS", BLOCK: "BLOCKED", UNBLOCK: "IN_PROGRESS", COMPLETE: "COMPLETED", REOPEN: "OPEN", CANCEL: "CANCELLED" };

// Which actions need a reason or note from the person.
export function needsReason(action: TaskAction): boolean {
  return action === "BLOCK" || action === "REOPEN" || action === "CANCEL" || action === "REASSIGN";
}

// What completing needs (the type's evidence rule).
export function completionProblems(rule: CompletionRule, note: string, files: number): string[] {
  const problems: string[] = [];
  if ((rule === "NOTE" || rule === "NOTE_AND_FILE") && note.trim().length < 3) problems.push("Write a completion note (what was done).");
  if ((rule === "FILE" || rule === "NOTE_AND_FILE") && files === 0) problems.push("Attach a file as evidence of completion.");
  return problems;
}

// Overdue: open and past its due time.
export function isOverdue(task: { status: TaskStatus; dueAt: Date | null }, now: Date): boolean {
  return OPEN_STATUSES.includes(task.status) && task.dueAt !== null && task.dueAt.getTime() < now.getTime();
}

// May the creator assign to this person, under the type's scope?
export interface AssignContext {
  creatorId: number;
  creatorDepartmentId: number | null;
  candidate: { id: number; active: boolean; departmentId: number | null; managerId: number | null; groupIds: readonly number[] };
}
export function mayAssignTo(settings: Pick<TaskSettings, "assignScope" | "assignGroupIds" | "assignUserIds">, context: AssignContext, creatorIsAdmin: boolean): boolean {
  const { candidate } = context;
  if (!candidate.active) return false;
  // Yourself is always allowed; IT may assign to anyone active.
  if (candidate.id === context.creatorId || creatorIsAdmin) return true;
  switch (settings.assignScope) {
    case "ANYONE":
      return true;
    case "SAME_DEPARTMENT":
      return context.creatorDepartmentId !== null && candidate.departmentId === context.creatorDepartmentId;
    case "MY_TEAM":
      return candidate.managerId === context.creatorId;
    case "GROUPS":
      return candidate.groupIds.some((id) => settings.assignGroupIds.includes(id));
    case "PEOPLE":
      return settings.assignUserIds.includes(candidate.id);
  }
}
