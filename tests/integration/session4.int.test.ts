import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { listPendingTasksFor } from "@/lib/db/repositories/approvals.repository";
import { createWorkflow, decideTask, handOverPendingTasks, publishVersion, submitCustomRequest, submitRequest, type Actor } from "@/server/approvals/service";
import { addComment, createDelegation, stopDelegation } from "@/server/approvals/collab";
import { setActive } from "@/server/admin/users";
import { runSlaChecks } from "@/server/jobs/sla";
import { indiaToday, listComments } from "@/lib/db/repositories/collab.repository";
import type { BuilderSpec } from "@/server/workflows/builder";
import { createUser, pendingTaskKey, requestRow } from "./helpers";

const admin = (id: number): Actor => ({ id, roles: ["USER", "IT_ADMIN"] });
const person = (id: number): Actor => ({ id, roles: ["USER"] });
let adminId: number;
let requester: number;
let approver: number;
let delegate: number;
let other: number;
let today: string;
let n = 0;
const code = () => `S4_${Date.now().toString(36)}_${++n}`.toUpperCase();

beforeAll(async () => {
  adminId = await createUser({ name: "IT", roles: ["USER", "IT_ADMIN"] });
  approver = await createUser({ name: "Approver A" });
  requester = await createUser({ name: "Requester", managerId: approver });
  delegate = await createUser({ name: "Delegate D" });
  other = await createUser({ name: "Other O" });
  today = await indiaToday();
});

afterAll(async () => {
  await getDbPool().end();
});

const oneStep = (userIds: number[], slaHours?: number): BuilderSpec => ({
  stages: [{ kind: "STEP", step: { id: "a", label: "Approval", approvers: { kind: "PEOPLE", userIds }, rule: "ALL", ...(slaHours ? { slaHours } : {}) } }],
});

async function liveWorkflow(spec: BuilderSpec): Promise<number> {
  const created = await createWorkflow({ code: code(), name: "S4", kind: "PREDEFINED", requestPrefix: "SFR", builder: spec, form: [] }, admin(adminId));
  if (!created.ok) throw new Error(created.message);
  const published = await publishVersion(created.value.versionId, admin(adminId));
  if (!published.ok) throw new Error(published.message);
  return created.value.workflowId;
}

async function raise(workflowId: number, by = requester): Promise<number> {
  const result = await submitRequest({ workflowId, title: "Session 4 test", fields: {}, allowDuplicate: true }, person(by));
  if (!result.ok) throw new Error(result.message);
  return result.value.requestId;
}

describe("custom approvals (F-33)", () => {
  it("anyone builds a route and submits it in one go; it stays private to them", async () => {
    const result = await submitCustomRequest({ title: "Hire a temp driver", builder: oneStep([approver, other]), fields: { details: "Two weeks cover", amount: "30,000" } }, person(requester));
    if (!result.ok) throw new Error(result.message);
    expect(result.value.requestNo).toMatch(/^CUS-\d{4}-\d{6}$/);
    expect((await listPendingTasksFor(approver)).some((task) => task.requestId === result.value.requestId)).toBe(true);
    const [rows] = await getDbPool().query<(RowDataPacket & { kind: string; owner_user_id: number })[]>(
      "SELECT w.kind, w.owner_user_id FROM approval_requests r JOIN workflow_versions v ON v.id = r.workflow_version_id JOIN workflow_definitions w ON w.id = v.workflow_id WHERE r.id = ?",
      [result.value.requestId],
    );
    expect(rows[0]).toMatchObject({ kind: "CUSTOM", owner_user_id: requester });
  });

  it("refuses a route where the requester approves alone, and a missing details field", async () => {
    expect(await submitCustomRequest({ title: "Self", builder: oneStep([requester]), fields: { details: "x" } }, person(requester))).toMatchObject({ ok: false, code: "SELF_APPROVAL" });
    expect(await submitCustomRequest({ title: "No details", builder: oneStep([approver]), fields: { details: "" } }, person(requester))).toMatchObject({ ok: false, code: "INVALID_FORM" });
  });
});

describe("delegation (F-30)", () => {
  it("the delegate sees and decides the approver's task, on their behalf, until it's ended", async () => {
    const workflowId = await liveWorkflow(oneStep([approver]));
    const requestId = await raise(workflowId);
    const set = await createDelegation({ userId: approver, delegateId: delegate, startsOn: today, endsOn: today, reason: "Leave" }, person(approver));
    if (!set.ok) throw new Error(set.message);
    expect(await createDelegation({ userId: approver, delegateId: other, startsOn: today, endsOn: today }, person(approver))).toMatchObject({ ok: false, code: "OVERLAP" });
    expect(await createDelegation({ userId: approver, delegateId: other, startsOn: today, endsOn: today }, person(other))).toMatchObject({ ok: false, code: "FORBIDDEN" });

    const queue = await listPendingTasksFor(delegate);
    expect(queue.find((task) => task.requestId === requestId)).toMatchObject({ forName: "Approver A" });

    const decided = await decideTask({ requestId, taskKey: await pendingTaskKey(requestId, approver), decision: "APPROVE" }, person(delegate));
    expect(decided).toMatchObject({ ok: true, value: { status: "APPROVED" } });
    const [rows] = await getDbPool().query<(RowDataPacket & { decided_by: number; on_behalf_of: number })[]>("SELECT decided_by, on_behalf_of FROM approval_tasks WHERE request_id = ?", [requestId]);
    expect(rows[0]).toMatchObject({ decided_by: delegate, on_behalf_of: approver });

    expect(await stopDelegation(set.value.id, person(approver))).toMatchObject({ ok: true });
    const second = await raise(workflowId);
    expect((await listPendingTasksFor(delegate)).some((task) => task.requestId === second)).toBe(false);
    expect(await decideTask({ requestId: second, taskKey: await pendingTaskKey(second, approver), decision: "APPROVE" }, person(delegate))).toMatchObject({ ok: false, code: "NOT_AUTHORISED" });
  });

  it("a delegate can't approve their own request", async () => {
    const workflowId = await liveWorkflow(oneStep([approver]));
    const set = await createDelegation({ userId: approver, delegateId: requester, startsOn: today, endsOn: today }, person(approver));
    if (!set.ok) throw new Error(set.message);
    const requestId = await raise(workflowId, requester);
    expect((await listPendingTasksFor(requester)).some((task) => task.requestId === requestId)).toBe(false);
    expect(await decideTask({ requestId, taskKey: await pendingTaskKey(requestId, approver), decision: "APPROVE" }, person(requester))).toMatchObject({ ok: false, code: "NOT_AUTHORISED" });
    await stopDelegation(set.value.id, person(approver));
  });
});

describe("handover and deactivation (F-16)", () => {
  it("deactivation is refused while approvals wait; handover moves them and then it's allowed", async () => {
    const leaver = await createUser({ name: "Leaver L" });
    const workflowId = await liveWorkflow(oneStep([leaver]));
    const first = await raise(workflowId);
    const second = await raise(workflowId);
    const adminActor = { id: adminId, roles: ["USER", "IT_ADMIN"] as const, sessionId: "00000000-0000-0000-0000-000000000000", ipAddress: null };
    const refused = await setActive(leaver, false, { ...adminActor, roles: [...adminActor.roles] });
    expect(refused).toMatchObject({ ok: false, message: expect.stringContaining("2 pending approvals") });

    const report = await handOverPendingTasks(leaver, other, admin(adminId));
    expect(report).toMatchObject({ ok: true, value: { moved: 2, skipped: [] } });
    expect((await listPendingTasksFor(other)).filter((task) => [first, second].includes(task.requestId))).toHaveLength(2);
    expect(await decideTask({ requestId: first, taskKey: await pendingTaskKey(first, other), decision: "APPROVE" }, person(other))).toMatchObject({ ok: true, value: { status: "APPROVED" } });

    expect(await setActive(leaver, false, { ...adminActor, roles: [...adminActor.roles] })).toMatchObject({ ok: true });
  });

  it("a handover to the requester is skipped and reported", async () => {
    const leaver = await createUser({ name: "Leaver M" });
    const workflowId = await liveWorkflow(oneStep([leaver]));
    await raise(workflowId);
    const report = await handOverPendingTasks(leaver, requester, admin(adminId));
    expect(report).toMatchObject({ ok: true, value: { moved: 0 } });
    if (report.ok) expect(report.value.skipped[0]!.reason).toMatch(/own request/);
  });
});

describe("comments (F-15)", () => {
  it("participants comment; others can't; comments can't be changed", async () => {
    const workflowId = await liveWorkflow(oneStep([approver]));
    const requestId = await raise(workflowId);
    expect(await addComment(requestId, "Quote attached by email", person(requester))).toMatchObject({ ok: true });
    expect(await addComment(requestId, "Thanks, checking", person(approver))).toMatchObject({ ok: true });
    expect(await addComment(requestId, "Sneaky", person(other))).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect((await listComments(requestId)).map((comment) => comment.authorName)).toEqual(["Requester", "Approver A"]);
    await expect(getDbPool().query("UPDATE request_comments SET body = 'x'")).rejects.toThrow(/append-only/);
    await expect(getDbPool().query("DELETE FROM request_comments")).rejects.toThrow(/append-only/);
  });
});

describe("SLA (F-31)", () => {
  it("sets a due time, reminds once, escalates once at twice the time", async () => {
    const workflowId = await liveWorkflow(oneStep([approver], 24));
    const requestId = await raise(workflowId);
    const [due] = await getDbPool().query<(RowDataPacket & { hours: number })[]>(
      "SELECT TIMESTAMPDIFF(HOUR, created_at, due_at) AS hours FROM approval_tasks WHERE request_id = ?",
      [requestId],
    );
    // 24 working hours; the default calendar (Mon–Sat) may stretch it over a Sunday.
    expect(Number(due[0]!.hours)).toBeGreaterThanOrEqual(24);

    // Pretend it was raised 30 hours ago: past due, not yet at 48 h.
    await getDbPool().query(
      "UPDATE approval_tasks SET created_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 30 HOUR), due_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 6 HOUR), escalate_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 18 HOUR) WHERE request_id = ?",
      [requestId],
    );
    await runSlaChecks();
    await runSlaChecks();
    const kinds = async () => {
      const [rows] = await getDbPool().query<(RowDataPacket & { kind: string })[]>(
        "SELECT m.kind FROM task_reminders m JOIN approval_tasks t ON t.id = m.task_id WHERE t.request_id = ? ORDER BY m.kind",
        [requestId],
      );
      return rows.map((row) => row.kind);
    };
    expect(await kinds()).toEqual(["REMINDER"]);

    await getDbPool().query(
      "UPDATE approval_tasks SET created_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 50 HOUR), due_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 26 HOUR), escalate_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 2 HOUR) WHERE request_id = ?",
      [requestId],
    );
    await runSlaChecks();
    await runSlaChecks();
    expect(await kinds()).toEqual(["REMINDER", "ESCALATION"]);
    const [notices] = await getDbPool().query<(RowDataPacket & { user_id: number; event_type: string })[]>(
      "SELECT user_id, event_type FROM notifications WHERE event_type IN ('APPROVAL_REMINDER', 'APPROVAL_ESCALATED') AND message LIKE CONCAT('%', (SELECT request_no FROM approval_requests WHERE id = ?), '%')",
      [requestId],
    );
    expect(notices.filter((row) => row.event_type === "APPROVAL_REMINDER").map((row) => row.user_id)).toEqual([approver]);
    expect(notices.some((row) => row.event_type === "APPROVAL_ESCALATED" && row.user_id === adminId)).toBe(true);
    expect((await requestRow(requestId)).status).toBe("IN_PROGRESS");
  });
});
