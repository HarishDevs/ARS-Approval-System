import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { createWorkflow, decideTask, publishVersion, resubmitRequest, submitRequest, withdrawRequest, type Actor } from "@/server/approvals/service";
import { findPublishedVersion, findWorkflow, listVersions, updateWorkflowSettings } from "@/lib/db/repositories/approvals.repository";
import { assessReadiness } from "@/server/approvals/readiness";
import { saveBudget } from "@/lib/db/repositories/budgets.repository";
import { findSubmissionCheck } from "@/lib/db/repositories/checks.repository";
import { financialYear, typeSettingsSchema } from "@/server/workflows/type-settings";
import { saveTemplate, listTemplates } from "@/lib/db/repositories/templates.repository";
import { prefill, reusableValues } from "@/server/approvals/autofill";
import type { FormField } from "@/server/forms/fields";
import { createDepartment, createUser, pendingTaskKey } from "./helpers";

// Unified prompt FN1/FN3/EN-09/FN4 on real MySQL: readiness, duplicates
// (incl. two submits at once), budgets, attachments, routing, templates.
let approver: number;
let raiser: number;
let other: number;
let admin: Actor;
let department: number;
let counter = 0;
const person = (id: number): Actor => ({ id, roles: ["USER"] });

const FORM: FormField[] = [
  { key: "invoice_no", label: "Invoice number", type: "TEXT", required: true },
  { key: "amount", label: "Amount", type: "NUMBER", required: true, min: 0 },
  { key: "kind", label: "Kind", type: "CHOICE", required: false, options: ["Capex", "Opex"] },
  { key: "dept", label: "Department", type: "LOOKUP", required: false, source: "DEPARTMENT" },
];

async function liveType(settings: Partial<Record<string, unknown>>, approvers: object = { type: "USER", userId: approver }): Promise<number> {
  const created = await createWorkflow(
    {
      code: `RDY_${Date.now()}_${++counter}`,
      name: `Readiness ${counter}`,
      kind: "PREDEFINED",
      requestPrefix: "RD",
      form: FORM,
      definition: {
        nodes: [
          { id: "start", kind: "START", label: "Start" },
          { id: "a", kind: "APPROVAL", label: "Check", approvers: [approvers as never], completion: { type: "ALL" } },
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

const submit = (workflowId: number, actor: Actor, fields: Record<string, string>, extra: Record<string, unknown> = {}) =>
  submitRequest({ workflowId, title: `Order ${++counter}`, fields, ...extra }, actor);

beforeAll(async () => {
  approver = await createUser({ name: "Ready Approver" });
  const adminId = await createUser({ roles: ["USER", "IT_ADMIN"] });
  admin = { id: adminId, roles: ["USER", "IT_ADMIN"] };
  department = await createDepartment(null);
  raiser = await createUser({ name: "Ready Raiser", departmentId: department });
  other = await createUser({ name: "Ready Other" });
});

afterAll(async () => {
  await getDbPool().end();
});

describe("possible duplicates (FN3)", () => {
  it("warn: confirm and give a reason; the reason is kept and audited; others see no details", async () => {
    const type = await liveType({ duplicates: { fields: ["invoice_no"], windowDays: 30, policy: "WARN" } });
    expect((await submit(type, person(raiser), { invoice_no: "INV-001", amount: "100" })).ok).toBe(true);
    const again = await submit(type, person(raiser), { invoice_no: "inv-001", amount: "100" });
    expect(again).toMatchObject({ ok: false, fieldErrors: { allowDuplicate: expect.any(String) } });
    if (again.ok) return;
    const item = again.readiness!.items.find((entry) => entry.code === "DUPLICATE")!;
    expect(item.severity).toBe("WARNING");
    expect(item.candidates![0]!.requestNo).toMatch(/^RD-/);
    const noReason = await submit(type, person(raiser), { invoice_no: "INV-001", amount: "100" }, { acknowledged: true });
    expect(!noReason.ok && noReason.fieldErrors).toHaveProperty("overrideReason");
    const done = await submit(type, person(raiser), { invoice_no: "INV-001", amount: "100" }, { acknowledged: true, overrideReason: "Second site delivery" });
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect((await findSubmissionCheck(done.value.requestId))?.overrideReason).toBe("Second site delivery");
    const [[audit]] = await getDbPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'DUPLICATE_WARNING_OVERRIDDEN' AND entity_id = ?", [String(done.value.requestId)]);
    expect(Number(audit!.n)).toBe(1);
    // Someone who can't open the earlier one learns only that a match exists.
    const theirs = await submit(type, person(other), { invoice_no: "INV-001", amount: "100" });
    expect(!theirs.ok && theirs.readiness?.items.find((entry) => entry.code === "DUPLICATE")?.candidates?.[0]).toMatchObject({ id: null, requestNo: null });
  });

  it("block: requesters can't submit; IT can, with a reason", async () => {
    const type = await liveType({ duplicates: { fields: ["invoice_no"], windowDays: 30, policy: "BLOCK" } });
    expect((await submit(type, person(raiser), { invoice_no: "INV-B", amount: "1" })).ok).toBe(true);
    const blocked = await submit(type, person(raiser), { invoice_no: "INV-B", amount: "1" }, { acknowledged: true, overrideReason: "please" });
    expect(blocked.ok).toBe(false);
    expect(!blocked.ok && blocked.readiness?.status).toBe("BLOCKED");
    expect((await submit(type, admin, { invoice_no: "INV-B", amount: "1" }, { acknowledged: true, overrideReason: "Genuine repeat order" })).ok).toBe(true);
  });

  it("two submits at the same moment: the type lock lets only one through unconfirmed", async () => {
    const type = await liveType({ duplicates: { fields: ["invoice_no"], windowDays: 30, policy: "WARN" } });
    const [a, b] = await Promise.all([submit(type, person(raiser), { invoice_no: "INV-RACE", amount: "5" }), submit(type, person(raiser), { invoice_no: "INV-RACE", amount: "5" })]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
  });
});

describe("budget (EN-09)", () => {
  it("within, near the limit, over (confirm), and withdrawn requests stop counting; no budget is said plainly", async () => {
    const type = await liveType({ budget: { enabled: true, amountField: "amount" } });
    const fy = financialYear(new Date());
    // No budget loaded yet: a warning, never "unlimited".
    const none = await submit(type, person(raiser), { invoice_no: "B-0", amount: "10" });
    expect(!none.ok && none.readiness?.items.some((item) => item.code === "BUDGET" && /No budget is loaded/.test(item.message))).toBe(true);
    await saveBudget({ departmentId: department, fy, amountPaise: 100000_00, warnPercent: 90, userId: admin.id });
    const first = await submit(type, person(raiser), { invoice_no: "B-1", amount: "60000" });
    expect(first.ok).toBe(true);
    const near = await submit(type, person(raiser), { invoice_no: "B-2", amount: "35000" });
    expect(near.ok).toBe(true); // 95 %: a note, no confirmation needed
    const over = await submit(type, person(raiser), { invoice_no: "B-3", amount: "10000" });
    expect(!over.ok && over.readiness?.budget).toMatchObject({ state: "OVER", committedPaise: 95000_00, requestPaise: 10000_00 });
    // Withdraw the first: 60,000 no longer counts, so it fits.
    if (first.ok) await withdrawRequest({ requestId: first.value.requestId, reason: "Not needed" }, person(raiser));
    const fits = await submit(type, person(raiser), { invoice_no: "B-4", amount: "10000" });
    expect(fits.ok).toBe(true);
    if (fits.ok) expect((await findSubmissionCheck(fits.value.requestId))?.budget).toMatchObject({ state: "OK", committedPaise: 35000_00 });
  });

  it("over budget is refused when the Super Admin chose BLOCK", async () => {
    const type = await liveType({ budget: { enabled: true, amountField: "amount" } });
    await getDbPool().query("INSERT INTO system_settings (setting_key, setting_group, value) VALUES ('general.budget_policy', 'GENERAL', 'BLOCK') ON DUPLICATE KEY UPDATE value = 'BLOCK'");
    try {
      const result = await submit(type, person(raiser), { invoice_no: "B-9", amount: "1000000" }, { acknowledged: true });
      expect(!result.ok && result.readiness?.status).toBe("BLOCKED");
    } finally {
      await getDbPool().query("DELETE FROM system_settings WHERE setting_key = 'general.budget_policy'");
    }
  });
});

describe("documents and routing (FN1)", () => {
  it("missing files block; a step nobody can approve is a warning", async () => {
    const type = await liveType({ attachments: { minimum: 1, note: "the quote" } }, { type: "ROLE", roleCode: "NOBODY_HAS_THIS" });
    const workflow = (await findWorkflow(type))!;
    // Validation refuses to publish a step nobody can ever approve, so the draft is checked.
    const version = (await findPublishedVersion(type)) ?? (await listVersions(type))[0]!;
    const { readiness } = await assessReadiness({ workflow, version, title: "Readiness check", fields: { invoice_no: "X", amount: "5" }, attachmentCount: 0, requester: person(raiser) });
    expect(readiness.status).toBe("BLOCKED");
    expect(readiness.items.find((item) => item.code === "DOCUMENTS")).toMatchObject({ field: "attachments", message: expect.stringMatching(/the quote/) });
    expect(readiness.items.find((item) => item.code === "ROUTING")?.severity).toBe("WARNING");
    const withFile = await assessReadiness({ workflow, version, title: "Readiness check", fields: { invoice_no: "X", amount: "5" }, attachmentCount: 1, requester: person(raiser) });
    expect(withFile.readiness.status).toBe("WARNINGS");
  });
});

describe("autofill and templates (FN4)", () => {
  it("profile fills the department; a template is the owner's only and drops values that no longer fit", async () => {
    const type = await liveType({});
    const [[dept]] = await getDbPool().query<RowDataPacket[]>("SELECT code FROM departments WHERE id = ?", [department]);
    const filled = await prefill({ user: person(raiser), workflowId: type, form: FORM });
    expect(filled.values.dept).toBe(String(dept!.code));
    expect(filled.sources.dept).toBe("profile");

    await saveTemplate({ userId: raiser, workflowId: type, name: "Monthly", title: "Monthly order", fields: { invoice_no: "T-1", kind: "Services", amount: "50" } });
    const [template] = await listTemplates(raiser, type);
    expect(await listTemplates(other, type)).toEqual([]);
    const fromTemplate = await prefill({ user: person(raiser), workflowId: type, form: FORM, templateId: template!.id });
    expect(fromTemplate.values).toMatchObject({ invoice_no: "T-1", amount: "50" });
    expect(fromTemplate.values.kind).toBeUndefined(); // "Services" is no longer a choice
    expect(fromTemplate.dropped).toBe(1);
    // Line items keep their rows (the editor reads key__lines), not just the total.
    const lineForm: FormField[] = [{ key: "items", label: "Items", type: "LINE_ITEMS", required: false }];
    const rows = JSON.stringify([{ description: "Gearbox", quantity: "1", rate: "100", gst: "", amountPaise: 10000, taxPaise: 0, totalPaise: 10000 }]);
    expect(reusableValues(lineForm, { fields: { items: "100", items__lines: rows } }).values).toEqual({ items: "100", items__lines: rows });
    // Someone else's template id gives nothing.
    expect((await prefill({ user: person(other), workflowId: type, form: FORM, templateId: template!.id })).origin).toBeNull();
  });
});

// D-248 (V181-A1, audit AUD-11): a resubmit with new values passes the same
// blocking checks as a submit; the request itself never counts against itself.
describe("resubmit is checked like a submit", () => {
  it("a must-be-unique value already used elsewhere is refused on resubmit; keeping its own value is fine", async () => {
    const workflowId = await liveType({ unique: { fields: ["invoice_no"] } });
    const tag = Date.now().toString(36).toUpperCase();
    const first = await submit(workflowId, person(raiser), { invoice_no: `A-${tag}`, amount: "10" });
    const second = await submit(workflowId, person(raiser), { invoice_no: `B-${tag}`, amount: "10" });
    if (!first.ok || !second.ok) throw new Error("setup");
    const asked = await decideTask({ requestId: second.value.requestId, taskKey: await pendingTaskKey(second.value.requestId, approver), decision: "REQUEST_CHANGES", comment: "Fix the amount" }, person(approver));
    expect(asked).toMatchObject({ ok: true });
    const clash = await resubmitRequest({ requestId: second.value.requestId, fields: { invoice_no: `A-${tag}`, amount: "12" } }, person(raiser));
    expect(clash).toMatchObject({ ok: false });
    const own = await resubmitRequest({ requestId: second.value.requestId, fields: { invoice_no: `B-${tag}`, amount: "12" } }, person(raiser));
    expect(own).toMatchObject({ ok: true });
  });
});
