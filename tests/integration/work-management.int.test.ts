import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import * as work from "@/server/work/service";
import * as repo from "@/lib/db/repositories/work.repository";
import { findTask } from "@/lib/db/repositories/tasks.repository";
import { loadTaskFor } from "@/server/modules/tasks";
import { rightsOn, workViewer } from "@/server/work/task-access";
import { parseWorkSearch } from "@/server/work/rules";
import { createDepartment, createUser, setDepartment } from "./helpers";
import { loadHolidaySettings, saveHolidaySettings } from "@/server/work/holiday-store";
import { DEFAULT_HOLIDAY_SETTINGS } from "@/server/work/holidays";

// D-215 / D-216: Task & Project Management against MySQL: projects and
// roles, the one visibility rule (lists, search, task page) including the
// reporting line at every level, subtasks, comments with mentions,
// dependencies, My Tasks, delete and restore.
const tag = Date.now().toString(36);
const who = (id: number, roles: string[] = ["USER"]) => ({ id, name: `P${id}`, roles });
let head: number; // top manager
let lead: number; // reports to head
let member: number; // reports to lead
let outsider: number;
let colleague: number; // same department as member
let itAdmin: number;
let dept: number;
let projectId: number;

async function canSee(taskId: number, userId: number, roles: string[] = ["USER"]) {
  return (await loadTaskFor(taskId, { id: userId, roles })) !== null;
}
async function searchIds(userId: number, raw: Record<string, string> = {}) {
  const viewer = await workViewer({ id: userId, roles: ["USER"] });
  const sql = repo.workSearchSql(viewer, parseWorkSearch({ status: "all", ...raw }), new Date());
  return (await repo.listTaskItems(sql.where, sql.params, "t.id", 500)).items.map((item) => item.id);
}
async function notices(userId: number, eventType: string): Promise<number> {
  const [rows] = await getDbPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND event_type = ?", [userId, eventType]);
  return Number(rows[0]!.n);
}

beforeAll(async () => {
  head = await createUser({ name: `Head ${tag}` });
  lead = await createUser({ name: `Lead ${tag}`, managerId: head });
  member = await createUser({ name: `Member ${tag}`, managerId: lead });
  outsider = await createUser({ name: `Outsider ${tag}` });
  colleague = await createUser({ name: `Colleague ${tag}` });
  itAdmin = await createUser({ name: `IT ${tag}`, roles: ["USER", "IT_ADMIN"] });
  dept = await createDepartment(null);
  await setDepartment(member, dept);
  await setDepartment(colleague, dept);
});

afterAll(async () => {
  await getDbPool().end();
});

describe("Task & Project Management (D-215)", () => {
  it("the built-in General task type exists for project tasks", async () => {
    expect(await repo.generalTypeVersion()).not.toBeNull();
  });

  it("a private project: its owner gets three sections; outsiders can't open it", async () => {
    const created = await work.createProject({ name: `Plant upgrade ${tag}`, description: "", color: "blue", privacy: "PRIVATE", departmentId: null, defaultAccessRole: "COMMENTER", defaultView: "LIST", startOn: "", dueOn: "" }, who(member));
    expect(created.ok).toBe(true);
    projectId = created.ok ? created.value.id : 0;
    expect((await repo.listSections(projectId)).map((section) => section.name)).toEqual(work.STARTER_SECTIONS);
    expect(await repo.projectFor(projectId, await workViewer(who(outsider)))).toBeNull();
    expect((await repo.projectFor(projectId, await workViewer(who(member))))?.role).toBe("OWNER");
    expect((await repo.projectFor(projectId, await workViewer(who(itAdmin, ["USER", "IT_ADMIN"]))))?.role).toBe("OWNER");
  });

  it("D-216: managers above a member, at every level, may look into the project (view only)", async () => {
    expect((await repo.projectFor(projectId, await workViewer(who(lead))))?.role).toBe("VIEWER");
    expect((await repo.projectFor(projectId, await workViewer(who(head))))?.role).toBe("VIEWER");
    const added = await work.quickAddTask({ title: "Not allowed", projectId, sectionId: null, parentId: null, assigneeId: null, dueDay: "", mySectionId: null }, who(head));
    expect(added.ok).toBe(false);
  });

  it("the last owner can't leave or be demoted; a department member sees a shared project", async () => {
    expect((await work.leaveProject(projectId, who(member))).ok).toBe(false);
    expect((await work.setMember(projectId, { type: "USER", id: member }, "EDITOR", who(member))).ok).toBe(false);
    expect(await repo.projectFor(projectId, await workViewer(who(colleague)))).toBeNull();
    const shared = await work.updateProjectDetails(projectId, { name: `Plant upgrade ${tag}`, description: "", color: "blue", privacy: "DEPARTMENT", departmentId: dept, defaultAccessRole: "COMMENTER", defaultView: "BOARD", startOn: "", dueOn: "" }, who(member));
    expect(shared.ok).toBe(true);
    expect((await repo.projectFor(projectId, await workViewer(who(colleague))))?.role).toBe("COMMENTER");
    expect(await repo.projectFor(projectId, await workViewer(who(outsider)))).toBeNull();
  });

  let parentTask: number;
  let subtask: number;
  let privateTask: number;
  it("tasks in sections, subtasks, and one visibility rule for the task page and search", async () => {
    const sections = await repo.listSections(projectId);
    const first = await work.quickAddTask({ title: `Survey ${tag}`, projectId, sectionId: sections[1]!.id, parentId: null, assigneeId: null, dueDay: "2026-11-20", mySectionId: null }, who(member));
    expect(first.ok).toBe(true);
    parentTask = first.ok ? first.value.id : 0;
    const tasks = await repo.listProjectTasks(projectId);
    expect(tasks.find((task) => task.id === parentTask)?.sectionId).toBe(sections[1]!.id);
    const child = await work.quickAddTask({ title: `Survey east bay ${tag}`, projectId: null, sectionId: null, parentId: parentTask, assigneeId: outsider, dueDay: "", mySectionId: null }, who(member));
    expect(child.ok).toBe(true);
    subtask = child.ok ? child.value.id : 0;
    expect((await findTask(subtask))?.depth).toBe(1);
    // A private My Tasks task: only its people.
    const mine = await work.quickAddTask({ title: `My note ${tag}`, projectId: null, sectionId: null, parentId: null, assigneeId: null, dueDay: "", mySectionId: null }, who(outsider));
    privateTask = mine.ok ? mine.value.id : 0;

    // The project's people (department share) see the project task and its subtask.
    expect(await canSee(parentTask, colleague)).toBe(true);
    expect(await canSee(subtask, colleague)).toBe(true);
    // The subtask's assignee sees their subtask, not the project's other tasks.
    expect(await canSee(subtask, outsider)).toBe(true);
    expect(await canSee(parentTask, outsider)).toBe(false);
    // Private task: owner only (and IT).
    expect(await canSee(privateTask, colleague)).toBe(false);
    expect(await canSee(privateTask, itAdmin, ["USER", "IT_ADMIN"])).toBe(true);
    // Search applies the same rule.
    expect(await searchIds(colleague, { q: tag })).toEqual(expect.arrayContaining([parentTask, subtask]));
    expect(await searchIds(colleague, { q: tag })).not.toContain(privateTask);
    expect(await searchIds(outsider, { q: tag })).not.toContain(parentTask);
  });

  it("D-216: the whole reporting line above an assignee sees their tasks; peers don't", async () => {
    const given = await work.quickAddTask({ title: `Member's own ${tag}`, projectId: null, sectionId: null, parentId: null, assigneeId: null, dueDay: "", mySectionId: null }, who(member));
    const id = given.ok ? given.value.id : 0;
    expect(await canSee(id, lead)).toBe(true);
    expect(await canSee(id, head)).toBe(true); // two levels up
    expect(await canSee(id, outsider)).toBe(false);
    expect(await searchIds(head, { team: "1" })).toContain(id);
    const rights = await rightsOn((await findTask(id))!, await workViewer(who(head)));
    expect(rights).toMatchObject({ view: true, edit: false, comment: true });
    expect((await work.setTaskFields(id, { priority: "HIGH" }, who(head))).ok).toBe(false);
  });

  it("subtasks can't loop or go past five levels", async () => {
    expect((await work.setParent(parentTask, subtask, who(member))).ok).toBe(false);
    let current = subtask;
    for (let level = 2; level <= 5; level += 1) {
      const next = await work.quickAddTask({ title: `Level ${level}`, projectId: null, sectionId: null, parentId: current, assigneeId: null, dueDay: "", mySectionId: null }, who(member));
      expect(next.ok).toBe(true);
      current = next.ok ? next.value.id : 0;
    }
    expect((await work.quickAddTask({ title: "Too deep", projectId: null, sectionId: null, parentId: current, assigneeId: null, dueDay: "", mySectionId: null }, who(member))).ok).toBe(false);
  });

  it("moving within and across sections keeps the order", async () => {
    const sections = await repo.listSections(projectId);
    const second = await work.quickAddTask({ title: `Quotes ${tag}`, projectId, sectionId: sections[1]!.id, parentId: null, assigneeId: null, dueDay: "", mySectionId: null }, who(member));
    const secondId = second.ok ? second.value.id : 0;
    expect((await work.moveInProject({ taskId: secondId, projectId, sectionId: sections[1]!.id, beforeId: parentTask, afterId: null }, who(member))).ok).toBe(true);
    let list = (await repo.listProjectTasks(projectId)).filter((task) => task.sectionId === sections[1]!.id).sort((a, b) => a.position - b.position);
    expect(list.map((task) => task.id).slice(0, 2)).toEqual([secondId, parentTask]);
    expect((await work.moveInProject({ taskId: secondId, projectId, sectionId: sections[2]!.id, beforeId: null, afterId: null }, who(member))).ok).toBe(true);
    list = await repo.listProjectTasks(projectId);
    expect(list.find((task) => task.id === secondId)?.sectionId).toBe(sections[2]!.id);
    // A commenter can't move tasks.
    expect((await work.moveInProject({ taskId: secondId, projectId, sectionId: sections[0]!.id, beforeId: null, afterId: null }, who(colleague))).ok).toBe(false);
  });

  it("comments: replies one level deep; a mention tells the person and lets them see the task", async () => {
    const body = `Can you check this, @[Outsider](user:${outsider})?`;
    const before = await notices(outsider, "WORK_TASK_MENTION");
    const posted = await work.addComment(parentTask, body, null, who(colleague));
    expect(posted.ok).toBe(true);
    expect(await notices(outsider, "WORK_TASK_MENTION")).toBe(before + 1);
    expect(await canSee(parentTask, outsider)).toBe(true); // now a follower
    const rootId = posted.ok ? posted.value.id : 0;
    const reply = await work.addComment(parentTask, "Done", rootId, who(outsider));
    expect(reply.ok).toBe(true);
    expect((await work.addComment(parentTask, "Nested", reply.ok ? reply.value.id : 0, who(member))).ok).toBe(false);
    expect((await work.changeComment(rootId, { body: "edited" }, who(member))).ok).toBe(false); // not the author
    expect((await work.changeComment(rootId, { delete: true }, who(colleague))).ok).toBe(true);
    const comments = await repo.listComments(parentTask, member);
    expect(comments.find((comment) => comment.id === rootId)?.deletedAt).not.toBeNull();
  });

  it("dependencies refuse loops; completing the last blocker tells the waiting task's assignee", async () => {
    const a = await work.quickAddTask({ title: `Order steel ${tag}`, projectId, sectionId: null, parentId: null, assigneeId: null, dueDay: "", mySectionId: null }, who(member));
    const b = await work.quickAddTask({ title: `Fabricate ${tag}`, projectId, sectionId: null, parentId: null, assigneeId: colleague, dueDay: "", mySectionId: null }, who(member));
    const aId = a.ok ? a.value.id : 0;
    const bId = b.ok ? b.value.id : 0;
    const aNo = (await findTask(aId))!.taskNo;
    const bNo = (await findTask(bId))!.taskNo;
    expect((await work.setDependency(bId, aNo, true, who(member))).ok).toBe(true);
    expect((await work.setDependency(aId, bNo, true, who(member))).ok).toBe(false);
    const before = await notices(colleague, "WORK_TASK_UPDATED");
    expect((await work.toggleComplete(aId, who(member))).ok).toBe(true);
    expect(await notices(colleague, "WORK_TASK_UPDATED")).toBeGreaterThan(before);
  });

  it("My Tasks: built-in sections once per person; placing a task is personal", async () => {
    const sections = await repo.ensureMySections(member);
    expect(sections.filter((section) => section.system).map((section) => section.system)).toEqual(["RECENT", "TODAY", "UPCOMING", "LATER"]);
    expect((await repo.ensureMySections(member)).length).toBe(sections.length);
    const later = sections.find((section) => section.system === "LATER")!;
    expect((await work.placeMine(parentTask, later.id, 5, who(member))).ok).toBe(true);
    expect((await repo.myPlacements(member)).get(parentTask)?.sectionId).toBe(later.id);
    expect((await work.placeMine(parentTask, later.id, 5, who(colleague))).ok).toBe(false); // not their task
  });

  it("delete closes the task and its subtasks for everyone; restore brings them back as they were", async () => {
    expect((await work.deleteTask(parentTask, who(colleague))).ok).toBe(false); // commenter
    expect((await work.deleteTask(parentTask, who(member))).ok).toBe(true);
    expect((await findTask(subtask))?.deletedAt).not.toBeNull();
    expect((await findTask(parentTask))?.status).toBe("CANCELLED");
    expect(await canSee(parentTask, colleague)).toBe(false);
    expect(await canSee(parentTask, member)).toBe(true); // the creator, to restore
    expect((await repo.listDeletedTasks(member)).map((task) => task.id)).toContain(parentTask);
    expect((await work.restoreTask(parentTask, who(member))).ok).toBe(true);
    expect((await findTask(parentTask))?.status).toBe("OPEN");
    expect((await findTask(subtask))?.deletedAt).toBeNull();
  });

  it("status updates are posted by editors and owners; deleting a project hides it until restored", async () => {
    expect((await work.postStatus(projectId, { status: "AT_RISK", title: "Vendor late", body: "" }, who(colleague))).ok).toBe(false);
    expect((await work.postStatus(projectId, { status: "AT_RISK", title: "Vendor late", body: "" }, who(member))).ok).toBe(true);
    expect((await repo.findProject(projectId))?.currentStatus).toBe("AT_RISK");
    expect((await repo.listStatusUpdates(projectId))[0]?.snapshot.open).toBeGreaterThan(0);
    expect((await work.setProjectLifecycle(projectId, "DELETE", who(colleague))).ok).toBe(false);
    expect((await work.setProjectLifecycle(projectId, "DELETE", who(member))).ok).toBe(true);
    expect(await repo.projectFor(projectId, await workViewer(who(member)))).toBeNull();
    expect((await work.setProjectLifecycle(projectId, "RESTORE", who(member))).ok).toBe(true);
    expect(await repo.projectFor(projectId, await workViewer(who(member)))).not.toBeNull();
  });

  it("D-217: a due date on a holiday is warned about, kept on purpose, refused when blocked, and IT can move them", async () => {
    // A Wednesday some months ahead, varying by run.
    const base = new Date(Date.now() + (200 + (Date.now() % 400)) * 86_400_000);
    base.setUTCHours(0, 0, 0, 0);
    while (base.getUTCDay() !== 3) base.setUTCDate(base.getUTCDate() + 1);
    const day = base.toISOString().slice(0, 10);
    const next = new Date(base.getTime() + 86_400_000).toISOString().slice(0, 10);
    await getDbPool().query("INSERT IGNORE INTO holidays (holiday_on, name) VALUES (?, ?)", [day, `Test holiday ${tag}`]);
    const saved = await loadHolidaySettings();
    try {
      await saveHolidaySettings({ ...DEFAULT_HOLIDAY_SETTINGS, mode: "WARN" }, itAdmin);
      const warned = await work.quickAddTask({ title: `On a holiday ${tag}`, projectId: null, sectionId: null, parentId: null, assigneeId: colleague, dueDay: day, mySectionId: null }, who(member));
      expect(warned.ok).toBe(false);
      expect(!warned.ok && warned.holiday).toMatchObject({ day, suggestion: next, mode: "WARN" });
      const kept = await work.quickAddTask({ title: `On a holiday ${tag}`, projectId: null, sectionId: null, parentId: null, assigneeId: colleague, dueDay: day, mySectionId: null, holidayOk: true }, who(member));
      expect(kept.ok).toBe(true);
      const keptId = kept.ok ? kept.value.id : 0;
      expect((await work.setTaskFields(keptId, { dueDay: day }, who(member))).ok).toBe(false);

      await saveHolidaySettings({ ...DEFAULT_HOLIDAY_SETTINGS, mode: "BLOCK" }, itAdmin);
      const blocked = await work.quickAddTask({ title: "Blocked", projectId: null, sectionId: null, parentId: null, assigneeId: null, dueDay: day, mySectionId: null, holidayOk: true }, who(member));
      expect(!blocked.ok && blocked.holiday?.mode).toBe("BLOCK");

      expect((await work.moveHolidayTasks(day, "NEXT", who(member))).ok).toBe(false); // IT only
      const moved = await work.moveHolidayTasks(day, "NEXT", who(itAdmin, ["USER", "IT_ADMIN"]));
      expect(moved.ok && moved.value.moved).toBeGreaterThanOrEqual(1);
      const due = (await findTask(keptId))!.dueAt!;
      expect(new Date(due.getTime() + 330 * 60_000).toISOString().slice(0, 10)).toBe(next);
      expect(await notices(colleague, "WORK_TASK_UPDATED")).toBeGreaterThan(0);
    } finally {
      await saveHolidaySettings(saved, itAdmin);
      await getDbPool().query("DELETE FROM holidays WHERE holiday_on = ?", [day]);
    }
  });
});
