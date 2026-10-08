import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { applyTemplateVerdict, findActiveTemplate, markTemplateSubmitted, saveTemplateDraft } from "@/lib/db/repositories/whatsapp.repository";
import { listAttachments } from "@/lib/db/repositories/attachments.repository";
import { listTimeline } from "@/lib/db/repositories/approvals.repository";
import { createWorkflow, decideTask, publishVersion, submitRequest, withdrawRequest, type Actor } from "@/server/approvals/service";
import { addAttachments, openAttachment, prepareFiles } from "@/server/attachments/service";
import { listDemoPeople, loadDemoData, retireDemoStaff, startDemoSession } from "@/server/demo/service";
import { findTemplateEntry } from "@/server/notifications/templates";
import { verifySessionToken } from "@/lib/session/token";
import { createUser, pendingTaskKey } from "./helpers";

const superAdmin = (id: number): Actor => ({ id, roles: ["USER", "IT_ADMIN", "SUPER_ADMIN"] });
const itAdmin = (id: number): Actor => ({ id, roles: ["USER", "IT_ADMIN"] });
const person = (id: number): Actor => ({ id, roles: ["USER"] });
let adminId: number;
let requester: number;
let approver: number;
let outsider: number;

beforeAll(async () => {
  adminId = await createUser({ name: "IT 6", roles: ["USER", "IT_ADMIN", "SUPER_ADMIN"] });
  requester = await createUser({ name: "Requester 6" });
  approver = await createUser({ name: "Approver 6" });
  outsider = await createUser({ name: "Outsider 6" });
});

afterAll(async () => {
  await getDbPool().end();
});

const pdf = (name: string) => new File([`%PDF-1.4\n${name}\n%%EOF`], name, { type: "application/pdf" });

describe("demo data (S6-02a, D-071)", () => {
  it("only the Super Admin can load it", async () => {
    await expect(loadDemoData(itAdmin(adminId))).rejects.toThrow("FORBIDDEN");
  });

  it("loads people, groups and 12 published approval types; loading again changes nothing", async () => {
    const first = await loadDemoData(superAdmin(adminId));
    expect(first.problems).toEqual([]);
    expect(first.people).toBe(20);
    expect(first.groups).toBe(8);
    expect(first.workflows).toHaveLength(12);
    const [published] = await getDbPool().query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) AS total FROM workflow_definitions d JOIN workflow_versions v ON v.workflow_id = d.id AND v.status = 'PUBLISHED'
       WHERE d.code IN ('MD_APPROVAL','PURCHASE_SCM_APPROVAL','FINANCE_INTERNAL','PRICE_REALISATION','DEPARTMENT_APPROVAL')`,
    );
    expect(Number(published[0]!.total)).toBe(5);

    const again = await loadDemoData(superAdmin(adminId));
    expect(again).toMatchObject({ people: 0, groups: 0, departments: 0, workflows: [], problems: [] });
    expect(again.skippedWorkflows).toHaveLength(12);
  });

  it("a ₹15 lakh purchase by a demo buyer goes SCM head → Finance head → ED, and skips MD", async () => {
    const people = await listDemoPeople();
    const id = (login: string) => people.find((p) => p.loginId === login)!.id;
    const [rows] = await getDbPool().query<(RowDataPacket & { id: number })[]>("SELECT id FROM workflow_definitions WHERE code = 'PURCHASE_SCM_APPROVAL'");
    const raised = await submitRequest(
      { workflowId: rows[0]!.id, title: "Hydraulic press spares", fields: { item: "Spares", amount: "15,00,000", budgeted: "Yes", details: "Annual spares" } },
      person(id("demo.buyer")),
    );
    if (!raised.ok) throw new Error(raised.message);
    const requestId = raised.value.requestId;
    for (const login of ["demo.scmhead", "demo.finhead", "demo.ed"]) {
      const result = await decideTask({ requestId, taskKey: await pendingTaskKey(requestId, id(login)), decision: "APPROVE" }, person(id(login)));
      expect(result.ok, login).toBe(true);
    }
    const [status] = await getDbPool().query<(RowDataPacket & { status: string })[]>("SELECT status FROM approval_requests WHERE id = ?", [requestId]);
    expect(status[0]!.status).toBe("APPROVED");
  });

  it("'Try as' works only for an active demo person with no admin role, and ends the Super Admin's session", async () => {
    const md = (await listDemoPeople()).find((p) => p.loginId === "demo.md")!;
    const actor = { ...superAdmin(adminId), sessionId: crypto.randomUUID(), ipAddress: null, userAgent: "test" };
    await getDbPool().query("INSERT INTO user_sessions (id, user_id, auth_method, expires_at) VALUES (?, ?, 'GOOGLE', DATE_ADD(NOW(), INTERVAL 1 HOUR))", [actor.sessionId, adminId]);

    expect(await startDemoSession(requester, actor)).toMatchObject({ ok: false });
    expect(await startDemoSession(md.id, { ...actor, roles: ["USER", "IT_ADMIN"] })).toMatchObject({ ok: false });
    const started = await startDemoSession(md.id, actor);
    if (!started.ok) throw new Error(started.message);
    expect(verifySessionToken(started.token)?.uid).toBe(md.id);
    const [sessions] = await getDbPool().query<(RowDataPacket & { revoked_at: Date | null })[]>("SELECT revoked_at FROM user_sessions WHERE id = ?", [actor.sessionId]);
    expect(sessions[0]!.revoked_at).not.toBeNull();

    await getDbPool().query("INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = 'IT_ADMIN'", [md.id]);
    expect(await startDemoSession(md.id, actor)).toMatchObject({ ok: false, message: expect.stringContaining("admin rights") });
    await getDbPool().query("DELETE FROM user_roles WHERE user_id = ? AND role_id = (SELECT id FROM roles WHERE code = 'IT_ADMIN')", [md.id]);
  });

  it("retiring makes every demo person inactive (never deleted)", async () => {
    const result = await retireDemoStaff(superAdmin(adminId));
    expect(result.retired).toBe(20);
    const people = await listDemoPeople();
    expect(people).toHaveLength(20);
    expect(people.every((p) => !p.active)).toBe(true);
  });
});

describe("attachments (S6-05, D-072)", () => {
  let workflowId: number;

  beforeAll(async () => {
    const created = await createWorkflow(
      {
        code: `S6_${Date.now().toString(36)}`.toUpperCase(),
        name: "S6",
        kind: "PREDEFINED",
        requestPrefix: "SSX",
        builder: { stages: [{ kind: "STEP", step: { id: "a", label: "Approve", approvers: { kind: "PEOPLE", userIds: [approver] }, rule: "ALL" } }] },
        form: [],
      },
      superAdmin(adminId),
    );
    if (!created.ok) throw new Error(created.message);
    await publishVersion(created.value.versionId, superAdmin(adminId));
    workflowId = created.value.workflowId;
  });

  async function raise(): Promise<number> {
    const raised = await submitRequest({ workflowId, title: "With files", fields: {}, allowDuplicate: true }, person(requester));
    if (!raised.ok) throw new Error(raised.message);
    return raised.value.requestId;
  }

  it("the requester and the approver attach files; the timeline says so; the bytes come back", async () => {
    const requestId = await raise();
    const files = await prepareFiles([pdf("quote.pdf")]);
    if (!files.ok) throw new Error(files.message);
    expect(await addAttachments(requestId, files.files, person(requester), { requesterOnly: true })).toMatchObject({ ok: true, value: { count: 1 } });
    const second = await prepareFiles([pdf("signed-note.pdf")]);
    if (!second.ok) throw new Error(second.message);
    expect(await addAttachments(requestId, second.files, person(approver))).toMatchObject({ ok: true });

    const list = await listAttachments(requestId);
    expect(list.map((file) => file.name)).toEqual(["quote.pdf", "signed-note.pdf"]);
    expect(list[0]!.sha256).toMatch(/^[0-9a-f]{64}$/);
    const timeline = await listTimeline(requestId);
    expect(timeline.some((row) => row.payload.type === "ATTACHMENTS_ADDED")).toBe(true);

    const opened = await openAttachment(list[0]!.id, person(approver));
    expect(opened?.bytes.toString("utf8")).toContain("quote.pdf");
  });

  it("someone not involved can neither add nor download; a closed request takes no files", async () => {
    const requestId = await raise();
    const files = await prepareFiles([pdf("a.pdf")]);
    if (!files.ok) throw new Error(files.message);
    expect(await addAttachments(requestId, files.files, person(outsider))).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await addAttachments(requestId, files.files, person(approver), { requesterOnly: true })).toMatchObject({ ok: false, code: "NOT_FOUND" });
    await addAttachments(requestId, files.files, person(requester));
    const [file] = await listAttachments(requestId);
    expect(await openAttachment(file!.id, person(outsider))).toBeNull();
    const [denied] = await getDbPool().query<RowDataPacket[]>("SELECT 1 FROM audit_logs WHERE action = 'ATTACHMENT_ACCESS_DENIED' AND actor_user_id = ?", [outsider]);
    expect(denied.length).toBeGreaterThan(0);

    await withdrawRequest({ requestId }, person(requester));
    expect(await addAttachments(requestId, files.files, person(requester))).toMatchObject({ ok: false, code: "CLOSED" });
  });

  it("a file pretending to be a PDF is refused before anything is saved", async () => {
    expect(await prepareFiles([new File(["MZ not a pdf"], "invoice.pdf")])).toMatchObject({ ok: false });
  });
});

describe("WhatsApp template registry (S6-04, S7)", () => {
  it("a template is sent only once Meta has approved it, with variables in the saved order", async () => {
    const entry = findTemplateEntry("WA_APPROVAL_NEEDED_V1")!;
    const id = await withTransaction((db) =>
      saveTemplateDraft(
        { existingId: null, code: entry.code, eventType: entry.eventType, version: 1, providerName: "ars_s6_needed_v1", category: "UTILITY", body: entry.body, footer: null, variables: entry.variables },
        adminId,
        db,
      ),
    );
    expect(await findActiveTemplate("APPROVAL_NEEDED")).toBeNull();
    await withTransaction((db) => markTemplateSubmitted(id, adminId, db));
    expect(await findActiveTemplate("APPROVAL_NEEDED")).toBeNull();
    await withTransaction((db) => applyTemplateVerdict({ id, code: entry.code, version: 1 }, { outcome: "APPROVED", metaStatus: "APPROVED", reason: null }, db));
    expect(await findActiveTemplate("APPROVAL_NEEDED")).toMatchObject({ providerName: "ars_s6_needed_v1", variableKeys: ["requester_name", "request_no", "title", "link"] });
    await withTransaction((db) => applyTemplateVerdict({ id, code: entry.code, version: 1 }, { outcome: "PAUSED", metaStatus: "PAUSED", reason: "Low quality" }, db));
    expect(await findActiveTemplate("APPROVAL_NEEDED")).toBeNull();
    await getDbPool().query("DELETE FROM whatsapp_template_variables WHERE template_id = ?", [id]);
    await getDbPool().query("DELETE FROM whatsapp_templates WHERE id = ?", [id]);
  });
});
