import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { addDraftVersion, createWorkflow, decideTask, publishVersion, submitRequest, type Actor } from "@/server/approvals/service";
import { findRequest } from "@/lib/db/repositories/approvals.repository";
import { listMigrationItems, planMigration, runMigration } from "@/server/workflows/migration";
import type { WorkflowDefinition } from "@/server/engine";
import type { FormField } from "@/server/forms/fields";
import { createUser, pendingTaskKey } from "./helpers";

// Unified prompt FN7 on real MySQL: moving open requests between versions.
let first: number;
let second: number;
let third: number;
let requester: number;
let admin: Actor;
let counter = 0;
const person = (id: number): Actor => ({ id, roles: ["USER"] });
const FORM: FormField[] = [{ key: "amount", label: "Amount", type: "NUMBER", required: true }];

function chain(steps: { id: string; label: string; userId: number }[]): WorkflowDefinition {
  const ids = ["start", ...steps.map((step) => step.id), "end"];
  return {
    nodes: [
      { id: "start", kind: "START", label: "Start" },
      ...steps.map((step) => ({ id: step.id, kind: "APPROVAL" as const, label: step.label, approvers: [{ type: "USER" as const, userId: step.userId }], completion: { type: "ALL" as const } })),
      { id: "end", kind: "END", label: "End" },
    ],
    edges: ids.slice(1).map((to, index) => ({ id: `e_${ids[index]}_${to}`, from: ids[index]!, to })),
  };
}

async function newVersion(workflowId: number, definition: WorkflowDefinition): Promise<number> {
  const draft = await addDraftVersion(workflowId, { definition, form: FORM }, admin);
  if (!draft.ok) throw new Error(draft.message);
  const published = await publishVersion(draft.value.versionId, admin);
  if (!published.ok) throw new Error(published.message);
  return draft.value.versionId;
}

beforeAll(async () => {
  first = await createUser({ name: "Mig First" });
  second = await createUser({ name: "Mig Second" });
  third = await createUser({ name: "Mig Third" });
  requester = await createUser({ name: "Mig Requester" });
  const adminId = await createUser({ roles: ["USER", "IT_ADMIN"] });
  admin = { id: adminId, roles: ["USER", "IT_ADMIN"] };
});

afterAll(async () => {
  await getDbPool().end();
});

describe("migration assistant (FN7)", () => {
  it("dry run changes nothing; compatible requests move, keep their decisions and continue on the new version", async () => {
    const created = await createWorkflow({ code: `MIG_${Date.now()}_${++counter}`, name: "Migrate A", kind: "PREDEFINED", requestPrefix: "MG", form: FORM, definition: chain([{ id: "a", label: "First", userId: first }, { id: "b", label: "Second", userId: second }]) }, admin);
    if (!created.ok) throw new Error(created.message);
    await publishVersion(created.value.versionId, admin);
    const workflowId = created.value.workflowId;
    const v1 = created.value.versionId;
    const raised = await submitRequest({ workflowId, title: "Move me", fields: { amount: "5" } }, person(requester));
    if (!raised.ok) throw new Error(raised.message);
    const id = raised.value.requestId;
    await decideTask({ requestId: id, taskKey: await pendingTaskKey(id, first), decision: "APPROVE" }, person(first));
    // Version 2: the second step now goes to someone else, and a third step is added.
    const v2 = await newVersion(workflowId, chain([{ id: "a", label: "First", userId: first }, { id: "b", label: "Second", userId: third }, { id: "c", label: "Third", userId: third }]));

    const plan = await planMigration({ workflowId, fromVersionId: v1, mapping: {} }, admin);
    expect(plan?.requests.find((request) => request.id === id)?.check.verdict).toBe("WARNINGS");
    expect((await findRequest(id))!.workflowVersionId).toBe(v1); // the dry run changed nothing
    expect(await planMigration({ workflowId, fromVersionId: v1, mapping: {} }, person(requester))).toBeNull();

    // Warnings need an explicit yes.
    const skipped = await runMigration({ workflowId, fromVersionId: v1, requestIds: [id], mapping: {}, acceptWarnings: false }, admin);
    expect(skipped.ok && skipped.report).toMatchObject({ moved: 0, skipped: 1 });
    const moved = await runMigration({ workflowId, fromVersionId: v1, requestIds: [id], mapping: {}, acceptWarnings: true }, admin);
    expect(moved.ok && moved.report).toMatchObject({ moved: 1, skipped: 0, failed: 0 });
    if (!moved.ok) return;
    expect(await listMigrationItems(moved.report.migrationId)).toEqual([expect.objectContaining({ requestId: id, outcome: "MOVED" })]);
    const after = (await findRequest(id))!;
    expect(after.workflowVersionId).toBe(v2);
    expect(after.state.tasks.find((task) => task.nodeId === "a")).toMatchObject({ status: "APPROVED", approverId: first });
    // The person already asked keeps the task; then the new third step follows.
    await decideTask({ requestId: id, taskKey: await pendingTaskKey(id, second), decision: "APPROVE" }, person(second));
    expect((await findRequest(id))!.state.tasks.some((task) => task.nodeId === "c" && task.approverId === third && task.status === "PENDING")).toBe(true);
    const [[event]] = await getDbPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM approval_events WHERE request_id = ? AND event_type = 'VERSION_MIGRATED'", [id]);
    expect(Number(event!.n)).toBe(1);
    // Moving again finds it no longer on version 1.
    const again = await runMigration({ workflowId, fromVersionId: v1, requestIds: [id], mapping: {}, acceptWarnings: true }, admin);
    expect(again.ok && again.report.items[0]).toMatchObject({ outcome: "SKIPPED", message: expect.stringMatching(/isn't on this version/) });
  });

  it("a removed step needs a mapping; with it the step is renamed in the state and the task rows", async () => {
    const created = await createWorkflow({ code: `MIG_${Date.now()}_${++counter}`, name: "Migrate B", kind: "PREDEFINED", requestPrefix: "MG", form: FORM, definition: chain([{ id: "a", label: "First", userId: first }]) }, admin);
    if (!created.ok) throw new Error(created.message);
    await publishVersion(created.value.versionId, admin);
    const workflowId = created.value.workflowId;
    const v1 = created.value.versionId;
    const raised = await submitRequest({ workflowId, title: "Rename me", fields: { amount: "5" } }, person(requester));
    if (!raised.ok) throw new Error(raised.message);
    const id = raised.value.requestId;
    await newVersion(workflowId, chain([{ id: "approve", label: "Approver", userId: first }]));
    const unmapped = await runMigration({ workflowId, fromVersionId: v1, requestIds: [id], mapping: {}, acceptWarnings: true }, admin);
    expect(unmapped.ok && unmapped.report).toMatchObject({ moved: 0, skipped: 1 });
    const mapped = await runMigration({ workflowId, fromVersionId: v1, requestIds: [id], mapping: { a: "approve" }, acceptWarnings: true }, admin);
    expect(mapped.ok && mapped.report.moved).toBe(1);
    const [rows] = await getDbPool().query<RowDataPacket[]>("SELECT node_id, node_label, status FROM approval_tasks WHERE request_id = ?", [id]);
    expect(rows).toEqual([expect.objectContaining({ node_id: "approve", node_label: "Approver", status: "PENDING" })]);
    const decided = await decideTask({ requestId: id, taskKey: await pendingTaskKey(id, first), decision: "APPROVE" }, person(first));
    expect(decided.ok).toBe(true);
    expect((await findRequest(id))!.status).toBe("APPROVED");
  });
});
