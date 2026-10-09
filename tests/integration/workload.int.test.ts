import { afterAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { createWorkflow, publishVersion, submitRequest, type Actor } from "@/server/approvals/service";
import { runDueSoon, runSlaChecks } from "@/server/jobs/sla";
import { listPendingTaskAges, pendingCountsByApprover } from "@/lib/db/repositories/workload.repository";
import { summarizeWorkload } from "@/server/workload/summary";
import { createUser } from "./helpers";

// #12: due-soon heads-up once at 75% of the response time, without taking a
// slot from the later reminder and escalations; the workload numbers.
afterAll(async () => {
  await getDbPool().end();
});

async function raiseWithSla(approver: number, raiser: number): Promise<number> {
  const adminId = await createUser({ roles: ["USER", "IT_ADMIN"] });
  const admin: Actor = { id: adminId, roles: ["USER", "IT_ADMIN"] };
  const created = await createWorkflow(
    {
      code: `DS_${Date.now()}_${approver}`,
      name: "Due soon",
      kind: "PREDEFINED",
      requestPrefix: "DS",
      definition: {
        nodes: [
          { id: "start", kind: "START", label: "Start" },
          { id: "a", kind: "APPROVAL", label: "Check", approvers: [{ type: "USER", userId: approver }], completion: { type: "ALL" }, slaHours: 24 },
          { id: "end", kind: "END", label: "End" },
        ],
        edges: [
          { id: "e1", from: "start", to: "a" },
          { id: "e2", from: "a", to: "end" },
        ],
      },
    },
    admin,
  );
  if (!created.ok) throw new Error(created.message);
  await publishVersion(created.value.versionId, admin);
  const submitted = await submitRequest({ workflowId: created.value.workflowId, title: "Due soon", fields: {}, allowDuplicate: true }, { id: raiser, roles: ["USER"] });
  if (!submitted.ok) throw new Error(submitted.message);
  return submitted.value.requestId;
}

const kinds = async (requestId: number) => {
  const [rows] = await getDbPool().query<RowDataPacket[]>("SELECT m.kind FROM task_reminders m JOIN approval_tasks t ON t.id = m.task_id WHERE t.request_id = ? ORDER BY m.sent_at, FIELD(m.kind, 'DUE_SOON', 'REMINDER')", [requestId]);
  return rows.map((row) => row.kind as string);
};

describe("due soon and workload", () => {
  it("sends one heads-up at 75%, and the reminder still follows when it's overdue", async () => {
    const approver = await createUser({ name: "Due Approver" });
    const raiser = await createUser();
    const requestId = await raiseWithSla(approver, raiser);
    expect(await runDueSoon()).toBeGreaterThanOrEqual(0);
    expect(await kinds(requestId)).toEqual([]);

    // 20 of 24 hours gone.
    await getDbPool().query("UPDATE approval_tasks SET created_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 20 HOUR), due_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 4 HOUR), escalate_at = NULL WHERE request_id = ?", [requestId]);
    await runDueSoon();
    await runDueSoon();
    expect(await kinds(requestId)).toEqual(["DUE_SOON"]);
    const [notes] = await getDbPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND event_type = 'APPROVAL_DUE_SOON'", [approver]);
    expect(Number(notes[0]!.n)).toBe(1);

    // Later, overdue: the normal reminder is still sent.
    await getDbPool().query("UPDATE approval_tasks SET created_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 30 HOUR), due_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 6 HOUR), escalate_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 18 HOUR) WHERE request_id = ?", [requestId]);
    await runSlaChecks();
    expect(await kinds(requestId)).toEqual(["DUE_SOON", "REMINDER"]);

    const workload = summarizeWorkload(await listPendingTaskAges());
    const row = workload.rows.find((item) => item.approverId === approver);
    expect(row).toMatchObject({ pending: 1, overdue: 1 });
    expect(row!.bands.three).toBe(1);
    expect((await pendingCountsByApprover()).get(approver)).toBe(1);
  });
});
