import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import * as work from "@/server/work/service";
import { loadTaskFor } from "@/server/modules/tasks";
import { countUnread, listInbox } from "@/lib/db/repositories/collab.repository";
import { inboxUnread } from "@/lib/db/repositories/work.repository";
import { bulkChangeModules } from "@/server/admin/users";
import { PROJECTS_NEED_TASKS, type ModuleCode } from "@/server/modules/modules";
import { createUser } from "./helpers";

// D-308 (owner's answers): without Projects, project notifications are
// hidden and not sent, projects open no task, and Projects is never given
// without Tasks.
const tag = Date.now().toString(36);
const person = (id: number, modules: ModuleCode[]) => ({ id, name: `P${id}`, roles: ["USER"], modules });
const ALL: ModuleCode[] = ["APPROVAL", "TASK", "PROJECT"];
const TASKS: ModuleCode[] = ["APPROVAL", "TASK"];
let owner: number; // has Projects
let outsider: number; // Tasks only
let assignee: number;
let adminId: number;
let projectId: number;
let taskId: number;

async function setModules(id: number, modules: string) {
  await getDbPool().query("UPDATE users SET module_access = ? WHERE id = ?", [modules, id]);
}

beforeAll(async () => {
  owner = await createUser({ name: `Owner ${tag}` });
  outsider = await createUser({ name: `Tasks only ${tag}` });
  assignee = await createUser({ name: `Assignee ${tag}` });
  adminId = await createUser({ name: `IT ${tag}`, roles: ["USER", "IT_ADMIN"] });
  await setModules(outsider, "APPROVAL,TASK");
  const created = await work.createProject({ name: `Open project ${tag}`, description: "", color: "blue", privacy: "ORGANISATION", departmentId: null, defaultAccessRole: "COMMENTER", defaultView: "LIST", startOn: "", dueOn: "" }, person(owner, ALL));
  if (!created.ok) throw new Error(created.message);
  projectId = created.value.id;
  const task = await work.quickAddTask({ title: `Shared task ${tag}`, projectId, sectionId: null, parentId: null, assigneeId: assignee, dueDay: "", mySectionId: null }, person(owner, ALL));
  if (!task.ok) throw new Error(task.message);
  taskId = task.value.id;
});

afterAll(async () => {
  await getDbPool().end();
});

describe("Projects module interlinks (D-308)", () => {
  it("a task seen only through a project: open with Projects, not without", async () => {
    expect(await loadTaskFor(taskId, person(outsider, [...ALL]))).not.toBeNull();
    expect(await loadTaskFor(taskId, person(outsider, TASKS))).toBeNull();
    // The people on the task keep it without Projects.
    expect(await loadTaskFor(taskId, person(assignee, TASKS))).not.toBeNull();
  });

  it("project notifications: not sent to members without Projects, and hidden from their inbox", async () => {
    expect((await work.setMember(projectId, { type: "USER", id: outsider }, "EDITOR", person(owner, ALL))).ok).toBe(true);
    expect((await work.postStatus(projectId, { status: "AT_RISK", title: "Late steel", body: "" }, person(owner, ALL))).ok).toBe(true);
    const [sent] = await getDbPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND event_type LIKE 'WORK|_PROJECT|_%' ESCAPE '|'", [outsider]);
    expect(Number(sent[0]!.n)).toBe(0);

    // An older one (from before the split) is hidden, and shows again once Projects is on.
    await getDbPool().query("INSERT INTO notifications (user_id, event_type, title, message, deep_link) VALUES (?, 'WORK_PROJECT_STATUS', 'Old status', 'x', ?)", [outsider, `/users/work/projects/${projectId}`]);
    expect((await listInbox(outsider, 50)).some((item) => item.title === "Old status")).toBe(false);
    expect(await countUnread(outsider)).toBe(0);
    expect(await inboxUnread(outsider)).toBe(0);
    await setModules(outsider, "APPROVAL,TASK,PROJECT");
    expect((await listInbox(outsider, 50)).some((item) => item.title === "Old status")).toBe(true);
    expect(await countUnread(outsider)).toBe(1);
    await setModules(outsider, "APPROVAL,TASK");
  });

  it("Projects is never given without Tasks (bulk add, or taking Tasks away)", async () => {
    const approvalsOnly = await createUser({ name: `Approvals only ${tag}` });
    await setModules(approvalsOnly, "APPROVAL");
    const it = { id: adminId, roles: ["USER", "IT_ADMIN"] as const, sessionId: "pm", ipAddress: null };
    const refused = await bulkChangeModules([approvalsOnly, outsider], "ADD", ["PROJECT"], { ...it, roles: [...it.roles] });
    expect(refused.changed).toBe(1); // the Tasks person
    expect(refused.refused.get(PROJECTS_NEED_TASKS)).toBe(1);
    const removeTasks = await bulkChangeModules([outsider], "REMOVE", ["TASK"], { ...it, roles: [...it.roles] });
    expect(removeTasks.refused.get(PROJECTS_NEED_TASKS)).toBe(1);
  });
});
