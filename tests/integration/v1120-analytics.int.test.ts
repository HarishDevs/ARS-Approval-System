import { beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { createModuleType, publishTypeDraft, saveTypeDraft } from "@/server/modules/config";
import { DEFAULT_INFO_SETTINGS, DEFAULT_TASK_SETTINGS } from "@/server/modules/settings";
import { createTask } from "@/server/modules/tasks";
import { saveInformation } from "@/server/modules/information";
import { agingBuckets } from "@/server/analytics/center";
import type { Scope } from "@/server/analytics/scope";
import { createWorkflow, publishVersion, submitRequest, type Actor } from "@/server/approvals/service";
import { approvalSummary, departmentRows, employeeRows, infoBoard, infoSummary, qualityChecks, slaBoard, taskBoard, taskSummary } from "@/lib/db/repositories/analytics-center.repository";
import { createDepartment, createUser, setDepartment } from "./helpers";

// v1.12.0 Analytics Center on real MySQL: denominators, statuses, real
// timestamps (never substitutes), scope isolation, empty periods.
const sql = async (text: string, params: unknown[] = []) => (await getDbPool().query<RowDataPacket[]>(text, params))[0];
const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const period = { key: "custom" as const, label: "test", from: new Date(Date.now() - 6 * 86_400_000 + 330 * 60_000).toISOString().slice(0, 10), to: today };
const empty = { key: "custom" as const, label: "empty", from: "2001-01-01", to: "2001-01-31" };
const buckets = agingBuckets("1,3,7,14");
const ORG: Scope = { kind: "ORGANISATION", label: "Org" };

let admin: Actor & { name: string };
let manager: number;
let worker: number;
let outsider: number;
let department: number;
const viewer = (id: number, roles: readonly string[] = ["USER"]) => ({ id, roles });
const ids: Record<string, number> = {};

beforeAll(async () => {
  const adminId = await createUser({ name: "V112 Admin", roles: ["USER", "IT_ADMIN"] });
  admin = { id: adminId, name: "V112 Admin", roles: ["USER", "IT_ADMIN"] };
  manager = await createUser({ name: "V112 Manager" });
  worker = await createUser({ name: "V112 Worker", managerId: manager });
  outsider = await createUser({ name: "V112 Outsider" });
  department = await createDepartment(manager);
  for (const id of [manager, worker]) await setDepartment(id, department);
  const type = await createModuleType("TASK", { code: `V112_T${Date.now() % 100000}`, name: "V112 Task" }, admin);
  const typeId = type.ok ? type.value.id : 0;
  await saveTypeDraft("TASK", typeId, { name: "V112 Task", form: [], settings: { ...DEFAULT_TASK_SETTINGS, assignScope: "ANYONE" as never, completion: "NOTE" } }, admin);
  await publishTypeDraft("TASK", typeId, admin);
  const make = async (name: string, dueInDays: number | null) => {
    // v1.54.7: a new task always has a due date; older tasks may have none (cleared below).
    const due = new Date(Date.now() + (dueInDays ?? 5) * 86_400_000 + 330 * 60_000).toISOString().slice(0, 16);
    const created = await createTask({ typeId, title: name, description: "", priority: "NORMAL", assigneeId: worker, due, startsOn: "", related: "", fields: {}, submissionKey: crypto.randomUUID(), files: [], holidayOk: true }, { id: manager, name: "V112 Manager", roles: ["USER"] } as never);
    if (!created.ok) throw new Error(created.message);
    ids[name] = created.value.id;
    if (dueInDays === null) await sql("UPDATE tasks SET due_at = NULL WHERE id = ?", [created.value.id]);
  };
  await make("on-time", 2);
  await make("late", -1);
  await make("open-overdue", -2);
  await make("cancelled", 3);
  await make("no-due", null);
  // Real completion times, as the service would record them.
  await sql("UPDATE tasks SET status = 'COMPLETED', completed_at = UTC_TIMESTAMP(), completed_by = ? WHERE id = ?", [worker, ids["on-time"]]);
  await sql("UPDATE tasks SET status = 'COMPLETED', completed_at = UTC_TIMESTAMP(), completed_by = ? WHERE id = ?", [worker, ids.late]);
  await sql("UPDATE tasks SET status = 'CANCELLED', cancelled_at = UTC_TIMESTAMP() WHERE id = ?", [ids.cancelled]);

  const info = await createModuleType("INFO", { code: `V112_I${Date.now() % 100000}`, name: "V112 Circular" }, admin);
  const infoTypeId = info.ok ? info.value.id : 0;
  await saveTypeDraft("INFO", infoTypeId, { name: "V112 Circular", form: [], settings: { ...DEFAULT_INFO_SETTINGS, ack: "ALWAYS" } }, admin);
  await publishTypeDraft("INFO", infoTypeId, admin);
  const saved = await saveInformation(
    { infoId: null, typeId: infoTypeId, rowVersion: null, title: "V112 policy", body: "Read me", priority: "NORMAL", askAck: true, effectiveOn: "", expiresOn: "", targets: { people: [worker, manager, outsider], departments: [], groups: [], everyone: false }, fields: {}, files: [], publish: true },
    { id: manager, name: "V112 Manager", roles: ["USER"] } as never,
  );
  if (!saved.ok) throw new Error(saved.message);
  ids.info = saved.value.id;
  // One opened it (not an acknowledgement), one acknowledged.
  await sql("UPDATE info_recipients SET read_at = UTC_TIMESTAMP() WHERE info_id = ? AND user_id = ?", [ids.info, outsider]);
  await sql("UPDATE info_recipients SET read_at = UTC_TIMESTAMP(), acknowledged_at = UTC_TIMESTAMP() WHERE info_id = ? AND user_id = ?", [ids.info, worker]);
});

describe("tasks", () => {
  it("completion rate excludes cancelled tasks; on-time uses real completion and due times only", async () => {
    const team: Scope = { kind: "TEAM", label: "Team" };
    const summary = await taskSummary(team, viewer(manager), period);
    expect(summary).toMatchObject({ created: 5, completed: 2, open: 2, overdue: 1 });
    expect(summary.completionRate).toBe(50); // 2 completed ÷ (5 created − 1 cancelled)
    const board = await taskBoard(team, viewer(manager), period, buckets);
    expect(board.delivery).toMatchObject({ timed: 2, onTime: 1, late: 1, onTimeRate: 50, untimed: 0 });
    expect(board.cancellationRate).toBe(20);
    expect(board.noDueDate).toBe(1);
    expect(board.status).toMatchObject({ OPEN: 2 });
    expect(Object.values(board.aging).reduce((sum, value) => sum + value, 0)).toBe(2);
  });

  it("an empty period gives unavailable rates, not errors or zeros dressed as rates", async () => {
    const summary = await taskSummary({ kind: "TEAM", label: "Team" }, viewer(manager), empty);
    expect(summary.created).toBe(0);
    expect(summary.completionRate).toBeNull();
    const board = await taskBoard({ kind: "TEAM", label: "Team" }, viewer(manager), empty, buckets);
    expect(board.delivery.onTimeRate).toBeNull();
    expect(board.duration.median).toBeNull();
  });

  it("scope isolation: someone else's own scope sees none of these; the HOD's department sees them", async () => {
    expect((await taskSummary({ kind: "MINE", label: "Mine" }, viewer(outsider), period)).created).toBe(0);
    expect((await taskSummary({ kind: "TEAM", label: "Team" }, viewer(outsider), period)).created).toBe(0);
    expect((await taskSummary({ kind: "DEPARTMENT", label: "Dept", departmentIds: [department] }, viewer(manager), period)).created).toBe(5);
  });
});

describe("information", () => {
  it("acknowledgement rate uses eligible recipients; opening is not acknowledging", async () => {
    const mine: Scope = { kind: "MINE", label: "Mine" };
    const summary = await infoSummary(mine, viewer(manager), period);
    // The sender isn't a recipient of their own information: 2 eligible.
    expect(summary).toMatchObject({ published: 1, recipients: 2, acknowledged: 1, ackRate: 50, read: 2, readRate: 100, awaitingAck: 1 });
    const board = await infoBoard(mine, viewer(manager), period, buckets, today);
    expect(board.ack).toMatchObject({ recipients: 2, acknowledged: 1, pending: 1 });
    expect(board.lowest).toHaveLength(0); // published under 7 days ago
    // The recipient's department view counts recipients, by their department.
    const org = await infoBoard(ORG, viewer(admin.id, admin.roles), period, buckets, today);
    // The worker (in the department) acknowledged; the outsider has no department.
    expect(org.byRecipientDepartment.some((row) => row.label !== "No department" && row.ackRate === 100)).toBe(true);
  });

  it("withdrawing doesn't count as acknowledging; titles are hidden from people who aren't the sender or IT", async () => {
    const before = await infoSummary(ORG, viewer(admin.id, admin.roles), period);
    expect(before.acknowledged).toBeGreaterThanOrEqual(1);
    await sql("UPDATE info_items SET published_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 8 DAY) WHERE id = ?", [ids.info]);
    const hod = await infoBoard({ kind: "DEPARTMENT", label: "Dept", departmentIds: [department] }, viewer(outsider), { ...period, from: "2000-01-01" }, buckets, today);
    for (const row of hod.lowest) expect(row.title).toBeNull();
    const sender = await infoBoard({ kind: "MINE", label: "Mine" }, viewer(manager), { ...period, from: "2000-01-01" }, buckets, today);
    expect(sender.lowest[0]?.title).toBe("V112 policy");
  });
});

describe("approvals", () => {
  it("counts requests, not approvers: a parallel step of three makes one request", async () => {
    const approvers = [await createUser({ name: "V112 A1" }), await createUser({ name: "V112 A2" }), await createUser({ name: "V112 A3" })];
    const created = await createWorkflow(
      {
        code: `V112_W${Date.now() % 100000}`,
        name: "V112 parallel",
        kind: "PREDEFINED",
        requestPrefix: "VP",
        form: [{ key: "amount", label: "Amount", type: "NUMBER", required: true }],
        definition: {
          nodes: [
            { id: "start", kind: "START", label: "Start" },
            { id: "p", kind: "APPROVAL", label: "V112 all three", approvers: approvers.map((userId) => ({ type: "USER" as const, userId })), completion: { type: "ALL" } },
            { id: "end", kind: "END", label: "End" },
          ],
          edges: [
            { id: "e1", from: "start", to: "p" },
            { id: "e2", from: "p", to: "end" },
          ],
        },
      },
      admin,
    );
    if (!created.ok) throw new Error(created.message);
    await publishVersion(created.value.versionId, admin);
    const submitted = await submitRequest({ workflowId: created.value.workflowId, title: "V112 parallel request", fields: { amount: "1" } }, { id: worker, roles: ["USER"] });
    expect(submitted.ok).toBe(true);
    const summary = await approvalSummary({ kind: "MINE", label: "Mine" }, viewer(worker), period);
    expect(summary.created).toBe(1);
    expect(summary.open).toBe(1);
    expect(summary.completionRate).toBe(0);
    const sla = await slaBoard({ kind: "MINE", label: "Mine" }, viewer(worker), empty);
    expect(sla.approvals.onTimeRate).toBeNull();
  });
});

describe("people, departments, quality", () => {
  it("employees: one row per person in scope, modules kept separate; search and sort are safe", async () => {
    const team = await employeeRows({ kind: "TEAM", label: "Team" }, viewer(manager), period, { search: "", sort: "tasks_open", page: 1, size: 25 });
    expect(team.total).toBe(1);
    expect(team.rows[0]).toMatchObject({ name: "V112 Worker", tasksAssigned: 5, tasksCompleted: 2, tasksOpen: 2, tasksOverdue: 1, onTimeRate: 50, submitted: 1, acksPending: 0 });
    const injected = await employeeRows(ORG, viewer(admin.id, admin.roles), period, { search: "x' OR '1'='1", sort: "name", page: 1, size: 25 });
    expect(injected.total).toBe(0);
    const self = await employeeRows({ kind: "MINE", label: "Mine" }, viewer(outsider), period, { search: "", sort: "name", page: 1, size: 25 });
    expect(self.rows.map((row) => row.name)).toEqual(["V112 Outsider"]);
  });

  it("departments: only for department or organisation scope", async () => {
    expect(await departmentRows({ kind: "MINE", label: "Mine" }, period)).toBeNull();
    const rows = await departmentRows({ kind: "DEPARTMENT", label: "Dept", departmentIds: [department] }, period);
    expect(rows).toHaveLength(1);
    expect(rows![0]).toMatchObject({ people: 2, tasksCreated: 5, tasksOpen: 2, requestsRaised: 1 });
  });

  it("data quality finds the open task without a due date", async () => {
    const checks = await qualityChecks({ kind: "TEAM", label: "Team" }, viewer(manager), today);
    expect(checks.find((check) => check.key === "task_no_due")?.count).toBe(1);
    expect(checks.find((check) => check.key === "task_done_no_time")?.count).toBe(0);
  });
});
