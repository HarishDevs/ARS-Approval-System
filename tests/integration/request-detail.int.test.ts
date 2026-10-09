import { afterAll, describe, expect, it } from "vitest";
import { getDbPool } from "@/lib/db/client";
import { createWorkflow, decideTask, publishVersion, resubmitRequest, submitRequest, type Actor } from "@/server/approvals/service";
import { loadRequestView } from "@/server/approvals/view";
import { listRevisions } from "@/lib/db/repositories/revisions.repository";
import { createUser, pendingTaskKey } from "./helpers";

// RD-03: what was submitted in each round is stored, and the request page
// shows what changed; a request from before v1.6.0 gets its earlier round
// filled in on its next resubmit.
afterAll(async () => {
  await getDbPool().end();
});

async function setup() {
  const approver = await createUser({ name: "Detail Approver" });
  const raiser = await createUser({ name: "Detail Raiser" });
  const adminId = await createUser({ roles: ["USER", "IT_ADMIN"] });
  const admin: Actor = { id: adminId, roles: ["USER", "IT_ADMIN"] };
  const created = await createWorkflow(
    {
      code: `RD_${Date.now()}_${approver}`,
      name: "Detail",
      kind: "PREDEFINED",
      requestPrefix: "RD",
      form: [
        { key: "amount", label: "Amount", type: "NUMBER", required: true },
        { key: "vendor", label: "Vendor", type: "TEXT", required: false },
      ],
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
  return { approver, raiser, workflowId: created.value.workflowId };
}

describe("rounds and what changed", () => {
  it("records each round and shows the changes after a resubmit", async () => {
    const { approver, raiser, workflowId } = await setup();
    const submitted = await submitRequest({ workflowId, title: "Chairs", fields: { amount: "85,000", vendor: "Godrej" }, allowDuplicate: true }, { id: raiser, roles: ["USER"] });
    if (!submitted.ok) throw new Error(submitted.message);
    const id = submitted.value.requestId;
    expect((await listRevisions(id)).map((revision) => revision.round)).toEqual([1]);

    await decideTask({ requestId: id, taskKey: await pendingTaskKey(id, approver), decision: "REQUEST_CHANGES", comment: "Two quotes" }, { id: approver, roles: ["USER"] });
    const again = await resubmitRequest({ requestId: id, fields: { amount: "82,000", vendor: "" } }, { id: raiser, roles: ["USER"] });
    expect(again.ok).toBe(true);
    expect((await listRevisions(id)).map((revision) => revision.round)).toEqual([1, 2]);

    const view = await loadRequestView(id, { id: approver, roles: ["USER"] });
    expect(view?.changes).toMatchObject({ round: 2, files: [] });
    const changes = view?.changes !== "unrecorded" ? view?.changes?.fields : [];
    expect(changes?.map((change) => [change.label, change.kind])).toEqual([
      ["Amount", "changed"],
      ["Vendor", "removed"],
    ]);
    // Someone not on the request sees nothing (the page answers 404).
    const stranger = await createUser();
    expect(await loadRequestView(id, { id: stranger, roles: ["USER"] })).toBeNull();
  });

  it("a request from before v1.6.0 gets its earlier round on the next resubmit", async () => {
    const { approver, raiser, workflowId } = await setup();
    const submitted = await submitRequest({ workflowId, title: "Desks", fields: { amount: "40,000" }, allowDuplicate: true }, { id: raiser, roles: ["USER"] });
    if (!submitted.ok) throw new Error(submitted.message);
    const id = submitted.value.requestId;
    await getDbPool().query("DELETE FROM request_revisions WHERE request_id = ?", [id]); // as if raised before v1.6.0
    await decideTask({ requestId: id, taskKey: await pendingTaskKey(id, approver), decision: "REQUEST_CHANGES", comment: "Cheaper" }, { id: approver, roles: ["USER"] });
    await resubmitRequest({ requestId: id, fields: { amount: "38,000" } }, { id: raiser, roles: ["USER"] });
    const view = await loadRequestView(id, { id: raiser, roles: ["USER"] });
    const fields = view?.changes && view.changes !== "unrecorded" ? view.changes.fields : null;
    expect(fields?.map((change) => [change.label, change.before, change.after])).toEqual([["Amount", "40,000", "38,000"]]);
  });
});
