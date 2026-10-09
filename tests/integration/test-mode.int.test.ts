import { afterAll, describe, expect, it } from "vitest";
import { getDbPool } from "@/lib/db/client";
import { addDraftVersion, createWorkflow, publishVersion, simulateVersion, submitRequest, type Actor } from "@/server/approvals/service";
import type { WorkflowDefinition } from "@/server/engine";
import { createUser } from "./helpers";

// #11: test mode compares a draft with the live version and says who a
// publish affects.
afterAll(async () => {
  await getDbPool().end();
});

const oneLevel = (userId: number): WorkflowDefinition => ({
  nodes: [
    { id: "start", kind: "START", label: "Start" },
    { id: "a", kind: "APPROVAL", label: "Check", approvers: [{ type: "USER", userId }], completion: { type: "ALL" } },
    { id: "end", kind: "END", label: "End" },
  ],
  edges: [
    { id: "e1", from: "start", to: "a" },
    { id: "e2", from: "a", to: "end" },
  ],
});

describe("test mode against the live version", () => {
  it("shows the differences and the open requests that keep their version", async () => {
    const first = await createUser({ name: "Live Checker" });
    const second = await createUser({ name: "Draft Checker" });
    const raiser = await createUser();
    const adminId = await createUser({ roles: ["USER", "IT_ADMIN"] });
    const admin: Actor = { id: adminId, roles: ["USER", "IT_ADMIN"] };
    const created = await createWorkflow({ code: `TM_${Date.now()}`, name: "Test mode", kind: "PREDEFINED", requestPrefix: "TM", definition: oneLevel(first) }, admin);
    if (!created.ok) throw new Error(created.message);
    await publishVersion(created.value.versionId, admin);
    const submitted = await submitRequest({ workflowId: created.value.workflowId, title: "Open one", fields: {}, allowDuplicate: true }, { id: raiser, roles: ["USER"] });
    expect(submitted.ok).toBe(true);

    const draft = await addDraftVersion(created.value.workflowId, { definition: oneLevel(second) }, admin);
    if (!draft.ok) throw new Error(draft.message);
    const view = await simulateVersion(draft.value.versionId, { requesterId: raiser, fields: {} });
    expect(view?.comparison).toMatchObject({ liveVersionNo: 1, same: false });
    expect(view?.comparison?.notes[0]).toContain("Draft Checker");
    expect(view?.impact).toEqual({ versionNo: 2, isLive: false, openRequests: 1 });

    const live = await simulateVersion(created.value.versionId, { requesterId: raiser, fields: {} });
    expect(live?.comparison).toBeNull();
    expect(live?.impact?.isLive).toBe(true);
  });
});
