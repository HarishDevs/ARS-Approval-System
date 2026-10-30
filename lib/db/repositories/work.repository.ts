import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import type { ProjectColor, ProjectFacts, ProjectPrivacy, ProjectRole, ProjectStatusKind, ProjectView, WorkViewer } from "@/server/work/access";
import { effectiveProjectRole } from "@/server/work/access";
import type { MySystemSection, WorkSearch } from "@/server/work/rules";
import { MY_SECTION_NAMES, MY_SECTION_ORDER } from "@/server/work/rules";
import type { TaskPriority } from "@/server/modules/settings";
import type { TaskStatus } from "@/server/modules/task-rules";

// D-215: Task & Project Management data. Every list that shows tasks uses
// visibleTaskClause, the SQL twin of server/work/access.ts taskRights().view.
type Row = RowDataPacket & Record<string, unknown>;
const num = (value: unknown) => Number(value);
const maybeNum = (value: unknown) => (value === null || value === undefined ? null : Number(value));
const str = (value: unknown) => (value === null || value === undefined ? null : String(value));
const dateOnly = (value: unknown) => (value === null || value === undefined ? null : value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10));

// ---- visibility ------------------------------------------------------------------------
// Projects the viewer can see (alias `p`).
export function visibleProjectClause(viewer: WorkViewer, alias = "p"): { sql: string; params: unknown[] } {
  if (viewer.isAdmin) return { sql: `${alias}.deleted_at IS NULL`, params: [] };
  const dept = viewer.departmentId;
  return {
    sql: `${alias}.deleted_at IS NULL AND (${alias}.privacy = 'ORGANISATION'
      OR (${alias}.privacy = 'DEPARTMENT' AND ? IS NOT NULL AND ${alias}.department_id = ?)
      OR EXISTS (SELECT 1 FROM project_members vm WHERE vm.project_id = ${alias}.id
        AND ((vm.member_type = 'USER' AND vm.member_id IN (?)) OR (vm.member_type = 'DEPARTMENT' AND ? IS NOT NULL AND vm.member_id = ?))))`,
    // D-216: the viewer and everyone below them in the reporting chain.
    params: [dept, dept, [viewer.id, ...viewer.teamIds], dept, dept],
  };
}

// Tasks the viewer can see (alias `t`, its assignee joined as `a`): a party
// to it (assignee, creator, assigner), anyone above its assignee in the
// reporting chain (D-216, every level), a follower,
// anyone who sees one of its projects; a subtask also by its top task.
export function visibleTaskClause(viewer: WorkViewer): { sql: string; params: unknown[] } {
  if (viewer.isAdmin) return { sql: "t.deleted_at IS NULL", params: [] };
  const project = visibleProjectClause(viewer, "vp");
  return {
    sql: `t.deleted_at IS NULL AND (t.assignee_id IN (?) OR t.created_by = ? OR t.assigned_by = ? OR a.reporting_manager_id = ?
      OR EXISTS (SELECT 1 FROM task_followers vf WHERE vf.task_id IN (t.id, COALESCE(t.root_task_id, t.id)) AND vf.user_id = ?)
      OR EXISTS (SELECT 1 FROM task_projects vtp JOIN projects vp ON vp.id = vtp.project_id WHERE vtp.task_id IN (t.id, COALESCE(t.root_task_id, t.id)) AND ${project.sql})
      OR (t.root_task_id IS NOT NULL AND EXISTS (SELECT 1 FROM tasks vr WHERE vr.id = t.root_task_id AND (vr.assignee_id = ? OR vr.created_by = ? OR vr.assigned_by = ?))))`,
    // D-216: tasks of everyone below the viewer in the reporting chain too.
    params: [[viewer.id, ...viewer.teamIds], viewer.id, viewer.id, viewer.id, viewer.id, ...project.params, viewer.id, viewer.id, viewer.id],
  };
}

// ---- projects --------------------------------------------------------------------------
export interface ProjectRecord {
  id: number;
  name: string;
  description: string | null;
  color: ProjectColor;
  departmentId: number | null;
  departmentName: string | null;
  privacy: ProjectPrivacy;
  defaultAccessRole: Exclude<ProjectRole, "OWNER">;
  defaultView: ProjectView;
  ownerId: number;
  ownerName: string;
  startOn: string | null;
  dueOn: string | null;
  currentStatus: ProjectStatusKind | null;
  completedAt: Date | null;
  archivedAt: Date | null;
  deletedAt: Date | null;
  deletedBy: number | null;
  rowVersion: number;
  createdBy: number;
  createdAt: Date;
  isTemplate: boolean; // D-218
}
export interface ProjectMember {
  type: "USER" | "DEPARTMENT";
  id: number;
  name: string;
  role: ProjectRole;
}

const PROJECT_SELECT = `SELECT p.*, d.name AS department_name, o.name AS owner_name FROM projects p LEFT JOIN departments d ON d.id = p.department_id JOIN users o ON o.id = p.owner_id`;
const toProject = (row: Row): ProjectRecord => ({
  id: num(row.id),
  name: String(row.name),
  description: str(row.description),
  color: String(row.color) as ProjectColor,
  departmentId: maybeNum(row.department_id),
  departmentName: str(row.department_name),
  privacy: row.privacy as ProjectPrivacy,
  defaultAccessRole: row.default_access_role as Exclude<ProjectRole, "OWNER">,
  defaultView: row.default_view as ProjectView,
  ownerId: num(row.owner_id),
  ownerName: String(row.owner_name),
  startOn: dateOnly(row.start_on),
  dueOn: dateOnly(row.due_on),
  currentStatus: (row.current_status as ProjectStatusKind | null) ?? null,
  completedAt: (row.completed_at as Date | null) ?? null,
  archivedAt: (row.archived_at as Date | null) ?? null,
  deletedAt: (row.deleted_at as Date | null) ?? null,
  deletedBy: maybeNum(row.deleted_by),
  rowVersion: num(row.row_version),
  createdBy: num(row.created_by),
  createdAt: row.created_at as Date,
  isTemplate: Boolean(row.is_template),
});

export async function findProject(id: number, db: Queryable = getDbPool(), lock = false): Promise<ProjectRecord | null> {
  if (lock) await db.query("SELECT id FROM projects WHERE id = ? FOR UPDATE", [id]);
  const [rows] = await db.query<Row[]>(`${PROJECT_SELECT} WHERE p.id = ?`, [id]);
  return rows[0] ? toProject(rows[0]) : null;
}

export async function listProjectMembers(projectId: number, db: Queryable = getDbPool()): Promise<ProjectMember[]> {
  const [rows] = await db.query<Row[]>(
    `SELECT m.member_type, m.member_id, m.role, COALESCE(u.name, d.name, '?') AS name
     FROM project_members m LEFT JOIN users u ON m.member_type = 'USER' AND u.id = m.member_id LEFT JOIN departments d ON m.member_type = 'DEPARTMENT' AND d.id = m.member_id
     WHERE m.project_id = ? ORDER BY FIELD(m.role, 'OWNER', 'EDITOR', 'COMMENTER', 'VIEWER'), name`,
    [projectId],
  );
  return rows.map((row) => ({ type: row.member_type as "USER" | "DEPARTMENT", id: num(row.member_id), name: String(row.name), role: row.role as ProjectRole }));
}

export const projectFacts = (project: ProjectRecord, members: readonly ProjectMember[]): ProjectFacts => ({ privacy: project.privacy, departmentId: project.departmentId, defaultAccessRole: project.defaultAccessRole, members });

// The project with the viewer's role (null: not found or not visible).
export async function projectFor(id: number, viewer: WorkViewer, db: Queryable = getDbPool()): Promise<{ project: ProjectRecord; members: ProjectMember[]; role: ProjectRole } | null> {
  const project = await findProject(id, db);
  if (!project || project.deletedAt) return null;
  const members = await listProjectMembers(id, db);
  const role = effectiveProjectRole(projectFacts(project, members), viewer);
  return role ? { project, members, role } : null;
}

export interface ProjectListItem {
  id: number;
  name: string;
  color: ProjectColor;
  privacy: ProjectPrivacy;
  departmentName: string | null;
  ownerName: string;
  currentStatus: ProjectStatusKind | null;
  archivedAt: Date | null;
  isMember: boolean;
  starred: boolean;
  openTasks: number;
  doneTasks: number;
}
export async function listVisibleProjects(viewer: WorkViewer, options: { archived?: boolean; q?: string; onlyMine?: boolean } = {}, db: Queryable = getDbPool()): Promise<ProjectListItem[]> {
  const visible = visibleProjectClause(viewer);
  const where = [visible.sql, "p.is_template = FALSE", options.archived ? "p.archived_at IS NOT NULL" : "p.archived_at IS NULL"];
  const params: unknown[] = [...visible.params];
  if (options.q) {
    where.push("p.name LIKE ?");
    params.push(`%${options.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  }
  if (options.onlyMine) {
    where.push("EXISTS (SELECT 1 FROM project_members mm WHERE mm.project_id = p.id AND ((mm.member_type = 'USER' AND mm.member_id = ?) OR (mm.member_type = 'DEPARTMENT' AND ? IS NOT NULL AND mm.member_id = ?)))");
    params.push(viewer.id, viewer.departmentId, viewer.departmentId);
  }
  const [rows] = await db.query<Row[]>(
    `SELECT p.id, p.name, p.color, p.privacy, p.current_status, p.archived_at, d.name AS department_name, o.name AS owner_name,
       EXISTS (SELECT 1 FROM project_members mm WHERE mm.project_id = p.id AND mm.member_type = 'USER' AND mm.member_id = ?) AS is_member,
       EXISTS (SELECT 1 FROM work_favourites f WHERE f.user_id = ? AND f.object_type = 'PROJECT' AND f.object_id = p.id) AS starred,
       (SELECT COUNT(*) FROM task_projects tp JOIN tasks tt ON tt.id = tp.task_id AND tt.deleted_at IS NULL WHERE tp.project_id = p.id AND tt.status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED')) AS open_tasks,
       (SELECT COUNT(*) FROM task_projects tp JOIN tasks tt ON tt.id = tp.task_id AND tt.deleted_at IS NULL WHERE tp.project_id = p.id AND tt.status = 'COMPLETED') AS done_tasks
     FROM projects p LEFT JOIN departments d ON d.id = p.department_id JOIN users o ON o.id = p.owner_id
     WHERE ${where.join(" AND ")} ORDER BY starred DESC, p.name LIMIT 500`,
    [viewer.id, viewer.id, ...params],
  );
  return rows.map((row) => ({
    id: num(row.id),
    name: String(row.name),
    color: row.color as ProjectColor,
    privacy: row.privacy as ProjectPrivacy,
    departmentName: str(row.department_name),
    ownerName: String(row.owner_name),
    currentStatus: (row.current_status as ProjectStatusKind | null) ?? null,
    archivedAt: (row.archived_at as Date | null) ?? null,
    isMember: Boolean(row.is_member),
    starred: Boolean(row.starred),
    openTasks: num(row.open_tasks),
    doneTasks: num(row.done_tasks),
  }));
}

export interface NewProject {
  name: string;
  description: string | null;
  color: ProjectColor;
  departmentId: number | null;
  privacy: ProjectPrivacy;
  defaultAccessRole: Exclude<ProjectRole, "OWNER">;
  defaultView: ProjectView;
  ownerId: number;
  startOn: string | null;
  dueOn: string | null;
}
export async function insertProject(project: NewProject, db: Queryable): Promise<number> {
  const [result] = await db.query<ResultSetHeader>(
    `INSERT INTO projects (name, description, color, department_id, privacy, default_access_role, default_view, owner_id, start_on, due_on, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [project.name, project.description, project.color, project.departmentId, project.privacy, project.defaultAccessRole, project.defaultView, project.ownerId, project.startOn, project.dueOn, project.ownerId],
  );
  return result.insertId;
}

export async function updateProject(id: number, changes: Record<string, unknown>, db: Queryable): Promise<void> {
  const allowed = ["name", "description", "color", "department_id", "privacy", "default_access_role", "default_view", "owner_id", "start_on", "due_on", "current_status", "completed_at", "archived_at", "deleted_at", "deleted_by"];
  const keys = Object.keys(changes).filter((key) => allowed.includes(key));
  if (!keys.length) return;
  await db.query<ResultSetHeader>(`UPDATE projects SET ${keys.map((key) => `${key} = ?`).join(", ")}, row_version = row_version + 1 WHERE id = ?`, [...keys.map((key) => changes[key]), id]);
}

export async function setProjectMember(projectId: number, type: "USER" | "DEPARTMENT", memberId: number, role: ProjectRole, addedBy: number, db: Queryable): Promise<void> {
  await db.query<ResultSetHeader>("INSERT INTO project_members (project_id, member_type, member_id, role, added_by) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE role = VALUES(role)", [projectId, type, memberId, role, addedBy]);
}
export async function removeProjectMember(projectId: number, type: "USER" | "DEPARTMENT", memberId: number, db: Queryable): Promise<void> {
  await db.query<ResultSetHeader>("DELETE FROM project_members WHERE project_id = ? AND member_type = ? AND member_id = ?", [projectId, type, memberId]);
}

export async function appendProjectEvent(projectId: number, actorId: number | null, type: string, body: string | null, db: Queryable): Promise<void> {
  await db.query<ResultSetHeader>("INSERT INTO project_events (project_id, actor_id, event_type, body) VALUES (?, ?, ?, ?)", [projectId, actorId, type, body?.slice(0, 500) ?? null]);
}
export async function listProjectEvents(projectId: number, limit = 50, db: Queryable = getDbPool()): Promise<{ id: number; actorName: string | null; type: string; body: string | null; createdAt: Date }[]> {
  const [rows] = await db.query<Row[]>("SELECT e.id, u.name, e.event_type, e.body, e.created_at FROM project_events e LEFT JOIN users u ON u.id = e.actor_id WHERE e.project_id = ? ORDER BY e.id DESC LIMIT ?", [projectId, limit]);
  return rows.map((row) => ({ id: num(row.id), actorName: str(row.name), type: String(row.event_type), body: str(row.body), createdAt: row.created_at as Date }));
}

// ---- sections --------------------------------------------------------------------------
export interface SectionRecord {
  id: number;
  name: string;
  position: number;
}
export async function listSections(projectId: number, db: Queryable = getDbPool()): Promise<SectionRecord[]> {
  const [rows] = await db.query<Row[]>("SELECT id, name, position FROM project_sections WHERE project_id = ? AND deleted_at IS NULL ORDER BY position, id", [projectId]);
  return rows.map((row) => ({ id: num(row.id), name: String(row.name), position: Number(row.position) }));
}
export async function insertSection(projectId: number, name: string, position: number, createdBy: number, db: Queryable): Promise<number> {
  const [result] = await db.query<ResultSetHeader>("INSERT INTO project_sections (project_id, name, position, created_by) VALUES (?, ?, ?, ?)", [projectId, name, position, createdBy]);
  return result.insertId;
}
export async function updateSection(id: number, changes: { name?: string; position?: number; deleted?: boolean }, db: Queryable): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (changes.name !== undefined) {
    sets.push("name = ?");
    params.push(changes.name);
  }
  if (changes.position !== undefined) {
    sets.push("position = ?");
    params.push(changes.position);
  }
  if (changes.deleted) sets.push("deleted_at = UTC_TIMESTAMP()");
  if (sets.length) await db.query<ResultSetHeader>(`UPDATE project_sections SET ${sets.join(", ")} WHERE id = ?`, [...params, id]);
}
export async function findSection(id: number, db: Queryable = getDbPool()): Promise<(SectionRecord & { projectId: number }) | null> {
  const [rows] = await db.query<Row[]>("SELECT id, project_id, name, position FROM project_sections WHERE id = ? AND deleted_at IS NULL", [id]);
  const row = rows[0];
  return row ? { id: num(row.id), projectId: num(row.project_id), name: String(row.name), position: Number(row.position) } : null;
}

// ---- tasks in projects -------------------------------------------------------------------
export interface WorkTaskItem {
  id: number;
  taskNo: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: number;
  assigneeName: string;
  createdBy: number;
  createdByName: string;
  dueAt: Date | null;
  startsOn: string | null;
  completedAt: Date | null;
  isMilestone: boolean;
  parentTaskId: number | null;
  assignedAt: Date | null;
  sectionId: number | null; // the section in the project being shown
  position: number;
  subtasks: number;
  subtasksOpen: number;
  comments: number;
  likes: number;
  blockedBy: number; // open blockers
  tags: { id: number; name: string; color: string }[];
  projects: { id: number; name: string; color: string }[];
}

const ITEM_SELECT = `SELECT t.id, t.task_no, t.title, t.status, t.priority, t.assignee_id, a.name AS assignee_name, t.created_by, c.name AS created_by_name, t.due_at, t.starts_on,
    t.completed_at, t.is_milestone, t.parent_task_id, t.assigned_at,
    (SELECT COUNT(*) FROM tasks s WHERE s.parent_task_id = t.id AND s.deleted_at IS NULL) AS subtasks,
    (SELECT COUNT(*) FROM tasks s WHERE s.parent_task_id = t.id AND s.deleted_at IS NULL AND s.status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED')) AS subtasks_open,
    (SELECT COUNT(*) FROM task_comments cm WHERE cm.task_id = t.id AND cm.deleted_at IS NULL) AS comments,
    (SELECT COUNT(*) FROM work_likes l WHERE l.target_type = 'TASK' AND l.target_id = t.id) AS likes,
    (SELECT COUNT(*) FROM task_dependencies dp JOIN tasks bt ON bt.id = dp.blocker_task_id AND bt.deleted_at IS NULL WHERE dp.blocked_task_id = t.id AND bt.status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED')) AS blocked_by`;

async function decorate(rows: Row[], db: Queryable): Promise<WorkTaskItem[]> {
  const ids = rows.map((row) => num(row.id));
  const tags = new Map<number, WorkTaskItem["tags"]>();
  const projects = new Map<number, WorkTaskItem["projects"]>();
  if (ids.length) {
    const [tagRows] = await db.query<Row[]>("SELECT tt.task_id, g.id, g.name, g.color FROM task_tags tt JOIN work_tags g ON g.id = tt.tag_id WHERE tt.task_id IN (?) ORDER BY g.name", [ids]);
    for (const row of tagRows) tags.set(num(row.task_id), [...(tags.get(num(row.task_id)) ?? []), { id: num(row.id), name: String(row.name), color: String(row.color) }]);
    const [projectRows] = await db.query<Row[]>("SELECT tp.task_id, p.id, p.name, p.color FROM task_projects tp JOIN projects p ON p.id = tp.project_id AND p.deleted_at IS NULL WHERE tp.task_id IN (?) ORDER BY p.name", [ids]);
    for (const row of projectRows) projects.set(num(row.task_id), [...(projects.get(num(row.task_id)) ?? []), { id: num(row.id), name: String(row.name), color: String(row.color) }]);
  }
  return rows.map((row) => ({
    id: num(row.id),
    taskNo: String(row.task_no),
    title: String(row.title),
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    assigneeId: num(row.assignee_id),
    assigneeName: String(row.assignee_name),
    createdBy: num(row.created_by),
    createdByName: String(row.created_by_name),
    dueAt: (row.due_at as Date | null) ?? null,
    startsOn: dateOnly(row.starts_on),
    completedAt: (row.completed_at as Date | null) ?? null,
    isMilestone: Boolean(row.is_milestone),
    parentTaskId: maybeNum(row.parent_task_id),
    assignedAt: (row.assigned_at as Date | null) ?? null,
    sectionId: maybeNum(row.section_id),
    position: Number(row.position ?? 0),
    subtasks: num(row.subtasks),
    subtasksOpen: num(row.subtasks_open),
    comments: num(row.comments),
    likes: num(row.likes),
    blockedBy: num(row.blocked_by),
    tags: tags.get(num(row.id)) ?? [],
    projects: projects.get(num(row.id)) ?? [],
  }));
}

// Everything in a project (who may see the project sees all its tasks).
export async function listProjectTasks(projectId: number, db: Queryable = getDbPool()): Promise<WorkTaskItem[]> {
  const [rows] = await db.query<Row[]>(
    `${ITEM_SELECT}, tp.section_id, tp.position FROM task_projects tp JOIN tasks t ON t.id = tp.task_id JOIN users a ON a.id = t.assignee_id JOIN users c ON c.id = t.created_by
     WHERE tp.project_id = ? AND t.deleted_at IS NULL ORDER BY tp.position, t.id LIMIT 2000`,
    [projectId],
  );
  return decorate(rows, db);
}

export async function listTaskItems(where: string[], params: unknown[], orderBy: string, limit: number, offset = 0, db: Queryable = getDbPool()): Promise<{ items: WorkTaskItem[]; total: number }> {
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [rows] = await db.query<Row[]>(`${ITEM_SELECT}, NULL AS section_id, t.subtask_position AS position FROM tasks t JOIN users a ON a.id = t.assignee_id JOIN users c ON c.id = t.created_by ${clause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const [count] = await db.query<Row[]>(`SELECT COUNT(*) AS total FROM tasks t JOIN users a ON a.id = t.assignee_id ${clause}`, params);
  return { items: await decorate(rows, db), total: num(count[0]?.total ?? 0) };
}

export async function listSubtasks(parentId: number, db: Queryable = getDbPool()): Promise<WorkTaskItem[]> {
  return (await listTaskItems(["t.parent_task_id = ?", "t.deleted_at IS NULL"], [parentId], "t.subtask_position, t.id", 500, 0, db)).items;
}

export interface TaskProjectLink {
  projectId: number;
  projectName: string;
  color: string;
  sectionId: number;
  sectionName: string;
  position: number;
}
export async function listTaskProjects(taskId: number, db: Queryable = getDbPool()): Promise<TaskProjectLink[]> {
  const [rows] = await db.query<Row[]>(
    `SELECT tp.project_id, p.name, p.color, tp.section_id, s.name AS section_name, tp.position FROM task_projects tp JOIN projects p ON p.id = tp.project_id AND p.deleted_at IS NULL
     JOIN project_sections s ON s.id = tp.section_id WHERE tp.task_id = ? ORDER BY p.name`,
    [taskId],
  );
  return rows.map((row) => ({ projectId: num(row.project_id), projectName: String(row.name), color: String(row.color), sectionId: num(row.section_id), sectionName: String(row.section_name), position: Number(row.position) }));
}
export async function countTaskProjects(taskId: number, db: Queryable): Promise<number> {
  const [rows] = await db.query<Row[]>("SELECT COUNT(*) AS n FROM task_projects WHERE task_id = ?", [taskId]);
  return num(rows[0]?.n ?? 0);
}
export async function placeTaskInProject(taskId: number, projectId: number, sectionId: number, position: number, addedBy: number, db: Queryable): Promise<void> {
  await db.query<ResultSetHeader>(
    "INSERT INTO task_projects (task_id, project_id, section_id, position, added_by) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE section_id = VALUES(section_id), position = VALUES(position)",
    [taskId, projectId, sectionId, position, addedBy],
  );
}
export async function removeTaskFromProject(taskId: number, projectId: number, db: Queryable): Promise<void> {
  await db.query<ResultSetHeader>("DELETE FROM task_projects WHERE task_id = ? AND project_id = ?", [taskId, projectId]);
}
// Positions of a section's tasks in order (for moves and renumbering).
export async function sectionPositions(projectId: number, sectionId: number, db: Queryable): Promise<{ taskId: number; position: number }[]> {
  const [rows] = await db.query<Row[]>("SELECT task_id, position FROM task_projects WHERE project_id = ? AND section_id = ? ORDER BY position, task_id", [projectId, sectionId]);
  return rows.map((row) => ({ taskId: num(row.task_id), position: Number(row.position) }));
}
export async function renumberSection(projectId: number, sectionId: number, db: Queryable): Promise<void> {
  const rows = await sectionPositions(projectId, sectionId, db);
  for (const [index, row] of rows.entries()) await db.query<ResultSetHeader>("UPDATE task_projects SET position = ? WHERE task_id = ? AND project_id = ?", [(index + 1) * 1024, row.taskId, projectId]);
}
export async function moveSectionTasks(projectId: number, fromSection: number, toSection: number, db: Queryable): Promise<void> {
  const [rows] = await db.query<Row[]>("SELECT COALESCE(MAX(position), 0) AS top FROM task_projects WHERE project_id = ? AND section_id = ?", [projectId, toSection]);
  await db.query<ResultSetHeader>("UPDATE task_projects SET section_id = ?, position = position + ? WHERE project_id = ? AND section_id = ?", [toSection, Number(rows[0]?.top ?? 0) + 1024, projectId, fromSection]);
}

// The projects of a task and of its top task, with their facts (for rights).
export async function projectsGoverning(taskId: number, rootId: number | null, db: Queryable = getDbPool()): Promise<{ project: ProjectRecord; members: ProjectMember[] }[]> {
  const [rows] = await db.query<Row[]>("SELECT DISTINCT project_id FROM task_projects WHERE task_id IN (?, ?)", [taskId, rootId ?? taskId]);
  const out: { project: ProjectRecord; members: ProjectMember[] }[] = [];
  for (const row of rows) {
    const project = await findProject(num(row.project_id), db);
    if (project && !project.deletedAt) out.push({ project, members: await listProjectMembers(project.id, db) });
  }
  return out;
}

// ---- task tree ---------------------------------------------------------------------------
export interface TreeFacts {
  id: number;
  parentTaskId: number | null;
  rootTaskId: number | null;
  depth: number;
  isMilestone: boolean;
  deletedAt: Date | null;
  deletedBy: number | null;
  assignedAt: Date | null;
}
export async function treeFacts(taskId: number, db: Queryable = getDbPool()): Promise<TreeFacts | null> {
  const [rows] = await db.query<Row[]>("SELECT id, parent_task_id, root_task_id, depth, is_milestone, deleted_at, deleted_by, assigned_at FROM tasks WHERE id = ?", [taskId]);
  const row = rows[0];
  return row
    ? {
        id: num(row.id),
        parentTaskId: maybeNum(row.parent_task_id),
        rootTaskId: maybeNum(row.root_task_id),
        depth: num(row.depth),
        isMilestone: Boolean(row.is_milestone),
        deletedAt: (row.deleted_at as Date | null) ?? null,
        deletedBy: maybeNum(row.deleted_by),
        assignedAt: (row.assigned_at as Date | null) ?? null,
      }
    : null;
}
// The chain from the top task down to the parent (for breadcrumbs and loop checks).
export async function ancestors(taskId: number, db: Queryable = getDbPool()): Promise<{ id: number; taskNo: string; title: string }[]> {
  const chain: { id: number; taskNo: string; title: string }[] = [];
  let current = (await treeFacts(taskId, db))?.parentTaskId ?? null;
  while (current !== null && chain.length < 10) {
    const [rows] = await db.query<Row[]>("SELECT id, task_no, title, parent_task_id FROM tasks WHERE id = ?", [current]);
    const row = rows[0];
    if (!row) break;
    chain.unshift({ id: num(row.id), taskNo: String(row.task_no), title: String(row.title) });
    current = maybeNum(row.parent_task_id);
  }
  return chain;
}
// Every task below `taskId` with its depth below it (1 = child).
export async function descendants(taskId: number, db: Queryable = getDbPool()): Promise<{ id: number; level: number }[]> {
  const out: { id: number; level: number }[] = [];
  let frontier = [taskId];
  for (let level = 1; frontier.length && level <= 10; level += 1) {
    const [rows] = await db.query<Row[]>("SELECT id FROM tasks WHERE parent_task_id IN (?)", [frontier]);
    frontier = rows.map((row) => num(row.id));
    for (const id of frontier) out.push({ id, level });
  }
  return out;
}
export async function setTaskTree(taskId: number, values: { parentTaskId: number | null; rootTaskId: number | null; depth: number; position: number }, db: Queryable): Promise<void> {
  await db.query<ResultSetHeader>("UPDATE tasks SET parent_task_id = ?, root_task_id = ?, depth = ?, subtask_position = ? WHERE id = ?", [values.parentTaskId, values.rootTaskId, values.depth, values.position, taskId]);
}
export async function setTaskWorkFields(taskId: number, changes: { is_milestone?: boolean; starts_on?: string | null; deleted_at?: Date | null; deleted_by?: number | null; assigned_at?: Date | null }, db: Queryable): Promise<void> {
  const keys = Object.keys(changes) as (keyof typeof changes)[];
  if (keys.length) await db.query<ResultSetHeader>(`UPDATE tasks SET ${keys.map((key) => `${key} = ?`).join(", ")} WHERE id = ?`, [...keys.map((key) => changes[key]), taskId]);
}
export async function lastSubtaskPosition(parentId: number, db: Queryable): Promise<number | null> {
  const [rows] = await db.query<Row[]>("SELECT MAX(subtask_position) AS top FROM tasks WHERE parent_task_id = ?", [parentId]);
  return rows[0]?.top === null || rows[0]?.top === undefined ? null : Number(rows[0].top);
}

// ---- followers ---------------------------------------------------------------------------
export async function listFollowers(taskId: number, db: Queryable = getDbPool()): Promise<{ id: number; name: string }[]> {
  const [rows] = await db.query<Row[]>("SELECT u.id, u.name FROM task_followers f JOIN users u ON u.id = f.user_id WHERE f.task_id = ? ORDER BY f.created_at, u.name", [taskId]);
  return rows.map((row) => ({ id: num(row.id), name: String(row.name) }));
}
export async function addFollower(taskId: number, userId: number, source: "CREATOR" | "ASSIGNEE" | "MANUAL" | "MENTION" | "COMMENT", addedBy: number | null, db: Queryable): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>("INSERT IGNORE INTO task_followers (task_id, user_id, source, added_by) VALUES (?, ?, ?, ?)", [taskId, userId, source, addedBy]);
  return result.affectedRows === 1;
}
export async function removeFollower(taskId: number, userId: number, db: Queryable): Promise<void> {
  await db.query<ResultSetHeader>("DELETE FROM task_followers WHERE task_id = ? AND user_id = ?", [taskId, userId]);
}
export async function isFollowing(taskIds: readonly number[], userId: number, db: Queryable = getDbPool()): Promise<boolean> {
  const [rows] = await db.query<Row[]>("SELECT 1 FROM task_followers WHERE task_id IN (?) AND user_id = ? LIMIT 1", [taskIds, userId]);
  return rows.length > 0;
}

// ---- comments ----------------------------------------------------------------------------
export interface CommentRecord {
  id: number;
  taskId: number;
  parentCommentId: number | null;
  authorId: number;
  authorName: string;
  body: string;
  isPinned: boolean;
  editedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  likes: number;
  likedByMe: boolean;
}
export async function listComments(taskId: number, viewerId: number, db: Queryable = getDbPool()): Promise<CommentRecord[]> {
  const [rows] = await db.query<Row[]>(
    `SELECT cm.*, u.name AS author_name,
       (SELECT COUNT(*) FROM work_likes l WHERE l.target_type = 'COMMENT' AND l.target_id = cm.id) AS likes,
       EXISTS (SELECT 1 FROM work_likes l WHERE l.target_type = 'COMMENT' AND l.target_id = cm.id AND l.user_id = ?) AS liked
     FROM task_comments cm JOIN users u ON u.id = cm.author_id WHERE cm.task_id = ? ORDER BY cm.id`,
    [viewerId, taskId],
  );
  return rows.map((row) => ({
    id: num(row.id),
    taskId: num(row.task_id),
    parentCommentId: maybeNum(row.parent_comment_id),
    authorId: num(row.author_id),
    authorName: String(row.author_name),
    body: row.deleted_at ? "" : String(row.body),
    isPinned: Boolean(row.is_pinned),
    editedAt: (row.edited_at as Date | null) ?? null,
    deletedAt: (row.deleted_at as Date | null) ?? null,
    createdAt: row.created_at as Date,
    likes: num(row.likes),
    likedByMe: Boolean(row.liked),
  }));
}
export async function findComment(id: number, db: Queryable = getDbPool()): Promise<{ id: number; taskId: number; parentCommentId: number | null; authorId: number; deletedAt: Date | null } | null> {
  const [rows] = await db.query<Row[]>("SELECT id, task_id, parent_comment_id, author_id, deleted_at FROM task_comments WHERE id = ?", [id]);
  const row = rows[0];
  return row ? { id: num(row.id), taskId: num(row.task_id), parentCommentId: maybeNum(row.parent_comment_id), authorId: num(row.author_id), deletedAt: (row.deleted_at as Date | null) ?? null } : null;
}
export async function insertComment(taskId: number, parentId: number | null, authorId: number, body: string, db: Queryable): Promise<number> {
  const [result] = await db.query<ResultSetHeader>("INSERT INTO task_comments (task_id, parent_comment_id, author_id, body) VALUES (?, ?, ?, ?)", [taskId, parentId, authorId, body]);
  return result.insertId;
}
export async function updateComment(id: number, changes: { body?: string; pinned?: boolean; deletedBy?: number }, db: Queryable): Promise<void> {
  if (changes.body !== undefined) await db.query<ResultSetHeader>("UPDATE task_comments SET body = ?, edited_at = UTC_TIMESTAMP() WHERE id = ?", [changes.body, id]);
  if (changes.pinned !== undefined) await db.query<ResultSetHeader>("UPDATE task_comments SET is_pinned = ? WHERE id = ?", [changes.pinned, id]);
  if (changes.deletedBy !== undefined) await db.query<ResultSetHeader>("UPDATE task_comments SET deleted_at = UTC_TIMESTAMP(), deleted_by = ?, is_pinned = FALSE WHERE id = ?", [changes.deletedBy, id]);
}

// ---- likes -----------------------------------------------------------------------------
export async function toggleLike(target: "TASK" | "COMMENT" | "STATUS", targetId: number, userId: number, db: Queryable = getDbPool()): Promise<boolean> {
  const [removed] = await db.query<ResultSetHeader>("DELETE FROM work_likes WHERE target_type = ? AND target_id = ? AND user_id = ?", [target, targetId, userId]);
  if (removed.affectedRows) return false;
  await db.query<ResultSetHeader>("INSERT IGNORE INTO work_likes (target_type, target_id, user_id) VALUES (?, ?, ?)", [target, targetId, userId]);
  return true;
}
export async function likesOf(target: "TASK" | "COMMENT" | "STATUS", targetId: number, db: Queryable = getDbPool()): Promise<{ id: number; name: string }[]> {
  const [rows] = await db.query<Row[]>("SELECT u.id, u.name FROM work_likes l JOIN users u ON u.id = l.user_id WHERE l.target_type = ? AND l.target_id = ? ORDER BY l.created_at", [target, targetId]);
  return rows.map((row) => ({ id: num(row.id), name: String(row.name) }));
}

// ---- dependencies --------------------------------------------------------------------------
export async function listDependencies(taskId: number, db: Queryable = getDbPool()): Promise<{ blockedBy: { id: number; taskNo: string; title: string; status: TaskStatus }[]; blocking: { id: number; taskNo: string; title: string; status: TaskStatus }[] }> {
  const pick = async (sql: string) => {
    const [rows] = await db.query<Row[]>(sql, [taskId]);
    return rows.map((row) => ({ id: num(row.id), taskNo: String(row.task_no), title: String(row.title), status: row.status as TaskStatus }));
  };
  return {
    blockedBy: await pick("SELECT t.id, t.task_no, t.title, t.status FROM task_dependencies d JOIN tasks t ON t.id = d.blocker_task_id AND t.deleted_at IS NULL WHERE d.blocked_task_id = ? ORDER BY t.id"),
    blocking: await pick("SELECT t.id, t.task_no, t.title, t.status FROM task_dependencies d JOIN tasks t ON t.id = d.blocked_task_id AND t.deleted_at IS NULL WHERE d.blocker_task_id = ? ORDER BY t.id"),
  };
}
// The dependency edges reachable from these tasks (enough for the loop check).
export async function dependencyEdges(db: Queryable): Promise<[number, number][]> {
  const [rows] = await db.query<Row[]>("SELECT blocker_task_id, blocked_task_id FROM task_dependencies LIMIT 100000");
  return rows.map((row) => [num(row.blocker_task_id), num(row.blocked_task_id)]);
}
export async function addDependency(blocker: number, blocked: number, by: number, db: Queryable): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>("INSERT IGNORE INTO task_dependencies (blocker_task_id, blocked_task_id, created_by) VALUES (?, ?, ?)", [blocker, blocked, by]);
  return result.affectedRows === 1;
}
export async function removeDependency(blocker: number, blocked: number, db: Queryable): Promise<void> {
  await db.query<ResultSetHeader>("DELETE FROM task_dependencies WHERE blocker_task_id = ? AND blocked_task_id = ?", [blocker, blocked]);
}
export async function countDependencies(taskId: number, db: Queryable): Promise<number> {
  const [rows] = await db.query<Row[]>("SELECT COUNT(*) AS n FROM task_dependencies WHERE blocker_task_id = ? OR blocked_task_id = ?", [taskId, taskId]);
  return num(rows[0]?.n ?? 0);
}

// ---- tags ------------------------------------------------------------------------------
export async function listTags(db: Queryable = getDbPool()): Promise<{ id: number; name: string; color: string }[]> {
  const [rows] = await db.query<Row[]>("SELECT id, name, color FROM work_tags ORDER BY name LIMIT 1000");
  return rows.map((row) => ({ id: num(row.id), name: String(row.name), color: String(row.color) }));
}
export async function tagByName(name: string, createdBy: number, color: string, db: Queryable): Promise<number> {
  await db.query<ResultSetHeader>("INSERT IGNORE INTO work_tags (name, color, created_by) VALUES (?, ?, ?)", [name, color, createdBy]);
  const [rows] = await db.query<Row[]>("SELECT id FROM work_tags WHERE name = ?", [name]);
  return num(rows[0]!.id);
}
export async function setTaskTag(taskId: number, tagId: number, on: boolean, by: number, db: Queryable): Promise<void> {
  if (on) await db.query<ResultSetHeader>("INSERT IGNORE INTO task_tags (task_id, tag_id, added_by) VALUES (?, ?, ?)", [taskId, tagId, by]);
  else await db.query<ResultSetHeader>("DELETE FROM task_tags WHERE task_id = ? AND tag_id = ?", [taskId, tagId]);
}

// ---- status updates ----------------------------------------------------------------------
export interface StatusUpdate {
  id: number;
  status: ProjectStatusKind;
  title: string;
  body: string | null;
  snapshot: { open: number; completed: number; overdue: number };
  authorId: number;
  authorName: string;
  createdAt: Date;
  projectId: number;
  projectName: string;
}
const toStatus = (row: Row): StatusUpdate => {
  const snapshot = (typeof row.snapshot_json === "string" ? JSON.parse(row.snapshot_json) : row.snapshot_json) as StatusUpdate["snapshot"];
  return { id: num(row.id), status: row.status as ProjectStatusKind, title: String(row.title), body: str(row.body), snapshot, authorId: num(row.author_id), authorName: String(row.author_name), createdAt: row.created_at as Date, projectId: num(row.project_id), projectName: String(row.project_name) };
};
export async function listStatusUpdates(projectId: number, db: Queryable = getDbPool()): Promise<StatusUpdate[]> {
  const [rows] = await db.query<Row[]>(
    "SELECT s.*, u.name AS author_name, p.name AS project_name FROM project_status_updates s JOIN users u ON u.id = s.author_id JOIN projects p ON p.id = s.project_id WHERE s.project_id = ? AND s.deleted_at IS NULL ORDER BY s.id DESC LIMIT 50",
    [projectId],
  );
  return rows.map(toStatus);
}
export async function recentStatusUpdates(viewer: WorkViewer, limit: number, db: Queryable = getDbPool()): Promise<StatusUpdate[]> {
  const visible = visibleProjectClause(viewer);
  const [rows] = await db.query<Row[]>(
    `SELECT s.*, u.name AS author_name, p.name AS project_name FROM project_status_updates s JOIN users u ON u.id = s.author_id JOIN projects p ON p.id = s.project_id
     WHERE s.deleted_at IS NULL AND p.archived_at IS NULL AND ${visible.sql} ORDER BY s.id DESC LIMIT ?`,
    [...visible.params, limit],
  );
  return rows.map(toStatus);
}
export async function insertStatusUpdate(projectId: number, status: ProjectStatusKind, title: string, body: string | null, snapshot: StatusUpdate["snapshot"], authorId: number, db: Queryable): Promise<number> {
  const [result] = await db.query<ResultSetHeader>("INSERT INTO project_status_updates (project_id, status, title, body, snapshot_json, author_id) VALUES (?, ?, ?, ?, ?, ?)", [projectId, status, title, body, JSON.stringify(snapshot), authorId]);
  return result.insertId;
}
export async function findStatusUpdate(id: number, db: Queryable = getDbPool()): Promise<{ id: number; projectId: number; authorId: number } | null> {
  const [rows] = await db.query<Row[]>("SELECT id, project_id, author_id FROM project_status_updates WHERE id = ? AND deleted_at IS NULL", [id]);
  return rows[0] ? { id: num(rows[0].id), projectId: num(rows[0].project_id), authorId: num(rows[0].author_id) } : null;
}
export async function deleteStatusUpdate(id: number, db: Queryable): Promise<void> {
  await db.query<ResultSetHeader>("UPDATE project_status_updates SET deleted_at = UTC_TIMESTAMP() WHERE id = ?", [id]);
}
export async function projectCounts(projectId: number, db: Queryable = getDbPool()): Promise<StatusUpdate["snapshot"]> {
  const [rows] = await db.query<Row[]>(
    `SELECT SUM(t.status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED')) AS open_n, SUM(t.status = 'COMPLETED') AS done_n,
       SUM(t.status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED') AND t.due_at < UTC_TIMESTAMP()) AS late_n
     FROM task_projects tp JOIN tasks t ON t.id = tp.task_id AND t.deleted_at IS NULL WHERE tp.project_id = ?`,
    [projectId],
  );
  return { open: num(rows[0]?.open_n ?? 0), completed: num(rows[0]?.done_n ?? 0), overdue: num(rows[0]?.late_n ?? 0) };
}

// ---- favourites and recents ----------------------------------------------------------------
export async function toggleFavourite(userId: number, type: "PROJECT" | "SEARCH", id: number, db: Queryable = getDbPool()): Promise<boolean> {
  const [removed] = await db.query<ResultSetHeader>("DELETE FROM work_favourites WHERE user_id = ? AND object_type = ? AND object_id = ?", [userId, type, id]);
  if (removed.affectedRows) return false;
  await db.query<ResultSetHeader>("INSERT IGNORE INTO work_favourites (user_id, object_type, object_id) VALUES (?, ?, ?)", [userId, type, id]);
  return true;
}
export async function touchRecentProject(userId: number, projectId: number, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>("INSERT INTO work_recent_projects (user_id, project_id, opened_at) VALUES (?, ?, UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE opened_at = UTC_TIMESTAMP()", [userId, projectId]);
}
export async function homeProjects(viewer: WorkViewer, limit: number, db: Queryable = getDbPool()): Promise<(ProjectListItem & { recentAt: Date | null })[]> {
  const visible = visibleProjectClause(viewer);
  const [rows] = await db.query<Row[]>(
    `SELECT p.id, p.name, p.color, p.privacy, p.current_status, p.archived_at, d.name AS department_name, o.name AS owner_name, r.opened_at,
       EXISTS (SELECT 1 FROM work_favourites f WHERE f.user_id = ? AND f.object_type = 'PROJECT' AND f.object_id = p.id) AS starred,
       (SELECT COUNT(*) FROM task_projects tp JOIN tasks tt ON tt.id = tp.task_id AND tt.deleted_at IS NULL WHERE tp.project_id = p.id AND tt.status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED')) AS open_tasks,
       (SELECT COUNT(*) FROM task_projects tp JOIN tasks tt ON tt.id = tp.task_id AND tt.deleted_at IS NULL WHERE tp.project_id = p.id AND tt.status = 'COMPLETED') AS done_tasks
     FROM projects p LEFT JOIN departments d ON d.id = p.department_id JOIN users o ON o.id = p.owner_id
     LEFT JOIN work_recent_projects r ON r.project_id = p.id AND r.user_id = ?
     WHERE p.archived_at IS NULL AND p.is_template = FALSE AND ${visible.sql}
       AND (r.opened_at IS NOT NULL OR EXISTS (SELECT 1 FROM work_favourites f WHERE f.user_id = ? AND f.object_type = 'PROJECT' AND f.object_id = p.id)
         OR EXISTS (SELECT 1 FROM project_members mm WHERE mm.project_id = p.id AND mm.member_type = 'USER' AND mm.member_id = ?))
     ORDER BY starred DESC, r.opened_at IS NULL, r.opened_at DESC, p.name LIMIT ?`,
    [viewer.id, viewer.id, ...visible.params, viewer.id, viewer.id, limit],
  );
  return rows.map((row) => ({
    id: num(row.id),
    name: String(row.name),
    color: row.color as ProjectColor,
    privacy: row.privacy as ProjectPrivacy,
    departmentName: str(row.department_name),
    ownerName: String(row.owner_name),
    currentStatus: (row.current_status as ProjectStatusKind | null) ?? null,
    archivedAt: null,
    isMember: true,
    starred: Boolean(row.starred),
    openTasks: num(row.open_tasks),
    doneTasks: num(row.done_tasks),
    recentAt: (row.opened_at as Date | null) ?? null,
  }));
}

// ---- My Tasks --------------------------------------------------------------------------
export interface MySection {
  id: number;
  name: string;
  position: number;
  system: MySystemSection | null;
}
// The four built-in sections exist once per person (made on first use).
export async function ensureMySections(userId: number, db: Queryable = getDbPool()): Promise<MySection[]> {
  const read = async () => {
    const [rows] = await db.query<Row[]>("SELECT id, name, position, system_key FROM my_task_sections WHERE user_id = ? ORDER BY position, id", [userId]);
    return rows.map((row) => ({ id: num(row.id), name: String(row.name), position: Number(row.position), system: (row.system_key as MySystemSection | null) ?? null }));
  };
  let sections = await read();
  const missing = MY_SECTION_ORDER.filter((key) => !sections.some((section) => section.system === key));
  if (missing.length) {
    for (const key of missing) {
      await db.query<ResultSetHeader>("INSERT IGNORE INTO my_task_sections (user_id, name, position, system_key) VALUES (?, ?, ?, ?)", [userId, MY_SECTION_NAMES[key], (MY_SECTION_ORDER.indexOf(key) + 1) * 1024, key]);
    }
    sections = await read();
  }
  return sections;
}
export async function insertMySection(userId: number, name: string, position: number, db: Queryable = getDbPool()): Promise<number> {
  const [result] = await db.query<ResultSetHeader>("INSERT INTO my_task_sections (user_id, name, position) VALUES (?, ?, ?)", [userId, name, position]);
  return result.insertId;
}
export async function updateMySection(userId: number, id: number, changes: { name?: string; position?: number }, db: Queryable = getDbPool()): Promise<boolean> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (changes.name !== undefined) {
    sets.push("name = ?");
    params.push(changes.name);
  }
  if (changes.position !== undefined) {
    sets.push("position = ?");
    params.push(changes.position);
  }
  if (!sets.length) return true;
  const [result] = await db.query<ResultSetHeader>(`UPDATE my_task_sections SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`, [...params, id, userId]);
  return result.affectedRows === 1;
}
// Deleting one's own section puts its tasks back to "by date" (no placement).
export async function deleteMySection(userId: number, id: number, db: Queryable = getDbPool()): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>("DELETE FROM my_task_sections WHERE id = ? AND user_id = ? AND system_key IS NULL", [id, userId]);
  return result.affectedRows === 1;
}
export async function myPlacements(userId: number, db: Queryable = getDbPool()): Promise<Map<number, { sectionId: number; position: number }>> {
  const [rows] = await db.query<Row[]>("SELECT task_id, section_id, position FROM my_task_placements WHERE user_id = ?", [userId]);
  return new Map(rows.map((row) => [num(row.task_id), { sectionId: num(row.section_id), position: Number(row.position) }]));
}
export async function placeMyTask(userId: number, taskId: number, sectionId: number, position: number, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>(
    "INSERT INTO my_task_placements (user_id, task_id, section_id, position) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE section_id = VALUES(section_id), position = VALUES(position), placed_at = UTC_TIMESTAMP()",
    [userId, taskId, sectionId, position],
  );
}
// A new assignee starts fresh: earlier placements of the task are forgotten.
export async function clearPlacements(taskId: number, db: Queryable): Promise<void> {
  await db.query<ResultSetHeader>("DELETE FROM my_task_placements WHERE task_id = ?", [taskId]);
}

// ---- saved searches ----------------------------------------------------------------------
export async function listSavedSearches(userId: number, db: Queryable = getDbPool()): Promise<{ id: number; name: string; query: string; starred: boolean }[]> {
  const [rows] = await db.query<Row[]>(
    "SELECT s.id, s.name, s.query, EXISTS (SELECT 1 FROM work_favourites f WHERE f.user_id = s.user_id AND f.object_type = 'SEARCH' AND f.object_id = s.id) AS starred FROM work_saved_searches s WHERE s.user_id = ? ORDER BY s.name",
    [userId],
  );
  return rows.map((row) => ({ id: num(row.id), name: String(row.name), query: String(row.query), starred: Boolean(row.starred) }));
}
export async function insertSavedSearch(userId: number, name: string, query: string, db: Queryable = getDbPool()): Promise<"OK" | "DUPLICATE" | "TOO_MANY"> {
  const [count] = await db.query<Row[]>("SELECT COUNT(*) AS n FROM work_saved_searches WHERE user_id = ?", [userId]);
  if (num(count[0]?.n ?? 0) >= 50) return "TOO_MANY";
  try {
    await db.query<ResultSetHeader>("INSERT INTO work_saved_searches (user_id, name, query) VALUES (?, ?, ?)", [userId, name, query]);
    return "OK";
  } catch (error) {
    if ((error as { code?: string }).code === "ER_DUP_ENTRY") return "DUPLICATE";
    throw error;
  }
}
export async function deleteSavedSearch(userId: number, id: number, db: Queryable = getDbPool()): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>("DELETE FROM work_saved_searches WHERE id = ? AND user_id = ?", [id, userId]);
  if (result.affectedRows) await db.query<ResultSetHeader>("DELETE FROM work_favourites WHERE user_id = ? AND object_type = 'SEARCH' AND object_id = ?", [userId, id]);
  return result.affectedRows === 1;
}

// ---- search ------------------------------------------------------------------------------
export const WORK_SEARCH_PAGE = 50;
export function workSearchSql(viewer: WorkViewer, search: WorkSearch, now: Date): { where: string[]; params: unknown[] } {
  const visible = visibleTaskClause(viewer);
  const where = [visible.sql];
  const params: unknown[] = [...visible.params];
  if (search.status === "open") where.push("t.status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED')");
  else if (search.status === "completed") where.push("t.status = 'COMPLETED'");
  else if (search.status === "cancelled") where.push("t.status = 'CANCELLED'");
  if (search.q) {
    const like = `%${search.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push("(t.task_no = ? OR t.title LIKE ? OR t.description LIKE ? OR EXISTS (SELECT 1 FROM task_comments sc WHERE sc.task_id = t.id AND sc.deleted_at IS NULL AND sc.body LIKE ?))");
    params.push(search.q.toUpperCase(), like, like, like);
  }
  if (search.assignee !== null) {
    where.push("t.assignee_id = ?");
    params.push(search.assignee === "me" ? viewer.id : search.assignee);
  }
  if (search.createdBy !== null) {
    where.push("(t.created_by = ? OR t.assigned_by = ?)");
    params.push(search.createdBy === "me" ? viewer.id : search.createdBy, search.createdBy === "me" ? viewer.id : search.createdBy);
  }
  if (search.project !== null) {
    where.push("EXISTS (SELECT 1 FROM task_projects sp WHERE sp.task_id = t.id AND sp.project_id = ?)");
    params.push(search.project);
  }
  if (search.priority) {
    where.push("t.priority = ?");
    params.push(search.priority);
  }
  if (search.tag !== null) {
    where.push("EXISTS (SELECT 1 FROM task_tags st WHERE st.task_id = t.id AND st.tag_id = ?)");
    params.push(search.tag);
  }
  if (search.dueFrom) {
    where.push("t.due_at >= ?");
    params.push(new Date(`${search.dueFrom}T00:00:00+05:30`));
  }
  if (search.dueTo) {
    where.push("t.due_at < ?");
    params.push(new Date(new Date(`${search.dueTo}T00:00:00+05:30`).getTime() + 86_400_000));
  }
  if (search.followed) {
    where.push("EXISTS (SELECT 1 FROM task_followers sf WHERE sf.task_id = t.id AND sf.user_id = ?)");
    params.push(viewer.id);
  }
  if (search.team) {
    where.push("t.assignee_id IN (?)");
    params.push(viewer.teamIds.length ? [...viewer.teamIds] : [0]);
  }
  if (search.overdue) {
    where.push("t.status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED') AND t.due_at < ?");
    params.push(now);
  }
  return { where, params };
}

// Quick search (command palette): tasks and projects by number or words.
export async function quickWork(viewer: WorkViewer, q: string, db: Queryable = getDbPool()): Promise<{ tasks: { id: number; taskNo: string; title: string; status: TaskStatus }[]; projects: { id: number; name: string }[] }> {
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const visible = visibleTaskClause(viewer);
  const [taskRows] = await db.query<Row[]>(
    `SELECT t.id, t.task_no, t.title, t.status FROM tasks t JOIN users a ON a.id = t.assignee_id WHERE ${visible.sql} AND (t.task_no = ? OR t.title LIKE ?)
     ORDER BY t.status IN ('COMPLETED', 'CANCELLED'), t.updated_at DESC LIMIT 6`,
    [...visible.params, q.toUpperCase(), like],
  );
  const projects = await listVisibleProjects(viewer, { q });
  return {
    tasks: taskRows.map((row) => ({ id: num(row.id), taskNo: String(row.task_no), title: String(row.title), status: row.status as TaskStatus })),
    projects: projects.slice(0, 5).map((project) => ({ id: project.id, name: project.name })),
  };
}

// The general task type's live version (for tasks added in projects and My Tasks).
export async function generalTypeVersion(db: Queryable = getDbPool()): Promise<{ typeId: number; versionId: number } | null> {
  const [rows] = await db.query<Row[]>(
    "SELECT mt.id AS type_id, v.id AS version_id FROM module_types mt JOIN module_type_versions v ON v.type_id = mt.id AND v.status = 'PUBLISHED' WHERE mt.module = 'TASK' AND mt.code = 'GENERAL' AND mt.active = TRUE",
  );
  return rows[0] ? { typeId: num(rows[0].type_id), versionId: num(rows[0].version_id) } : null;
}

// Deleted tasks the person created or deleted (last 30 days), for Restore.
export async function listDeletedTasks(userId: number, db: Queryable = getDbPool()): Promise<{ id: number; taskNo: string; title: string; deletedAt: Date }[]> {
  const [rows] = await db.query<Row[]>(
    "SELECT id, task_no, title, deleted_at FROM tasks WHERE deleted_at IS NOT NULL AND deleted_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY) AND (created_by = ? OR deleted_by = ?) AND parent_task_id IS NULL ORDER BY deleted_at DESC LIMIT 100",
    [userId, userId],
  );
  return rows.map((row) => ({ id: num(row.id), taskNo: String(row.task_no), title: String(row.title), deletedAt: row.deleted_at as Date }));
}
export async function listDeletedProjects(viewer: WorkViewer, db: Queryable = getDbPool()): Promise<{ id: number; name: string; deletedAt: Date }[]> {
  const [rows] = await db.query<Row[]>(
    `SELECT p.id, p.name, p.deleted_at FROM projects p WHERE p.deleted_at IS NOT NULL AND p.deleted_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)
     AND (? OR p.deleted_by = ? OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.member_type = 'USER' AND m.member_id = ? AND m.role = 'OWNER')) ORDER BY p.deleted_at DESC LIMIT 100`,
    [viewer.isAdmin, viewer.id, viewer.id],
  );
  return rows.map((row) => ({ id: num(row.id), name: String(row.name), deletedAt: row.deleted_at as Date }));
}

// D-216: the reporting line below a manager (every level), with their open,
// overdue and recently completed tasks, nearest reports first.
export async function teamWorkload(teamIds: readonly number[], managerId: number, db: Queryable = getDbPool()): Promise<{ id: number; name: string; managerName: string | null; direct: boolean; open: number; overdue: number; doneWeek: number }[]> {
  if (!teamIds.length) return [];
  const [rows] = await db.query<Row[]>(
    `SELECT u.id, u.name, m.name AS manager_name, u.reporting_manager_id,
       (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = u.id AND t.deleted_at IS NULL AND t.status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED')) AS open_n,
       (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = u.id AND t.deleted_at IS NULL AND t.status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED') AND t.due_at < UTC_TIMESTAMP()) AS late_n,
       (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = u.id AND t.deleted_at IS NULL AND t.status = 'COMPLETED' AND t.completed_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)) AS done_n
     FROM users u LEFT JOIN users m ON m.id = u.reporting_manager_id WHERE u.id IN (?) AND u.active = TRUE ORDER BY u.reporting_manager_id = ? DESC, late_n DESC, u.name LIMIT 200`,
    [[...teamIds], managerId],
  );
  return rows.map((row) => ({ id: num(row.id), name: String(row.name), managerName: str(row.manager_name), direct: num(row.reporting_manager_id) === managerId, open: num(row.open_n), overdue: num(row.late_n), doneWeek: num(row.done_n) }));
}

// ---- custom fields (D-218) -------------------------------------------------------------
export interface ProjectField {
  id: number;
  projectId: number;
  name: string;
  kind: "TEXT" | "NUMBER" | "SELECT" | "DATE";
  options: string[];
}
export async function listProjectFields(projectId: number, db: Queryable = getDbPool()): Promise<ProjectField[]> {
  const [rows] = await db.query<Row[]>("SELECT id, project_id, name, kind, options_json FROM project_fields WHERE project_id = ? AND deleted_at IS NULL ORDER BY position, id", [projectId]);
  return rows.map((row) => ({
    id: num(row.id),
    projectId: num(row.project_id),
    name: String(row.name),
    kind: row.kind as ProjectField["kind"],
    options: (typeof row.options_json === "string" ? JSON.parse(row.options_json) : row.options_json) as string[],
  }));
}
export async function findProjectField(id: number, db: Queryable = getDbPool()): Promise<ProjectField | null> {
  const [rows] = await db.query<Row[]>("SELECT project_id FROM project_fields WHERE id = ? AND deleted_at IS NULL", [id]);
  if (!rows[0]) return null;
  return (await listProjectFields(num(rows[0].project_id), db)).find((field) => field.id === id) ?? null;
}
export async function insertProjectField(projectId: number, name: string, kind: ProjectField["kind"], options: string[], by: number, db: Queryable = getDbPool()): Promise<number> {
  const [top] = await db.query<Row[]>("SELECT COALESCE(MAX(position), 0) AS top FROM project_fields WHERE project_id = ?", [projectId]);
  const [result] = await db.query<ResultSetHeader>("INSERT INTO project_fields (project_id, name, kind, options_json, position, created_by) VALUES (?, ?, ?, ?, ?, ?)", [
    projectId,
    name,
    kind,
    JSON.stringify(options),
    Number(top[0]?.top ?? 0) + 1024,
    by,
  ]);
  return result.insertId;
}
export async function removeProjectField(id: number, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>("UPDATE project_fields SET deleted_at = UTC_TIMESTAMP() WHERE id = ?", [id]);
}
// Values of the given tasks: task id → field id → value.
export async function fieldValues(taskIds: readonly number[], db: Queryable = getDbPool()): Promise<Map<number, Record<number, string>>> {
  const out = new Map<number, Record<number, string>>();
  if (!taskIds.length) return out;
  const [rows] = await db.query<Row[]>("SELECT task_id, field_id, value FROM task_field_values WHERE task_id IN (?)", [[...taskIds]]);
  for (const row of rows) out.set(num(row.task_id), { ...(out.get(num(row.task_id)) ?? {}), [num(row.field_id)]: String(row.value) });
  return out;
}
export async function setFieldValue(taskId: number, fieldId: number, value: string | null, by: number, db: Queryable = getDbPool()): Promise<void> {
  if (value === null) await db.query<ResultSetHeader>("DELETE FROM task_field_values WHERE task_id = ? AND field_id = ?", [taskId, fieldId]);
  else
    await db.query<ResultSetHeader>("INSERT INTO task_field_values (task_id, field_id, value, updated_by) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value), updated_by = VALUES(updated_by)", [taskId, fieldId, value, by]);
}

// ---- templates (D-218) ----------------------------------------------------------------
export async function listTemplates(viewer: WorkViewer, db: Queryable = getDbPool()): Promise<{ id: number; name: string; description: string | null; ownerName: string; body: unknown }[]> {
  const visible = visibleProjectClause(viewer);
  const [rows] = await db.query<Row[]>(
    `SELECT p.id, p.name, p.description, o.name AS owner_name, p.template_json FROM projects p JOIN users o ON o.id = p.owner_id WHERE p.is_template = TRUE AND ${visible.sql} ORDER BY p.name LIMIT 200`,
    visible.params,
  );
  return rows.map((row) => ({ id: num(row.id), name: String(row.name), description: str(row.description), ownerName: String(row.owner_name), body: row.template_json }));
}
export async function setTemplateBody(projectId: number, body: unknown, db: Queryable): Promise<void> {
  await db.query<ResultSetHeader>("UPDATE projects SET is_template = TRUE, template_json = ? WHERE id = ?", [JSON.stringify(body), projectId]);
}
export async function templateBody(projectId: number, db: Queryable = getDbPool()): Promise<unknown> {
  const [rows] = await db.query<Row[]>("SELECT template_json FROM projects WHERE id = ? AND is_template = TRUE AND deleted_at IS NULL", [projectId]);
  return rows[0]?.template_json ?? null;
}

// ---- task inbox (D-218) ---------------------------------------------------------------
export type InboxTab = "activity" | "bookmarks" | "archive";
export interface InboxItem {
  id: number;
  title: string;
  message: string;
  link: string | null;
  createdAt: Date;
  readAt: Date | null;
  archivedAt: Date | null;
  bookmarkedAt: Date | null;
  eventType: string;
}
const TASK_NOTICE = "(n.category = 'TASK' OR n.event_type LIKE 'WORK|_%' ESCAPE '|')";
export async function listInbox(userId: number, tab: InboxTab, unreadOnly: boolean, limit = 100, db: Queryable = getDbPool()): Promise<InboxItem[]> {
  const where = ["n.user_id = ?", TASK_NOTICE, tab === "archive" ? "n.archived_at IS NOT NULL" : tab === "bookmarks" ? "n.bookmarked_at IS NOT NULL" : "n.archived_at IS NULL"];
  if (unreadOnly) where.push("n.read_at IS NULL");
  const [rows] = await db.query<Row[]>(
    `SELECT n.id, n.title, n.message, n.deep_link, n.created_at, n.read_at, n.archived_at, n.bookmarked_at, n.event_type FROM notifications n WHERE ${where.join(" AND ")} ORDER BY n.id DESC LIMIT ?`,
    [userId, limit],
  );
  return rows.map((row) => ({
    id: num(row.id),
    title: String(row.title),
    message: String(row.message),
    link: str(row.deep_link),
    createdAt: row.created_at as Date,
    readAt: (row.read_at as Date | null) ?? null,
    archivedAt: (row.archived_at as Date | null) ?? null,
    bookmarkedAt: (row.bookmarked_at as Date | null) ?? null,
    eventType: String(row.event_type),
  }));
}
export async function inboxUnread(userId: number, db: Queryable = getDbPool()): Promise<number> {
  const [rows] = await db.query<Row[]>(`SELECT COUNT(*) AS n FROM notifications n WHERE n.user_id = ? AND ${TASK_NOTICE} AND n.archived_at IS NULL AND n.read_at IS NULL`, [userId]);
  return num(rows[0]?.n ?? 0);
}
const INBOX_SET: Record<string, string> = {
  READ: "read_at = COALESCE(read_at, UTC_TIMESTAMP())",
  UNREAD: "read_at = NULL",
  ARCHIVE: "archived_at = UTC_TIMESTAMP(), read_at = COALESCE(read_at, UTC_TIMESTAMP())",
  UNARCHIVE: "archived_at = NULL",
  BOOKMARK: "bookmarked_at = UTC_TIMESTAMP()",
  UNBOOKMARK: "bookmarked_at = NULL",
};
export const INBOX_COMMANDS = Object.keys(INBOX_SET);
// Only the person's own task notices change; `ids` null = all of them (not archived).
export async function setInbox(userId: number, ids: readonly number[] | null, command: string, db: Queryable = getDbPool()): Promise<number> {
  const set = INBOX_SET[command];
  if (!set) return 0;
  const [result] = await db.query<ResultSetHeader>(
    `UPDATE notifications n SET ${set} WHERE n.user_id = ? AND ${TASK_NOTICE} ${ids === null ? "AND n.archived_at IS NULL" : "AND n.id IN (?)"}`,
    ids === null ? [userId] : [userId, ids.length ? [...ids] : [0]],
  );
  return result.affectedRows;
}
