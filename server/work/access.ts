// D-215: Task & Project Management access rules. Pure and unit-tested; the
// repository builds the same rule in SQL for lists and search
// (work.repository.ts visibleTaskClause), and both are tested on one matrix.
//
// A project's effective role for a person is the highest of: their own
// grant, their department's grant, and the privacy default (DEPARTMENT
// projects give it to the project's department, ORGANISATION ones to
// everyone), and view for a manager whose reporting line (any level) has a
// member in it (D-216). IT Admin and Super Admin act as owners of every
// project, as they already may act on every task.
export const PROJECT_ROLES = ["OWNER", "EDITOR", "COMMENTER", "VIEWER"] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];
export const PROJECT_ROLE_LABEL: Record<ProjectRole, string> = { OWNER: "Owner", EDITOR: "Editor", COMMENTER: "Commenter", VIEWER: "Viewer" };
export const PROJECT_ROLE_HELP: Record<ProjectRole, string> = {
  OWNER: "Everything, including privacy, members, archive and delete.",
  EDITOR: "Add and change tasks and sections, add members, post status updates.",
  COMMENTER: "Comment and like; change only the tasks assigned to them.",
  VIEWER: "Read only; change only the tasks assigned to them.",
};

export const PRIVACY = ["PRIVATE", "DEPARTMENT", "ORGANISATION"] as const;
export type ProjectPrivacy = (typeof PRIVACY)[number];
export const PRIVACY_LABEL: Record<ProjectPrivacy, string> = { PRIVATE: "Private to members", DEPARTMENT: "My department", ORGANISATION: "Everyone at ARS" };

const RANK: Record<ProjectRole, number> = { OWNER: 4, EDITOR: 3, COMMENTER: 2, VIEWER: 1 };
export const atLeast = (role: ProjectRole | null, needed: ProjectRole) => role !== null && RANK[role] >= RANK[needed];
export const higher = (a: ProjectRole | null, b: ProjectRole | null): ProjectRole | null => (a === null ? b : b === null ? a : RANK[a] >= RANK[b] ? a : b);

export interface ProjectFacts {
  privacy: ProjectPrivacy;
  departmentId: number | null;
  defaultAccessRole: Exclude<ProjectRole, "OWNER">;
  members: readonly { type: "USER" | "DEPARTMENT"; id: number; role: ProjectRole }[];
}
export interface WorkViewer {
  id: number;
  departmentId: number | null;
  isAdmin: boolean;
  // D-216: everyone below this person in the reporting chain, every level.
  teamIds: readonly number[];
  // D-308 (owner): false without the Projects module: projects then grant
  // nothing (no project seen, no task seen or changed through a project), so
  // the person has only the tasks they are on and their team's. Unset = true.
  projects?: boolean;
}

export function effectiveProjectRole(project: ProjectFacts, viewer: WorkViewer): ProjectRole | null {
  if (viewer.projects === false) return null;
  if (viewer.isAdmin) return "OWNER";
  let role: ProjectRole | null = null;
  for (const member of project.members) {
    if (member.type === "USER" && member.id === viewer.id) role = higher(role, member.role);
    // A department grant is never ownership.
    if (member.type === "DEPARTMENT" && viewer.departmentId !== null && member.id === viewer.departmentId) role = higher(role, member.role === "OWNER" ? "EDITOR" : member.role);
  }
  if (project.privacy === "ORGANISATION") role = higher(role, project.defaultAccessRole);
  if (project.privacy === "DEPARTMENT" && viewer.departmentId !== null && project.departmentId === viewer.departmentId) role = higher(role, project.defaultAccessRole);
  // D-216: a manager may look into (not change) any project someone in their
  // reporting line, at any level, is a member of.
  if (project.members.some((member) => member.type === "USER" && viewer.teamIds.includes(member.id))) role = higher(role, "VIEWER");
  return role;
}

// What a role may do in the project itself.
export function projectAbilities(role: ProjectRole | null) {
  return {
    view: role !== null,
    manage: atLeast(role, "OWNER"), // rename, privacy, archive, delete, owners
    share: atLeast(role, "EDITOR"), // add members, change non-owner roles
    edit: atLeast(role, "EDITOR"), // sections, tasks, status updates
    comment: atLeast(role, "COMMENTER"),
  };
}

// A task's rights from everything that connects the person to it.
export interface TaskLink {
  isAssignee: boolean;
  isCreator: boolean; // created or assigned it
  isFollower: boolean;
  managesAssignee: boolean; // the assignee is below this person in the reporting chain (any level, D-216) (Team tasks)
  isAdmin: boolean;
  bestProjectRole: ProjectRole | null; // highest role over the task's projects (and its top task's)
  // D-222: an ad hoc task's details are its creator's (and IT's) alone.
  adhoc?: boolean;
  isOriginalCreator?: boolean; // created it (not only reassigned it)
}

export function taskRights(link: TaskLink) {
  const editor = atLeast(link.bestProjectRole, "EDITOR");
  const view = link.isAdmin || link.isAssignee || link.isCreator || link.isFollower || link.managesAssignee || link.bestProjectRole !== null;
  return {
    view,
    // Change any field, move, add subtasks: editors, the creator, IT. The
    // assignee may change their own task (status, dates) through its actions.
    edit: link.isAdmin || link.isCreator || editor,
    // D-222: changing the details (name, description, priority, assignee,
    // fields). Ad hoc: only its creator and IT. Periodic: the creator, the
    // assigner, project editors and IT.
    details: link.isAdmin || (link.adhoc ? Boolean(link.isOriginalCreator) : link.isCreator || editor),
    // Dates, tags, waiting-for: the same, and for periodic tasks the assignee too.
    planning: link.isAdmin || (link.adhoc ? Boolean(link.isOriginalCreator) : link.isCreator || editor || link.isAssignee),
    progress: link.isAdmin || link.isAssignee || link.isCreator || editor,
    comment: view && (link.isAdmin || link.isAssignee || link.isCreator || link.isFollower || link.managesAssignee || atLeast(link.bestProjectRole, "COMMENTER")),
    like: view,
    follow: view,
  };
}
export type TaskRights = ReturnType<typeof taskRights>;

export const STATUS_KINDS = ["ON_TRACK", "AT_RISK", "OFF_TRACK", "ON_HOLD", "COMPLETE", "DROPPED"] as const;
export type ProjectStatusKind = (typeof STATUS_KINDS)[number];
export const STATUS_KIND_LABEL: Record<ProjectStatusKind, string> = { ON_TRACK: "On track", AT_RISK: "At risk", OFF_TRACK: "Off track", ON_HOLD: "On hold", COMPLETE: "Complete", DROPPED: "Dropped" };
export const STATUS_KIND_TONE: Record<ProjectStatusKind, "success" | "warning" | "danger" | "info" | "primary" | "neutral"> = {
  ON_TRACK: "success",
  AT_RISK: "warning",
  OFF_TRACK: "danger",
  ON_HOLD: "info",
  COMPLETE: "primary",
  DROPPED: "neutral",
};

export const PROJECT_COLORS = ["green", "blue", "teal", "amber", "red", "purple", "pink", "gray"] as const;
export type ProjectColor = (typeof PROJECT_COLORS)[number];
export const PROJECT_VIEWS = ["LIST", "BOARD", "CALENDAR", "TIMELINE"] as const;
export type ProjectView = (typeof PROJECT_VIEWS)[number];

// Removing or demoting must leave at least one person as owner.
export function leavesAnOwner(members: readonly { type: "USER" | "DEPARTMENT"; id: number; role: ProjectRole }[], change: { type: "USER" | "DEPARTMENT"; id: number; role: ProjectRole | null }): boolean {
  const after = members.filter((member) => !(member.type === change.type && member.id === change.id));
  if (change.role) after.push({ type: change.type, id: change.id, role: change.role });
  return after.some((member) => member.type === "USER" && member.role === "OWNER");
}

// ---- project permissions (D-222, Asana's "Project permissions") ---------------------------
// Fields: who may update a field's values in this project ("due", "assignee",
// "priority", "start" or "field:<id>"). Sharing: who may add this project's
// tasks to other projects.
export const RESTRICTABLE = ["due", "start", "assignee", "priority"] as const;
export const RESTRICTABLE_LABEL: Record<(typeof RESTRICTABLE)[number], string> = { due: "Due date", start: "Start date", assignee: "Assignee", priority: "Priority" };
export const PERMISSION_ROLES = ["OWNER", "EDITOR", "COMMENTER"] as const;
export type PermissionRole = (typeof PERMISSION_ROLES)[number];
export const PERMISSION_ROLE_LABEL: Record<PermissionRole, string> = { OWNER: "Project admins only", EDITOR: "Project admins and editors", COMMENTER: "Everyone in the project" };
export interface ProjectPermissions {
  fields: { field: string; role: "OWNER" | "EDITOR" }[];
  shareTasks: PermissionRole;
}
export const DEFAULT_PERMISSIONS: ProjectPermissions = { fields: [], shareTasks: "EDITOR" };
const FIELD_KEY = /^(due|start|assignee|priority|field:\d{1,10})$/;
export function parseProjectPermissions(raw: unknown): ProjectPermissions {
  const value = (typeof raw === "string" ? safeParse(raw) : raw) as Partial<ProjectPermissions> | null;
  if (!value || typeof value !== "object") return DEFAULT_PERMISSIONS;
  const fields = Array.isArray(value.fields)
    ? value.fields
        .filter((item): item is { field: string; role: "OWNER" | "EDITOR" } => Boolean(item) && typeof item.field === "string" && FIELD_KEY.test(item.field) && (item.role === "OWNER" || item.role === "EDITOR"))
        .filter((item, index, list) => list.findIndex((other) => other.field === item.field) === index)
        .slice(0, 30)
    : [];
  const shareTasks = (PERMISSION_ROLES as readonly string[]).includes(String(value.shareTasks)) ? (value.shareTasks as PermissionRole) : "EDITOR";
  return { fields, shareTasks };
}
// May someone with `role` in the project update `field` there? IT always may.
export function mayUpdateField(permissions: ProjectPermissions, field: string, role: ProjectRole | null, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  const rule = permissions.fields.find((item) => item.field === field);
  return !rule || atLeast(role, rule.role);
}
export function mayShareTasks(permissions: ProjectPermissions, role: ProjectRole | null, isAdmin: boolean): boolean {
  return isAdmin || atLeast(role, permissions.shareTasks);
}
function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
