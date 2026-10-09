import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { createWorkflow, publishVersion, submitRequest, type Actor } from "@/server/approvals/service";
import { createUser } from "./helpers";

// P7-04: the optional Power BI views install and read sensibly.
afterAll(async () => {
  await getDbPool().end();
});

describe("reporting views for Power BI", () => {
  it("create cleanly and show one row per request and per task, by name", async () => {
    const sql = fs.readFileSync(path.resolve(__dirname, "../../database/optional/reporting_views.sql"), "utf8");
    for (const statement of sql.split(/;\s*\n/).map((part) => part.replace(/^(\s*--.*\n)+/gm, "").trim()).filter(Boolean)) {
      await getDbPool().query(statement);
    }
    const admin: Actor = { id: await createUser({ roles: ["USER", "IT_ADMIN"] }), roles: ["USER", "IT_ADMIN"] };
    const approver = await createUser({ name: "Viewer Approver" });
    const raiser = await createUser({ name: "Viewer Raiser" });
    const created = await createWorkflow(
      {
        code: `VIEWS_${Date.now()}`,
        name: "Views type",
        kind: "PREDEFINED",
        requestPrefix: "VW",
        definition: {
          nodes: [
            { id: "start", kind: "START", label: "Start" },
            { id: "a", kind: "APPROVAL", label: "Approver step", approvers: [{ type: "USER", userId: approver }], completion: { type: "ALL" } },
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
    const submitted = await submitRequest({ workflowId: created.value.workflowId, title: "For the views", fields: {}, allowDuplicate: true }, { id: raiser, roles: ["USER"] });
    if (!submitted.ok) throw new Error(submitted.message);

    const [requests] = await getDbPool().query<RowDataPacket[]>("SELECT * FROM reporting_requests WHERE request_no = ?", [submitted.value.requestNo]);
    expect(requests[0]).toMatchObject({ approval_type: "Views type", requester: "Viewer Raiser", status: "IN_PROGRESS" });
    const [tasks] = await getDbPool().query<RowDataPacket[]>("SELECT * FROM reporting_tasks WHERE request_no = ?", [submitted.value.requestNo]);
    expect(tasks[0]).toMatchObject({ step: "Approver step", assigned_to: "Viewer Approver", status: "PENDING", task_type: "APPROVAL" });
  });
});
