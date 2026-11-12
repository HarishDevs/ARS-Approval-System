import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import * as work from "@/server/work/service";
import * as more from "@/server/work/service-more";
import * as repo from "@/lib/db/repositories/work.repository";
import { findTask } from "@/lib/db/repositories/tasks.repository";
import { addDepartmentHoliday, removeDepartmentHoliday } from "@/server/work/holiday-store";
import { workViewer } from "@/server/work/task-access";
import { indiaDate } from "@/server/workflows/calendar";
import { createDepartment, createUser, setDepartment } from "./helpers";

// D-218: repeating tasks, project fields, templates and copies, bulk
// actions, the task inbox, the morning summary and department holidays.
const tag = Date.now().toString(36);
const who = (id: number, roles: string[] = ["USER"]) => ({ id, name: `P${id}`, roles });
let owner: number;
let helper: number;
let viewerOnly: number;
let dept: number;
let projectId: number;

async function sql<T = RowDataPacket>(query: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await getDbPool().query<RowDataPacket[]>(query, params);
  return rows as T[];
}
const dueDayOf = async (id: number) => indiaDate((await findTask(id))!.dueAt!);
// A day of the given weekday (0 = Sunday) some weeks ahead, free of holidays.
async function futureDay(weekday: number, weeksAhead: number): Promise<string> {
  const date = new Date(Date.now() + weeksAhead * 7 * 86_400_000);
  date.setUTCHours(0, 0, 0, 0);
  while (date.getUTCDay() !== weekday) date.setUTCDate(date.getUTCDate() + 1);
  for (;;) {
    const day = date.toISOString().slice(0, 10);
    const hits = await sql("SELECT 1 FROM holidays WHERE holiday_on BETWEEN ? AND DATE_ADD(?, INTERVAL 21 DAY)", [day, day]);
    if (!hits.length) return day;
    date.setUTCDate(date.getUTCDate() + 7);
  }
}

beforeAll(async () => {
  owner = await createUser({ name: `More owner ${tag}` });
  helper = await createUser({ name: `More helper ${tag}` });
  viewerOnly = await createUser({ name: `More viewer ${tag}` });
  dept = await createDepartment(null);
  await setDepartment(helper, dept);
  const created = await work.createProject({ name: `Monthly close ${tag}`, description: "", color: "teal", privacy: "PRIVATE", departmentId: null, defaultAccessRole: "COMMENTER", defaultView: "LIST", startOn: "", dueOn: "" }, who(owner));
  projectId = created.ok ? created.value.id : 0;
  await work.setMember(projectId, { type: "USER", id: helper }, "EDITOR", who(owner));
  await work.setMember(projectId, { type: "USER", id: viewerOnly }, "VIEWER", who(owner));
});

afterAll(async () => {
  await getDbPool().end();
});

describe("repeating tasks (D-218)", () => {
  it("completing makes the next one (same project, tags, subtasks), once", async () => {
    const monday = await futureDay(1, 3);
    const added = await work.quickAddTask({ title: `Weekly check ${tag}`, projectId, sectionId: null, parentId: null, assigneeId: null, dueDay: monday, mySectionId: null }, who(owner));
    expect(added.ok).toBe(true);
    const id = added.ok ? added.value.id : 0;
    await work.setTag(id, `weekly-${tag}`, true, who(owner));
    await work.quickAddTask({ title: "Sub step", projectId: null, sectionId: null, parentId: id, assigneeId: null, dueDay: "", mySectionId: null }, who(owner));
    expect((await more.setRecurrence(id, { kind: "WEEKLY", every: 1, weekdays: [1] }, who(viewerOnly))).ok).toBe(false); // viewer
    expect((await more.setRecurrence(id, { kind: "WEEKLY", every: 1, weekdays: [1] }, who(owner))).ok).toBe(true);

    expect((await work.toggleComplete(id, who(owner))).ok).toBe(true);
    const series = await sql<{ id: number; recurrence_json: unknown }>("SELECT id, recurrence_json FROM tasks WHERE series_id = ? AND id <> ? AND deleted_at IS NULL", [id, id]);
    expect(series).toHaveLength(1);
    const next = Number(series[0]!.id);
    expect(await dueDayOf(next)).toBe(new Date(new Date(`${monday}T00:00:00Z`).getTime() + 7 * 86_400_000).toISOString().slice(0, 10));
    expect((await repo.listTaskProjects(next)).map((link) => link.projectId)).toEqual([projectId]);
    expect((await repo.listTaskItems(["t.id = ?"], [next], "t.id", 1)).items[0]!.tags.map((item) => item.name)).toEqual([`weekly-${tag}`]);
    expect((await repo.listSubtasks(next)).map((item) => item.title)).toEqual(["Sub step"]);
    expect(await more.recurrenceOf(id)).toBeNull(); // the rule moved on
    expect(await more.recurrenceOf(next)).toMatchObject({ kind: "WEEKLY" });

    // Reopen and complete the old one: no second copy.
    await work.toggleComplete(id, who(owner));
    await work.toggleComplete(id, who(owner));
    expect(await sql("SELECT id FROM tasks WHERE series_id = ? AND id <> ? AND deleted_at IS NULL", [id, id])).toHaveLength(1);
  });

  it("the next date moves off the assignee's department holiday", async () => {
    const tuesday = await futureDay(2, 6);
    const nextDay = new Date(new Date(`${tuesday}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
    const dayAfter = new Date(new Date(`${tuesday}T00:00:00Z`).getTime() + 2 * 86_400_000).toISOString().slice(0, 10);
    await addDepartmentHoliday(dept, nextDay, `Shutdown ${tag}`, owner);
    try {
      // v1.54.4: a repeating task is the person's own (created by and for the helper).
      const added = await work.quickAddTask({ title: `Daily ${tag}`, projectId, sectionId: null, parentId: null, assigneeId: null, dueDay: tuesday, mySectionId: null }, who(helper));
      const id = added.ok ? added.value.id : 0;
      expect((await more.setRecurrence(id, { kind: "DAILY", every: 1 }, who(helper))).ok).toBe(true);
      expect((await work.toggleComplete(id, who(helper))).ok).toBe(true);
      const [next] = await sql<{ id: number }>("SELECT id FROM tasks WHERE series_id = ? AND id <> ?", [id, id]);
      expect(await dueDayOf(Number(next!.id))).toBe(dayAfter);
      // The department's holiday also questions dates for that department's people only.
      const forHelper = await work.quickAddTask({ title: "On shutdown", projectId: null, sectionId: null, parentId: null, assigneeId: helper, dueDay: nextDay, mySectionId: null }, who(owner));
      expect(!forHelper.ok && forHelper.holiday?.name).toBe(`Shutdown ${tag}`);
      const forOwner = await work.quickAddTask({ title: "Not on shutdown", projectId: null, sectionId: null, parentId: null, assigneeId: null, dueDay: nextDay, mySectionId: null }, who(owner));
      expect(forOwner.ok).toBe(true);
    } finally {
      await removeDepartmentHoliday(dept, nextDay);
    }
  });
});

describe("project fields (D-218)", () => {
  it("editors add fields; values are checked; viewers can't set them", async () => {
    expect((await more.addField(projectId, { name: "Plant", kind: "SELECT", options: "Raipur\nBilaspur" }, who(viewerOnly))).ok).toBe(false);
    const added = await more.addField(projectId, { name: "Plant", kind: "SELECT", options: "Raipur\nBilaspur" }, who(helper));
    expect(added.ok).toBe(true);
    const fieldId = added.ok ? added.value.id : 0;
    expect((await more.addField(projectId, { name: "plant", kind: "TEXT", options: "" }, who(helper))).ok).toBe(false); // same name
    const task = await work.quickAddTask({ title: `Field task ${tag}`, projectId, sectionId: null, parentId: null, assigneeId: null, dueDay: "", mySectionId: null }, who(owner));
    const taskId = task.ok ? task.value.id : 0;
    // D-222: an ad hoc task's details are its creator's: the editor can't, the creator can.
    expect((await more.setTaskField(taskId, fieldId, "Raipur", who(helper))).ok).toBe(false);
    expect((await more.setTaskField(taskId, fieldId, "Raipur", who(owner))).ok).toBe(true);
    expect((await more.setTaskField(taskId, fieldId, "Delhi", who(owner))).ok).toBe(false);
    expect((await more.setTaskField(taskId, fieldId, "Bilaspur", who(viewerOnly))).ok).toBe(false);
    expect((await repo.fieldValues([taskId])).get(taskId)).toEqual({ [fieldId]: "Raipur" });
  });
});

describe("templates and copies (D-218)", () => {
  let templateId: number;
  it("save as a template: it holds the tasks as a shape and isn't a live project", async () => {
    const saved = await more.saveAsTemplate(projectId, `Close template ${tag}`, who(helper));
    expect(saved.ok).toBe(true);
    templateId = saved.ok ? saved.value.id : 0;
    const viewer = await workViewer(who(helper));
    expect((await repo.listVisibleProjects(viewer)).some((project) => project.id === templateId)).toBe(false);
    expect((await repo.listTemplates(viewer)).some((template) => template.id === templateId)).toBe(true);
    expect(await sql("SELECT 1 FROM task_projects WHERE project_id = ?", [templateId])).toHaveLength(0);
  });

  it("a project from the template gets sections, fields and tasks with dates moved to its start", async () => {
    const start = await futureDay(3, 10);
    const made = await more.createFromTemplate({ templateId }, { name: `November close ${tag}`, startOn: start, privacy: "PRIVATE", departmentId: null }, who(owner));
    expect(made.ok ? "ok" : made.message).toBe("ok");
    const newId = made.ok ? made.value.id : 0;
    expect(made.ok && made.value.tasks).toBeGreaterThanOrEqual(3);
    const tasks = await repo.listProjectTasks(newId);
    expect(tasks.some((task) => task.title === `Field task ${tag}`)).toBe(true);
    expect((await repo.listProjectFields(newId)).map((field) => field.name)).toEqual(["Plant"]);
    const fieldTask = tasks.find((task) => task.title === `Field task ${tag}`)!;
    expect(Object.values((await repo.fieldValues([fieldTask.id])).get(fieldTask.id) ?? {})).toEqual(["Raipur"]);
    // Every task is the new owner's, open, and none came from the old project's ids.
    expect(tasks.every((task) => task.assigneeId === owner && task.status === "OPEN")).toBe(true);
  });

  it("copy a project with its members", async () => {
    const copy = await more.createFromTemplate({ copyFrom: projectId, copyMembers: true }, { name: `Copy ${tag}`, startOn: "", privacy: "PRIVATE", departmentId: null }, who(helper));
    expect(copy.ok).toBe(true);
    const id = copy.ok ? copy.value.id : 0;
    const members = await repo.listProjectMembers(id);
    expect(members.find((member) => member.id === helper)?.role).toBe("OWNER");
    expect(members.some((member) => member.id === viewerOnly && member.role === "VIEWER")).toBe(true);
    expect((await more.createFromTemplate({ copyFrom: projectId }, { name: "Nope", startOn: "", privacy: "PRIVATE", departmentId: null }, who(viewerOnly))).ok).toBe(false);
  });
});

describe("bulk actions (D-218)", () => {
  it("several tasks at once; what the person may not change is counted, not done", async () => {
    const ids: number[] = [];
    for (const n of [1, 2, 3]) {
      const made = await work.quickAddTask({ title: `Bulk ${n} ${tag}`, projectId, sectionId: null, parentId: null, assigneeId: null, dueDay: "", mySectionId: null }, who(owner));
      ids.push(made.ok ? made.value.id : 0);
    }
    const assigned = await more.bulkTasks(ids, "ASSIGN", { assigneeId: helper }, who(owner));
    expect(assigned.ok && assigned.value.done).toBe(3);
    expect((await findTask(ids[0]!))!.assigneeId).toBe(helper);
    const sections = await repo.listSections(projectId);
    const moved = await more.bulkTasks(ids, "SECTION", { projectId, sectionId: sections[2]!.id }, who(helper));
    expect(moved.ok && moved.value.done).toBe(3);
    expect((await repo.listProjectTasks(projectId)).filter((task) => ids.includes(task.id)).every((task) => task.sectionId === sections[2]!.id)).toBe(true);
    expect((await more.bulkTasks(ids, "DELETE", {}, who(viewerOnly))).ok).toBe(false);
    const done = await more.bulkTasks(ids, "COMPLETE", {}, who(helper));
    expect(done.ok && done.value.done).toBe(3);
  });
});

describe("task inbox and morning summary (D-218)", () => {
  it("archive and bookmark one's own task notices only", async () => {
    const inbox = await repo.listInbox(helper, "activity", false);
    expect(inbox.length).toBeGreaterThan(0);
    const first = inbox[0]!.id;
    expect(await repo.setInbox(owner, [first], "ARCHIVE")).toBe(0); // someone else's
    expect(await repo.setInbox(helper, [first], "BOOKMARK")).toBe(1);
    expect(await repo.setInbox(helper, [first], "ARCHIVE")).toBe(1);
    expect((await repo.listInbox(helper, "activity", false)).some((item) => item.id === first)).toBe(false);
    expect((await repo.listInbox(helper, "archive", false)).some((item) => item.id === first)).toBe(true);
    expect((await repo.listInbox(helper, "bookmarks", false)).some((item) => item.id === first)).toBe(true);
    await repo.setInbox(helper, null, "ARCHIVE");
    expect(await repo.inboxUnread(helper)).toBe(0);
  });

  it("the summary goes once a day to people with something to do, not on holidays, not when switched off", async () => {
    const wednesday = await futureDay(3, 20);
    const at = new Date(`${wednesday}T10:30:00+05:30`);
    // An overdue-by-then task for the helper; the owner switches the summary off.
    await work.quickAddTask({ title: `Digest item ${tag}`, projectId: null, sectionId: null, parentId: null, assigneeId: helper, dueDay: "", mySectionId: null }, who(helper));
    await getDbPool().query("UPDATE tasks SET due_at = ? WHERE title = ?", [new Date(at.getTime() - 3 * 86_400_000), `Digest item ${tag}`]);
    await getDbPool().query("INSERT INTO user_settings (user_id, setting_key, value) VALUES (?, 'work.digest', 'OFF') ON DUPLICATE KEY UPDATE value = 'OFF'", [owner]);
    const before = await sql("SELECT id FROM notifications WHERE user_id = ? AND event_type = 'WORK_TASK_DIGEST'", [helper]);
    expect((await more.runWorkDigest(new Date(`${wednesday}T07:00:00+05:30`))).digests).toBe(0); // before the hour
    await more.runWorkDigest(at);
    const after = await sql<{ title: string }>("SELECT title FROM notifications WHERE user_id = ? AND event_type = 'WORK_TASK_DIGEST' ORDER BY id", [helper]);
    expect(after.length).toBe(before.length + 1);
    expect(after.at(-1)!.title).toMatch(/overdue/);
    await more.runWorkDigest(at);
    expect(await sql("SELECT id FROM notifications WHERE user_id = ? AND event_type = 'WORK_TASK_DIGEST'", [helper])).toHaveLength(before.length + 1);
    expect(await sql("SELECT 1 FROM work_digest_sends WHERE user_id = ? AND day = ?", [owner, wednesday])).toHaveLength(0);
    // A Sunday (weekly off): nobody.
    const sunday = new Date(new Date(`${wednesday}T00:00:00Z`).getTime() + 4 * 86_400_000).toISOString().slice(0, 10);
    expect((await more.runWorkDigest(new Date(`${sunday}T10:30:00+05:30`))).digests).toBe(0);
  });
});

describe("projects step by step, saved tabs, periodic and ad hoc (D-219, D-220)", () => {
  it("a new project starts with the sections chosen in the steps", async () => {
    const made = await work.createProject({ name: `Steps ${tag}`, description: "", color: "blue", privacy: "PRIVATE", departmentId: null, defaultAccessRole: "COMMENTER", defaultView: "BOARD", startOn: "", dueOn: "", sections: ["Backlog", "This week", "", "  Done  "].join(String.fromCharCode(10)) }, who(owner));
    expect(made.ok).toBe(true);
    const id = made.ok ? made.value.id : 0;
    expect((await repo.listSections(id)).map((section) => section.name)).toEqual(["Backlog", "This week", "Done"]);
  });

  it("saved tabs: unique names per place; at most 30", async () => {
    const first = await repo.insertWorkView("MY_TASKS", owner, `Overdue ${tag}`, { group: "assignee" }, owner);
    expect(typeof first).toBe("number");
    expect(await repo.insertWorkView("MY_TASKS", owner, `Overdue ${tag}`, {}, owner)).toBe("DUPLICATE");
    expect((await repo.listWorkViews("MY_TASKS", owner)).map((view) => view.name)).toContain(`Overdue ${tag}`);
    await repo.updateWorkView(first as number, { config: { group: "due" } });
    expect((await repo.listWorkViews("MY_TASKS", owner)).find((view) => view.id === first)?.config).toEqual({ group: "due" });
    await repo.deleteWorkView(first as number);
    expect((await repo.listWorkViews("MY_TASKS", owner)).some((view) => view.id === first)).toBe(false);
  });

  it("periodic and ad hoc tasks are told apart in search and the periodic list", async () => {
    const periodic = await work.quickAddTask({ title: `Periodic ${tag}`, projectId: null, sectionId: null, parentId: null, assigneeId: null, dueDay: "", mySectionId: null }, who(owner));
    const adhoc = await work.quickAddTask({ title: `Adhoc ${tag}`, projectId: null, sectionId: null, parentId: null, assigneeId: null, dueDay: "", mySectionId: null }, who(owner));
    const periodicId = periodic.ok ? periodic.value.id : 0;
    const adhocId = adhoc.ok ? adhoc.value.id : 0;
    await more.setRecurrence(periodicId, { kind: "DAILY", every: 1 }, who(owner));
    const viewer = await workViewer(who(owner));
    const find = async (kind: string) => {
      const sql = repo.workSearchSql(viewer, (await import("@/server/work/rules")).parseWorkSearch({ q: tag, status: "all", kind }), new Date());
      return (await repo.listTaskItems(sql.where, sql.params, "t.id", 200)).items.map((item) => item.id);
    };
    expect(await find("periodic")).toContain(periodicId);
    expect(await find("periodic")).not.toContain(adhocId);
    expect(await find("adhoc")).toContain(adhocId);
    expect(await find("adhoc")).not.toContain(periodicId);
    expect((await repo.listPeriodic(viewer)).map((item) => item.id)).toContain(periodicId);
    // Stopping the repeat makes a task that never repeated ad hoc again.
    await more.setRecurrence(periodicId, null, who(owner));
    expect(await find("adhoc")).toContain(periodicId);
    expect((await repo.listTaskItems(["t.id = ?"], [periodicId], "t.id", 1)).items[0]!.followers.map((person) => person.id)).toContain(owner);
  });
});

describe("ad hoc tasks and project permissions (D-222)", () => {
  it("an ad hoc task for several people: one linked copy each", async () => {
    const made = await work.quickAddForMany({ title: `Stock audit ${tag}`, projectId, sectionId: null, parentId: null, assigneeId: null, dueDay: "", mySectionId: null }, [helper, viewerOnly], who(owner));
    expect(made.ok && made.value.ids.length).toBe(2);
    const ids = made.ok ? made.value.ids : [];
    const tasks = await Promise.all(ids.map((id) => findTask(id)));
    expect(tasks.map((task) => task!.assigneeId).sort()).toEqual([helper, viewerOnly].sort());
    expect((await repo.assignGroup(ids[0]!)).map((item) => item.id)).toEqual([ids[1]]);
  });

  it("the assignee of an ad hoc task can't change its details, only progress it", async () => {
    const made = await work.quickAddTask({ title: `Adhoc rules ${tag}`, projectId, sectionId: null, parentId: null, assigneeId: helper, dueDay: "", mySectionId: null }, who(owner));
    const id = made.ok ? made.value.id : 0;
    expect((await work.setTaskFields(id, { dueDay: "2027-02-03" }, who(helper))).ok).toBe(false);
    expect((await work.setTaskFields(id, { title: "Renamed" }, who(helper))).ok).toBe(false);
    expect((await work.setTag(id, "x", true, who(helper))).ok).toBe(false);
    expect((await work.setTaskFields(id, { title: `Adhoc rules renamed ${tag}` }, who(owner))).ok).toBe(true);
    expect((await work.toggleComplete(id, who(helper))).ok).toBe(true); // progress is still theirs
  });

  it("v1.54.4 (owner): only a task kept for oneself repeats; given to someone else it is ad hoc", async () => {
    const forHelper = await work.quickAddTask({ title: `Periodic rules ${tag}`, projectId, sectionId: null, parentId: null, assigneeId: helper, dueDay: "", mySectionId: null }, who(owner));
    const helperTask = forHelper.ok ? forHelper.value.id : 0;
    const refused = await more.setRecurrence(helperTask, { kind: "MONTHLY", every: 1 }, who(owner));
    expect(refused).toMatchObject({ ok: false, message: expect.stringMatching(/Only a task you give yourself can repeat/) });
    // The owner's own task repeats; reassigning it to the helper makes it ad hoc.
    const own = await work.quickAddTask({ title: `Own periodic ${tag}`, projectId, sectionId: null, parentId: null, assigneeId: null, dueDay: "", mySectionId: null }, who(owner));
    const ownId = own.ok ? own.value.id : 0;
    expect((await more.setRecurrence(ownId, { kind: "MONTHLY", every: 1 }, who(owner))).ok).toBe(true);
    expect((await work.setTaskFields(ownId, { assigneeId: helper }, who(owner))).ok).toBe(true);
    expect(await more.recurrenceOf(ownId)).toBeNull();
  });

  it("project permissions: a restricted field and who may share tasks", async () => {
    expect((await work.setPermissions(projectId, { fields: [{ field: "priority", role: "OWNER" }], shareTasks: "OWNER" }, who(helper))).ok).toBe(false); // owners only
    expect((await work.setPermissions(projectId, { fields: [{ field: "priority", role: "OWNER" }], shareTasks: "OWNER" }, who(owner))).ok).toBe(true);
    const made = await work.quickAddTask({ title: `Restricted ${tag}`, projectId, sectionId: null, parentId: null, assigneeId: null, dueDay: "", mySectionId: null }, who(helper));
    const id = made.ok ? made.value.id : 0;
    // The helper created it (so may change its details) but priority is for project admins here.
    const refused = await work.setTaskFields(id, { priority: "HIGH" }, who(helper));
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.message).toMatch(/Project permissions/);
    expect((await work.setTaskFields(id, { priority: "HIGH" }, who(owner))).ok).toBe(false); // owner isn't the ad hoc task's creator
    // Sharing into another project: only this project's admins.
    const other = await work.createProject({ name: `Other ${tag}`, description: "", color: "red", privacy: "ORGANISATION", departmentId: null, defaultAccessRole: "EDITOR", defaultView: "LIST", startOn: "", dueOn: "" }, who(helper));
    const otherId = other.ok ? other.value.id : 0;
    const shared = await work.addToProject(id, otherId, null, who(helper));
    expect(shared.ok).toBe(false);
    expect((await work.addToProject(id, otherId, null, who(owner))).ok).toBe(true);
    await work.setPermissions(projectId, { fields: [], shareTasks: "EDITOR" }, who(owner));
  });
});

