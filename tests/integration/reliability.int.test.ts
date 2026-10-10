import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { createWorkflow, publishVersion, submitRequest, type Actor } from "@/server/approvals/service";
import { findStuckRequests, snoozeStuck } from "@/server/ops/stuck";
import { runAutomations, AUTOMATIONS, healthOf } from "@/server/ops/automation";
import { listJobRuns, summariseJobs } from "@/lib/db/repositories/job-runs.repository";
import { claimOutbox, insertOutbox, listUnsentOutbox, releaseOutboxForResend } from "@/lib/db/repositories/outbox.repository";
import { createUser } from "./helpers";

// Unified prompt FN2 (stuck detection), FN11 (job-run history, safe
// resend) on real MySQL.
let approver: number;
let requester: number;
let admin: Actor;
let counter = 0;

async function raise(approverId: number): Promise<number> {
  const created = await createWorkflow(
    {
      code: `REL_${Date.now()}_${++counter}`,
      name: `Reliability ${counter}`,
      kind: "PREDEFINED",
      requestPrefix: "RL",
      form: [{ key: "note", label: "Note", type: "TEXT", required: false }],
      definition: {
        nodes: [
          { id: "start", kind: "START", label: "Start" },
          { id: "a", kind: "APPROVAL", label: "Check", approvers: [{ type: "USER", userId: approverId }], completion: { type: "ALL" } },
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
  const submitted = await submitRequest({ workflowId: created.value.workflowId, title: `Stuck check ${counter}`, fields: {} }, { id: requester, roles: ["USER"] });
  if (!submitted.ok) throw new Error(submitted.message);
  return submitted.value.requestId;
}

const reasonsFor = async (requestId: number) => (await findStuckRequests({ idleDays: 7, limit: 500 })).filter((item) => item.requestId === requestId).map((item) => item.reason);

beforeAll(async () => {
  const adminId = await createUser({ roles: ["USER", "IT_ADMIN"] });
  admin = { id: adminId, roles: ["USER", "IT_ADMIN"] };
  approver = await createUser({ name: "Rel Approver" });
  requester = await createUser({ name: "Rel Requester" });
});

afterAll(async () => {
  await getDbPool().end();
});

describe("stuck-request detection (FN2)", () => {
  it("a healthy new request is not listed", async () => {
    const id = await raise(approver);
    expect(await reasonsFor(id)).toEqual([]);
  });

  it("finds a task held by an inactive person with no delegate, and a snooze hides it", async () => {
    const leaver = await createUser({ name: "Rel Leaver" });
    const id = await raise(leaver);
    await getDbPool().query("UPDATE users SET active = FALSE WHERE id = ?", [leaver]);
    const found = (await findStuckRequests({ idleDays: 7 })).find((item) => item.requestId === id && item.reason === "INACTIVE_APPROVER");
    expect(found).toMatchObject({ personId: leaver, detail: expect.stringContaining("Rel Leaver") });
    await snoozeStuck({ requestId: id, reason: "INACTIVE_APPROVER", days: 7, note: "Handing over Monday", userId: admin.id });
    expect(await reasonsFor(id)).not.toContain("INACTIVE_APPROVER");
  });

  it("finds no activity past the limit, and a blocked step", async () => {
    const id = await raise(approver);
    // approval_events is append-only, so look from 10 days ahead instead.
    const later = new Date(Date.now() + 10 * 24 * 60 * 60_000);
    expect((await findStuckRequests({ idleDays: 7, asOf: later, limit: 500 })).filter((item) => item.requestId === id).map((item) => item.reason)).toContain("NO_ACTIVITY");
    expect((await findStuckRequests({ idleDays: 30, asOf: later, limit: 500 })).some((item) => item.requestId === id)).toBe(false);
    expect(await reasonsFor(id)).toEqual([]);
    await getDbPool().query("UPDATE approval_requests SET state_json = JSON_SET(state_json, '$.nodes.a.status', 'BLOCKED') WHERE id = ?", [id]);
    expect(await reasonsFor(id)).toContain("BLOCKED_STEP");
  });
});

describe("messages the sender gave up on (FN11)", () => {
  it("are listed and resent once; a message being sent, or sent, is never released", async () => {
    const id = await raise(approver);
    const [outboxId] = await insertOutbox(id, [{ eventType: "TEST_EVENT", userId: approver, title: "t", message: "m", deepLink: null, email: null, whatsappVariables: null } as never], getDbPool());
    await getDbPool().query("UPDATE notification_outbox SET attempts = 5 WHERE id = ?", [outboxId]);
    expect((await listUnsentOutbox(500)).find((row) => row.id === outboxId)).toMatchObject({ eventType: "TEST_EVENT", gaveUp: true });
    expect(await reasonsFor(id)).toContain("MESSAGES_UNSENT");
    // Released: fresh tries.
    expect(await releaseOutboxForResend({ requestId: id })).toContain(outboxId);
    // Someone claims it to send: a second resend leaves it alone.
    expect(await claimOutbox(outboxId!)).not.toBeNull();
    expect(await releaseOutboxForResend({ ids: [outboxId!] })).toEqual([]);
    // Sent: never released again.
    await getDbPool().query("UPDATE notification_outbox SET sent_at = CURRENT_TIMESTAMP(3) WHERE id = ?", [outboxId]);
    expect(await releaseOutboxForResend({ ids: [outboxId!] })).toEqual([]);
    const [[row]] = await getDbPool().query<RowDataPacket[]>("SELECT attempts FROM notification_outbox WHERE id = ?", [outboxId]);
    expect(Number(row!.attempts)).toBe(1);
  });
});

describe("job-run history (FN11)", () => {
  it("each step is recorded with its counts; health reads from the history", async () => {
    const report = await runAutomations({ runRef: `test-${Date.now()}`, trigger: "MANUAL", only: ["stuck", "delegations"] });
    expect(report.failed).toEqual([]);
    const runs = await listJobRuns({ limit: 10 });
    const mine = runs.filter((run) => run.runRef === report.runRef);
    expect(mine.map((run) => run.jobKey).sort()).toEqual(["delegations", "stuck"]);
    expect(mine.every((run) => run.status === "OK" && run.trigger === "MANUAL" && run.finishedAt)).toBe(true);
    expect(mine.find((run) => run.jobKey === "stuck")!.counts).toHaveProperty("BLOCKED_STEP");
    const summary = (await summariseJobs(["stuck", "never-ran"])).get("stuck")!;
    const stuck = AUTOMATIONS.find((automation) => automation.key === "stuck")!;
    expect(healthOf(stuck, summary)).toBe("OK");
    expect(healthOf(stuck, summary, new Date(Date.now() + 60 * 60_000))).toBe("LATE");
    expect(healthOf(stuck, (await summariseJobs(["never-ran"])).get("never-ran"))).toBe("NEVER");
    expect(healthOf(stuck, { ...summary, lastRun: { ...summary.lastRun!, status: "FAILED" } })).toBe("FAILING");
  });
});
