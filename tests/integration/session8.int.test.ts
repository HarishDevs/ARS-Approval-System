import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { insertOutbox } from "@/lib/db/repositories/outbox.repository";
import { searchMyRequests } from "@/lib/db/repositories/approvals.repository";
import { saveTemplateDraft } from "@/lib/db/repositories/whatsapp.repository";
import { createWorkflow, decideTask, publishVersion, runOutbox, submitRequest, type Actor } from "@/server/approvals/service";
import { addAttachments, prepareFiles } from "@/server/attachments/service";
import { runDailyTemplateSync } from "@/server/notifications/template-registry";
import { saveSettingsGroup } from "@/server/settings/save";
import { findTemplateEntry } from "@/server/notifications/templates";
import type { BuilderSpec } from "@/server/workflows/builder";
import { createUser, pendingTaskKey } from "./helpers";

// S8-06: regression tests for the QA defects (docs/qa/QA-TEST-SUITE.md §39).
let adminId: number;
let requester: number;
let approverA: number;
let approverB: number;
let n = 0;
const admin = (): Actor => ({ id: adminId, roles: ["USER", "IT_ADMIN", "SUPER_ADMIN"] });
const person = (id: number): Actor => ({ id, roles: ["USER"] });

beforeAll(async () => {
  adminId = await createUser({ name: "IT 8", roles: ["USER", "IT_ADMIN", "SUPER_ADMIN"] });
  requester = await createUser({ name: "Requester 8" });
  approverA = await createUser({ name: "Approver 8A" });
  approverB = await createUser({ name: "Approver 8B" });
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await getDbPool().end();
});

async function live(spec: BuilderSpec, form = [{ key: "amount", label: "Amount (₹)", type: "NUMBER" as const, required: true }]): Promise<number> {
  const created = await createWorkflow({ code: `S8_${Date.now().toString(36)}_${++n}`.toUpperCase(), name: "S8", kind: "PREDEFINED", requestPrefix: "SEI", builder: spec, form }, admin());
  if (!created.ok) throw new Error(created.message);
  const published = await publishVersion(created.value.versionId, admin());
  if (!published.ok) throw new Error(published.message);
  return created.value.workflowId;
}

const oneStep = (): BuilderSpec => ({ stages: [{ kind: "STEP", step: { id: "a", label: "A", approvers: { kind: "PEOPLE", userIds: [approverA] }, rule: "ALL" } }] });
const count = async (title: string) => {
  const [rows] = await getDbPool().query<(RowDataPacket & { total: number })[]>("SELECT COUNT(*) AS total FROM approval_requests WHERE requester_id = ? AND title = ?", [requester, title]);
  return Number(rows[0]!.total);
};

describe("D-QA-04: a negative amount can't skip DoA levels", () => {
  it("refused on submit even though the form field has no minimum", async () => {
    const workflowId = await live({
      stages: [
        {
          kind: "DOA",
          id: "doa",
          label: "DoA",
          field: "amount",
          limits: [100000],
          levels: [
            { step: { id: "a", label: "A", approvers: { kind: "PEOPLE", userIds: [approverA] }, rule: "ALL" }, bands: [true, true] },
            { step: { id: "b", label: "B", approvers: { kind: "PEOPLE", userIds: [approverB] }, rule: "ALL" }, bands: [false, true] },
          ],
        },
      ],
    });
    expect(await submitRequest({ workflowId, title: "Negative", fields: { amount: "-50,00,000" } }, person(requester))).toMatchObject({
      ok: false,
      fieldErrors: { amount: "Enter an amount of ₹0 or more." },
    });
    expect(await count("Negative")).toBe(0);
  });
});

describe("D-QA-01 / D-QA-02: one request per intent", () => {
  it("a retried submit with the same form key returns the first request", async () => {
    const workflowId = await live(oneStep());
    const key = crypto.randomUUID();
    const first = await submitRequest({ workflowId, title: "Retry me", fields: { amount: "100" }, submissionKey: key }, person(requester));
    const again = await submitRequest({ workflowId, title: "Retry me", fields: { amount: "100" }, submissionKey: key }, person(requester));
    expect(first.ok && again.ok).toBe(true);
    if (first.ok && again.ok) {
      expect(again.value.requestId).toBe(first.value.requestId);
      expect(again.value.repeated).toBe(true);
    }
    expect(await count("Retry me")).toBe(1);
  });

  it("two copies racing with the same key still make one request", async () => {
    const workflowId = await live(oneStep());
    const key = crypto.randomUUID();
    const [a, b] = await Promise.all([
      submitRequest({ workflowId, title: "Race me", fields: { amount: "1" }, submissionKey: key }, person(requester)),
      submitRequest({ workflowId, title: "Race me", fields: { amount: "1" }, submissionKey: key }, person(requester)),
    ]);
    expect(a.ok && b.ok).toBe(true);
    expect(await count("Race me")).toBe(1);
  });

  it("the same title again within 10 minutes asks first; ticking allows it", async () => {
    const workflowId = await live(oneStep());
    await submitRequest({ workflowId, title: "Crane motor", fields: { amount: "5" } }, person(requester));
    const second = await submitRequest({ workflowId, title: "Crane motor", fields: { amount: "5" } }, person(requester));
    expect(second).toMatchObject({ ok: false, code: "POSSIBLE_DUPLICATE" });
    expect(await count("Crane motor")).toBe(1);
    expect(await submitRequest({ workflowId, title: "Crane motor", fields: { amount: "5" }, allowDuplicate: true }, person(requester))).toMatchObject({ ok: true });
    expect(await count("Crane motor")).toBe(2);
  });
});

describe("D-QA-06: notification outbox", () => {
  it("every message of an action is recorded with it and sent after the commit", async () => {
    const workflowId = await live(oneStep());
    const raised = await submitRequest({ workflowId, title: "Outbox", fields: { amount: "1" } }, person(requester));
    if (!raised.ok) throw new Error(raised.message);
    const [rows] = await getDbPool().query<(RowDataPacket & { sent_at: Date | null })[]>("SELECT sent_at FROM notification_outbox WHERE request_id = ?", [raised.value.requestId]);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.sent_at !== null)).toBe(true);
  });

  it("messages left unsent by a crash are sent by the job runner, once", async () => {
    const [id] = await withTransaction((db) =>
      insertOutbox(null, [{ eventType: "QA_TEST", userId: approverB, title: "Left behind", message: "sent by the job runner", email: null, whatsappVariables: null }], db),
    );
    await getDbPool().query("UPDATE notification_outbox SET created_at = DATE_SUB(created_at, INTERVAL 5 MINUTE) WHERE id = ?", [id]);
    const first = await runOutbox();
    const second = await runOutbox();
    expect(first.outboxSent).toBeGreaterThanOrEqual(1);
    expect(second.outboxSent).toBe(0);
    const [notes] = await getDbPool().query<RowDataPacket[]>("SELECT id FROM notifications WHERE user_id = ? AND event_type = 'QA_TEST'", [approverB]);
    expect(notes).toHaveLength(1);
  });
});

describe("D-QA-03: attachments under the request lock", () => {
  const pdf = (body: string) => new File([`%PDF-1.4\n${body}\n%%EOF`], `${body}.pdf`);

  it("the same file isn't stored twice on a request", async () => {
    const workflowId = await live(oneStep());
    const raised = await submitRequest({ workflowId, title: "Files", fields: { amount: "1" } }, person(requester));
    if (!raised.ok) throw new Error(raised.message);
    const files = await prepareFiles([pdf("quote")]);
    if (!files.ok) throw new Error(files.message);
    expect(await addAttachments(raised.value.requestId, files.files, person(requester))).toMatchObject({ ok: true, value: { count: 1, duplicates: [] } });
    expect(await addAttachments(raised.value.requestId, files.files, person(requester))).toMatchObject({ ok: true, value: { count: 0, duplicates: ["quote.pdf"] } });
  });

  it("two uploads at the limit can't pass 20 files together", async () => {
    const workflowId = await live(oneStep());
    const raised = await submitRequest({ workflowId, title: "Limit", fields: { amount: "1" } }, person(requester));
    if (!raised.ok) throw new Error(raised.message);
    for (let i = 0; i < 4; i += 1) {
      const batch = await prepareFiles(Array.from({ length: 5 }, (_, j) => pdf(`f${i}_${j}`)).slice(0, i === 3 ? 4 : 5));
      if (!batch.ok) throw new Error(batch.message);
      await addAttachments(raised.value.requestId, batch.files, person(requester));
    }
    const a = await prepareFiles([pdf("race_a")]);
    const b = await prepareFiles([pdf("race_b")]);
    if (!a.ok || !b.ok) throw new Error("prepare");
    const results = await Promise.all([addAttachments(raised.value.requestId, a.files, person(requester)), addAttachments(raised.value.requestId, b.files, person(requester))]);
    expect(results.filter((result) => result.ok).length).toBe(1);
    const [rows] = await getDbPool().query<(RowDataPacket & { total: number })[]>("SELECT COUNT(*) AS total FROM request_attachments WHERE request_id = ?", [raised.value.requestId]);
    expect(Number(rows[0]!.total)).toBe(20);
  });
});

describe("D-QA-11: search, filter and paging of My requests", () => {
  it("finds by number or title, filters by status, pages by 25", async () => {
    const workflowId = await live(oneStep());
    const someone = await createUser({ name: "Searcher" });
    for (let i = 0; i < 27; i += 1) await submitRequest({ workflowId, title: `Pump ${i}`, fields: { amount: "1" } }, person(someone));
    const one = await submitRequest({ workflowId, title: "Unique valve", fields: { amount: "1" } }, person(someone));
    if (!one.ok) throw new Error(one.message);
    await decideTask({ requestId: one.value.requestId, taskKey: await pendingTaskKey(one.value.requestId, approverA), decision: "APPROVE" }, person(approverA));

    const all = await searchMyRequests(someone, {});
    expect(all).toMatchObject({ total: 28, pages: 2, page: 1 });
    expect(all.items).toHaveLength(25);
    expect((await searchMyRequests(someone, { page: 2 })).items).toHaveLength(3);
    expect((await searchMyRequests(someone, { q: "valve" })).items.map((item) => item.title)).toEqual(["Unique valve"]);
    expect((await searchMyRequests(someone, { q: one.value.requestNo })).total).toBe(1);
    expect((await searchMyRequests(someone, { status: "APPROVED" })).total).toBe(1);
    expect((await searchMyRequests(someone, { q: "%" })).total).toBe(0); // wildcards are literal
    expect((await searchMyRequests(requester, { q: "Unique valve" })).total).toBe(0); // only your own
  });
});

describe("D-QA-09: daily template sync", () => {
  it("runs at most once a day, only with a key and a named template", async () => {
    await saveSettingsGroup("WHATSAPP", { "whatsapp.ceoitbox_api_key": "test-only-key-8" }, new Set(), { userId: adminId, sessionId: "s8", ipAddress: null });
    const entry = findTemplateEntry("WA_REQUEST_ON_HOLD_V1")!;
    await withTransaction((db) =>
      saveTemplateDraft({ existingId: null, code: entry.code, eventType: entry.eventType, version: 1, providerName: "ars_s8_hold_v1", category: "UTILITY", body: entry.body, footer: null, variables: entry.variables }, adminId, db),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        new URL(url).pathname.endsWith("getTemplates") ? new Response(JSON.stringify({ results: [], total: 0 }), { status: 200 }) : new Response("", { status: 200 }),
      ),
    );
    const first = await runDailyTemplateSync();
    const second = await runDailyTemplateSync();
    // An earlier test file may already have synced today; either way the second run must skip.
    expect(["synced", "skipped: synced in the last 24 hours"]).toContain(first.templateSync);
    expect(second.templateSync).toBe("skipped: synced in the last 24 hours");
  });
});
