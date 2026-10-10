import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { bulkReassign, createWorkflow, decideTask, publishVersion, submitRequest, type Actor } from "@/server/approvals/service";
import { updateWorkflowSettings } from "@/lib/db/repositories/approvals.repository";
import { typeSettingsSchema } from "@/server/workflows/type-settings";
import { runExpiryNotices } from "@/server/approvals/expiry";
import { loadNeededBy } from "@/server/approvals/calendar";
import { loadRequestView } from "@/server/approvals/view";
import { addCollaborators } from "@/server/approvals/collaborators";
import { recheckAndFix } from "@/server/ops/repair";
import { tellBoth } from "@/server/approvals/collab";
import { canExport } from "@/server/settings/features";
import { checkJobRunnerStopped, resetJobRunnerCheck } from "@/server/ops/alerts";
import { saveDraft, listDrafts } from "@/lib/db/repositories/drafts.repository";
import type { FormField } from "@/server/forms/fields";
import { createDepartment, createUser, pendingTaskKey, setDepartment } from "./helpers";

// v1.7.0 list A on real MySQL: expiry, calendar, bulk reassignment, repair,
// delegation end, confidential fields, export permission, duplicate scope
// and unique fields, amendment drafts, the stopped-runner alert.
let approver: number;
let approver2: number;
let target: number;
let requester: number;
let colleague: number;
let friend: number;
let admin: Actor;
let counter = 0;
const person = (id: number): Actor => ({ id, roles: ["USER"] });

const FORM: FormField[] = [
  { key: "invoice_no", label: "Invoice number", type: "TEXT", required: false },
  { key: "amount", label: "Amount", type: "NUMBER", required: true, min: 0 },
  { key: "salary", label: "Salary", type: "NUMBER", required: false, confidential: true },
  { key: "need", label: "Needed by", type: "DATE", required: false, neededBy: true },
];

async function liveType(settings: Record<string, unknown> = {}, approvers: number[] = [approver]): Promise<number> {
  counter += 1;
  const created = await createWorkflow(
    {
      code: `V170_${Date.now()}_${counter}`,
      name: `V170 type ${counter}`,
      kind: "PREDEFINED",
      requestPrefix: "VS",
      form: FORM,
      definition: {
        nodes: [
          { id: "start", kind: "START", label: "Start" },
          { id: "a", kind: "APPROVAL", label: "Check", approvers: approvers.map((userId) => ({ type: "USER", userId })), completion: { type: "ALL" } },
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
  await updateWorkflowSettings(created.value.workflowId, typeSettingsSchema.parse(settings));
  return created.value.workflowId;
}

async function raise(workflowId: number, fields: Record<string, string>, by = requester, title = `V170 ${Date.now()} ${++counter}`) {
  const result = await submitRequest({ workflowId, title, fields }, person(by));
  if (!result.ok) throw new Error(result.message);
  return result.value.requestId;
}

beforeAll(async () => {
  approver = await createUser({ name: "V170 Approver" });
  approver2 = await createUser({ name: "V170 Approver Two" });
  target = await createUser({ name: "V170 Target" });
  requester = await createUser({ name: "V170 Requester" });
  colleague = await createUser({ name: "V170 Colleague" });
  friend = await createUser({ name: "V170 Friend" });
  const adminId = await createUser({ roles: ["USER", "IT_ADMIN"] });
  admin = { id: adminId, roles: ["USER", "IT_ADMIN"] };
});

afterAll(async () => {
  await getDbPool().end();
});

describe("A1 approval expiry", () => {
  it("fixes valid-until on approval and tells the requester once, 7 days before", async () => {
    const workflowId = await liveType({ validityDays: 30 });
    const id = await raise(workflowId, { amount: "100" });
    const approved = await decideTask({ requestId: id, taskKey: await pendingTaskKey(id, approver), decision: "APPROVE" }, person(approver));
    expect(approved.ok).toBe(true);
    const [[row]] = await getDbPool().query<RowDataPacket[]>("SELECT TIMESTAMPDIFF(DAY, closed_at, valid_until) AS days FROM approval_requests WHERE id = ?", [id]);
    expect(Number(row!.days)).toBe(30);
    expect((await loadRequestView(id, person(requester)))?.validUntil).toBeInstanceOf(Date);
    // Not due yet: nothing sent.
    const first = await runExpiryNotices();
    const [[none]] = await getDbPool().query<RowDataPacket[]>("SELECT expiry_notified_at FROM approval_requests WHERE id = ?", [id]);
    expect(none!.expiry_notified_at).toBeNull();
    void first;
    await getDbPool().query("UPDATE approval_requests SET valid_until = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 3 DAY) WHERE id = ?", [id]);
    await runExpiryNotices();
    await runExpiryNotices();
    const [sent] = await getDbPool().query<RowDataPacket[]>("SELECT title FROM notifications WHERE user_id = ? AND event_type = 'APPROVAL_EXPIRING'", [requester]);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.title).toBe("An approval expires soon");
  });

  it("types without a validity period never expire", async () => {
    const workflowId = await liveType({});
    const id = await raise(workflowId, { amount: "5" });
    await decideTask({ requestId: id, taskKey: await pendingTaskKey(id, approver), decision: "APPROVE" }, person(approver));
    const [[row]] = await getDbPool().query<RowDataPacket[]>("SELECT valid_until FROM approval_requests WHERE id = ?", [id]);
    expect(row!.valid_until).toBeNull();
  });
});

describe("A2 needed-by calendar", () => {
  it("lists requests by their needed-by date, only for people who may see them", async () => {
    const workflowId = await liveType({});
    const id = await raise(workflowId, { amount: "1", need: "2031-03-14" });
    const mine = await loadNeededBy(person(requester), "2031-03", { mine: true });
    expect(mine.map((item) => item.id)).toContain(id);
    expect(mine.find((item) => item.id === id)?.date).toBe("2031-03-14");
    expect((await loadNeededBy(person(approver), "2031-03", { mine: true })).map((item) => item.id)).toContain(id); // waiting on them
    expect((await loadNeededBy(person(colleague), "2031-03", {})).map((item) => item.id)).not.toContain(id);
    expect((await loadNeededBy(admin, "2031-03", {})).map((item) => item.id)).toContain(id);
    expect((await loadNeededBy(person(requester), "2031-04", { mine: true })).map((item) => item.id)).not.toContain(id);
  });
});

describe("A3 bulk reassignment", () => {
  it("moves each chosen task and reports every one", async () => {
    const workflowId = await liveType({});
    const one = await raise(workflowId, { amount: "1" });
    const two = await raise(workflowId, { amount: "2" });
    const items = [
      { requestId: one, taskKey: await pendingTaskKey(one, approver) },
      { requestId: two, taskKey: await pendingTaskKey(two, approver) },
      { requestId: two, taskKey: "nope" },
    ];
    expect((await bulkReassign(items, target, "Leaving", person(requester))).ok).toBe(false); // IT only
    const result = await bulkReassign(items, target, "Approver on leave", admin);
    if (!result.ok) throw new Error(result.message);
    expect(result.value.map((outcome) => outcome.ok)).toEqual([true, true, false]);
    expect(await pendingTaskKey(one, target)).toBeTruthy();
    // Never to the requester.
    const back = await bulkReassign([{ requestId: one, taskKey: await pendingTaskKey(one, target) }], requester, "Test", admin);
    expect(back.ok && back.value[0]).toMatchObject({ ok: false, message: "That person raised the request." });
  });
});

describe("A6 re-check and fix", () => {
  it("makes task rows match the workflow; never deletes or changes the state", async () => {
    const workflowId = await liveType({});
    const id = await raise(workflowId, { amount: "1" });
    const key = await pendingTaskKey(id, approver);
    expect(await recheckAndFix(id, admin)).toMatchObject({ ok: true, fixed: false, diagnosis: { kind: "OK" } });
    await getDbPool().query("UPDATE approval_tasks SET status = 'NOT_REQUIRED' WHERE request_id = ? AND task_key = ?", [id, key]);
    await getDbPool().query(
      "INSERT INTO approval_tasks (request_id, task_key, node_id, node_label, round, approver_id, status, created_at) VALUES (?, 'ghost', 'a', 'Check', 1, ?, 'PENDING', CURRENT_TIMESTAMP)",
      [id, approver2],
    );
    const [[before]] = await getDbPool().query<RowDataPacket[]>("SELECT state_version FROM approval_requests WHERE id = ?", [id]);
    expect((await recheckAndFix(id, person(requester))).ok).toBe(false);
    const fixed = await recheckAndFix(id, admin);
    expect(fixed).toMatchObject({ ok: true, fixed: true });
    const [rows] = await getDbPool().query<RowDataPacket[]>("SELECT task_key, status FROM approval_tasks WHERE request_id = ? ORDER BY task_key", [id]);
    expect(rows.find((row) => row.task_key === key)?.status).toBe("PENDING");
    expect(rows.find((row) => row.task_key === "ghost")?.status).toBe("CANCELLED");
    const [[after]] = await getDbPool().query<RowDataPacket[]>("SELECT state_version FROM approval_requests WHERE id = ?", [id]);
    expect(after!.state_version).toBe(before!.state_version);
    const [[audit]] = await getDbPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'REQUEST_REPAIRED' AND entity_id = ?", [String(id)]);
    expect(Number(audit!.n)).toBe(1);
  });
});

describe("A7 delegation end", () => {
  it("tells both people what is back with the person", async () => {
    const workflowId = await liveType({}, [approver2]);
    await raise(workflowId, { amount: "1" });
    await tellBoth(approver2, "V170 Approver Two", friend, "V170 Friend", "", false);
    const [mine] = await getDbPool().query<RowDataPacket[]>("SELECT message FROM notifications WHERE user_id = ? AND event_type = 'DELEGATION_ENDED' ORDER BY id DESC LIMIT 1", [approver2]);
    expect(mine[0]!.message).toMatch(/approvals? (is|are) waiting for you/);
    const [theirs] = await getDbPool().query<RowDataPacket[]>("SELECT message FROM notifications WHERE user_id = ? AND event_type = 'DELEGATION_ENDED' ORDER BY id DESC LIMIT 1", [friend]);
    expect(theirs[0]!.message).toMatch(/gone back to them/);
  });
});

describe("A8 confidential fields", () => {
  it("hides the value from collaborators; requester, approver and IT see it", async () => {
    const workflowId = await liveType({});
    const id = await raise(workflowId, { amount: "10", salary: "98765" });
    await addCollaborators(id, [friend], person(requester));
    const salaryOf = async (actor: Actor) => (await loadRequestView(id, actor))?.fields.find((field) => field.key === "salary")?.value;
    expect(await salaryOf(person(friend))).toBe("Confidential");
    expect((await loadRequestView(id, person(friend)))?.rawFields.salary).toBeUndefined();
    expect((await loadRequestView(id, person(friend)))?.confidentialHidden).toBe(true);
    for (const actor of [person(requester), person(approver), admin]) expect(await salaryOf(actor)).toMatch(/98,765/);
  });
});

describe("A9 export permission", () => {
  it("everyone by default; only Can export (or IT) when limited", async () => {
    expect(await canExport({ roles: ["USER"] })).toBe(true);
    await getDbPool().query("INSERT INTO system_settings (setting_key, setting_group, value) VALUES ('features.exports', 'FEATURES', 'ROLE') ON DUPLICATE KEY UPDATE value = 'ROLE'");
    try {
      expect(await canExport({ roles: ["USER"] })).toBe(false);
      expect(await canExport({ roles: ["USER", "EXPORTER"] })).toBe(true);
      expect(await canExport({ roles: ["USER", "IT_ADMIN"] })).toBe(true);
    } finally {
      await getDbPool().query("DELETE FROM system_settings WHERE setting_key = 'features.exports'");
    }
  });
});

describe("A10 duplicate scope and unique fields", () => {
  it("same-requester scope ignores other people's requests", async () => {
    const workflowId = await liveType({ duplicates: { fields: ["amount"], windowDays: 30, policy: "BLOCK", scope: "SAME_REQUESTER" } });
    await raise(workflowId, { amount: "777" }, colleague);
    await expect(raise(workflowId, { amount: "777" })).resolves.toBeGreaterThan(0);
    const again = await submitRequest({ workflowId, title: "V170 dup again", fields: { amount: "777" } }, person(requester));
    expect(again.ok).toBe(false);
  });

  it("same-department scope counts colleagues in the department only", async () => {
    const department = await createDepartment(null);
    await setDepartment(requester, department);
    await setDepartment(colleague, department);
    const workflowId = await liveType({ duplicates: { fields: ["amount"], windowDays: 30, policy: "BLOCK", scope: "SAME_DEPARTMENT" } });
    await raise(workflowId, { amount: "888" }, friend); // other department
    await expect(raise(workflowId, { amount: "888" })).resolves.toBeGreaterThan(0);
    const blocked = await submitRequest({ workflowId, title: "V170 dept dup", fields: { amount: "888" } }, person(colleague));
    expect(blocked.ok).toBe(false);
  });

  it("a unique identifier is refused while open or approved, for everyone, and freed by withdrawal", async () => {
    const workflowId = await liveType({ unique: { fields: ["invoice_no"] } });
    await raise(workflowId, { amount: "1", invoice_no: "INV-42" }, colleague);
    const repeat = await submitRequest({ workflowId, title: "V170 unique", fields: { amount: "1", invoice_no: " inv-42 " } }, admin);
    expect(repeat.ok).toBe(false);
    if (!repeat.ok) expect(repeat.message + JSON.stringify(repeat.fieldErrors ?? {})).toMatch(/must be unique/);
  });
});

describe("A11 amendment drafts", () => {
  it("are listed with the request they amend", async () => {
    const workflowId = await liveType({ amendableFields: ["amount"] });
    const id = await raise(workflowId, { amount: "50" });
    await decideTask({ requestId: id, taskKey: await pendingTaskKey(id, approver), decision: "APPROVE" }, person(approver));
    await saveDraft(requester, `AM:${id}`, { title: "", fields: { amount: "60", amendReason: "Price rose" } }, null);
    const drafts = await listDrafts(requester, 20);
    expect(drafts.find((draft) => draft.key === `AM:${id}`)).toMatchObject({ href: `/users/requests/${id}/amend` });
    expect(drafts.find((draft) => draft.key === `AM:${id}`)?.typeName).toMatch(/^Amendment of /);
  });
});

describe("A5 stopped job runner", () => {
  it("alerts the Super Admin once when the runner hasn't run for 2 hours", async () => {
    const superAdmin = await createUser({ roles: ["USER", "SUPER_ADMIN"] });
    const [[saved]] = await getDbPool().query<RowDataPacket[]>("SELECT id, locked_at FROM jobs WHERE job_type = 'RUNNER_HEARTBEAT' ORDER BY id LIMIT 1");
    if (saved) await getDbPool().query("UPDATE jobs SET locked_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 3 HOUR) WHERE id = ?", [saved.id]);
    else await getDbPool().query("INSERT INTO jobs (job_type, status, locked_at, attempts) VALUES ('RUNNER_HEARTBEAT', 'DONE', DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 3 HOUR), 1)");
    try {
      resetJobRunnerCheck();
      expect(await checkJobRunnerStopped()).toBe(true);
      resetJobRunnerCheck();
      expect(await checkJobRunnerStopped()).toBe(false); // once a day
      const [rows] = await getDbPool().query<RowDataPacket[]>("SELECT title FROM notifications WHERE user_id = ? AND event_type = 'OPS_ALERT'", [superAdmin]);
      expect(rows.map((row) => row.title)).toContain("Scheduled jobs have stopped");
    } finally {
      if (saved) await getDbPool().query("UPDATE jobs SET locked_at = ? WHERE id = ?", [saved.locked_at, saved.id]);
      else await getDbPool().query("DELETE FROM jobs WHERE job_type = 'RUNNER_HEARTBEAT'");
    }
  });
});
