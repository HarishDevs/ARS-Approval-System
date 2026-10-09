import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { createSavedView, deleteSavedView, listSavedViews, renameSavedView, searchRequests, setDefaultSavedView } from "@/lib/db/repositories/search.repository";
import { createWorkflow, publishVersion, submitRequest, type Actor } from "@/server/approvals/service";
import { parseSearchFilters } from "@/server/search/filters";
import { createDepartment, createUser, setDepartment } from "./helpers";

// #4 search: who may see what is decided in SQL; nothing leaks.
let raiser: number;
let approver: number;
let outsider: number;
let admin: number;
let delegate: number;
let staleDelegate: number;
let requestNo = "";

const find = (viewer: number, isAdmin = false, params: Record<string, string> = {}) =>
  searchRequests({ id: viewer, isAdmin }, parseSearchFilters({ q: requestNo, ...params }));

beforeAll(async () => {
  raiser = await createUser({ name: "Search Raiser" });
  approver = await createUser({ name: "Search Approver" });
  outsider = await createUser({ name: "Search Outsider" });
  admin = await createUser({ name: "Search Admin", roles: ["USER", "IT_ADMIN"] });
  delegate = await createUser({ name: "Search Delegate" });
  staleDelegate = await createUser({ name: "Search Old Delegate" });
  await setDepartment(raiser, await createDepartment(null));
  const it: Actor = { id: admin, roles: ["USER", "IT_ADMIN"] };
  const created = await createWorkflow(
    {
      code: `SEARCH_${Date.now()}`,
      name: "Search type",
      kind: "PREDEFINED",
      requestPrefix: "SR",
      definition: {
        nodes: [
          { id: "start", kind: "START", label: "Start" },
          { id: "a", kind: "APPROVAL", label: "A", approvers: [{ type: "USER", userId: approver }], completion: { type: "ALL" } },
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
  await publishVersion(created.value.versionId, it);
  const submitted = await submitRequest({ workflowId: created.value.workflowId, title: "Ventilation fan 50% off_deal", fields: {}, allowDuplicate: true }, { id: raiser, roles: ["USER"] });
  if (!submitted.ok) throw new Error(submitted.message);
  requestNo = submitted.value.requestNo;
  await getDbPool().query(
    "INSERT INTO delegations (user_id, delegate_id, starts_on, ends_on, created_by) VALUES (?, ?, DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE)), DATE_ADD(DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE)), INTERVAL 3 DAY), ?)",
    [approver, delegate, approver],
  );
  await getDbPool().query("INSERT INTO delegations (user_id, delegate_id, starts_on, ends_on, created_by) VALUES (?, ?, '2026-01-01', '2026-01-05', ?)", [approver, staleDelegate, approver]);
});

afterAll(async () => {
  await getDbPool().end();
});

describe("search access", () => {
  it("requester, approver, active delegate and IT find it; outsider and an expired delegate don't", async () => {
    expect((await find(raiser)).total).toBe(1);
    expect((await find(approver)).total).toBe(1);
    expect((await find(delegate)).total).toBe(1);
    expect((await find(admin, true)).total).toBe(1);
    expect((await find(outsider)).total).toBe(0);
    expect((await find(staleDelegate)).total).toBe(0);
  });

  it("the department filter is for IT only; 'my part' narrows", async () => {
    const [[row]] = await getDbPool().query<RowDataPacket[]>("SELECT department_id FROM users WHERE id = ?", [raiser]);
    const otherDept = String(Number(row!.department_id) + 9999);
    expect((await find(raiser, false, { dept: otherDept })).total).toBe(1); // ignored for staff
    expect((await find(admin, true, { dept: otherDept })).total).toBe(0);
    expect((await find(approver, false, { role: "raised" })).total).toBe(0);
    expect((await find(approver, false, { role: "approver" })).total).toBe(1);
  });

  it("wildcards and odd text are searched literally and never fail", async () => {
    expect((await searchRequests({ id: raiser, isAdmin: false }, parseSearchFilters({ q: "50% off_deal" }))).total).toBe(1);
    expect((await searchRequests({ id: raiser, isAdmin: false }, parseSearchFilters({ q: "_%zz" }))).total).toBe(0); // wildcards are literal: matches nothing
    for (const odd of ["'; DROP TABLE users; --", "\\", "Śrī ✓ ½", "<script>"]) {
      await expect(searchRequests({ id: raiser, isAdmin: false }, parseSearchFilters({ q: odd }))).resolves.toBeDefined();
    }
  });
});

describe("saved views are private", () => {
  it("only the owner can list, rename, default or delete them", async () => {
    expect(await createSavedView(raiser, "Mine", { status: "IN_PROGRESS" })).toBe("OK");
    expect(await createSavedView(raiser, "Mine", { q: "x" })).toBe("DUPLICATE");
    const [view] = await listSavedViews(raiser);
    expect(await listSavedViews(outsider)).toEqual([]);
    expect(await renameSavedView(outsider, view!.id, "Hijack")).toBe("NOT_FOUND");
    expect(await setDefaultSavedView(outsider, view!.id)).toBe(false);
    expect(await deleteSavedView(outsider, view!.id)).toBe(false);
    expect(await setDefaultSavedView(raiser, view!.id)).toBe(true);
    expect((await listSavedViews(raiser))[0]).toMatchObject({ name: "Mine", isDefault: true, query: { status: "IN_PROGRESS" } });
    expect(await deleteSavedView(raiser, view!.id)).toBe(true);
  });
});

describe("search speed on a larger table", () => {
  it("stays fast with a few thousand requests", async () => {
    // Copy the request until there are a few thousand rows (numbers made unique).
    for (let i = 0; i < 12; i += 1) {
      await getDbPool().query(
        `INSERT INTO approval_requests (request_no, workflow_version_id, requester_id, title, form_data_json, state_json, state_version, status, round, submitted_at)
         SELECT CONCAT('BULK-', ?, '-', id), workflow_version_id, requester_id, CONCAT(title, ' copy'), form_data_json, state_json, state_version, status, round, submitted_at
         FROM approval_requests WHERE request_no NOT LIKE CONCAT('BULK-', ?, '-%') LIMIT 2000`,
        [i, i],
      );
    }
    const [[count]] = await getDbPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM approval_requests");
    expect(Number(count!.n)).toBeGreaterThan(1000);
    const started = Date.now();
    await searchRequests({ id: approver, isAdmin: false }, parseSearchFilters({ q: "fan" }));
    await searchRequests({ id: admin, isAdmin: true }, parseSearchFilters({ q: "copy", sort: "due" }));
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
