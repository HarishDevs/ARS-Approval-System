import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { createWorkflow, publishVersion, submitRequest, type Actor } from "@/server/approvals/service";
import { countPendingTasksFor, listPendingTasksFor, queueTypesFor } from "@/lib/db/repositories/approvals.repository";
import { listRecent, recordView } from "@/lib/db/repositories/recent.repository";
import { markAllReadReturningIds, markRead, markUnread } from "@/lib/db/repositories/collab.repository";
import { searchRequests } from "@/lib/db/repositories/search.repository";
import { parseSearchFilters } from "@/server/search/filters";
import { parseQueueFilter } from "@/server/approvals/queue-filters";
import { createUser } from "./helpers";

// v1.6.0 Phase 4: queue filters on real SQL, recently viewed only shows
// what the person can still see, and notification read state is scoped to
// its owner.
let approver: number;
let raiser: number;
let stranger: number;
let typeA: number;
let typeB: number;
let admin: Actor;
let counter = 0;

async function liveType(name: string, approverId: number): Promise<number> {
  const created = await createWorkflow(
    {
      code: `WS_${Date.now()}_${++counter}`,
      name,
      kind: "PREDEFINED",
      requestPrefix: "WS",
      definition: {
        nodes: [
          { id: "start", kind: "START", label: "Start" },
          { id: "a", kind: "APPROVAL", label: "Check", approvers: [{ type: "USER", userId: approverId }], completion: { type: "ALL" } },
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
  return created.value.workflowId;
}

async function raise(workflowId: number, title: string): Promise<number> {
  const submitted = await submitRequest({ workflowId, title, fields: {}, allowDuplicate: true }, { id: raiser, roles: ["USER"] });
  if (!submitted.ok) throw new Error(submitted.message);
  return submitted.value.requestId;
}

beforeAll(async () => {
  approver = await createUser({ name: "Queue Approver" });
  raiser = await createUser({ name: "Queue Raiser" });
  stranger = await createUser({ name: "Queue Stranger" });
  const adminId = await createUser({ roles: ["USER", "IT_ADMIN"] });
  admin = { id: adminId, roles: ["USER", "IT_ADMIN"] };
  typeA = await liveType("Type A", approver);
  typeB = await liveType("Type B", approver);
});

afterAll(async () => {
  await getDbPool().end();
});

describe("Waiting for me filters (WS-01)", () => {
  it("filters by type and overdue, orders by due time, and lists the types", async () => {
    const a1 = await raise(typeA, "A one");
    const b1 = await raise(typeB, "B one");
    await getDbPool().query("UPDATE approval_tasks SET due_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 HOUR) WHERE request_id = ?", [b1]);
    await getDbPool().query("UPDATE approval_tasks SET due_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 5 HOUR) WHERE request_id = ?", [a1]);

    expect(await countPendingTasksFor(approver)).toBe(2);
    expect(await countPendingTasksFor(approver, parseQueueFilter({ type: String(typeA) }))).toBe(1);
    const overdue = await listPendingTasksFor(approver, { limit: 10, offset: 0 }, undefined, parseQueueFilter({ show: "overdue" }));
    expect(overdue.map((item) => item.requestId)).toEqual([b1]);
    const soon = await listPendingTasksFor(approver, { limit: 10, offset: 0 }, undefined, parseQueueFilter({ show: "soon" }));
    expect(soon.map((item) => item.requestId)).toEqual([a1]);
    const byDue = await listPendingTasksFor(approver, { limit: 10, offset: 0 }, undefined, parseQueueFilter({ sort: "due" }));
    expect(byDue.map((item) => item.requestId)).toEqual([b1, a1]);
    expect(byDue[0]!.typeName).toBe("Type B");
    expect(await queueTypesFor(approver)).toEqual([
      { id: typeA, name: "Type A", count: 1 },
      { id: typeB, name: "Type B", count: 1 },
    ]);
    // Someone else's queue is untouched by the filter.
    expect(await countPendingTasksFor(stranger, parseQueueFilter({ type: String(typeA) }))).toBe(0);
  });
});

describe("recently viewed (WS-04)", () => {
  it("lists only requests the person can still see, newest first", async () => {
    const seen = await raise(typeA, "Seen by raiser");
    const other = await raise(typeA, "Viewed by a stranger");
    await recordView(raiser, seen);
    // A stranger "visit" (e.g. recorded before they lost access) is never listed.
    await recordView(stranger, other);
    expect((await listRecent({ id: raiser, isAdmin: false })).map((item) => item.id)).toContain(seen);
    expect(await listRecent({ id: stranger, isAdmin: false })).toEqual([]);
    expect((await listRecent({ id: stranger, isAdmin: true })).map((item) => item.id)).toEqual([other]);
  });
});

describe("search visibility matches the request page", () => {
  it("a stranger finds nothing, even by exact number", async () => {
    const id = await raise(typeB, "Private thing");
    const [[row]] = await getDbPool().query<RowDataPacket[]>("SELECT request_no FROM approval_requests WHERE id = ?", [id]);
    const filters = parseSearchFilters({ q: String(row!.request_no) });
    expect((await searchRequests({ id: stranger, isAdmin: false }, filters)).items).toEqual([]);
    expect((await searchRequests({ id: raiser, isAdmin: false }, filters)).items.map((item) => item.id)).toEqual([id]);
  });
});

describe("notification read state (WS / FB-03)", () => {
  it("mark all returns the ids for Undo; nobody can touch another person's", async () => {
    const insert = async (userId: number) => {
      const [result] = await getDbPool().query<import("mysql2/promise").ResultSetHeader>("INSERT INTO notifications (event_type, user_id, title, message) VALUES ('TEST', ?, 't', 'm')", [userId]);
      return result.insertId;
    };
    const mine = [await insert(raiser), await insert(raiser)];
    const theirs = await insert(stranger);
    const ids = await markAllReadReturningIds(raiser);
    expect([...ids].sort()).toEqual([...mine].sort());
    expect(await markUnread(raiser, [...ids, theirs])).toBe(2);
    expect(await markRead(raiser, [theirs])).toBe(0);
    const [[state]] = await getDbPool().query<RowDataPacket[]>("SELECT read_at FROM notifications WHERE id = ?", [theirs]);
    expect(state!.read_at).toBeNull();
  });
});
