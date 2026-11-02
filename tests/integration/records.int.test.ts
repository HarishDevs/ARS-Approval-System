import { beforeAll, describe, expect, it } from "vitest";
import { getDbPool } from "@/lib/db/client";
import { exportRecords, listRecords, recordChoices } from "@/lib/db/repositories/records.repository";
import { createWorkflow, publishVersion, submitRequest, type Actor } from "@/server/approvals/service";
import { readRecordFilter, SORTS, type RecordKind } from "@/server/records/filters";
import { createDepartment, createUser, setDepartment } from "./helpers";

// D-191: the Admin registers against the real schema. Every filter and every
// sort runs (valid SQL), the waiting-on and raised-by filters find the right
// request, and a deleted request never shows.
let raiser: number;
let approver: number;
let department: number;
let requestNo = "";
let requestId = 0;
let workflowId = 0;

beforeAll(async () => {
  raiser = await createUser({ name: "Records Raiser" });
  approver = await createUser({ name: "Records Approver" });
  const admin = await createUser({ name: "Records Admin", roles: ["USER", "IT_ADMIN"] });
  department = await createDepartment(null);
  await setDepartment(raiser, department);
  const it: Actor = { id: admin, roles: ["USER", "IT_ADMIN"] };
  const created = await createWorkflow(
    {
      code: `RECORDS_${Date.now()}`,
      name: "Records type",
      kind: "PREDEFINED",
      requestPrefix: "RC",
      definition: {
        nodes: [
          { id: "start", kind: "START", label: "Start" },
          { id: "a", kind: "APPROVAL", label: "Manager check", approvers: [{ type: "USER", userId: approver }], completion: { type: "ALL" } },
          { id: "end", kind: "END", label: "End" },
        ],
        edges: [
          { id: "e1", from: "start", to: "a" },
          { id: "e2", from: "a", to: "end" },
        ],
      },
    },
    it,
  );
  if (!created.ok) throw new Error(created.message);
  workflowId = created.value.workflowId;
  await publishVersion(created.value.versionId, it);
  const submitted = await submitRequest({ workflowId, title: "Records gearbox", fields: {}, allowDuplicate: true }, { id: raiser, roles: ["USER"] });
  if (!submitted.ok) throw new Error(submitted.message);
  requestNo = submitted.value.requestNo;
  requestId = submitted.value.requestId;
});

describe("Admin records registers (D-191)", () => {
  it("a request shows with its type, raiser, department, step and who it waits on", async () => {
    const result = await listRecords("requests", readRecordFilter("requests", { q: requestNo }));
    expect(result.total).toBe(1);
    expect(result.rows[0]).toMatchObject({ no: requestNo, title: "Records gearbox", type: "Records type", raisedBy: "Records Raiser", status: "IN_PROGRESS", currentStep: "Manager check", waitingOn: "Records Approver", approvals: 0 });
    // PB-34: a type with no currency field has no amount.
    expect(result.rows[0]!.amount).toEqual({ value: null, confidential: false });
    expect((await listRecords("requests", readRecordFilter("requests", { waiting: String(approver), type: String(workflowId), department: String(department), person: String(raiser) }))).rows.map((row) => row.no)).toEqual([requestNo]);
    expect((await listRecords("requests", readRecordFilter("requests", { q: requestNo, waiting: String(raiser) }))).total).toBe(0);
  });

  it("every filter and every sort is valid SQL for every register, and the download matches", async () => {
    const all = { q: "x", status: "", type: "1", department: "1", person: "1", waiting: "1", priority: "", overdue: "1", from: "2026-01-01", to: "2026-12-31" };
    for (const kind of ["requests", "tasks", "information"] as RecordKind[]) {
      for (const sort of Object.keys(SORTS[kind])) {
        for (const dir of ["asc", "desc"]) await listRecords(kind, readRecordFilter(kind, { ...all, sort, dir }));
      }
      const plain = readRecordFilter(kind, {});
      const [page, download, choices] = await Promise.all([listRecords(kind, plain), exportRecords(kind, plain), recordChoices(kind)]);
      expect(download.rows.length).toBe(Math.min(page.total, 10_000));
      expect(Array.isArray(choices.people)).toBe(true);
    }
  });

  it("a deleted request is never listed", async () => {
    await getDbPool().query("UPDATE approval_requests SET deleted_at = UTC_TIMESTAMP(), delete_reason = 'test' WHERE id = ?", [requestId]);
    expect((await listRecords("requests", readRecordFilter("requests", { q: requestNo }))).total).toBe(0);
    expect((await exportRecords("requests", readRecordFilter("requests", { q: requestNo }))).rows).toHaveLength(0);
  });
});
