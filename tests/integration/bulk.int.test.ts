import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { bulkApprove } from "@/server/approvals/bulk";
import { createWorkflow, holdTask, publishVersion, submitRequest, type Actor } from "@/server/approvals/service";
import type { WorkflowDefinition } from "@/server/engine";
import { createUser, pendingTaskKey } from "./helpers";

// #7 bulk approval: each item through decideTask; mixed batches report per
// item; nothing is approved twice.
let approver: number;
let raiser: number;
let itAdmin: Actor;
let counter = 0;

const chain = (...nodes: WorkflowDefinition["nodes"]): WorkflowDefinition => {
  const all = [{ id: "start", kind: "START", label: "Start" } as const, ...nodes, { id: "end", kind: "END", label: "End" } as const];
  return { nodes: all, edges: all.slice(1).map((node, index) => ({ id: `e${index}`, from: all[index]!.id, to: node.id })) };
};

async function raise(definition: WorkflowDefinition): Promise<number> {
  const created = await createWorkflow({ code: `BULK_${Date.now()}_${++counter}`, name: "Bulk", kind: "PREDEFINED", requestPrefix: "BK", definition }, itAdmin);
  if (!created.ok) throw new Error(created.message);
  await publishVersion(created.value.versionId, itAdmin);
  const submitted = await submitRequest({ workflowId: created.value.workflowId, title: `Bulk ${counter}`, fields: {}, allowDuplicate: true }, { id: raiser, roles: ["USER"] });
  if (!submitted.ok) throw new Error(submitted.message);
  return submitted.value.requestId;
}

beforeAll(async () => {
  approver = await createUser({ name: "Bulk Approver" });
  raiser = await createUser({ name: "Bulk Raiser" });
  const admin = await createUser({ roles: ["USER", "IT_ADMIN"] });
  itAdmin = { id: admin, roles: ["USER", "IT_ADMIN"] };
});

afterAll(async () => {
  await getDbPool().end();
});

describe("bulk approve", () => {
  it("approves the eligible ones, skips the rest with a reason, and never twice", async () => {
    const simple = () => chain({ id: "a", kind: "APPROVAL", label: "A", approvers: [{ type: "USER", userId: approver }], completion: { type: "ALL" } });
    const one = await raise(simple());
    const two = await raise(chain(
      { id: "a", kind: "APPROVAL", label: "A", approvers: [{ type: "USER", userId: approver }], completion: { type: "ALL" } },
      { id: "b", kind: "APPROVAL", label: "B", approvers: [{ type: "USER", userId: approver }], completion: { type: "ALL" } },
    ));
    const held = await raise(simple());
    await holdTask({ requestId: held, taskKey: await pendingTaskKey(held, approver) }, { id: approver, roles: ["USER"] });

    const items = [
      { requestId: one, taskKey: await pendingTaskKey(one, approver) },
      { requestId: two, taskKey: await pendingTaskKey(two, approver) },
      { requestId: held, taskKey: await pendingTaskKey(held, approver) },
      { requestId: 999999, taskKey: "t1" },
    ];
    const outcomes = await bulkApprove(items, { id: approver, roles: ["USER"] }, "Checked in the weekly review");
    expect(outcomes.map((outcome) => [outcome.requestId, outcome.result])).toEqual([
      [one, "APPROVED"],
      [two, "APPROVED"],
      [held, "SKIPPED"],
      [999999, "SKIPPED"],
    ]);
    expect(outcomes[2]!.message).toMatch(/hold/);

    // The same batch again: nothing is approved twice.
    const again = await bulkApprove(items.slice(0, 2), { id: approver, roles: ["USER"] });
    expect(again.map((outcome) => outcome.result)).toEqual(["SKIPPED", "SKIPPED"]);
    const [[decided]] = await getDbPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'REQUEST_DECIDED' AND entity_id IN (?, ?)", [String(one), String(two)]);
    expect(Number(decided!.n)).toBe(2);
    // Request two moved on to its second level, each request on its own.
    const [[two_]] = await getDbPool().query<RowDataPacket[]>("SELECT status FROM approval_requests WHERE id = ?", [two]);
    expect(two_!.status).toBe("IN_PROGRESS");
  });

  it("a work task is never bulk-approved, and someone else's approval can't be", async () => {
    const workflow = chain({ id: "w", kind: "APPROVAL", label: "Do it", approvers: [{ type: "USER", userId: approver }], completion: { type: "ALL" }, mode: "WORK" }, { id: "a", kind: "APPROVAL", label: "A", approvers: [{ type: "USER", userId: approver }], completion: { type: "ALL" } });
    const id = await raise(workflow);
    const [outcome] = await bulkApprove([{ requestId: id, taskKey: await pendingTaskKey(id, approver) }], { id: approver, roles: ["USER"] });
    expect(outcome).toMatchObject({ result: "SKIPPED", message: expect.stringMatching(/work task/) });

    const plain = await raise(chain({ id: "a", kind: "APPROVAL", label: "A", approvers: [{ type: "USER", userId: approver }], completion: { type: "ALL" } }));
    const stranger = await createUser();
    const [denied] = await bulkApprove([{ requestId: plain, taskKey: await pendingTaskKey(plain, approver) }], { id: stranger, roles: ["USER"] });
    expect(denied!.result).toBe("FAILED");
  });
});
