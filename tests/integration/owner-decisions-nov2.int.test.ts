import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { createWorkflow, decideTask, publishVersion, resubmitRequest, submitRequest, type Actor } from "@/server/approvals/service";
import { findRequest, updateWorkflowSettings } from "@/lib/db/repositories/approvals.repository";
import { submitAmendment } from "@/server/approvals/amendments";
import { linkFollowUp } from "@/server/approvals/consult";
import { typeSettingsSchema } from "@/server/workflows/type-settings";
import { searchRequests } from "@/lib/db/repositories/search.repository";
import { parseSearchFilters } from "@/server/search/filters";
import type { WorkflowDefinition } from "@/server/engine";
import { createDepartment, createUser, pendingTaskKey } from "./helpers";

// Owner decisions of 2 Nov 2026 on real MySQL:
//   DR-09 a resubmit that changes the route restarts at the earliest affected step;
//   DR-01 a branch rejection under a WHEN_UNREACHABLE join lets the others carry on;
//   DR-02 no request ends Approved without a human (HOD, else IT), unless IT ticked the type;
//   DR-05 Expired is derived and shown; amending / following up an expired approval needs a reason.
let admin: Actor;
let hod: number;
let requester: number;
let orphan: number; // no department, so no HOD
let a: number;
let cfo: number;
let ed: number;
let counter = 0;
const person = (id: number): Actor => ({ id, roles: ["USER"] });
const sql = async (text: string, params: unknown[] = []) => (await getDbPool().query<RowDataPacket[]>(text, params))[0];
const events = async (requestId: number, type: string) => sql("SELECT payload_json FROM approval_events WHERE request_id = ? AND event_type = ? ORDER BY id", [requestId, type]);

async function liveType(definition: WorkflowDefinition, settings: Record<string, unknown> = {}): Promise<number> {
  counter += 1;
  const created = await createWorkflow(
    {
      code: `DR_${Date.now()}_${counter}`,
      name: `DR type ${counter}`,
      kind: "PREDEFINED",
      requestPrefix: "DR",
      form: [{ key: "amount", label: "Amount", type: "NUMBER", required: true, min: 0 }],
      definition,
    },
    admin,
  );
  if (!created.ok) throw new Error(created.message);
  const published = await publishVersion(created.value.versionId, admin);
  if (!published.ok) throw new Error(published.message);
  await updateWorkflowSettings(created.value.workflowId, typeSettingsSchema.parse(settings));
  return created.value.workflowId;
}

const decide = async (requestId: number, who: number, decision: "APPROVE" | "REJECT" | "REQUEST_CHANGES") => {
  const result = await decideTask({ requestId, taskKey: await pendingTaskKey(requestId, who), decision, comment: decision === "APPROVE" ? undefined : "Reason given" }, person(who));
  if (!result.ok) throw new Error(result.message);
  return result.value;
};

beforeAll(async () => {
  const adminId = await createUser({ name: "DR Admin", roles: ["USER", "IT_ADMIN"] });
  admin = { id: adminId, roles: ["USER", "IT_ADMIN"] };
  hod = await createUser({ name: "DR HOD" });
  const department = await createDepartment(hod);
  requester = await createUser({ name: "DR Requester", departmentId: department });
  orphan = await createUser({ name: "DR No HOD" });
  a = await createUser({ name: "DR First" });
  cfo = await createUser({ name: "DR CFO" });
  ed = await createUser({ name: "DR ED" });
});

afterAll(async () => {
  await getDbPool().end();
});

describe("DR-09: resubmit restarts at the earliest affected step", () => {
  it("raising the amount brings back the CFO level only; the first approval stands; the history says so", async () => {
    const type = await liveType({
      nodes: [
        { id: "start", kind: "START", label: "Start" },
        { id: "a", kind: "APPROVAL", label: "First check", approvers: [{ type: "USER", userId: a }], completion: { type: "ALL" } },
        { id: "cfo", kind: "APPROVAL", label: "CFO", approvers: [{ type: "USER", userId: cfo }], completion: { type: "ALL" }, skipIf: { field: "amount", operator: "LT", value: 100000 } },
        { id: "ed", kind: "APPROVAL", label: "ED", approvers: [{ type: "USER", userId: ed }], completion: { type: "ALL" } },
        { id: "end", kind: "END", label: "End" },
      ],
      edges: [
        { id: "e1", from: "start", to: "a" },
        { id: "e2", from: "a", to: "cfo" },
        { id: "e3", from: "cfo", to: "ed" },
        { id: "e4", from: "ed", to: "end" },
      ],
    });
    const submitted = await submitRequest({ workflowId: type, title: "Pump spares", fields: { amount: "5000" } }, person(requester));
    if (!submitted.ok) throw new Error(submitted.message);
    const id = submitted.value.requestId;
    await decide(id, a, "APPROVE");
    await decide(id, ed, "REQUEST_CHANGES");
    const again = await resubmitRequest({ requestId: id, fields: { amount: "5000000" } }, person(requester));
    expect(again.ok).toBe(true);
    await expect(pendingTaskKey(id, cfo)).resolves.toBeTruthy();
    await expect(pendingTaskKey(id, a)).rejects.toThrow(); // not asked again
    const changed = await events(id, "ROUTE_CHANGED");
    expect(changed).toHaveLength(1);
    const payload = typeof changed[0]!.payload_json === "string" ? JSON.parse(changed[0]!.payload_json) : changed[0]!.payload_json;
    expect(payload).toMatchObject({ added: ["cfo"], restartNodeIds: ["cfo"], fromBeginning: false });
    await decide(id, cfo, "APPROVE");
    expect((await decide(id, ed, "APPROVE")).status).toBe("APPROVED");
  });
});

describe("DR-01: a branch rejection under WHEN_UNREACHABLE", () => {
  it("the other branch still decides; its approval completes the stage", async () => {
    const type = await liveType({
      nodes: [
        { id: "start", kind: "START", label: "Start" },
        { id: "s", kind: "SPLIT", label: "Heads" },
        { id: "x", kind: "APPROVAL", label: "Plant", approvers: [{ type: "USER", userId: a }], completion: { type: "ALL" } },
        { id: "y", kind: "APPROVAL", label: "Finance", approvers: [{ type: "USER", userId: cfo }], completion: { type: "ALL" } },
        { id: "j", kind: "JOIN", label: "Heads complete", completion: { type: "ANY_ONE" }, onReject: "WHEN_UNREACHABLE" },
        { id: "end", kind: "END", label: "End" },
      ],
      edges: [
        { id: "e1", from: "start", to: "s" },
        { id: "e2", from: "s", to: "x" },
        { id: "e3", from: "s", to: "y" },
        { id: "e4", from: "x", to: "j" },
        { id: "e5", from: "y", to: "j" },
        { id: "e6", from: "j", to: "end" },
      ],
    });
    const submitted = await submitRequest({ workflowId: type, title: "Two heads", fields: { amount: "10" } }, person(requester));
    if (!submitted.ok) throw new Error(submitted.message);
    const id = submitted.value.requestId;
    expect((await decide(id, a, "REJECT")).status).toBe("IN_PROGRESS");
    expect(await events(id, "BRANCH_ENDED")).toHaveLength(1);
    expect((await decide(id, cfo, "APPROVE")).status).toBe("APPROVED");
  });
});

describe("DR-02: no approval without a human", () => {
  const skipped = (): WorkflowDefinition => ({
    nodes: [
      { id: "start", kind: "START", label: "Start" },
      { id: "cfo", kind: "APPROVAL", label: "CFO", approvers: [{ type: "USER", userId: cfo }], completion: { type: "ALL" }, skipIf: { field: "amount", operator: "LT", value: 100000 } },
      { id: "end", kind: "END", label: "End" },
    ],
    edges: [
      { id: "e1", from: "start", to: "cfo" },
      { id: "e2", from: "cfo", to: "end" },
    ],
  });

  it("every level skipped: the requester's HOD approves it", async () => {
    const type = await liveType(skipped());
    const submitted = await submitRequest({ workflowId: type, title: "Small spend", fields: { amount: "10" } }, person(requester));
    if (!submitted.ok) throw new Error(submitted.message);
    expect(submitted.value.status).toBe("IN_PROGRESS");
    expect(await events(submitted.value.requestId, "HUMAN_APPROVAL_ROUTED")).toHaveLength(1);
    expect((await decide(submitted.value.requestId, hod, "APPROVE")).status).toBe("APPROVED");
  });

  it("no HOD: the step is blocked for IT", async () => {
    const type = await liveType(skipped());
    const submitted = await submitRequest({ workflowId: type, title: "Small spend, no HOD", fields: { amount: "10" } }, person(orphan));
    if (!submitted.ok) throw new Error(submitted.message);
    const request = await findRequest(submitted.value.requestId);
    expect(request!.state.nodes.cfo!.status).toBe("BLOCKED");
  });

  it("a type IT ticked may finish with nobody approving", async () => {
    const type = await liveType(skipped(), { mayFinishWithoutApprover: true });
    const submitted = await submitRequest({ workflowId: type, title: "Small spend, allowed", fields: { amount: "10" } }, person(requester));
    if (!submitted.ok) throw new Error(submitted.message);
    expect(submitted.value.status).toBe("APPROVED");
  });
});

describe("DR-05: an expired approval", () => {
  const simple = (): WorkflowDefinition => ({
    nodes: [
      { id: "start", kind: "START", label: "Start" },
      { id: "a", kind: "APPROVAL", label: "Check", approvers: [{ type: "USER", userId: a }], completion: { type: "ALL" } },
      { id: "end", kind: "END", label: "End" },
    ],
    edges: [
      { id: "e1", from: "start", to: "a" },
      { id: "e2", from: "a", to: "end" },
    ],
  });

  async function expiredRequest(type: number): Promise<number> {
    const submitted = await submitRequest({ workflowId: type, title: "Licence", fields: { amount: "100" } }, person(requester));
    if (!submitted.ok) throw new Error(submitted.message);
    await decide(submitted.value.requestId, a, "APPROVE");
    await getDbPool().query("UPDATE approval_requests SET valid_until = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 DAY) WHERE id = ?", [submitted.value.requestId]);
    return submitted.value.requestId;
  }

  it("search returns its valid-until date (the list shows Expired), stored status unchanged", async () => {
    const type = await liveType(simple(), { validityDays: 30 });
    const id = await expiredRequest(type);
    const found = await searchRequests({ id: admin.id, isAdmin: true }, parseSearchFilters({ type: String(type) }));
    const item = found.items.find((row) => row.id === id)!;
    expect(item.status).toBe("APPROVED");
    expect(item.validUntil).toBeInstanceOf(Date);
  });

  it("amending needs a reason, and the reason is on the expired request's history", async () => {
    const type = await liveType(simple(), { validityDays: 30, amendableFields: ["amount"] });
    const id = await expiredRequest(type);
    const without = await submitAmendment({ originalId: id, fields: { amount: "200" }, reason: "Vendor revised the quote" }, person(requester));
    expect(without).toMatchObject({ ok: false, fieldErrors: { expiredReason: expect.stringMatching(/expired/) } });
    const withReason = await submitAmendment({ originalId: id, fields: { amount: "200" }, reason: "Vendor revised the quote", expiredReason: "Renewing for the next quarter" }, person(requester));
    expect(withReason.ok).toBe(true);
    const reused = await events(id, "EXPIRED_REUSED");
    expect(reused).toHaveLength(1);
  });

  it("a follow-up link with a reason records it on the expired request", async () => {
    const type = await liveType(simple(), { validityDays: 30 });
    const id = await expiredRequest(type);
    const follow = await submitRequest({ workflowId: type, title: "Follow-up", fields: { amount: "50" } }, person(requester));
    if (!follow.ok) throw new Error(follow.message);
    expect(await linkFollowUp({ sourceId: id, followUpId: follow.value.requestId, followUpNo: follow.value.requestNo, expiredReason: "Work still going on" }, person(requester))).toBe(true);
    expect(await events(id, "EXPIRED_REUSED")).toHaveLength(1);
  });
});
