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
}

export function effectiveProjectRole(project: ProjectFacts, viewer: WorkViewer): ProjectRole | null {
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
}

export function taskRights(link: TaskLink) {
  const editor = atLeast(link.bestProjectRole, "EDITOR");
  const view = link.isAdmin || link.isAssignee || link.isCreator || link.isFollower || link.managesAssignee || link.bestProjectRole !== null;
  return {
    view,
    // Change any field, move, add subtasks: editors, the creator, IT. The
    // assignee may change their own task (status, dates) through its actions.
    edit: link.isAdmin || link.isCreator || editor,
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
