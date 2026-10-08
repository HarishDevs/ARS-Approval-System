import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { findRequest, listMyRequests, listPendingTasksFor } from "@/lib/db/repositories/approvals.repository";
import { listAllRequests } from "@/lib/db/repositories/request-admin.repository";
import { loadApprovers, loadDepartments, loadRaisers, loadUtilisation } from "@/lib/db/repositories/dashboards.repository";
import { indiaToday } from "@/lib/db/repositories/collab.repository";
import { addDraftVersion, createWorkflow, decideTask, handOverPendingTasks, publishVersion, submitCustomRequest, submitRequest, type Actor } from "@/server/approvals/service";
import { createDelegation } from "@/server/approvals/collab";
import { deleteRequest } from "@/server/approvals/delete";
import { saveDepartment } from "@/server/admin/organisation";
import { createUser as createUserService } from "@/server/admin/users";
import { parseDashboardFilter } from "@/server/dashboards/filters";
import type { BuilderSpec } from "@/server/workflows/builder";
import { createDepartment, createUser, pendingTaskKey } from "./helpers";

// Session 11: approver designations (D-085), Super Admin request deletion
// (D-086) and the admin dashboards (D-087) against MySQL.
const tag = Date.now().toString(36).toUpperCase();
const it_ = (id: number) => ({ id, roles: ["USER", "IT_ADMIN"] as const, sessionId: "s11", ipAddress: null });
const sa = (id: number) => ({ id, roles: ["USER", "IT_ADMIN", "SUPER_ADMIN"] as const, sessionId: "s11", ipAddress: null });
const person = (id: number): Actor => ({ id, roles: ["USER"] });
const oneStep = (userIds: number[]): BuilderSpec => ({ stages: [{ kind: "STEP", step: { id: "a", label: "Approval", approvers: { kind: "PEOPLE", userIds }, rule: "ALL" } }] });
let n = 0;
const code = () => `S11_${tag}_${++n}`;

let superId: number;
let adminId: number;
let department: number;
let requester: number;
let approver: number;
let junior: number;

beforeAll(async () => {
  superId = await createUser({ name: "Super 11", roles: ["USER", "IT_ADMIN", "SUPER_ADMIN"] });
  adminId = await createUser({ name: "IT 11", roles: ["USER", "IT_ADMIN"] });
  department = await createDepartment(null);
  requester = await createUser({ name: `Raiser ${tag}`, departmentId: department, approver: false });
  approver = await createUser({ name: `Approver ${tag}`, departmentId: department });
  junior = await createUser({ name: `Junior ${tag}`, departmentId: department, approver: false });
});

afterAll(async () => {
  await getDbPool().end();
});

describe("approver designations (D-085)", () => {
  it("a workflow can't name someone who isn't an approver; a draft keeps people already named", async () => {
    expect(await createWorkflow({ code: code(), name: "S11", kind: "PREDEFINED", requestPrefix: "SEL", builder: oneStep([junior]), form: [] }, it_(adminId))).toMatchObject({
      ok: false,
      code: "NOT_APPROVER",
      message: expect.stringContaining("isn't an approver"),
    });
    const created = await createWorkflow({ code: code(), name: "S11", kind: "PREDEFINED", requestPrefix: "SEL", builder: oneStep([approver]), form: [] }, it_(adminId));
    if (!created.ok) throw new Error(created.message);
    // The approver's designation is unticked later: the saved workflow still edits.
    await getDbPool().query("UPDATE users SET designation_id = (SELECT id FROM designations WHERE code = 'IT_NON_APPROVER') WHERE id = ?", [approver]);
    try {
      expect((await addDraftVersion(created.value.workflowId, { builder: oneStep([approver]), form: [] }, it_(adminId))).ok).toBe(true);
      expect((await addDraftVersion(created.value.workflowId, { builder: oneStep([approver, junior]), form: [] }, it_(adminId))).ok).toBe(false);
    } finally {
      await getDbPool().query("UPDATE users SET designation_id = (SELECT id FROM designations WHERE code = 'IT_APPROVER') WHERE id = ?", [approver]);
    }
  });

  it("custom approvals, delegates, handover, HOD and manager all take approvers only", async () => {
    expect(await submitCustomRequest({ title: "Custom to a junior", builder: oneStep([junior]), fields: { details: "x" } }, person(requester))).toMatchObject({ ok: false, code: "NOT_APPROVER" });
    const today = await indiaToday();
    expect(await createDelegation({ userId: approver, delegateId: junior, startsOn: today, endsOn: today }, person(approver))).toMatchObject({ ok: false, code: "NOT_APPROVER" });
    expect(await handOverPendingTasks(approver, junior, it_(adminId))).toMatchObject({ ok: false, code: "NOT_APPROVER" });
    expect(await saveDepartment(null, { code: `H${tag}`, name: "HOD test", hodUserId: String(junior) }, it_(adminId))).toMatchObject({ ok: false, fieldErrors: { hodUserId: expect.stringContaining("isn't an approver") } });
    expect((await saveDepartment(null, { code: `H${tag}`, name: "HOD test", hodUserId: String(approver) }, it_(adminId))).ok).toBe(true);
    const newPerson = { loginId: `p-${tag}`.toLowerCase(), name: "New Person", email: `p-${tag}@example.test`.toLowerCase(), whatsappNumber: null, departmentId: null, designationId: null, signInMethod: "GOOGLE" as const, roles: ["USER" as const] };
    expect(await createUserService({ ...newPerson, reportingManagerId: junior }, it_(adminId))).toMatchObject({ ok: false, fieldErrors: { reportingManagerId: expect.stringContaining("isn't an approver") } });
    expect((await createUserService({ ...newPerson, reportingManagerId: approver }, it_(adminId))).ok).toBe(true);
  });
});

describe("Super Admin deletes a request (D-086)", () => {
  it("only the Super Admin, with a reason; the request vanishes from every list and its approvals are cancelled", async () => {
    const created = await createWorkflow({ code: code(), name: `Del ${tag}`, kind: "PREDEFINED", requestPrefix: "DEL", builder: oneStep([approver]), form: [] }, it_(adminId));
    if (!created.ok) throw new Error(created.message);
    await publishVersion(created.value.versionId, it_(adminId));
    const raised = await submitRequest({ workflowId: created.value.workflowId, title: "Wrong request", fields: {} }, person(requester));
    if (!raised.ok) throw new Error(raised.message);
    const id = raised.value.requestId;

    expect(await deleteRequest({ requestId: id, reason: "Raised by mistake" }, it_(adminId))).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await deleteRequest({ requestId: id, reason: "x" }, sa(superId))).toMatchObject({ ok: false, code: "REASON_REQUIRED" });
    expect(await deleteRequest({ requestId: id, reason: "Raised by mistake" }, sa(superId))).toMatchObject({ ok: true, value: { cancelledTasks: 1 } });

    expect(await findRequest(id)).toBeNull();
    expect((await listPendingTasksFor(approver)).some((task) => task.requestId === id)).toBe(false);
    expect((await listMyRequests(requester)).some((item) => item.id === id)).toBe(false);
    expect((await listAllRequests({ q: raised.value.requestNo })).total).toBe(0);
    expect((await listAllRequests({ q: raised.value.requestNo, deleted: true })).items[0]).toMatchObject({ deleteReason: "Raised by mistake", deletedByName: "Super 11" });
    expect(await decideTask({ requestId: id, taskKey: "t1", decision: "APPROVE" }, person(approver))).toMatchObject({ ok: false });
    expect(await deleteRequest({ requestId: id, reason: "Again please" }, sa(superId))).toMatchObject({ ok: false, code: "NOT_FOUND" });
    const [audit] = await getDbPool().query<(RowDataPacket & { n: number })[]>("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'REQUEST_DELETED' AND entity_id = ?", [String(id)]);
    expect(Number(audit[0]?.n)).toBe(1);
  });
});

describe("admin dashboards (D-087)", () => {
  it("count by type, department, approver and raiser, and leave deleted requests out", async () => {
    const created = await createWorkflow({ code: code(), name: `Dash ${tag}`, kind: "PREDEFINED", requestPrefix: "DSH", builder: oneStep([approver]), form: [] }, it_(adminId));
    if (!created.ok) throw new Error(created.message);
    await publishVersion(created.value.versionId, it_(adminId));
    const ids: number[] = [];
    for (const title of ["Dash one", "Dash two", "Dash three"]) {
      const raised = await submitRequest({ workflowId: created.value.workflowId, title, fields: {}, allowDuplicate: true }, person(requester));
      if (!raised.ok) throw new Error(raised.message);
      ids.push(raised.value.requestId);
    }
    await decideTask({ requestId: ids[0]!, taskKey: await pendingTaskKey(ids[0]!, approver), decision: "APPROVE" }, person(approver));
    await decideTask({ requestId: ids[1]!, taskKey: await pendingTaskKey(ids[1]!, approver), decision: "REJECT", comment: "No budget" }, person(approver));
    // A fourth request, deleted: never counted.
    const deleted = await submitRequest({ workflowId: created.value.workflowId, title: "Dash deleted", fields: {}, allowDuplicate: true }, person(requester));
    if (!deleted.ok) throw new Error(deleted.message);
    await deleteRequest({ requestId: deleted.value.requestId, reason: "Test of deletion" }, sa(superId));

    const filter = parseDashboardFilter({ type: String(created.value.workflowId), dept: String(department) }, await indiaToday());
    expect((await loadUtilisation(filter))[0]).toMatchObject({ name: `Dash ${tag}`, raised: 3, approved: 1, rejected: 1, open: 1, withdrawn: 0 });
    expect(await loadDepartments(filter)).toEqual([expect.objectContaining({ departmentId: department, raised: 3, raisers: 1, topTypes: [{ name: `Dash ${tag}`, raised: 3 }] })]);
    expect(await loadRaisers(filter)).toEqual([expect.objectContaining({ requesterId: requester, raised: 3, approved: 1, rejected: 1, open: 1 })]);
    const approverRow = (await loadApprovers(filter)).find((row) => row.approverId === approver);
    expect(approverRow).toMatchObject({ assigned: 3, approved: 1, rejected: 1, pending: 1 });
    // Outside the period: nothing.
    expect(await loadRaisers({ ...filter, from: "2001-01-01", to: "2001-12-31" })).toEqual([]);
  });
});
