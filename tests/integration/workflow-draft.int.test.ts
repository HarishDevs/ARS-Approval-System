import { beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { listVersions } from "@/lib/db/repositories/approvals.repository";
import { createWorkflow, publishVersion, saveWorkingDraft, type Actor } from "@/server/approvals/service";
import type { BuilderSpec } from "@/server/workflows/builder";
import type { FormField } from "@/server/forms/fields";
import { createUser } from "./helpers";

// D-241 (Q-026): the editor's working draft: saved in place from the revision
// the editor saw, made only when none is open, never published by saving.
const FORM: FormField[] = [{ key: "amount", label: "Amount", type: "NUMBER", required: true }];
const spec = (label: string): BuilderSpec => ({ stages: [{ kind: "STEP", step: { id: "mgr", label, approvers: { kind: "REQUESTER_MANAGER" }, rule: "ALL" } }] });
let actor: Actor;
let workflowId: number;

beforeAll(async () => {
  actor = { id: await createUser({ name: "Draft IT", roles: ["USER", "IT_ADMIN"] }), roles: ["USER", "IT_ADMIN"] };
  const created = await createWorkflow({ code: `WD_${Date.now().toString(36)}`.toUpperCase(), name: "Working draft", kind: "PREDEFINED", requestPrefix: "WDR", builder: spec("Manager"), form: FORM }, actor);
  if (!created.ok) throw new Error(created.message);
  workflowId = created.value.workflowId;
  const published = await publishVersion(created.value.versionId, actor);
  if (!published.ok) throw new Error(published.message);
});

describe("the working draft (D-241)", () => {
  it("makes one draft when none is open, then saves into it; publishing stays separate", async () => {
    const first = await saveWorkingDraft(workflowId, { builder: spec("Line manager"), form: FORM }, actor, { versionId: null, revision: 0 }, { autosave: true });
    if (!first.ok) throw new Error(first.message);
    expect(first.value).toMatchObject({ versionNo: 2, revision: 0, created: true });
    const second = await saveWorkingDraft(workflowId, { builder: spec("Line manager (HOD)"), form: FORM }, actor, { versionId: first.value.versionId, revision: 0 }, { autosave: true });
    if (!second.ok) throw new Error(second.message);
    expect(second.value).toMatchObject({ versionId: first.value.versionId, versionNo: 2, revision: 1, created: false });
    const versions = await listVersions(workflowId);
    expect(versions.map((version) => [version.versionNo, version.status])).toEqual([
      [2, "DRAFT"],
      [1, "PUBLISHED"],
    ]);
    expect(versions[0]!.builder?.stages[0]).toMatchObject({ step: { label: "Line manager (HOD)" } });
    expect(versions[0]!.draftRevision).toBe(1);
  });

  it("refuses a save from an older revision, or made before someone else's draft, and changes nothing", async () => {
    const open = (await listVersions(workflowId))[0]!;
    expect(await saveWorkingDraft(workflowId, { builder: spec("Stale"), form: FORM }, actor, { versionId: open.id, revision: 0 })).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(await saveWorkingDraft(workflowId, { builder: spec("Stale"), form: FORM }, actor, { versionId: null, revision: 0 })).toMatchObject({ ok: false, code: "CONFLICT" });
    const after = (await listVersions(workflowId))[0]!;
    expect(after.builder?.stages[0]).toMatchObject({ step: { label: "Line manager (HOD)" } });
    expect(after.draftRevision).toBe(1);
  });

  it("after the draft is published, an editor still holding it is told; a fresh editor starts a new draft", async () => {
    const open = (await listVersions(workflowId))[0]!;
    expect(await publishVersion(open.id, actor)).toMatchObject({ ok: true });
    expect(await saveWorkingDraft(workflowId, { builder: spec("Late"), form: FORM }, actor, { versionId: open.id, revision: 1 })).toMatchObject({ ok: false, code: "CONFLICT" });
    const fresh = await saveWorkingDraft(workflowId, { builder: spec("Next round"), form: FORM }, actor, { versionId: null, revision: 0 });
    expect(fresh).toMatchObject({ ok: true, value: { versionNo: 3, created: true } });
    const [audit] = await getDbPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM audit_logs WHERE entity_type = 'WORKFLOW' AND entity_id = ? AND action = 'WORKFLOW_DRAFT_SAVED'", [String(workflowId)]);
    expect(Number(audit[0]!.n)).toBe(1);
  });
});
