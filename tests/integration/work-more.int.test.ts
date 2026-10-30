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
      const added = await work.quickAddTask({ title: `Daily ${tag}`, projectId, sectionId: null, parentId: null, assigneeId: helper, dueDay: tuesday, mySectionId: null }, who(owner));
      const id = added.ok ? added.value.id : 0;
      await more.setRecurrence(id, { kind: "DAILY", every: 1 }, who(owner));
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
    expect((await more.setTaskField(taskId, fieldId, "Raipur", who(helper))).ok).toBe(true);
    expect((await more.setTaskField(taskId, fieldId, "Delhi", who(helper))).ok).toBe(false);
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
