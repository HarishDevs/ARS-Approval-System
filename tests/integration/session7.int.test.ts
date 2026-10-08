import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { findActiveTemplate, versionsFor } from "@/lib/db/repositories/whatsapp.repository";
import { createWorkflow, decideTask, publishVersion, submitRequest, type Actor } from "@/server/approvals/service";
import { saveSettingsGroup } from "@/server/settings/save";
import { saveDraft, sendTemplateTest, submitDraft, syncStatuses } from "@/server/notifications/template-registry";
import type { BuilderSpec } from "@/server/workflows/builder";
import { createUser, pendingTaskKey } from "./helpers";

// Session 7: DoA matrix per approval type (D-075) and the WhatsApp template
// creator against a fake CEOITBox (D-076). Test-only values throughout.
let adminId: number;
let requester: number;
let manager: number;
let finance: number;
let director: number;
const superAdmin = () => ({ id: adminId, roles: ["USER", "IT_ADMIN", "SUPER_ADMIN"] as const, sessionId: null });
const person = (id: number): Actor => ({ id, roles: ["USER"] });

beforeAll(async () => {
  adminId = await createUser({ name: "IT 7", roles: ["USER", "IT_ADMIN", "SUPER_ADMIN"] });
  manager = await createUser({ name: "Manager 7" });
  requester = await createUser({ name: "Requester 7", managerId: manager });
  finance = await createUser({ name: "Finance 7" });
  director = await createUser({ name: "Director 7" });
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await getDbPool().end();
});

describe("DoA matrix per approval type (D-075)", () => {
  const spec = (): BuilderSpec => ({
    stages: [
      {
        kind: "DOA",
        id: "doa",
        label: "DoA",
        field: "amount",
        limits: [50000, 500000],
        levels: [
          { step: { id: "mgr", label: "Manager", approvers: { kind: "REQUESTER_MANAGER" }, rule: "ALL" }, bands: [true, true, true] },
          { step: { id: "fin", label: "Finance", approvers: { kind: "PEOPLE", userIds: [finance] }, rule: "ALL" }, bands: [false, true, false] },
          { step: { id: "dir", label: "Director", approvers: { kind: "PEOPLE", userIds: [director] }, rule: "ALL" }, bands: [false, false, true] },
        ],
      },
    ],
  });
  const create = (required: boolean) =>
    createWorkflow(
      { code: `S7_${Date.now().toString(36)}_${required ? "R" : "O"}`.toUpperCase(), name: "S7 DoA", kind: "PREDEFINED", requestPrefix: "SVN", builder: spec(), form: [{ key: "amount", label: "Amount (₹)", type: "NUMBER", required }] },
      { id: adminId, roles: ["USER", "IT_ADMIN"] },
    );

  it("an approval type can't save a DoA whose amount isn't required", async () => {
    expect(await create(false)).toMatchObject({ ok: false, code: "INVALID_BUILDER", message: expect.stringContaining("required") });
  });

  it("routes each request by its band, including non-cumulative levels", async () => {
    const created = await create(true);
    if (!created.ok) throw new Error(created.message);
    expect(await publishVersion(created.value.versionId, { id: adminId, roles: ["USER", "IT_ADMIN"] })).toMatchObject({ ok: true });
    const raise = async (amount: string) => {
      const result = await submitRequest({ workflowId: created.value.workflowId, title: `Amount ${amount}`, fields: { amount } }, person(requester));
      if (!result.ok) throw new Error(result.message);
      const id = result.value.requestId;
      await decideTask({ requestId: id, taskKey: await pendingTaskKey(id, manager), decision: "APPROVE" }, person(manager));
      const [rows] = await getDbPool().query<(RowDataPacket & { approver_id: number })[]>("SELECT approver_id FROM approval_tasks WHERE request_id = ? AND status = 'PENDING'", [id]);
      return rows.map((row) => row.approver_id);
    };
    expect(await raise("50,000")).toEqual([]); // manager only: approved
    expect(await raise("2,00,000")).toEqual([finance]);
    expect(await raise("9,00,000")).toEqual([director]); // finance not needed above ₹5L
  });
});

describe("WhatsApp template creator (D-076)", () => {
  const meta = new Map<string, { status: string; reason?: string }>();
  const calls: { method: string; path: string; body: unknown }[] = [];

  beforeAll(async () => {
    await saveSettingsGroup("WHATSAPP", { "whatsapp.ceoitbox_api_key": "test-only-key" }, new Set(), { userId: adminId, sessionId: "s7", ipAddress: null });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        const path = new URL(url).pathname;
        const body = init.body ? JSON.parse(String(init.body)) : null;
        calls.push({ method: init.method ?? "GET", path, body });
        if (path === "/api/v1/messageTemplate/create") {
          meta.set(body.name, { status: "PENDING" });
          return new Response(JSON.stringify({ success: true, message: "Message template created successfully" }), { status: 200 });
        }
        if (path === "/api/v1/whatsapp/syncTemplatesFromMeta") return new Response("", { status: 200 });
        if (path === "/api/v1/messageTemplate/getTemplates") {
          const results = [...meta].map(([name, value]) => ({ id: name, template: { name, language: "en", category: "UTILITY", status: value.status, rejected_reason: value.reason ?? "NONE" } }));
          return new Response(JSON.stringify({ results, total: results.length }), { status: 200 });
        }
        if (path === "/api/v1/whatsapp/sendMessage") return new Response(JSON.stringify({ id: "1", waMessageId: "wamid.test" }), { status: 200 });
        return new Response("{}", { status: 404 });
      }),
    );
  });

  const BODY = "Hello, {{requester_name}} needs your approval for {{request_no}}: {{title}}. Open: {{link}} — ARS";

  it("only the Super Admin can use it", async () => {
    expect(await saveDraft("WA_APPROVAL_NEEDED_V1", { name: "x_v1", category: "UTILITY", body: BODY, footer: "" }, { id: adminId, roles: ["USER", "IT_ADMIN"], sessionId: null })).toMatchObject({ ok: false, message: "Not found." });
  });

  it("draft → submit → Meta approves → live; a change becomes v2 and replaces v1 once approved", async () => {
    const code = "WA_APPROVAL_NEEDED_V1";
    expect(await saveDraft(code, { name: "ars_s7_needed_v1", category: "UTILITY", body: BODY, footer: "ARS Steels" }, superAdmin())).toMatchObject({ ok: true, value: { version: 1 } });
    // Editing an unsent draft updates it in place.
    expect(await saveDraft(code, { name: "ars_s7_needed_v1", category: "UTILITY", body: BODY.replace("Hello", "Hi"), footer: "ARS Steels" }, superAdmin())).toMatchObject({ ok: true, value: { version: 1 } });

    expect(await submitDraft(code, superAdmin())).toMatchObject({ ok: true });
    const create = calls.find((call) => call.path === "/api/v1/messageTemplate/create")!;
    expect(create.body).toEqual({
      name: "ars_s7_needed_v1",
      language: "en",
      category: "UTILITY",
      components: [
        { type: "BODY", text: "Hi, {{1}} needs your approval for {{2}}: {{3}}. Open: {{4}} — ARS", example: { body_text: [["Ravi Kumar", "PUR-2026-000123", "Laptop for the new engineer", "https://approvals.arssteels.net/users/requests/123"]] } },
        { type: "FOOTER", text: "ARS Steels" },
      ],
    });
    expect(await submitDraft(code, superAdmin())).toMatchObject({ ok: false }); // nothing new to submit

    expect(await syncStatuses(superAdmin())).toMatchObject({ ok: true, value: { pending: 1, approved: 0 } });
    expect(await findActiveTemplate("APPROVAL_NEEDED")).toBeNull();
    meta.set("ars_s7_needed_v1", { status: "APPROVED" });
    expect(await syncStatuses(superAdmin())).toMatchObject({ ok: true, value: { approved: 1 } });
    expect(await findActiveTemplate("APPROVAL_NEEDED")).toMatchObject({ providerName: "ars_s7_needed_v1", variableKeys: ["requester_name", "request_no", "title", "link"] });

    // Same name again → saved as _v2; v1 keeps sending until v2 is approved.
    const v2 = await saveDraft(code, { name: "ars_s7_needed_v1", category: "UTILITY", body: "New: {{title}} ({{request_no}}) is waiting for you. Open {{link}} please.", footer: "" }, superAdmin());
    expect(v2).toMatchObject({ ok: true, value: { version: 2, name: "ars_s7_needed_v2" } });
    await submitDraft(code, superAdmin());
    await syncStatuses(superAdmin());
    expect((await findActiveTemplate("APPROVAL_NEEDED"))?.providerName).toBe("ars_s7_needed_v1");
    meta.set("ars_s7_needed_v2", { status: "APPROVED" });
    await syncStatuses(superAdmin());
    expect(await findActiveTemplate("APPROVAL_NEEDED")).toMatchObject({ providerName: "ars_s7_needed_v2", variableKeys: ["title", "request_no", "link"] });
    expect((await versionsFor(code)).map((version) => version.status)).toEqual(["RETIRED", "ACTIVE"]);
  });

  it("a rejection shows Meta's reason", async () => {
    const code = "WA_REQUEST_APPROVED_V1";
    await saveDraft(code, { name: "ars_s7_approved_v1", category: "UTILITY", body: "Good news: {{request_no}} ({{title}}) is approved. Details {{link}} here.", footer: "" }, superAdmin());
    await submitDraft(code, superAdmin());
    meta.set("ars_s7_approved_v1", { status: "REJECTED", reason: "INVALID_FORMAT" });
    expect(await syncStatuses(superAdmin())).toMatchObject({ ok: true, value: { rejected: 1 } });
    expect((await versionsFor(code)).at(-1)).toMatchObject({ approvalStatus: "REJECTED", rejectionReason: "INVALID_FORMAT" });
    expect(await findActiveTemplate("REQUEST_APPROVED")).toBeNull();
  });

  it("a test goes only to the Super Admin's own number, with the samples", async () => {
    expect(await sendTemplateTest("WA_APPROVAL_NEEDED_V1", { ...superAdmin(), whatsappNumber: null })).toMatchObject({ ok: false });
    expect(await sendTemplateTest("WA_APPROVAL_NEEDED_V1", { ...superAdmin(), whatsappNumber: "919000000007" })).toMatchObject({ ok: true });
    const send = calls.filter((call) => call.path === "/api/v1/whatsapp/sendMessage").at(-1)!;
    expect(send.body).toMatchObject({ to: "919000000007", templateName: "ars_s7_needed_v2", templateVariables: ["Laptop for the new engineer", "PUR-2026-000123", "https://approvals.arssteels.net/users/requests/123"], userMessageId: "ars-test-wa_approval_needed_v1" });
  });
});
