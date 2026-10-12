import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDbPool } from "@/lib/db/client";
import { createWorkflow, decideTask, publishVersion, submitRequest, withdrawRequest, type Actor } from "@/server/approvals/service";
import { addCollaborators, removeCollaborator } from "@/server/approvals/collaborators";
import { listChoices, listRequests, tabCounts } from "@/lib/db/repositories/request-lists.repository";
import { countPendingTasksFor, listPendingTasksFor, queueChoicesFor } from "@/lib/db/repositories/approvals.repository";
import { parseListFilters } from "@/server/requests/list-filters";
import { parseQueueFilter } from "@/server/approvals/queue-filters";
import { createDepartment, createUser, pendingTaskKey } from "./helpers";

// v1.7.2 on real MySQL: Collaborating, My requests and Waiting for me with
// their filters. A list only ever shows the person's own base set.
let approver: number;
let approver2: number;
let ravi: number;
let meera: number;
let me: number;
let stranger: number;
let admin: Actor;
let workflowId: number;
let dept: number;
const person = (id: number): Actor => ({ id, roles: ["USER"] });
const ids: Record<string, number> = {};

async function raise(by: number, title: string) {
  const result = await submitRequest({ workflowId, title, fields: { amount: "10" } }, person(by));
  if (!result.ok) throw new Error(result.message);
  return result.value.requestId;
}
const collab = (params: Record<string, string> = {}) => listRequests("COLLAB", me, parseListFilters(params, "COLLAB"));
const titles = async (params: Record<string, string> = {}) => (await collab(params)).items.map((item) => item.title).sort();

beforeAll(async () => {
  approver = await createUser({ name: "L Approver" });
  approver2 = await createUser({ name: "L Second" });
  dept = await createDepartment(null);
  ravi = await createUser({ name: "L Ravi", departmentId: dept });
  meera = await createUser({ name: "L Meera" });
  me = await createUser({ name: "L Me" });
  stranger = await createUser({ name: "L Stranger" });
  const adminId = await createUser({ roles: ["USER", "IT_ADMIN"] });
  admin = { id: adminId, roles: ["USER", "IT_ADMIN"] };
  const created = await createWorkflow(
    {
      code: `LST_${Date.now()}`,
      name: "List type",
      kind: "PREDEFINED",
      requestPrefix: "LS",
      form: [{ key: "amount", label: "Amount", type: "NUMBER", required: true }],
      definition: {
        nodes: [
          { id: "start", kind: "START", label: "Start" },
          { id: "a", kind: "APPROVAL", label: "L First check", approvers: [{ type: "USER", userId: approver }], completion: { type: "ALL" }, slaHours: 8 },
          { id: "b", kind: "APPROVAL", label: "L Second check", approvers: [{ type: "USER", userId: approver2 }], completion: { type: "ALL" } },
          { id: "end", kind: "END", label: "End" },
        ],
        edges: [
          { id: "e1", from: "start", to: "a" },
          { id: "e2", from: "a", to: "b" },
          { id: "e3", from: "b", to: "end" },
        ],
      },
    },
    admin,
  );
  if (!created.ok) throw new Error(created.message);
  await publishVersion(created.value.versionId, admin);
  workflowId = created.value.workflowId;

  ids.open = await raise(ravi, "L pump motor");
  ids.second = await raise(ravi, "L crane rope");
  await decideTask({ requestId: ids.second, taskKey: await pendingTaskKey(ids.second, approver), decision: "APPROVE" }, person(approver)); // now at the second step
  ids.withdrawn = await raise(meera, "L old laptop");
  await withdrawRequest({ requestId: ids.withdrawn }, person(meera));
  ids.removed = await raise(meera, "L removed one");
  ids.notMine = await raise(meera, "L not shared");
  ids.mineRaised = await raise(me, "L my own");
  await addCollaborators(ids.open, [me], person(ravi));
  await addCollaborators(ids.second, [me], person(ravi));
  await addCollaborators(ids.withdrawn, [me], person(meera));
  await addCollaborators(ids.removed, [me], person(meera));
  await removeCollaborator(ids.removed, me, person(meera));
  await getDbPool().query("UPDATE approval_tasks SET due_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 HOUR) WHERE request_id = ? AND status = 'PENDING'", [ids.open]);
  await getDbPool().query(
    "INSERT INTO request_attachments (request_id, uploaded_by, round, original_name, stored_path, content_type, size_bytes, sha256) VALUES (?, ?, 1, 'q.pdf', ?, 'application/pdf', 10, ?)",
    [ids.second, ravi, `test/${Date.now()}-list`, "a".repeat(64)],
  );
});

afterAll(async () => {
  await getDbPool().end();
});

describe("Collaborating", () => {
  it("lists only requests I'm a collaborator on now (not removed, not someone else's)", async () => {
    expect(await titles()).toEqual(["L crane rope", "L old laptop", "L pump motor"]);
    expect((await listRequests("COLLAB", stranger, parseListFilters({}, "COLLAB"))).total).toBe(0);
  });

  it("filters: tabs, several statuses, raised by, department, added by, step, waiting with, overdue, files, dates", async () => {
    expect(await titles({ tab: "open" })).toEqual(["L crane rope", "L pump motor"]);
    expect(await titles({ tab: "withdrawn" })).toEqual(["L old laptop"]);
    expect(await titles({ status: "CANCELLED,IN_PROGRESS" })).toEqual(["L crane rope", "L old laptop", "L pump motor"]);
    expect(await titles({ raisedBy: String(meera) })).toEqual(["L old laptop"]);
    expect(await titles({ dept: String(dept) })).toEqual(["L crane rope", "L pump motor"]);
    expect(await titles({ addedBy: String(meera) })).toEqual(["L old laptop"]);
    expect(await titles({ step: "L Second check" })).toEqual(["L crane rope"]);
    expect(await titles({ waitingWith: String(approver) })).toEqual(["L pump motor"]);
    expect(await titles({ overdue: "1" })).toEqual(["L pump motor"]);
    expect(await titles({ tab: "overdue" })).toEqual(["L pump motor"]);
    expect(await titles({ files: "yes" })).toEqual(["L crane rope"]);
    expect(await titles({ files: "no" })).toEqual(["L old laptop", "L pump motor"]);
    expect(await titles({ q: "rope" })).toEqual(["L crane rope"]);
    expect(await titles({ q: "L Meera" })).toEqual(["L old laptop"]); // by who raised it
    expect(await titles({ raisedFrom: "2099-01-01" })).toEqual([]);
    const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
    expect(await titles({ addedFrom: today, addedTo: today })).toHaveLength(3);
    expect(await titles({ closedFrom: today })).toEqual(["L old laptop"]);
    expect(await titles({ validity: "expired" })).toEqual([]);
  });

  it("tab counts follow the other filters; paging and sort work", async () => {
    const counts = await tabCounts("COLLAB", me, parseListFilters({ raisedBy: String(ravi) }, "COLLAB"));
    expect(counts).toMatchObject({ all: 2, open: 2, waiting: 2, withdrawn: 0, overdue: 1 });
    const page = await collab({ size: "25", sort: "number" });
    expect(page.items.map((item) => item.requestNo)).toEqual([...page.items.map((item) => item.requestNo)].sort());
    expect(page.items.find((item) => item.title === "L pump motor")).toMatchObject({ overdue: true, pendingStep: "L First check", addedByName: "L Ravi" });
  });

  it("choices come only from my own collaborations", async () => {
    const choices = await listChoices("COLLAB", me);
    expect(choices.requesters.map((item) => item.name).sort()).toEqual(["L Meera", "L Ravi"]);
    expect(choices.addedBy.map((item) => item.name).sort()).toEqual(["L Meera", "L Ravi"]);
    expect(choices.steps.sort()).toEqual(["L First check", "L Second check"]);
    expect((await listChoices("COLLAB", stranger)).requesters).toEqual([]);
  });
});

describe("My requests", () => {
  it("only what I raised, with the same filters", async () => {
    const mine = await listRequests("MINE", me, parseListFilters({}, "MINE"));
    expect(mine.items.map((item) => item.title)).toEqual(["L my own"]);
    expect((await listRequests("MINE", meera, parseListFilters({ tab: "withdrawn" }, "MINE"))).items.map((item) => item.title)).toEqual(["L old laptop"]);
    expect((await listRequests("MINE", ravi, parseListFilters({ step: "L Second check" }, "MINE"))).items.map((item) => item.title)).toEqual(["L crane rope"]);
  });
});

describe("Waiting for me (v1.7.2 filters)", () => {
  it("search, raised by, department, step, due within, files, dates", async () => {
    const count = (params: Record<string, string>) => countPendingTasksFor(approver, parseQueueFilter(params));
    expect(await count({ q: "pump" })).toBe(1);
    expect(await count({ raisedBy: String(ravi) })).toBe(1);
    expect(await count({ raisedBy: String(meera) })).toBe(2); // removed one + not shared
    expect(await count({ dept: String(dept) })).toBe(1);
    expect(await count({ step: "L First check" })).toBeGreaterThanOrEqual(3);
    expect(await count({ step: "L Second check" })).toBe(0);
    expect(await count({ for: "covering" })).toBe(0);
    expect(await count({ files: "yes" })).toBe(0);
    expect(await count({ raisedFrom: "2099-01-01" })).toBe(0);
    const items = await listPendingTasksFor(approver, { limit: 50, offset: 0 }, undefined, parseQueueFilter({ sort: "number", raisedBy: String(meera) }));
    expect(items.map((item) => item.requestNo)).toEqual([...items.map((item) => item.requestNo)].sort());
    const choices = await queueChoicesFor(approver);
    expect(choices.requesters.map((item) => item.name)).toEqual(expect.arrayContaining(["L Ravi", "L Meera", "L Me"]));
    expect(choices.covering).toBe(false);
  });
});
