import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { listPendingTasksFor } from "@/lib/db/repositories/approvals.repository";
import { addHoliday, setWorkingDays } from "@/lib/db/repositories/calendar.repository";
import { loadInsights } from "@/lib/db/repositories/insights.repository";
import { createWorkflow, decideTask, publishVersion, reopenRequest, submitRequest, withdrawRequest, type Actor } from "@/server/approvals/service";
import type { BuilderSpec } from "@/server/workflows/builder";
import { createUser, pendingTaskKey, requestRow } from "./helpers";

const admin = (id: number): Actor => ({ id, roles: ["USER", "IT_ADMIN"] });
const superAdmin = (id: number): Actor => ({ id, roles: ["USER", "IT_ADMIN", "SUPER_ADMIN"] });
const person = (id: number): Actor => ({ id, roles: ["USER"] });
let adminId: number;
let requester: number;
let first: number;
let second: number;
let n = 0;

beforeAll(async () => {
  adminId = await createUser({ name: "IT 5", roles: ["USER", "IT_ADMIN", "SUPER_ADMIN"] });
  requester = await createUser({ name: "Requester 5" });
  first = await createUser({ name: "First 5" });
  second = await createUser({ name: "Second 5" });
});

afterAll(async () => {
  await getDbPool().end();
});

async function live(spec: BuilderSpec, form = [] as { key: string; label: string; type: "NUMBER"; required: boolean }[]): Promise<number> {
  const created = await createWorkflow({ code: `S5_${Date.now().toString(36)}_${++n}`.toUpperCase(), name: "S5", kind: "PREDEFINED", requestPrefix: "SFV", builder: spec, form }, admin(adminId));
  if (!created.ok) throw new Error(created.message);
  const published = await publishVersion(created.value.versionId, admin(adminId));
  if (!published.ok) throw new Error(published.message);
  return created.value.workflowId;
}

const twoSteps = (): BuilderSpec => ({
  stages: [
    { kind: "STEP", step: { id: "a", label: "First", approvers: { kind: "PEOPLE", userIds: [first] }, rule: "ALL", slaHours: 24 } },
    { kind: "STEP", step: { id: "b", label: "Second", approvers: { kind: "PEOPLE", userIds: [second] }, rule: "ALL" } },
  ],
});

describe("withdraw and reopen (F-17, F-29)", () => {
  it("only the requester withdraws; the approver's queue empties", async () => {
    const workflowId = await live(twoSteps());
    const raised = await submitRequest({ workflowId, title: "Withdraw me", fields: {} }, person(requester));
    if (!raised.ok) throw new Error(raised.message);
    const id = raised.value.requestId;
    expect(await withdrawRequest({ requestId: id }, person(first))).toMatchObject({ ok: false, code: "NOT_AUTHORISED" });
    expect(await withdrawRequest({ requestId: id, reason: "Bought elsewhere" }, person(requester))).toMatchObject({ ok: true, value: { status: "CANCELLED" } });
    expect((await listPendingTasksFor(first)).some((task) => task.requestId === id)).toBe(false);
    expect((await requestRow(id)).closed_at).not.toBeNull();
    expect(await withdrawRequest({ requestId: id }, person(requester))).toMatchObject({ ok: false, code: "NOT_OPEN" });
  });

  it("only the Super Admin reopens an approved request; it runs again on the same number", async () => {
    const workflowId = await live(twoSteps());
    const raised = await submitRequest({ workflowId, title: "Reopen me", fields: {} }, person(requester));
    if (!raised.ok) throw new Error(raised.message);
    const id = raised.value.requestId;
    await decideTask({ requestId: id, taskKey: await pendingTaskKey(id, first), decision: "APPROVE" }, person(first));
    await decideTask({ requestId: id, taskKey: await pendingTaskKey(id, second), decision: "APPROVE" }, person(second));
    expect((await requestRow(id)).status).toBe("APPROVED");
    expect(await reopenRequest({ requestId: id, reason: "Wrong vendor" }, admin(adminId))).toMatchObject({ ok: false, code: "NOT_AUTHORISED" });
    expect(await reopenRequest({ requestId: id, reason: "Wrong vendor" }, superAdmin(adminId))).toMatchObject({ ok: true, value: { status: "IN_PROGRESS" } });
    const row = await requestRow(id);
    expect(row).toMatchObject({ status: "IN_PROGRESS", round: 2, closed_at: null });
    expect((await listPendingTasksFor(first)).some((task) => task.requestId === id)).toBe(true);
  });
});

describe("working calendar on real tasks (F-31)", () => {
  it("due and escalation times skip non-working days and holidays", async () => {
    // Make every day a holiday except today, so a 24 h limit must jump far ahead.
    await setWorkingDays(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"], adminId);
    const [[today]] = await getDbPool().query<RowDataPacket[]>("SELECT DATE_FORMAT(DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE)), '%Y-%m-%d') AS d");
    const tomorrow = new Date(`${today!.d}T00:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const holiday = tomorrow.toISOString().slice(0, 10);
    await addHoliday(holiday, "Test holiday", adminId);

    const workflowId = await live(twoSteps());
    const raised = await submitRequest({ workflowId, title: "Calendar", fields: {} }, person(requester));
    if (!raised.ok) throw new Error(raised.message);
    const [[task]] = await getDbPool().query<RowDataPacket[]>(
      "SELECT TIMESTAMPDIFF(HOUR, created_at, due_at) AS due_h, TIMESTAMPDIFF(HOUR, created_at, escalate_at) AS esc_h FROM approval_tasks WHERE request_id = ?",
      [raised.value.requestId],
    );
    // 24 working hours with one holiday in between take 47–48 real hours.
    expect(Number(task!.due_h)).toBeGreaterThanOrEqual(47);
    expect(Number(task!.due_h)).toBeLessThanOrEqual(48);
    expect(Number(task!.esc_h)).toBeGreaterThan(Number(task!.due_h));
  });
});

describe("insights (F-70)", () => {
  it("loads every section from real data", async () => {
    const insights = await loadInsights();
    expect(insights.totals.open).toBeGreaterThan(0);
    expect(insights.byMonth.length).toBeGreaterThan(0);
    expect(insights.speedByLevel.length).toBeGreaterThan(0);
    expect(Array.isArray(insights.overdue)).toBe(true);
  });
});
