import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { createWorkflow, publishVersion, submitRequest, withdrawRequest, type Actor } from "@/server/approvals/service";
import { deleteRequest } from "@/server/approvals/delete";
import { createHold, isHeld, listHolds, releaseHold, retentionDryRun } from "@/server/ops/governance";
import { createUser } from "./helpers";

// Unified prompt FN10 on real MySQL: legal holds and the retention dry run.
let approver: number;
let requester: number;
let requesterLogin: string;
let superAdmin: Actor;
let workflowCode: string;
let workflowId: number;
const person = (id: number): Actor => ({ id, roles: ["USER"] });

async function raise(title: string): Promise<{ id: number; no: string }> {
  const result = await submitRequest({ workflowId, title, fields: { amount: "1" } }, person(requester));
  if (!result.ok) throw new Error(result.message);
  return { id: result.value.requestId, no: result.value.requestNo };
}

beforeAll(async () => {
  approver = await createUser({ name: "Gov Approver" });
  requester = await createUser({ name: "Gov Requester" });
  const [[row]] = await getDbPool().query<RowDataPacket[]>("SELECT login_id FROM users WHERE id = ?", [requester]);
  requesterLogin = String(row!.login_id);
  const adminId = await createUser({ roles: ["USER", "IT_ADMIN", "SUPER_ADMIN"] });
  superAdmin = { id: adminId, roles: ["USER", "IT_ADMIN", "SUPER_ADMIN"] };
  workflowCode = `GOV_${Date.now()}`;
  const created = await createWorkflow(
    {
      code: workflowCode,
      name: "Governance type",
      kind: "PREDEFINED",
      requestPrefix: "GV",
      form: [{ key: "amount", label: "Amount", type: "NUMBER", required: true }],
      definition: {
        nodes: [
          { id: "start", kind: "START", label: "Start" },
          { id: "a", kind: "APPROVAL", label: "Check", approvers: [{ type: "USER", userId: approver }], completion: { type: "ALL" } },
          { id: "end", kind: "END", label: "End" },
        ],
        edges: [
          { id: "e1", from: "start", to: "a" },
          { id: "e2", from: "a", to: "end" },
        ],
      },
    },
    superAdmin,
  );
  if (!created.ok) throw new Error(created.message);
  await publishVersion(created.value.versionId, superAdmin);
  workflowId = created.value.workflowId;
});

afterAll(async () => {
  await getDbPool().end();
});

const ownerLogin = async () => {
  const [[row]] = await getDbPool().query<RowDataPacket[]>("SELECT login_id FROM users WHERE id = ?", [superAdmin.id]);
  return String(row!.login_id);
};

describe("legal holds (FN10)", () => {
  it("only the Super Admin places a hold, with a reference and a reason", async () => {
    const request = await raise("Gov one");
    expect(await createHold({ reference: "Case 1", reason: "Vendor dispute pending", scopeType: "REQUEST", scope: request.no, ownerLogin: await ownerLogin() }, { id: approver, roles: ["USER", "IT_ADMIN"] })).toMatchObject({ ok: false });
    expect(await createHold({ reference: "Case 1", reason: "short", scopeType: "REQUEST", scope: request.no, ownerLogin: await ownerLogin() }, superAdmin)).toMatchObject({ ok: false, field: "reason" });
    expect(await createHold({ reference: "Case 1", reason: "Vendor dispute pending", scopeType: "REQUEST", scope: "NOPE-1", ownerLogin: await ownerLogin() }, superAdmin)).toMatchObject({ ok: false, field: "scope" });
  });

  it("a held request can't be deleted, even by the Super Admin; after release it can", async () => {
    const request = await raise("Gov two");
    const hold = await createHold({ reference: "Case 2", reason: "Internal audit of this order", scopeType: "REQUEST", scope: request.no, ownerLogin: await ownerLogin() }, superAdmin);
    expect(hold.ok).toBe(true);
    if (!hold.ok) return;
    expect(await isHeld(request.id)).toBe(true);
    expect(await deleteRequest({ requestId: request.id, reason: "Raised by mistake" }, superAdmin)).toMatchObject({ ok: false, code: "LEGAL_HOLD" });
    expect(await releaseHold({ id: hold.id, reason: "short" }, superAdmin)).toMatchObject({ ok: false });
    expect(await releaseHold({ id: hold.id, reason: "Audit closed, no findings" }, superAdmin)).toEqual({ ok: true });
    expect(await releaseHold({ id: hold.id, reason: "Audit closed, no findings" }, superAdmin)).toMatchObject({ ok: false });
    expect(await isHeld(request.id)).toBe(false);
    expect((await deleteRequest({ requestId: request.id, reason: "Raised by mistake" }, superAdmin)).ok).toBe(true);
    const [[audit]] = await getDbPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM audit_logs WHERE action IN ('LEGAL_HOLD_CREATED', 'LEGAL_HOLD_RELEASED') AND entity_id = ?", [String(hold.id)]);
    expect(Number(audit!.n)).toBe(2);
  });

  it("a hold on a person or an approval type covers all their requests, and overlapping holds stay until both are released", async () => {
    const request = await raise("Gov three");
    const byPerson = await createHold({ reference: "Case 3", reason: "Employment matter for this person", scopeType: "REQUESTER", scope: requesterLogin, ownerLogin: await ownerLogin() }, superAdmin);
    const byType = await createHold({ reference: "Case 4", reason: "Regulator review of this approval type", scopeType: "WORKFLOW", scope: workflowCode, ownerLogin: await ownerLogin() }, superAdmin);
    expect(byPerson.ok && byType.ok).toBe(true);
    if (!byPerson.ok || !byType.ok) return;
    expect(await isHeld(request.id)).toBe(true);
    expect((await listHolds(false)).find((hold) => hold.id === byPerson.id)?.covered).toBeGreaterThanOrEqual(2);
    await releaseHold({ id: byPerson.id, reason: "Matter closed for this person" }, superAdmin);
    expect(await isHeld(request.id)).toBe(true); // the type hold still applies
    await releaseHold({ id: byType.id, reason: "Regulator review finished" }, superAdmin);
    expect(await isHeld(request.id)).toBe(false);
  });
});

describe("retention dry run (FN10)", () => {
  it("not set means kept for ever; with a duration it counts eligible and held records, changing nothing", async () => {
    expect((await retentionDryRun()).find((row) => row.key === "requests")).toMatchObject({ duration: 0, eligible: 0 });
    const old = await raise("Gov old");
    const kept = await raise("Gov old held");
    for (const item of [old, kept]) await withdrawRequest({ requestId: item.id, reason: "Not needed" }, person(requester));
    await getDbPool().query("UPDATE approval_requests SET closed_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 3 YEAR) WHERE id IN (?, ?)", [old.id, kept.id]);
    await createHold({ reference: "Case 5", reason: "Keep this old record for the audit", scopeType: "REQUEST", scope: kept.no, ownerLogin: await ownerLogin() }, superAdmin);
    await getDbPool().query("INSERT INTO system_settings (setting_key, setting_group, value) VALUES ('retention.requests_years', 'RETENTION', '2') ON DUPLICATE KEY UPDATE value = '2'");
    try {
      const row = (await retentionDryRun()).find((item) => item.key === "requests")!;
      expect(row.duration).toBe(2);
      expect(row.eligible).toBeGreaterThanOrEqual(1);
      expect(row.held).toBeGreaterThanOrEqual(1);
      const [[count]] = await getDbPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM approval_requests WHERE id IN (?, ?) AND deleted_at IS NULL", [old.id, kept.id]);
      expect(Number(count!.n)).toBe(2); // nothing changed
    } finally {
      await getDbPool().query("DELETE FROM system_settings WHERE setting_key = 'retention.requests_years'");
    }
  });
});
