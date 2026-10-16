import { beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { createWorkflow, decideTask, publishVersion, resubmitRequest, submitRequest, type Actor } from "@/server/approvals/service";
import { createModuleType, publishTypeDraft, saveTypeDraft, setTypeActive, startTypeDraft } from "@/server/modules/config";
import { DEFAULT_INFO_SETTINGS, DEFAULT_TASK_SETTINGS } from "@/server/modules/settings";
import { actOnTask, createTask, loadTaskFor } from "@/server/modules/tasks";
import { actOnInfo, loadInfoFor, saveInformation } from "@/server/modules/information";
import { runModuleReminders } from "@/server/modules/jobs";
import { findTask } from "@/lib/db/repositories/tasks.repository";
import { listRecipients, markInfoRead } from "@/lib/db/repositories/info.repository";
import { countUnreadByCategory, listInbox } from "@/lib/db/repositories/collab.repository";
import { updateWorkflowSettings, findWorkflow } from "@/lib/db/repositories/approvals.repository";
import { createDepartment, createUser, pendingTaskKey, setDepartment } from "./helpers";

// v1.9.0 on real MySQL: Task and Information types (versions, publish,
// retire), tasks and information end to end with their permissions,
// notification categories, reminders, and the approval fixes (who may
// raise a type; resubmit re-routing).
let admin: Actor & { name: string };
let creator: number;
let assignee: number;
let manager: number;
let stranger: number;
let department: number;
const as = (id: number, name = "Tester") => ({ id, name, roles: ["USER"] as const });
const sql = async (text: string, params: unknown[] = []) => (await getDbPool().query<RowDataPacket[]>(text, params))[0];
let taskTypeId: number;
let infoTypeId: number;

beforeAll(async () => {
  const adminId = await createUser({ name: "V19 Admin", roles: ["USER", "IT_ADMIN"] });
  admin = { id: adminId, name: "V19 Admin", roles: ["USER", "IT_ADMIN"] };
  manager = await createUser({ name: "V19 Manager" });
  creator = await createUser({ name: "V19 Creator" });
  assignee = await createUser({ name: "V19 Assignee", managerId: manager });
  stranger = await createUser({ name: "V19 Stranger" });
  department = await createDepartment(null);
  await setDepartment(creator, department);
  await setDepartment(assignee, department);
});

describe("module types: draft, publish, versions, retire", () => {
  it("only IT creates types; a draft is checked before publishing", async () => {
    expect((await createModuleType("TASK", { code: "V19_X", name: "Nope" }, { id: creator, roles: ["USER"] })).ok).toBe(false);
    const created = await createModuleType("TASK", { code: `V19_T${Date.now() % 100000}`, name: "V19 Repair task" }, admin);
    expect(created.ok).toBe(true);
    taskTypeId = created.ok ? created.value.id : 0;
    const form = [{ key: "serial", label: "Serial no.", type: "TEXT" as const, required: true, searchable: true, listed: true }];
    const bad = await saveTypeDraft("TASK", taskTypeId, { name: "V19 Repair task", form, settings: { ...DEFAULT_TASK_SETTINGS, assignScope: "PEOPLE", assignUserIds: [] } }, admin);
    expect(bad.ok && bad.value.problems.join(" ")).toMatch(/at least one person/);
    expect((await publishTypeDraft("TASK", taskTypeId, admin)).ok).toBe(false);
    const good = await saveTypeDraft("TASK", taskTypeId, { name: "V19 Repair task", form, settings: { ...DEFAULT_TASK_SETTINGS, assignScope: "SAME_DEPARTMENT", completion: "NOTE" } }, admin);
    expect(good.ok && good.value.problems).toEqual([]);
    const published = await publishTypeDraft("TASK", taskTypeId, admin);
    expect(published).toEqual({ ok: true, value: { versionNo: 1 } });
    const audit = await sql("SELECT action FROM audit_logs WHERE entity_type = 'TASK_TYPE' AND entity_id = ? ORDER BY id", [String(taskTypeId)]);
    expect(audit.map((row) => row.action)).toEqual(["MODULE_TYPE_CREATED", "MODULE_TYPE_DRAFT_SAVED", "MODULE_TYPE_DRAFT_SAVED", "MODULE_TYPE_PUBLISHED"]);
  });

  it("information type", async () => {
    const created = await createModuleType("INFO", { code: `V19_I${Date.now() % 100000}`, name: "V19 Circular" }, admin);
    infoTypeId = created.ok ? created.value.id : 0;
    await saveTypeDraft("INFO", infoTypeId, { name: "V19 Circular", form: [], settings: { ...DEFAULT_INFO_SETTINGS, ack: "ALWAYS", ackReminderDays: 1 } }, admin);
    expect((await publishTypeDraft("INFO", infoTypeId, admin)).ok).toBe(true);
  });
});

let taskId: number;
describe("tasks", () => {
  it("creates a task once (same submission key), tells the assignee, keeps its version", async () => {
    const key = "11111111-2222-3333-4444-555555555555";
    const input = { typeId: taskTypeId, title: "Fix the pump", description: "Pump 3 leaks", priority: "HIGH", assigneeId: assignee, due: "2026-12-01T18:00", startsOn: "", related: "", fields: { serial: "P-3" }, submissionKey: key, files: [] };
    const first = await createTask(input, as(creator, "V19 Creator"));
    const again = await createTask(input, as(creator, "V19 Creator"));
    expect(first.ok && again.ok && first.value.id === again.value.id).toBe(true);
    taskId = first.ok ? first.value.id : 0;
    const task = await findTask(taskId);
    expect(task).toMatchObject({ status: "OPEN", assigneeId: assignee, priority: "HIGH", formData: { serial: "P-3" } });
    expect(task!.dueAt!.toISOString()).toBe("2026-12-01T12:30:00.000Z");
    const inbox = await listInbox(assignee, 5, undefined, undefined, "TASK");
    expect(inbox[0]).toMatchObject({ category: "TASK", title: expect.stringContaining("Fix the pump") });
    const [row] = await sql("SELECT category, entity_type, entity_id FROM notifications WHERE id = ?", [inbox[0]!.id]);
    expect(row).toMatchObject({ category: "TASK", entity_type: "TASK", entity_id: taskId });
    expect((await countUnreadByCategory(assignee)).TASK).toBeGreaterThan(0);
  });

  it("refuses assignees outside the type's scope", async () => {
    const outside = await createTask({ typeId: taskTypeId, title: "Out of scope", description: "", priority: "", assigneeId: stranger, due: "", startsOn: "", related: "", fields: { serial: "X" }, submissionKey: null, files: [] }, as(creator));
    expect(outside.ok === false && outside.fieldErrors?.assignee).toMatch(/can't be assigned/);
  });

  it("only the parties, the assignee's manager and IT can open it", async () => {
    expect(await loadTaskFor(taskId, { id: stranger, roles: ["USER"] })).toBeNull();
    expect(await loadTaskFor(taskId, { id: manager, roles: ["USER"] })).not.toBeNull();
    expect(await loadTaskFor(taskId, { id: admin.id, roles: admin.roles })).not.toBeNull();
    const asAssignee = await loadTaskFor(taskId, { id: assignee, roles: ["USER"] });
    expect([...asAssignee!.actions].sort()).toEqual(["BLOCK", "COMMENT", "COMPLETE", "START"]);
  });

  it("lifecycle: a stranger can't act, stale pages are refused, completion needs its note", async () => {
    const task = (await findTask(taskId))!;
    expect((await actOnTask({ taskId, action: "START", rowVersion: task.rowVersion, reason: "", assigneeId: null, files: [] }, as(stranger))).ok).toBe(false);
    expect((await actOnTask({ taskId, action: "START", rowVersion: task.rowVersion, reason: "", assigneeId: null, files: [] }, as(assignee))).ok).toBe(true);
    const stale = await actOnTask({ taskId, action: "BLOCK", rowVersion: task.rowVersion, reason: "waiting for parts", assigneeId: null, files: [] }, as(assignee));
    expect(stale.ok === false && stale.message).toMatch(/changed this task/);
    const noNote = await actOnTask({ taskId, action: "COMPLETE", rowVersion: null, reason: "", assigneeId: null, files: [] }, as(assignee));
    expect(noNote.ok === false && noNote.message).toMatch(/completion note/);
    expect((await actOnTask({ taskId, action: "COMPLETE", rowVersion: null, reason: "Replaced the seal", assigneeId: null, files: [] }, as(assignee, "V19 Assignee"))).ok).toBe(true);
    const done = (await findTask(taskId))!;
    expect(done).toMatchObject({ status: "COMPLETED", completedByName: "V19 Assignee", completionNote: "Replaced the seal" });
    const events = await sql("SELECT event_type FROM task_events WHERE task_id = ? ORDER BY id", [taskId]);
    expect(events.map((row) => row.event_type)).toEqual(["CREATED", "START", "COMPLETE"]);
    // The history can't be edited.
    await expect(getDbPool().query("UPDATE task_events SET body = 'x' WHERE task_id = ?", [taskId])).rejects.toThrow(/append-only/);
    // The creator may reopen (type allows it), with a reason.
    expect((await actOnTask({ taskId, action: "REOPEN", rowVersion: null, reason: "", assigneeId: null, files: [] }, as(creator))).ok).toBe(false);
    expect((await actOnTask({ taskId, action: "REOPEN", rowVersion: null, reason: "Still leaking", assigneeId: null, files: [] }, as(creator))).ok).toBe(true);
  });

  it("a new version applies to new tasks only; a retired type takes no new tasks", async () => {
    expect((await startTypeDraft("TASK", taskTypeId, admin)).ok).toBe(true);
    await saveTypeDraft("TASK", taskTypeId, { name: "V19 Repair task", form: [{ key: "serial", label: "Serial no.", type: "TEXT", required: true }, { key: "site", label: "Site", type: "TEXT", required: true }], settings: DEFAULT_TASK_SETTINGS }, admin);
    expect(await publishTypeDraft("TASK", taskTypeId, admin)).toEqual({ ok: true, value: { versionNo: 2 } });
    const old = await loadTaskFor(taskId, admin);
    expect(old!.versionNo).toBe(1);
    expect(old!.form.map((field) => field.key)).toEqual(["serial"]);
    await setTypeActive("TASK", taskTypeId, false, admin);
    const refused = await createTask({ typeId: taskTypeId, title: "Too late", description: "", priority: "", assigneeId: assignee, due: "", startsOn: "", related: "", fields: { serial: "A", site: "B" }, submissionKey: null, files: [] }, as(creator));
    expect(refused.ok).toBe(false);
    await setTypeActive("TASK", taskTypeId, true, admin);
  });

  it("reminders: due-soon once, overdue once", async () => {
    await getDbPool().query("UPDATE tasks SET due_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 2 HOUR), status = 'OPEN' WHERE id = ?", [taskId]);
    const first = await runModuleReminders();
    const second = await runModuleReminders();
    expect(first.taskDueSoon).toBeGreaterThanOrEqual(1);
    expect(second.taskDueSoon).toBe(0);
    await getDbPool().query("UPDATE tasks SET due_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 HOUR) WHERE id = ?", [taskId]);
    expect((await runModuleReminders()).taskOverdue).toBeGreaterThanOrEqual(1);
    expect((await runModuleReminders()).taskOverdue).toBe(0);
  });
});

describe("information", () => {
  let infoId: number;
  it("a draft is the sender's alone; publishing fixes recipients (never the sender)", async () => {
    const saved = await saveInformation(
      { infoId: null, typeId: infoTypeId, rowVersion: null, title: "New canteen hours", body: "From Monday 8 to 6.", priority: "IMPORTANT", askAck: false, effectiveOn: "", expiresOn: "", targets: { people: [stranger], departments: [department], groups: [], everyone: false }, fields: {}, files: [], publish: false },
      as(creator, "V19 Creator"),
    );
    expect(saved.ok && saved.value.published).toBeNull();
    infoId = saved.ok ? saved.value.id : 0;
    expect(await loadInfoFor(infoId, { id: stranger, roles: ["USER"] })).toBeNull();
    const published = await actOnInfo({ infoId, action: "PUBLISH", rowVersion: null, reason: "", fields: {}, expiresOn: "" }, as(creator, "V19 Creator"));
    expect(published.ok).toBe(true);
    const recipients = await listRecipients(infoId);
    expect(recipients.map((row) => row.userId).sort()).toEqual([assignee, stranger].sort());
    expect(recipients.find((row) => row.userId === stranger)!.source).toBe("USER");
    expect((await listInbox(stranger, 5, undefined, undefined, "INFORMATION"))[0]?.title).toMatch(/acknowledge/);
  });

  it("reading is not acknowledging; acknowledgement is recorded once", async () => {
    expect(await markInfoRead(infoId, stranger)).toBe(true);
    let view = await loadInfoFor(infoId, { id: stranger, roles: ["USER"] });
    expect(view!.viewer.recipient!.readAt).not.toBeNull();
    expect(view!.viewer.recipient!.acknowledgedAt).toBeNull();
    expect(view!.actions.has("ACKNOWLEDGE")).toBe(true);
    expect((await actOnInfo({ infoId, action: "ACKNOWLEDGE", rowVersion: null, reason: "", fields: {}, expiresOn: "" }, as(stranger))).ok).toBe(true);
    view = await loadInfoFor(infoId, { id: stranger, roles: ["USER"] });
    expect(view!.viewer.recipient!.acknowledgedAt).not.toBeNull();
    expect(view!.actions.size).toBe(0);
    // A non-recipient can't acknowledge or see it.
    expect((await actOnInfo({ infoId, action: "ACKNOWLEDGE", rowVersion: null, reason: "", fields: {}, expiresOn: "" }, as(manager))).ok).toBe(false);
    expect(await loadInfoFor(infoId, { id: manager, roles: ["USER"] })).toBeNull();
  });

  it("acknowledgement reminders go once to those who haven't; withdrawing tells recipients", async () => {
    await getDbPool().query("UPDATE info_items SET published_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 DAY) WHERE id = ?", [infoId]);
    const first = await runModuleReminders();
    expect(first.infoAckReminders).toBeGreaterThanOrEqual(1);
    const [reminded] = await sql("SELECT reminded_at FROM info_recipients WHERE info_id = ? AND user_id = ?", [infoId, assignee]);
    expect(reminded!.reminded_at).not.toBeNull();
    expect((await runModuleReminders()).infoAckReminders).toBe(0);
    expect((await actOnInfo({ infoId, action: "WITHDRAW", rowVersion: null, reason: "", fields: {}, expiresOn: "" }, as(creator))).ok).toBe(false);
    expect((await actOnInfo({ infoId, action: "WITHDRAW", rowVersion: null, reason: "Hours changed again", fields: {}, expiresOn: "" }, as(creator, "V19 Creator"))).ok).toBe(true);
    const inbox = await listInbox(assignee, 10, undefined, undefined, "INFORMATION");
    expect(inbox.some((item) => item.title.startsWith("Withdrawn"))).toBe(true);
  });
});

describe("approvals: who may raise; resubmit re-routing", () => {
  let workflowId: number;
  const cfo = { id: 0 };
  const ed = { id: 0 };
  beforeAll(async () => {
    cfo.id = await createUser({ name: "V19 CFO" });
    ed.id = await createUser({ name: "V19 ED" });
    const created = await createWorkflow(
      {
        code: `V19_W${Date.now() % 100000}`,
        name: "V19 Purchase",
        kind: "PREDEFINED",
        requestPrefix: "VN",
        form: [{ key: "amount", label: "Amount", type: "NUMBER", required: true }],
        definition: {
          nodes: [
            { id: "start", kind: "START", label: "Start" },
            { id: "cfo", kind: "APPROVAL", label: "CFO", approvers: [{ type: "USER", userId: cfo.id }], completion: { type: "ALL" }, skipIf: { field: "amount", operator: "LT", value: 100000 } },
            { id: "ed", kind: "APPROVAL", label: "ED", approvers: [{ type: "USER", userId: ed.id }], completion: { type: "ALL" } },
            { id: "end", kind: "END", label: "End" },
          ],
          edges: [
            { id: "e1", from: "start", to: "cfo" },
            { id: "e2", from: "cfo", to: "ed" },
            { id: "e3", from: "ed", to: "end" },
          ],
        },
      },
      admin,
    );
    if (!created.ok) throw new Error(created.message);
    await publishVersion(created.value.versionId, admin);
    workflowId = created.value.workflowId;
  });

  it("a type limited to a department refuses others (IT always may)", async () => {
    const workflow = (await findWorkflow(workflowId))!;
    await updateWorkflowSettings(workflowId, { ...workflow.settings!, raisers: { mode: "DEPARTMENTS", departmentIds: [department], userIds: [] } });
    const outsider = await submitRequest({ workflowId, title: "Not mine", fields: { amount: "10" } }, { id: stranger, roles: ["USER"] });
    expect(outsider.ok).toBe(false);
    const insider = await submitRequest({ workflowId, title: "Mine", fields: { amount: "10" } }, { id: creator, roles: ["USER"] });
    expect(insider.ok).toBe(true);
    await updateWorkflowSettings(workflowId, { ...workflow.settings!, raisers: { mode: "EVERYONE", departmentIds: [], userIds: [] } });
  });

  it("raising the amount on resubmit brings back the skipped CFO level (AUD-02)", async () => {
    const submitted = await submitRequest({ workflowId, title: "Pump spares", fields: { amount: "5000" } }, { id: creator, roles: ["USER"] });
    if (!submitted.ok) throw new Error(submitted.message);
    const id = submitted.value.requestId;
    const sentBack = await decideTask({ requestId: id, taskKey: await pendingTaskKey(id, ed.id), decision: "REQUEST_CHANGES", comment: "Add the second quote" }, { id: ed.id, roles: ["USER"] });
    expect(sentBack.ok).toBe(true);
    const again = await resubmitRequest({ requestId: id, fields: { amount: "5000000" } }, { id: creator, roles: ["USER"] });
    expect(again.ok).toBe(true);
    await expect(pendingTaskKey(id, cfo.id)).resolves.toBeTruthy();
  });
});

describe("task and information reports (IT)", () => {
  it("run on real data: the task shows in the register and the workload; the information in its register", async () => {
    const { REPORTS } = await import("@/server/reports/catalogue");
    const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
    const filter = { period: { key: "custom" as const, label: "Today", from: "2026-01-01", to: today }, workflowId: null, departmentId: null };
    const run = (key: string) => REPORTS.find((report) => report.key === key)!.run({ kind: "ORGANISATION", label: "Whole organisation" }, { id: admin.id, roles: admin.roles }, filter);
    const register = await run("task_register");
    expect(register.rows.some((row) => row[1] === "Fix the pump")).toBe(true);
    const workload = await run("task_workload");
    expect(workload.rows.some((row) => row[0] === "V19 Assignee")).toBe(true);
    const info = await run("information_register");
    const canteen = info.rows.find((row) => row[1] === "New canteen hours")!;
    expect(canteen[7]).toBe(2); // recipients
    expect(canteen[5]).toBe("Withdrawn");
    const outstanding = await run("outstanding_acknowledgements");
    expect(outstanding.columns.map((column) => column.key)).toContain("person");
  });
});
