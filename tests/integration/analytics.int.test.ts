import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDbPool } from "@/lib/db/client";
import { createWorkflow, decideTask, publishVersion, submitRequest, type Actor } from "@/server/approvals/service";
import { availableScopes, type Scope } from "@/server/analytics/scope";
import { loadAging, loadKpis, loadNow, loadSla, loadTrend, type AnalyticsFilter } from "@/lib/db/repositories/analytics.repository";
import { indiaToday, resolvePeriod } from "@/server/analytics/periods";
import { createDepartment, createUser, pendingTaskKey, setDepartment } from "./helpers";

// Addendum A on real MySQL: scopes, request vs task counts, overdue only
// with a due time, SLA statuses.
let a1: number;
let a2: number;
let requester: number;
let other: number;
let hod: number;
let admin: Actor;
let workflowId: number;
let department: number;
const person = (id: number): Actor => ({ id, roles: ["USER"] });
const filter = (): AnalyticsFilter => ({ period: resolvePeriod({ key: "7d" }, indiaToday(new Date())), workflowId, departmentId: null });

beforeAll(async () => {
  a1 = await createUser({ name: "An Approver One" });
  a2 = await createUser({ name: "An Approver Two" });
  hod = await createUser({ name: "An HOD" });
  department = await createDepartment(hod);
  requester = await createUser({ name: "An Requester", departmentId: department });
  other = await createUser({ name: "An Other" });
  await setDepartment(requester, department);
  const adminId = await createUser({ roles: ["USER", "IT_ADMIN"] });
  admin = { id: adminId, roles: ["USER", "IT_ADMIN"] };
  // One step needing BOTH approvers (parallel tasks), with a response time.
  const created = await createWorkflow(
    {
      code: `ANL_${Date.now()}`,
      name: "Analytics type",
      kind: "PREDEFINED",
      requestPrefix: "AN",
      form: [{ key: "amount", label: "Amount", type: "NUMBER", required: true }],
      definition: {
        nodes: [
          { id: "start", kind: "START", label: "Start" },
          { id: "both", kind: "APPROVAL", label: "Both", approvers: [{ type: "USER", userId: a1 }, { type: "USER", userId: a2 }], completion: { type: "ALL" }, slaHours: 8 },
          { id: "end", kind: "END", label: "End" },
        ],
        edges: [
          { id: "e1", from: "start", to: "both" },
          { id: "e2", from: "both", to: "end" },
        ],
      },
    },
    admin,
  );
  if (!created.ok) throw new Error(created.message);
  await publishVersion(created.value.versionId, admin);
  workflowId = created.value.workflowId;
  for (const title of ["First", "Second"]) {
    const result = await submitRequest({ workflowId, title: `Analytics ${title}`, fields: { amount: "1" } }, person(requester));
    if (!result.ok) throw new Error(result.message);
  }
  const theirs = await submitRequest({ workflowId, title: "Someone else's", fields: { amount: "1" } }, person(other));
  if (!theirs.ok) throw new Error(theirs.message);
});

afterAll(async () => {
  await getDbPool().end();
});

const scopeOf = async (actor: Actor, kind: Scope["kind"]) => (await availableScopes(actor)).find((scope) => scope.kind === kind);

describe("role scopes", () => {
  it("everyone has My requests; only IT has the organisation; HODs have their department", async () => {
    expect((await availableScopes(person(requester))).map((scope) => scope.kind)).toEqual(["MINE"]);
    expect((await availableScopes(person(a1))).map((scope) => scope.kind)).toContain("APPROVALS");
    expect(await scopeOf(person(hod), "DEPARTMENT")).toMatchObject({ departmentIds: [department] });
    expect(await scopeOf(person(hod), "ORGANISATION")).toBeUndefined();
    expect(await scopeOf(admin, "ORGANISATION")).toBeDefined();
  });

  it("a requester's numbers include only their own requests", async () => {
    const mine = (await scopeOf(person(requester), "MINE"))!;
    expect((await loadKpis(mine, person(requester), filter())).raised).toBe(2);
    const org = (await scopeOf(admin, "ORGANISATION"))!;
    expect((await loadKpis(org, admin, filter())).raised).toBe(3);
    const dept = (await scopeOf(person(hod), "DEPARTMENT"))!;
    expect((await loadKpis(dept, person(hod), filter())).raised).toBe(2);
  });
});

describe("pending, overdue and SLA", () => {
  it("counts requests and tasks apart; overdue only past a due time; my approvals are mine", async () => {
    const org = (await scopeOf(admin, "ORGANISATION"))!;
    const now = await loadNow(org, admin, filter());
    expect(now).toMatchObject({ pendingRequests: 3, pendingTasks: 6, overdueTasks: 0, openRequests: 3 });
    // Make one task overdue.
    await getDbPool().query(
      "UPDATE approval_tasks t JOIN approval_requests r ON r.id = t.request_id SET t.due_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 HOUR) WHERE r.title = 'Analytics First' AND t.approver_id = ?",
      [a1],
    );
    expect(await loadNow(org, admin, filter())).toMatchObject({ overdueTasks: 1, overdueRequests: 1 });
    const mineAsApprover = (await scopeOf(person(a2), "APPROVALS"))!;
    expect(await loadNow(mineAsApprover, person(a2), filter())).toMatchObject({ pendingTasks: 3, overdueTasks: 0 });
    const sla = await loadSla(org, admin, filter());
    expect(sla.BREACHED).toBe(1);
    expect(sla.WITHIN + sla.APPROACHING).toBe(5);
  });

  it("decisions count by decision date; a request decided by both is approved; trend and aging add up", async () => {
    const [[row]] = await getDbPool().query<import("mysql2/promise").RowDataPacket[]>("SELECT id FROM approval_requests WHERE title = 'Analytics Second'");
    const id = Number(row!.id);
    await decideTask({ requestId: id, taskKey: await pendingTaskKey(id, a1), decision: "APPROVE" }, person(a1));
    await decideTask({ requestId: id, taskKey: await pendingTaskKey(id, a2), decision: "APPROVE" }, person(a2));
    const org = (await scopeOf(admin, "ORGANISATION"))!;
    const kpis = await loadKpis(org, admin, filter());
    expect(kpis).toMatchObject({ approved: 1, decisions: 2, approvalRate: 100, onTimeDecisions: 2, timedDecisions: 2 });
    const trend = await loadTrend(org, admin, filter());
    expect(trend.points.reduce((sum, point) => sum + point.raised, 0)).toBe(3);
    expect(trend.points.reduce((sum, point) => sum + point.approved, 0)).toBe(1);
    const aging = await loadAging(org, admin, filter());
    expect(Object.values(aging.sinceSubmission).reduce((a, b) => a + b, 0)).toBe(2);
    expect(aging.sinceSubmission.lt1d).toBe(2);
    expect(Object.values(aging.atCurrentStep).reduce((a, b) => a + b, 0)).toBe(4);
  });
});
