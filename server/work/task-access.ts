import "server-only";
import { hasModule } from "@/server/modules/modules";
import type { ModuleCode } from "@/types/auth";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import { personFacts } from "@/lib/db/repositories/tasks.repository";
import { getManagerMap } from "@/lib/db/repositories/admin-users.repository";
import { teamBelow } from "@/server/work/hierarchy";
import { isFollowing, projectFacts, projectsGoverning } from "@/lib/db/repositories/work.repository";
import { effectiveProjectRole, higher, taskRights, type ProjectRole, type TaskRights, type WorkViewer } from "@/server/work/access";
import type { TaskViewer } from "@/server/modules/task-rules";

// D-215: one place that works out how a person is connected to a task
// (party, follower, projects of the task and of its top task) and so what
// they may do. Used by the task page, task actions and every work action.
export const isAdminRoles = (roles: readonly string[]) => roles.includes("IT_ADMIN") || roles.includes("SUPER_ADMIN");

export async function workViewer(actor: { id: number; roles: readonly string[]; modules?: readonly ModuleCode[] }, db: Queryable = getDbPool()): Promise<WorkViewer> {
  const me = await personFacts(actor.id, db);
  // D-308: without the Projects module, projects grant nothing (modules unknown = as before).
  const projects = !actor.modules || hasModule({ roles: actor.roles, modules: actor.modules }, "PROJECT");
  return { id: actor.id, departmentId: me?.departmentId ?? null, isAdmin: isAdminRoles(actor.roles), teamIds: await teamOf(actor.id, db), projects };
}

// D-216: everyone below the person in the reporting chain (all levels).
export async function teamOf(managerId: number, db: Queryable = getDbPool()): Promise<number[]> {
  return teamBelow(await getManagerMap(db), managerId);
}

interface TaskShape {
  id: number;
  rootTaskId: number | null;
  createdBy: number;
  assigneeId: number;
  assignedBy: number;
  assigneeManagerId: number | null;
}

export async function rightsOn(task: TaskShape, viewer: WorkViewer, db: Queryable = getDbPool()): Promise<TaskRights & { bestRole: ProjectRole | null; adhoc: boolean }> {
  let best: ProjectRole | null = null;
  for (const { project, members } of await projectsGoverning(task.id, task.rootTaskId, db)) best = higher(best, effectiveProjectRole(projectFacts(project, members), viewer));
  // The top task's people see its subtasks too.
  let rootParty = false;
  if (task.rootTaskId) {
    const [rows] = await db.query<RowDataPacket[]>("SELECT 1 FROM tasks WHERE id = ? AND (assignee_id = ? OR created_by = ? OR assigned_by = ?)", [task.rootTaskId, viewer.id, viewer.id, viewer.id]);
    rootParty = rows.length > 0;
  }
  const follower = await isFollowing([task.id, task.rootTaskId ?? task.id], viewer.id, db);
  // D-222: ad hoc = not repeating and not part of a repeating series.
  const [kind] = await db.query<RowDataPacket[]>("SELECT recurrence_json IS NULL AND series_id IS NULL AS adhoc FROM tasks WHERE id = ?", [task.id]);
  const adhoc = Boolean(kind[0]?.adhoc);
  const rights = taskRights({
    isAssignee: task.assigneeId === viewer.id,
    isCreator: task.createdBy === viewer.id || task.assignedBy === viewer.id,
    isFollower: follower || rootParty,
    managesAssignee: task.assigneeManagerId === viewer.id || viewer.teamIds.includes(task.assigneeId),
    isAdmin: viewer.isAdmin,
    bestProjectRole: best,
    adhoc,
    isOriginalCreator: task.createdBy === viewer.id,
  });
  return { ...rights, bestRole: best, adhoc };
}

// The task rules' viewer, with what projects and followers add.
export async function taskViewerFor(task: TaskShape, actor: { id: number; roles: readonly string[] }, db: Queryable = getDbPool()): Promise<TaskViewer> {
  const viewer = await workViewer(actor, db);
  const rights = await rightsOn(task, viewer, db);
  return {
    id: actor.id,
    isAdmin: viewer.isAdmin,
    managesAssignee: task.assigneeManagerId === actor.id || viewer.teamIds.includes(task.assigneeId),
    workSee: rights.view,
    workEdit: rights.bestRole === "OWNER" || rights.bestRole === "EDITOR",
    workComment: rights.comment,
    // D-222: an ad hoc task is edited, reassigned, cancelled and reopened by its creator (and IT) only.
    creatorOnly: rights.adhoc,
    teamIds: viewer.teamIds,
  };
}
