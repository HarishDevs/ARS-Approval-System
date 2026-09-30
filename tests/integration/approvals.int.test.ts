import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { nextRequestNumber, listPendingTasksFor, listTimeline } from "@/lib/db/repositories/approvals.repository";
import { addDraftVersion, createWorkflow, decideTask, holdTask, publishVersion, resubmitRequest, resumeRequest, submitRequest, type Actor } from "@/server/approvals/service";
import type { WorkflowDefinition } from "@/server/engine";
import { createDepartment, createGroup, createUser, pendingTaskKey, requestRow, setDepartment } from "./helpers";

// S2-06b: the multi-level engine persisted in MySQL, end to end.
const admin = (id: number): Actor => ({ id, roles: ["USER", "IT_ADMIN"] });
const user = (id: number): Actor => ({ id, roles: ["USER"] });
let codeCounter = 0;
const code = () => `WF_${Date.now().toString(36)}_${++codeCounter}`.toUpperCase();

let adminId: number;
let requester: number;
let manager: number;
let hod: number;
let financeA: number;
let financeB: number;
let md: number;

beforeAll(async () => {
  adminId = await createUser({ name: "IT Admin", roles: ["USER", "IT_ADMIN"] });
  hod = await createUser({ name: "HOD" });
  manager = await createUser({ name: "Manager", managerId: hod });
  requester = await createUser({ name: "Requester", managerId: manager });
  financeA = await createUser({ name: "Finance A" });
  financeB = await createUser({ name: "Finance B" });
  md = await createUser({ name: "MD" });
  const department = await createDepartment(hod);
  await setDepartment(requester, department);
});

afterAll(async () => {
  await getDbPool().end();
});

// Manager → parallel(HOD, Finance any-one of group) → MD above ₹5L, else end.
function hybrid(groupId: number): WorkflowDefinition {
  return {
    nodes: [
      { id: "start", kind: "START", label: "Start" },
      { id: "manager", kind: "APPROVAL", label: "Manager", approvers: [{ type: "REQUESTER_MANAGER" }], completion: { type: "ALL" } },
      { id: "split", kind: "SPLIT", label: "Parallel" },
      { id: "hod", kind: "APPROVAL", label: "HOD", approvers: [{ type: "REQUESTER_DEPARTMENT_HOD" }], completion: { type: "ALL" } },
      { id: "finance", kind: "APPROVAL", label: "Finance", approvers: [{ type: "GROUP", groupId }], completion: { type: "ANY_ONE" } },
      { id: "join", kind: "JOIN", label: "Both done", completion: { type: "ALL" } },
      { id: "band", kind: "CONDITION", label: "Amount band" },
      { id: "md", kind: "APPROVAL", label: "MD", approvers: [{ type: "USER", userId: md }], completion: { type: "ALL" } },
      { id: "end", kind: "END", label: "End" },
    ],
    edges: [
      { id: "e1", from: "start", to: "manager" },
      { id: "e2", from: "manager", to: "split" },
      { id: "e3", from: "split", to: "hod" },
      { id: "e4", from: "split", to: "finance" },
      { id: "e5", from: "hod", to: "join" },
      { id: "e6", from: "finance", to: "join" },
      { id: "e7", from: "join", to: "band" },
      { id: "e8", from: "band", to: "md", condition: { field: "amount", operator: "GT", value: 500000 }, order: 1 },
      { id: "e9", from: "band", to: "end", isDefault: true },
      { id: "e10", from: "md", to: "end" },
    ],
  };
}

async function publishedWorkflow(definition: WorkflowDefinition, prefix: string): Promise<number> {
  const created = await createWorkflow({ code: code(), name: "Test approval", kind: "PREDEFINED", requestPrefix: prefix, definition }, admin(adminId));
  if (!created.ok) throw new Error(created.message);
  expect(created.value.validation.errors).toEqual([]);
  const published = await publishVersion(created.value.versionId, admin(adminId));
  if (!published.ok) throw new Error(published.message);
  return created.value.workflowId;
}

async function approve(requestId: number, approverId: number) {
  const result = await decideTask({ requestId, taskKey: await pendingTaskKey(requestId, approverId), decision: "APPROVE" }, user(approverId));
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
  return result.value;
}

describe("request numbers", () => {
  it("are PREFIX-YEAR-000001 and unique under concurrency", async () => {
    const numbers = await Promise.all(Array.from({ length: 10 }, () => withTransaction((connection) => nextRequestNumber("SEQ", connection))));
    const year = new Date().getUTCFullYear();
    expect(new Set(numbers).size).toBe(10);
    expect([...numbers].sort()).toEqual(Array.from({ length: 10 }, (_, i) => `SEQ-${year}-${String(i + 1).padStart(6, "0")}`));
  });
});

describe("hybrid multi-level request, persisted", () => {
  it("runs manager → parallel HOD + any-one Finance → MD for ₹12.5L, with queues and timeline", async () => {
    const workflowId = await publishedWorkflow(hybrid(await createGroup([financeA, financeB])), "HYB");
    const submitted = await submitRequest({ workflowId, title: "New crane motor", formData: { amount: 1250000 } }, user(requester));
    if (!submitted.ok) throw new Error(submitted.message);
    const { requestId, requestNo } = submitted.value;
    expect(requestNo).toMatch(/^HYB-\d{4}-000001$/);

    expect((await listPendingTasksFor(manager)).map((task) => task.requestId)).toContain(requestId);
    expect(await listPendingTasksFor(hod)).toHaveLength(0);

    await approve(requestId, manager);
    // Parallel: HOD and both Finance members now have a task.
    expect((await listPendingTasksFor(hod)).some((task) => task.requestId === requestId)).toBe(true);
    expect((await listPendingTasksFor(financeA)).some((task) => task.requestId === requestId)).toBe(true);
    expect((await listPendingTasksFor(financeB)).some((task) => task.requestId === requestId)).toBe(true);

    await approve(requestId, financeB);
    // Any-one: Finance A's task is closed, not left dangling in their queue.
    expect((await listPendingTasksFor(financeA)).some((task) => task.requestId === requestId)).toBe(false);
    expect((await requestRow(requestId)).status).toBe("IN_PROGRESS");

    await approve(requestId, hod);
    expect((await listPendingTasksFor(md)).some((task) => task.requestId === requestId)).toBe(true);
    const final = await approve(requestId, md);
    expect(final.status).toBe("APPROVED");

    const row = await requestRow(requestId);
    expect(row.status).toBe("APPROVED");
    expect(row.closed_at).not.toBeNull();
    expect(row.state_version).toBe(5); // submit + 4 decisions

    const timeline = await listTimeline(requestId);
    expect(timeline[0]!.eventType).toBe("SUBMITTED");
    expect(timeline.map((entry) => entry.eventType)).toEqual(expect.arrayContaining(["TASK_CREATED", "TASK_DECIDED", "TASKS_CLOSED", "BRANCH_TAKEN", "INSTANCE_APPROVED"]));
    const decidedBy = timeline.filter((entry) => entry.eventType === "TASK_DECIDED").map((entry) => entry.actorName);
    expect(decidedBy).toEqual(["Manager", "Finance B", "HOD", "MD"]);
  });

  it("small amounts skip the MD level", async () => {
    const workflowId = await publishedWorkflow(hybrid(await createGroup([financeA])), "SML");
    const submitted = await submitRequest({ workflowId, title: "Stationery", formData: { amount: 4000 } }, user(requester));
    if (!submitted.ok) throw new Error(submitted.message);
    const { requestId } = submitted.value;
    await approve(requestId, manager);
    await approve(requestId, financeA);
    expect((await approve(requestId, hod)).status).toBe("APPROVED");
  });
});

describe("safety on the server", () => {
  it("nobody can decide someone else's task; the requester can't approve their own request", async () => {
    const definition: WorkflowDefinition = {
      nodes: [
        { id: "start", kind: "START", label: "Start" },
        { id: "a", kind: "APPROVAL", label: "Approver", approvers: [{ type: "USER", userId: md }, { type: "USER", userId: requester }], completion: { type: "ALL" } },
        { id: "end", kind: "END", label: "End" },
      ],
      edges: [
        { id: "e1", from: "start", to: "a" },
        { id: "e2", from: "a", to: "end" },
      ],
    };
    const workflowId = await publishedWorkflow(definition, "SAF");
    const submitted = await submitRequest({ workflowId, title: "Self check", formData: {} }, user(requester));
    if (!submitted.ok) throw new Error(submitted.message);
    const { requestId } = submitted.value;
    // Requester was listed as an approver, but is never given a task.
    await expect(pendingTaskKey(requestId, requester)).rejects.toThrow();
    const mdTask = await pendingTaskKey(requestId, md);
    const hijack = await decideTask({ requestId, taskKey: mdTask, decision: "APPROVE" }, user(financeA));
    expect(hijack).toMatchObject({ ok: false, code: "NOT_AUTHORISED" });
    expect((await requestRow(requestId)).status).toBe("IN_PROGRESS");
  });

  it("two approvers of an any-one step acting at the same moment: one wins, the other is told clearly", async () => {
    const definition: WorkflowDefinition = {
      nodes: [
        { id: "start", kind: "START", label: "Start" },
        { id: "any", kind: "APPROVAL", label: "Any finance", approvers: [{ type: "USER", userId: financeA }, { type: "USER", userId: financeB }], completion: { type: "ANY_ONE" } },
        { id: "end", kind: "END", label: "End" },
      ],
      edges: [
        { id: "e1", from: "start", to: "any" },
        { id: "e2", from: "any", to: "end" },
      ],
    };
    const workflowId = await publishedWorkflow(definition, "RCE");
    const submitted = await submitRequest({ workflowId, title: "Race", formData: {} }, user(requester));
    if (!submitted.ok) throw new Error(submitted.message);
    const { requestId } = submitted.value;
    const [keyA, keyB] = [await pendingTaskKey(requestId, financeA), await pendingTaskKey(requestId, financeB)];
    const results = await Promise.all([
      decideTask({ requestId, taskKey: keyA, decision: "APPROVE" }, user(financeA)),
      decideTask({ requestId, taskKey: keyB, decision: "APPROVE" }, user(financeB)),
    ]);
    // The row lock runs them one after the other: the first approval
    // completes the step, the second finds the request already approved.
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toMatchObject({ ok: false, code: "NOT_IN_PROGRESS" });
    const row = await requestRow(requestId);
    expect(row.status).toBe("APPROVED");
    expect(row.state_version).toBe(2);
    const [decided] = await getDbPool().query<(RowDataPacket & { total: number })[]>(
      "SELECT COUNT(*) AS total FROM approval_events WHERE request_id = ? AND event_type = 'TASK_DECIDED'",
      [requestId],
    );
    expect(Number(decided[0]!.total)).toBe(1);
  });

  it("the timeline is append-only", async () => {
    await expect(getDbPool().query("UPDATE approval_events SET event_type = 'HACKED'")).rejects.toThrow(/append-only/);
    await expect(getDbPool().query("DELETE FROM approval_events")).rejects.toThrow(/append-only/);
  });

  it("an invalid workflow can't be published", async () => {
    const broken: WorkflowDefinition = {
      nodes: [
        { id: "start", kind: "START", label: "Start" },
        { id: "a", kind: "APPROVAL", label: "Nobody", approvers: [{ type: "USER", userId: 999999 }], completion: { type: "ALL" } },
        { id: "end", kind: "END", label: "End" },
      ],
      edges: [
        { id: "e1", from: "start", to: "a" },
        { id: "e2", from: "a", to: "end" },
      ],
    };
    const created = await createWorkflow({ code: code(), name: "Broken", kind: "PREDEFINED", requestPrefix: "BRK", definition: broken }, admin(adminId));
    if (!created.ok) throw new Error(created.message);
    expect(created.value.validation.valid).toBe(false);
    const published = await publishVersion(created.value.versionId, admin(adminId));
    expect(published).toMatchObject({ ok: false, code: "INVALID_WORKFLOW" });
  });

  it("only the IT team creates predefined workflows", async () => {
    const result = await createWorkflow({ code: code(), name: "X", kind: "PREDEFINED", requestPrefix: "XX", definition: hybrid(1) }, user(requester));
    expect(result).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });
});

describe("changes, hold and versions", () => {
  const twoLevel = (): WorkflowDefinition => ({
    nodes: [
      { id: "start", kind: "START", label: "Start" },
      { id: "manager", kind: "APPROVAL", label: "Manager", approvers: [{ type: "REQUESTER_MANAGER" }], completion: { type: "ALL" } },
      { id: "md", kind: "APPROVAL", label: "MD", approvers: [{ type: "USER", userId: md }], completion: { type: "ALL" } },
      { id: "end", kind: "END", label: "End" },
    ],
    edges: [
      { id: "e1", from: "start", to: "manager" },
      { id: "e2", from: "manager", to: "md" },
      { id: "e3", from: "md", to: "end" },
    ],
  });

  it("changes required → requester resubmits the same request with new data → approved", async () => {
    const workflowId = await publishedWorkflow(twoLevel(), "CHG");
    const submitted = await submitRequest({ workflowId, title: "Laptop", formData: { amount: 90000 } }, user(requester));
    if (!submitted.ok) throw new Error(submitted.message);
    const { requestId, requestNo } = submitted.value;
    await approve(requestId, manager);
    const asked = await decideTask({ requestId, taskKey: await pendingTaskKey(requestId, md), decision: "REQUEST_CHANGES", comment: "Attach 3 quotes" }, user(md));
    expect(asked).toMatchObject({ ok: true, value: { status: "CHANGES_REQUIRED" } });

    expect(await resubmitRequest({ requestId }, user(manager))).toMatchObject({ ok: false, code: "NOT_AUTHORISED" });
    const again = await resubmitRequest({ requestId, formData: { amount: 85000, quotes: "3" } }, user(requester));
    expect(again).toMatchObject({ ok: true, value: { status: "IN_PROGRESS" } });
    const row = await requestRow(requestId);
    expect(row.round).toBe(2);
    expect((await approve(requestId, md)).status).toBe("APPROVED");

    const [rows] = await getDbPool().query<(RowDataPacket & { request_no: string; form: string })[]>(
      "SELECT request_no, JSON_EXTRACT(form_data_json, '$.quotes') AS form FROM approval_requests WHERE id = ?",
      [requestId],
    );
    expect(rows[0]!.request_no).toBe(requestNo);
    expect(String(rows[0]!.form)).toContain("3");
  });

  it("hold pauses; the approver resumes", async () => {
    const workflowId = await publishedWorkflow(twoLevel(), "HLD");
    const submitted = await submitRequest({ workflowId, title: "Vendor onboarding", formData: {} }, user(requester));
    if (!submitted.ok) throw new Error(submitted.message);
    const { requestId } = submitted.value;
    const key = await pendingTaskKey(requestId, manager);
    expect(await holdTask({ requestId, taskKey: key, reason: "Waiting for GST copy" }, user(manager))).toMatchObject({ ok: true, value: { status: "ON_HOLD" } });
    expect(await resumeRequest(requestId, user(financeA))).toMatchObject({ ok: false, code: "NOT_AUTHORISED" });
    expect(await resumeRequest(requestId, user(manager))).toMatchObject({ ok: true, value: { status: "IN_PROGRESS" } });
    await approve(requestId, manager);
  });

  it("a running request stays on its version when a new one is published", async () => {
    const workflowId = await publishedWorkflow(twoLevel(), "VER");
    const first = await submitRequest({ workflowId, title: "Before change", formData: {} }, user(requester));
    if (!first.ok) throw new Error(first.message);

    const oneLevel: WorkflowDefinition = {
      nodes: [
        { id: "start", kind: "START", label: "Start" },
        { id: "md", kind: "APPROVAL", label: "MD", approvers: [{ type: "USER", userId: md }], completion: { type: "ALL" } },
        { id: "end", kind: "END", label: "End" },
      ],
      edges: [
        { id: "e1", from: "start", to: "md" },
        { id: "e2", from: "md", to: "end" },
      ],
    };
    const draft = await addDraftVersion(workflowId, oneLevel, admin(adminId));
    if (!draft.ok) throw new Error(draft.message);
    expect(draft.value.versionNo).toBe(2);
    expect(await publishVersion(draft.value.versionId, admin(adminId))).toMatchObject({ ok: true });

    // The old request still needs its manager first (version 1).
    await expect(pendingTaskKey(first.value.requestId, md)).rejects.toThrow();
    await approve(first.value.requestId, manager);
    // A new request goes straight to the MD (version 2).
    const second = await submitRequest({ workflowId, title: "After change", formData: {} }, user(requester));
    if (!second.ok) throw new Error(second.message);
    expect(await pendingTaskKey(second.value.requestId, md)).toBeTruthy();

    const [versions] = await getDbPool().query<(RowDataPacket & { version_no: number; status: string })[]>(
      "SELECT version_no, status FROM workflow_versions WHERE workflow_id = ? ORDER BY version_no",
      [workflowId],
    );
    expect(versions.map((row) => `${row.version_no}:${row.status}`)).toEqual(["1:ARCHIVED", "2:PUBLISHED"]);
  });
});
