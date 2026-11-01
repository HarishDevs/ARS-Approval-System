import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { canViewRequest, isParticipant } from "@/lib/db/repositories/approvals.repository";
import { createWorkflow, decideTask, publishVersion, submitRequest, type Actor } from "@/server/approvals/service";
import { loadJourney } from "@/server/journey/load";
import { backfillWorkMirrors } from "@/server/approvals/work-mirror";
import type { WorkflowDefinition } from "@/server/engine";
import { createUser, pendingTaskKey, requestRow } from "./helpers";

// D-273 (owner's journey brief): background work (the request doesn't wait)
// persisted end to end, and the journey read from the request's records.
const admin = (id: number): Actor => ({ id, roles: ["USER", "IT_ADMIN"] });
const user = (id: number): Actor => ({ id, roles: ["USER"] });

let adminId: number;
let requester: number;
let worker: number;
let watcher: number;
let boss: number;
let outsider: number;

beforeAll(async () => {
  adminId = await createUser({ name: "IT Admin", roles: ["USER", "IT_ADMIN"] });
  requester = await createUser({ name: "Journey Requester" });
  worker = await createUser({ name: "Journey Worker" });
  watcher = await createUser({ name: "Journey Watcher" });
  boss = await createUser({ name: "Journey Boss" });
  outsider = await createUser({ name: "Journey Outsider" });
});

afterAll(async () => {
  await getDbPool().end();
});

function definition(): WorkflowDefinition {
  return {
    nodes: [
      { id: "start", kind: "START", label: "Start" },
      { id: "papers", kind: "APPROVAL", label: "Collect papers", approvers: [{ type: "USER", userId: worker }], completion: { type: "ALL" }, mode: "WORK", background: true, slaHours: 24 },
      { id: "fyi", kind: "NOTIFY", label: "Tell the watcher", recipients: [{ type: "USER", userId: watcher }] },
      { id: "boss", kind: "APPROVAL", label: "Boss", approvers: [{ type: "USER", userId: boss }], completion: { type: "ALL" } },
      { id: "end", kind: "END", label: "End" },
    ],
    edges: [
      { id: "e1", from: "start", to: "papers" },
      { id: "e2", from: "papers", to: "fyi" },
      { id: "e3", from: "fyi", to: "boss" },
      { id: "e4", from: "boss", to: "end" },
    ],
  };
}

describe("background work and the journey", () => {
  it("gives the work as a linked task, doesn't wait for it, and the journey shows it beside the road", async () => {
    const created = await createWorkflow({ code: `JRN_${Date.now().toString(36)}`.toUpperCase(), name: "Journey", kind: "PREDEFINED", requestPrefix: "JRN", definition: definition(), form: [] }, admin(adminId));
    if (!created.ok) throw new Error(created.message);
    expect(created.value.validation.errors).toEqual([]);
    const published = await publishVersion(created.value.versionId, admin(adminId));
    if (!published.ok) throw new Error(published.message);
    const submitted = await submitRequest({ workflowId: created.value.workflowId, title: "Ship the coils", fields: {} }, user(requester));
    if (!submitted.ok) throw new Error(submitted.message);
    const { requestId } = submitted.value;

    // The request moved straight on to the boss.
    expect((await requestRow(requestId)).status).toBe("IN_PROGRESS");
    await expect(pendingTaskKey(requestId, boss)).resolves.toBeTruthy();

    // One linked task for the worker, due after the step's 24 hours, never a work-step mirror.
    const [tasks] = await getDbPool().query<RowDataPacket[]>(
      "SELECT id, assignee_id, status, due_at, title, JSON_EXTRACT(form_data_json, '$.__approvalWork') AS mirror FROM tasks WHERE related_request_id = ? AND JSON_CONTAINS_PATH(form_data_json, 'one', '$.__approvalLink')",
      [requestId],
    );
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ assignee_id: worker, status: "OPEN", mirror: null });
    expect(String(tasks[0]!.title)).toContain("Collect papers");
    expect(tasks[0]!.due_at).not.toBeNull();

    // Context access: the worker may read the request (read-only), the outsider may not.
    expect(await canViewRequest(requestId, worker)).toBe(true);
    expect(await isParticipant(requestId, worker)).toBe(false);
    expect(await canViewRequest(requestId, outsider)).toBe(false);
    expect(await loadJourney(requestId, user(outsider))).toBeNull();

    // The journey: one checkpoint (the boss), the task and the FYI as activities.
    const journey = (await loadJourney(requestId, user(requester)))!;
    expect(journey.road.checkpoints.map((point) => point.label)).toEqual(["Request submitted", "Boss"]);
    expect(journey.road.vanAt).toBe(1);
    expect(journey.tasks).toEqual([expect.objectContaining({ assignee: "Journey Worker", status: "OPEN", blocking: false })]);
    expect(journey.fyi).toEqual([expect.objectContaining({ step: "Tell the watcher", recipients: [expect.objectContaining({ name: "Journey Watcher" })] })]);
    expect(journey.cursor).toBeGreaterThan(0);

    // Syncing again (any later change) makes no second task.
    const approved = await decideTask({ requestId, taskKey: await pendingTaskKey(requestId, boss), decision: "APPROVE" }, user(boss));
    if (!approved.ok) throw new Error(approved.message);
    const [after] = await getDbPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM tasks WHERE related_request_id = ? AND JSON_CONTAINS_PATH(form_data_json, 'one', '$.__approvalLink')", [requestId]);
    expect(Number(after[0]!.n)).toBe(1);
    // The job runner's backfill finds nothing missing here and makes no copy.
    await backfillWorkMirrors();
    const [again] = await getDbPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM tasks WHERE related_request_id = ? AND JSON_CONTAINS_PATH(form_data_json, 'one', '$.__approvalLink')", [requestId]);
    expect(Number(again[0]!.n)).toBe(1);
    // Approving the request didn't complete the work (independent), and the journey is at the flag.
    const [still] = await getDbPool().query<RowDataPacket[]>("SELECT status FROM tasks WHERE id = ?", [tasks[0]!.id]);
    expect(still[0]!.status).toBe("OPEN");
    const finished = (await loadJourney(requestId, user(requester)))!;
    expect(finished.road.outcome).toBe("APPROVED");
    expect(finished.road.percent).toBe(100);
    expect(finished.cursor).toBeGreaterThan(journey.cursor);
  });
});
