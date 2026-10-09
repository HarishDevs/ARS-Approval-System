import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { findRequest, nextRequestNumber, publishWorkflowVersion, countPendingTasksFor, listPendingTasksFor } from "@/lib/db/repositories/approvals.repository";
import { addDraftVersion, createWorkflow, decideTask, handOverPendingTasks, holdTask, publishVersion, resolveBlockedStep, resumeRequest, submitCustomRequest, submitRequest, type Actor } from "@/server/approvals/service";
import { deleteRequest } from "@/server/approvals/delete";
import type { WorkflowDefinition } from "@/server/engine";
import { createDepartment, createUser, pendingTaskKey } from "./helpers";

// v1.4.0 (D-097..D-101): work steps, blocked-step recovery, delete through
// the engine, handover and hold clocks, the publish lock, custom cleanup.
const admin = (id: number): Actor => ({ id, roles: ["USER", "IT_ADMIN"] });
const superAdmin = (id: number): Actor => ({ id, roles: ["USER", "IT_ADMIN", "SUPER_ADMIN"] });
const user = (id: number): Actor => ({ id, roles: ["USER"] });
let counter = 0;
const code = () => `V140_${Date.now().toString(36)}_${++counter}`.toUpperCase();

let itAdmin: number;
let boss: number;
let requester: number;
let approver: number;
let other: number;

beforeAll(async () => {
  itAdmin = await createUser({ name: "IT", roles: ["USER", "IT_ADMIN", "SUPER_ADMIN"] });
  boss = await createUser({ name: "Boss" });
  requester = await createUser({ name: "Raiser", managerId: boss });
  approver = await createUser({ name: "Approver" });
  other = await createUser({ name: "Other" });
});

afterAll(async () => {
  await getDbPool().end();
});

async function publish(definition: WorkflowDefinition): Promise<number> {
  const created = await createWorkflow({ code: code(), name: "V140", kind: "PREDEFINED", requestPrefix: "VT", definition }, admin(itAdmin));
  if (!created.ok) throw new Error(created.message);
  const published = await publishVersion(created.value.versionId, admin(itAdmin));
  if (!published.ok) throw new Error(published.message);
  return created.value.workflowId;
}

async function raise(workflowId: number): Promise<number> {
  const submitted = await submitRequest({ workflowId, title: `V140 ${code()}`, fields: {}, allowDuplicate: true }, user(requester));
  if (!submitted.ok) throw new Error(submitted.message);
  return submitted.value.requestId;
}

const chain = (...nodes: WorkflowDefinition["nodes"]): WorkflowDefinition => {
  const all = [{ id: "start", kind: "START", label: "Start" } as const, ...nodes, { id: "end", kind: "END", label: "End" } as const];
  return { nodes: all, edges: all.slice(1).map((node, index) => ({ id: `e${index}`, from: all[index]!.id, to: node.id })) };
};

describe("work step for the requester (D-097)", () => {
  it("shows in their own 'Waiting for me', and marking it done finishes the request", async () => {
    const workflowId = await publish(
      chain(
        { id: "mgr", kind: "APPROVAL", label: "Manager", approvers: [{ type: "USER", userId: approver }], completion: { type: "ALL" } },
        { id: "po", kind: "APPROVAL", label: "Raise the PO", approvers: [{ type: "REQUESTER" }], completion: { type: "ALL" }, mode: "WORK" },
      ),
    );
    const id = await raise(workflowId);
    expect((await decideTask({ requestId: id, taskKey: await pendingTaskKey(id, approver), decision: "APPROVE" }, user(approver))).ok).toBe(true);
    const mine = await listPendingTasksFor(requester);
    expect(mine.find((item) => item.requestId === id)).toMatchObject({ work: true, nodeLabel: "Raise the PO" });
    expect(await countPendingTasksFor(requester)).toBeGreaterThanOrEqual(1);
    const done = await decideTask({ requestId: id, taskKey: await pendingTaskKey(id, requester), decision: "APPROVE", comment: "PO 1 raised" }, user(requester));
    expect(done).toEqual({ ok: true, value: { status: "APPROVED" } });
    const [audit] = await getDbPool().query<(RowDataPacket & { total: number })[]>("SELECT COUNT(*) AS total FROM audit_logs WHERE action = 'REQUEST_DECIDED' AND entity_id = ?", [String(id)]);
    expect(Number(audit[0]?.total)).toBe(2);
  });
});

describe("blocked step recovery (D-098)", () => {
  it("IT gives the stuck step to a person; a plain user can't", async () => {
    const noHod = await createDepartment(null);
    const workflowId = await publish(chain({ id: "hod", kind: "APPROVAL", label: "HOD", approvers: [{ type: "DEPARTMENT_HOD", departmentId: noHod }], completion: { type: "ALL" } }));
    const id = await raise(workflowId);
    expect((await findRequest(id))?.state.nodes.hod?.status).toBe("BLOCKED");
    const refused = await resolveBlockedStep({ requestId: id, nodeId: "hod", reason: "fixing", action: "ASSIGN", userIds: [approver] }, user(other));
    expect(refused.ok).toBe(false);
    const fixed = await resolveBlockedStep({ requestId: id, nodeId: "hod", reason: "HOD not set yet", action: "ASSIGN", userIds: [approver] }, admin(itAdmin));
    expect(fixed.ok).toBe(true);
    expect(await pendingTaskKey(id, approver)).toBeTruthy();
    const [audit] = await getDbPool().query<(RowDataPacket & { total: number })[]>("SELECT COUNT(*) AS total FROM audit_logs WHERE action = 'REQUEST_UNBLOCKED' AND entity_id = ?", [String(id)]);
    expect(Number(audit[0]?.total)).toBe(1);
  });
});

describe("delete through the engine (audit R-04)", () => {
  it("closes the open request, its tasks and state agree, and the approver and requester are told", async () => {
    const workflowId = await publish(chain({ id: "a", kind: "APPROVAL", label: "A", approvers: [{ type: "USER", userId: approver }], completion: { type: "ALL" } }));
    const id = await raise(workflowId);
    const deleted = await deleteRequest({ requestId: id, reason: "Raised by mistake" }, superAdmin(itAdmin));
    expect(deleted).toMatchObject({ ok: true, value: { cancelledTasks: 1 } });
    const [rows] = await getDbPool().query<(RowDataPacket & { status: string; state: string; deleted: number })[]>(
      "SELECT status, CAST(state_json AS CHAR) AS state, deleted_at IS NOT NULL AS deleted FROM approval_requests WHERE id = ?",
      [id],
    );
    expect(rows[0]).toMatchObject({ status: "CANCELLED", deleted: 1 });
    expect(JSON.parse(rows[0]!.state).tasks.every((task: { status: string }) => task.status !== "PENDING")).toBe(true);
    const [tasks] = await getDbPool().query<(RowDataPacket & { status: string })[]>("SELECT status FROM approval_tasks WHERE request_id = ?", [id]);
    expect(tasks.map((task) => task.status)).toEqual(["CANCELLED"]);
    const [inbox] = await getDbPool().query<(RowDataPacket & { user_id: number; event_type: string })[]>(
      "SELECT n.user_id, n.event_type FROM notifications n WHERE n.event_type IN ('REQUEST_WITHDRAWN', 'REQUEST_DELETED') AND n.message LIKE ?",
      [`%${(await getDbPool().query<(RowDataPacket & { request_no: string })[]>("SELECT request_no FROM approval_requests WHERE id = ?", [id]))[0][0]!.request_no}%`],
    );
    expect(inbox.map((row) => `${row.user_id}:${row.event_type}`).sort()).toEqual([`${approver}:REQUEST_WITHDRAWN`, `${requester}:REQUEST_DELETED`].sort());
  });
});

describe("response clocks (audit R-07, hold)", () => {
  const timed = () => chain({ id: "a", kind: "APPROVAL", label: "A", approvers: [{ type: "USER", userId: approver }], completion: { type: "ALL" }, slaHours: 48 });

  it("a handover gives the new person the full time again and forgets old reminders", async () => {
    const id = await raise(await publish(timed()));
    await getDbPool().query("UPDATE approval_tasks SET due_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 HOUR) WHERE request_id = ?", [id]);
    const [task] = await getDbPool().query<(RowDataPacket & { id: number })[]>("SELECT id FROM approval_tasks WHERE request_id = ?", [id]);
    await getDbPool().query("INSERT INTO task_reminders (task_id, kind) VALUES (?, 'REMINDER')", [task[0]!.id]);
    const moved = await handOverPendingTasks(approver, other, admin(itAdmin));
    expect(moved.ok && moved.value.moved).toBeGreaterThanOrEqual(1);
    const [after] = await getDbPool().query<(RowDataPacket & { hours: number; reminders: number })[]>(
      "SELECT TIMESTAMPDIFF(HOUR, CURRENT_TIMESTAMP, due_at) AS hours, (SELECT COUNT(*) FROM task_reminders r WHERE r.task_id = t.id) AS reminders FROM approval_tasks t WHERE request_id = ?",
      [id],
    );
    expect(Number(after[0]!.hours)).toBeGreaterThan(10);
    expect(Number(after[0]!.reminders)).toBe(0);
    // give it back for later tests
    await handOverPendingTasks(other, approver, admin(itAdmin));
  });

  it("time on hold is added to the due time", async () => {
    const id = await raise(await publish(timed()));
    const key = await pendingTaskKey(id, approver);
    const [before] = await getDbPool().query<(RowDataPacket & { due: Date })[]>("SELECT due_at AS due FROM approval_tasks WHERE request_id = ?", [id]);
    expect((await holdTask({ requestId: id, taskKey: key, reason: "wait" }, user(approver))).ok).toBe(true);
    // pretend the hold started 5 hours ago
    const [row] = await getDbPool().query<(RowDataPacket & { state: string })[]>("SELECT CAST(state_json AS CHAR) AS state FROM approval_requests WHERE id = ?", [id]);
    const state = JSON.parse(row[0]!.state);
    state.hold.at = new Date(Date.now() - 5 * 3600_000).toISOString();
    await getDbPool().query("UPDATE approval_requests SET state_json = ? WHERE id = ?", [JSON.stringify(state), id]);
    expect((await resumeRequest(id, user(approver))).ok).toBe(true);
    const [after] = await getDbPool().query<(RowDataPacket & { due: Date })[]>("SELECT due_at AS due FROM approval_tasks WHERE request_id = ?", [id]);
    const added = (new Date(after[0]!.due).getTime() - new Date(before[0]!.due).getTime()) / 3600_000;
    expect(added).toBeGreaterThan(4.9);
    expect(added).toBeLessThan(5.1);
  });
});

describe("publishing and numbering (audit R-05, R-09)", () => {
  it("publishing the same draft twice at once leaves exactly one published version", async () => {
    const workflowId = await publish(chain({ id: "a", kind: "APPROVAL", label: "A", approvers: [{ type: "USER", userId: approver }], completion: { type: "ALL" } }));
    const draft = await addDraftVersion(workflowId, { definition: chain({ id: "b", kind: "APPROVAL", label: "B", approvers: [{ type: "USER", userId: approver }], completion: { type: "ALL" } }) }, admin(itAdmin));
    if (!draft.ok) throw new Error(draft.message);
    const results = await Promise.all([1, 2].map(() => withTransaction((db) => publishWorkflowVersion(draft.value.versionId, workflowId, itAdmin, db))));
    expect(results.filter(Boolean)).toHaveLength(1);
    const [rows] = await getDbPool().query<(RowDataPacket & { total: number })[]>("SELECT COUNT(*) AS total FROM workflow_versions WHERE workflow_id = ? AND status = 'PUBLISHED'", [workflowId]);
    expect(Number(rows[0]?.total)).toBe(1);
  });

  it("request numbers use the year in India", async () => {
    const [ist] = await getDbPool().query<(RowDataPacket & { year: number })[]>("SELECT YEAR(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE)) AS year");
    const number = await withTransaction((db) => nextRequestNumber(`Y${counter}`.slice(0, 6), db));
    expect(number).toContain(`-${ist[0]!.year}-`);
  });
});

describe("custom approvals leave no orphan (audit R-06)", () => {
  it("a submit that fails removes the one-off approval type again", async () => {
    const [before] = await getDbPool().query<(RowDataPacket & { total: number })[]>("SELECT COUNT(*) AS total FROM workflow_definitions WHERE kind = 'CUSTOM' AND owner_user_id = ?", [requester]);
    const result = await submitCustomRequest(
      {
        title: "Custom with a bad form",
        builder: { stages: [{ kind: "STEP", step: { id: "x1", label: "Boss", approvers: { kind: "PEOPLE", userIds: [boss] }, rule: "ALL" } }] },
        fields: { details: "", amount: "-5" },
        allowDuplicate: true,
      },
      user(requester),
    );
    expect(result.ok).toBe(false);
    const [after] = await getDbPool().query<(RowDataPacket & { total: number })[]>("SELECT COUNT(*) AS total FROM workflow_definitions WHERE kind = 'CUSTOM' AND owner_user_id = ?", [requester]);
    expect(Number(after[0]?.total)).toBe(Number(before[0]?.total));
  });
});
