import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { createWorkflow, decideTask, publishVersion, submitRequest, withdrawRequest, type Actor } from "@/server/approvals/service";
import { findRequest, updateWorkflowSettings } from "@/lib/db/repositories/approvals.repository";
import { effectiveValues, listAmendments, submitAmendment } from "@/server/approvals/amendments";
import { typeSettingsSchema, financialYear } from "@/server/workflows/type-settings";
import { saveBudget } from "@/lib/db/repositories/budgets.repository";
import { findSubmissionCheck } from "@/lib/db/repositories/checks.repository";
import type { FormField } from "@/server/forms/fields";
import { createDepartment, createUser, pendingTaskKey } from "./helpers";

// Unified prompt FN5 on real MySQL: amendments of approved requests.
let approver: number;
let requester: number;
let other: number;
let admin: Actor;
let department: number;
let counter = 0;
const person = (id: number): Actor => ({ id, roles: ["USER"] });

const FORM: FormField[] = [
  { key: "invoice_no", label: "Invoice number", type: "TEXT", required: true },
  { key: "amount", label: "Amount", type: "NUMBER", required: true, min: 0 },
];

async function liveType(settings: Record<string, unknown>): Promise<number> {
  const created = await createWorkflow(
    {
      code: `AMD_${Date.now()}_${++counter}`,
      name: `Amend ${counter}`,
      kind: "PREDEFINED",
      requestPrefix: "AM",
      form: FORM,
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
    admin,
  );
  if (!created.ok) throw new Error(created.message);
  await publishVersion(created.value.versionId, admin);
  await updateWorkflowSettings(created.value.workflowId, typeSettingsSchema.parse(settings));
  return created.value.workflowId;
}

async function approve(requestId: number) {
  const result = await decideTask({ requestId, taskKey: await pendingTaskKey(requestId, approver), decision: "APPROVE" }, person(approver));
  if (!result.ok) throw new Error(result.message);
}

async function approvedRequest(type: number, fields: Record<string, string>, extra: Record<string, unknown> = {}): Promise<number> {
  const result = await submitRequest({ workflowId: type, title: `Order ${++counter}`, fields, ...extra }, person(requester));
  if (!result.ok) throw new Error(result.message);
  await approve(result.value.requestId);
  return result.value.requestId;
}

const amend = (originalId: number, fields: Record<string, string>, extra: Record<string, unknown> = {}, actor: Actor = person(requester)) =>
  submitAmendment({ originalId, fields, reason: "Vendor revised the quote", ...extra }, actor);

beforeAll(async () => {
  approver = await createUser({ name: "Amend Approver" });
  const adminId = await createUser({ roles: ["USER", "IT_ADMIN"] });
  admin = { id: adminId, roles: ["USER", "IT_ADMIN"] };
  department = await createDepartment(null);
  requester = await createUser({ name: "Amend Requester", departmentId: department });
  other = await createUser({ name: "Amend Other" });
});

afterAll(async () => {
  await getDbPool().end();
});

describe("amending an approved request (FN5)", () => {
  it("changes only allowed fields, goes through approval again, and keeps the original intact", async () => {
    const type = await liveType({ amendableFields: ["amount"] });
    const original = await approvedRequest(type, { invoice_no: "INV-A1", amount: "100" });
    // A change to a field that can't be amended is ignored, so nothing changed.
    const ignored = await amend(original, { invoice_no: "HACKED", amount: "100" });
    expect(ignored).toMatchObject({ ok: false, fieldErrors: { amendment: expect.stringMatching(/Nothing has changed/) } });
    // Too short a reason.
    expect(await amend(original, { amount: "150" }, { reason: "x" })).toMatchObject({ ok: false, fieldErrors: { amendReason: expect.any(String) } });

    const first = await amend(original, { invoice_no: "HACKED", amount: "150" });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const amendment = (await findRequest(first.value.requestId))!;
    expect(amendment.formData).toMatchObject({ invoice_no: "INV-A1", amount: 150 });
    expect(amendment.status).toBe("IN_PROGRESS"); // re-approval required
    expect((await listAmendments(original))[0]).toMatchObject({ amendmentId: first.value.requestId, changes: [{ key: "amount", from: 100, to: 150 }] });
    // One at a time.
    expect(await amend(original, { amount: "175" })).toMatchObject({ ok: false, fieldErrors: { amendment: expect.stringMatching(/still in progress/) } });
    // Until approved, the values in force are the original's.
    expect((await effectiveValues((await findRequest(original))!)).data.amount).toBe(100);
    await approve(first.value.requestId);
    expect((await effectiveValues((await findRequest(original))!)).data.amount).toBe(150);
    // The original request itself is untouched.
    const kept = (await findRequest(original))!;
    expect(kept.formData.amount).toBe(100);
    expect(kept.status).toBe("APPROVED");
    const [[audit]] = await getDbPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'AMENDMENT_SUBMITTED' AND entity_id = ?", [String(original)]);
    expect(Number(audit!.n)).toBe(1);
  });

  it("a rejected or withdrawn amendment changes nothing; the next one amends the values in force", async () => {
    const type = await liveType({ amendableFields: ["amount"] });
    const original = await approvedRequest(type, { invoice_no: "INV-R1", amount: "500" });
    const rejected = await amend(original, { amount: "900" });
    if (!rejected.ok) throw new Error(rejected.message);
    await decideTask({ requestId: rejected.value.requestId, taskKey: await pendingTaskKey(rejected.value.requestId, approver), decision: "REJECT", comment: "Too much" }, person(approver));
    expect((await effectiveValues((await findRequest(original))!)).data.amount).toBe(500);
    const withdrawn = await amend(original, { amount: "800" });
    if (!withdrawn.ok) throw new Error(withdrawn.message);
    await withdrawRequest({ requestId: withdrawn.value.requestId, reason: "Not needed" }, person(requester));
    expect((await effectiveValues((await findRequest(original))!)).data.amount).toBe(500);
    const third = await amend(original, { amount: "550" });
    expect(third.ok).toBe(true);
    if (third.ok) expect((await listAmendments(original))[0]!.changes).toEqual([{ key: "amount", from: 500, to: 550 }]);
  });

  it("only the requester, only approved requests, only types that allow it; two at once make one", async () => {
    const closed = await liveType({});
    const type = await liveType({ amendableFields: ["amount"] });
    const original = await approvedRequest(type, { invoice_no: "INV-P1", amount: "10" });
    expect(await amend(original, { amount: "20" }, {}, person(other))).toMatchObject({ ok: false, message: "Not found." });
    expect(await amend(original, { amount: "20" }, {}, person(approver))).toMatchObject({ ok: false, message: "Not found." });
    const notAllowed = await approvedRequest(closed, { invoice_no: "INV-P2", amount: "10" });
    expect(await amend(notAllowed, { amount: "20" })).toMatchObject({ ok: false, message: expect.stringMatching(/doesn't allow amendments/) });
    const pending = await submitRequest({ workflowId: type, title: "Pending one", fields: { invoice_no: "INV-P3", amount: "1" } }, person(requester));
    if (pending.ok) expect(await amend(pending.value.requestId, { amount: "2" })).toMatchObject({ ok: false, message: expect.stringMatching(/Only an approved request/) });
    const [a, b] = await Promise.all([amend(original, { amount: "30" }), amend(original, { amount: "40" })]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
  });

  it("isn't flagged as a duplicate of its original; counts only its change against the budget", async () => {
    const type = await liveType({ amendableFields: ["amount"], duplicates: { fields: ["invoice_no"], windowDays: 30, policy: "BLOCK" }, budget: { enabled: true, amountField: "amount" } });
    await saveBudget({ departmentId: department, fy: financialYear(new Date()), amountPaise: 10_000_00, warnPercent: 90, userId: admin.id });
    const original = await approvedRequest(type, { invoice_no: "INV-B1", amount: "1000" }, { acknowledged: true });
    const up = await amend(original, { amount: "1500" });
    expect(up.ok).toBe(true);
    if (!up.ok) return;
    expect((await findSubmissionCheck(up.value.requestId))?.budget).toMatchObject({ requestPaise: 500_00, committedPaise: 1000_00 });
    await approve(up.value.requestId);
    // A reduction counts only once approved.
    const down = await amend(original, { amount: "400" });
    if (!down.ok) throw new Error(down.message);
    expect((await findSubmissionCheck(down.value.requestId))?.budget.requestPaise).toBe(-1100_00);
    const committed = async () => {
      const [[row]] = await getDbPool().query<RowDataPacket[]>(
        `SELECT COALESCE(SUM(CASE WHEN c.request_paise < 0 AND r.status <> 'APPROVED' THEN 0 ELSE c.request_paise END), 0) AS paise
         FROM request_submission_checks c JOIN approval_requests r ON r.id = c.request_id
         WHERE c.budget_department = ? AND r.status IN ('IN_PROGRESS','ON_HOLD','CHANGES_REQUIRED','APPROVED') AND r.id IN (?, ?, ?)`,
        [department, original, up.value.requestId, down.value.requestId],
      );
      return Number(row!.paise);
    };
    expect(await committed()).toBe(1500_00);
    await approve(down.value.requestId);
    expect(await committed()).toBe(400_00);
  });
});
