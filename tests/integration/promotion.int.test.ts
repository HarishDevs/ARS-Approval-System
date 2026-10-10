import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { createWorkflow, publishVersion, type Actor } from "@/server/approvals/service";
import { findWorkflow, listVersions, updateWorkflowSettings } from "@/lib/db/repositories/approvals.repository";
import { applyImport, checksumOf, exportApprovalType, previewImport, type PromotionPackage } from "@/server/workflows/promotion";
import { typeSettingsSchema } from "@/server/workflows/type-settings";
import { createUser } from "./helpers";

// Unified prompt FN9 on real MySQL: export → import as a draft.
let approver: number;
let admin: Actor;
let workflowId: number;
const code = `PRO_${Date.now()}`;
const resign = (pkg: PromotionPackage): PromotionPackage => {
  const body: Omit<PromotionPackage, "checksum"> & { checksum?: string } = { ...pkg };
  delete body.checksum;
  return { ...body, checksum: checksumOf(body) };
};

beforeAll(async () => {
  approver = await createUser({ name: "Promo Approver" });
  const adminId = await createUser({ roles: ["USER", "IT_ADMIN"] });
  admin = { id: adminId, roles: ["USER", "IT_ADMIN"] };
  const created = await createWorkflow(
    {
      code,
      name: "Promotion type",
      kind: "PREDEFINED",
      requestPrefix: "PR",
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
    admin,
  );
  if (!created.ok) throw new Error(created.message);
  await publishVersion(created.value.versionId, admin);
  await updateWorkflowSettings(created.value.workflowId, typeSettingsSchema.parse({ amendableFields: ["amount"] }));
  workflowId = created.value.workflowId;
});

afterAll(async () => {
  await getDbPool().end();
});

describe("configuration promotion (FN9)", () => {
  it("exports with portable references, not ids; requesters can't export", async () => {
    const pkg = (await exportApprovalType(workflowId, admin))!;
    const text = JSON.stringify(pkg.version.definition);
    expect(text).toContain('"userRef"');
    expect(text).not.toContain('"userId"');
    expect(pkg.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(await exportApprovalType(workflowId, { id: approver, roles: ["USER"] })).toBeNull();
  });

  it("refuses a changed file and names references it can't find", async () => {
    const pkg = (await exportApprovalType(workflowId, admin))!;
    const tampered = { ...pkg, type: { ...pkg.type, name: "Changed" } };
    expect((await previewImport(tampered)).problems[0]).toMatch(/checksum/);
    const unknown = resign(JSON.parse(JSON.stringify(pkg).replace(/"userRef":"[^"]+"/, '"userRef":"NOBODY_HERE"')) as PromotionPackage);
    const preview = await previewImport(unknown);
    expect(preview.ok).toBe(false);
    expect(preview.problems.join(" ")).toMatch(/user "NOBODY_HERE"/);
  });

  it("into an existing type: a new draft only; live version and checks untouched", async () => {
    const pkg = (await exportApprovalType(workflowId, admin))!;
    const preview = await previewImport(pkg);
    expect(preview).toMatchObject({ ok: true, existing: { id: workflowId }, settingsDiffer: false });
    expect(preview.diff?.same).toBe(true);
    const result = await applyImport(pkg, admin);
    expect(result).toMatchObject({ ok: true, workflowId, versionNo: 2, created: false });
    const versions = await listVersions(workflowId);
    expect(versions.map((version) => version.status)).toEqual(["DRAFT", "PUBLISHED"]);
    const [[audit]] = await getDbPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'WORKFLOW_IMPORTED' AND entity_id = ?", [String(workflowId)]);
    expect(Number(audit!.n)).toBe(1);
  });

  it("as a new type: created as a draft with its checks, ids resolved locally", async () => {
    const pkg = (await exportApprovalType(workflowId, admin))!;
    const fresh = resign({ ...pkg, type: { ...pkg.type, code: `${code}_NEW`, name: "Promotion copy" } });
    const result = await applyImport(fresh, admin);
    expect(result.ok && result.created).toBe(true);
    if (!result.ok) return;
    const versions = await listVersions(result.workflowId);
    expect(versions.map((version) => version.status)).toEqual(["DRAFT"]);
    expect(JSON.stringify(versions[0]!.definition)).toContain(`"userId":${approver}`);
    expect((await findWorkflow(result.workflowId))?.settings?.amendableFields).toEqual(["amount"]);
  });
});
