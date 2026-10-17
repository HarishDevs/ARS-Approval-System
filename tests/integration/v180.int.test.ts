import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { createWorkflow, decideTask, publishVersion, submitCustomRequest, submitRequest, type Actor } from "@/server/approvals/service";
import { listChoices, listRequests, tabCounts } from "@/lib/db/repositories/request-lists.repository";
import { parseListFilters } from "@/server/requests/list-filters";
import { loadCustomConfig, saveCustomConfig } from "@/server/approvals/custom-config";
import { listAccessRules, rulesForPerson, setAccessRule } from "@/lib/db/repositories/page-access.repository";
import { effectiveLevel } from "@/server/authorization/pages";
import { sessionIdleSeconds } from "@/lib/db/repositories/sessions.repository";
import { idleLimitMinutes } from "@/server/auth/session";
import { createDepartment, createUser, pendingTaskKey } from "./helpers";

// v1.8.0 on real MySQL: the approved lists, the custom approval set-up as
// applied at submit, work steps naming anyone, page access rules and the
// inactivity limit.
let approver: number;
let approver2: number;
let boss: number;
let requester: number;
let staff: number;
let admin: Actor;
let workflowId: number;
const person = (id: number): Actor => ({ id, roles: ["USER"] });
const ids: Record<string, number> = {};

beforeAll(async () => {
  approver = await createUser({ name: "V18 Approver" });
  approver2 = await createUser({ name: "V18 Second" });
  boss = await createUser({ name: "V18 Boss" });
  requester = await createUser({ name: "V18 Requester" });
  staff = await createUser({ name: "V18 Staff", approver: false });
  const adminId = await createUser({ roles: ["USER", "IT_ADMIN"] });
  admin = { id: adminId, roles: ["USER", "IT_ADMIN"] };
  const created = await createWorkflow(
    {
      code: `V18_${Date.now()}`,
      name: "V18 type",
      kind: "PREDEFINED",
      requestPrefix: "VE",
      form: [{ key: "amount", label: "Amount", type: "NUMBER", required: true }],
      definition: {
        nodes: [
          { id: "start", kind: "START", label: "Start" },
          { id: "a", kind: "APPROVAL", label: "V18 First", approvers: [{ type: "USER", userId: approver }], completion: { type: "ALL" } },
          { id: "b", kind: "APPROVAL", label: "V18 Second", approvers: [{ type: "USER", userId: approver2 }], completion: { type: "ALL" } },
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
  const raise = async (title: string) => {
    const result = await submitRequest({ workflowId, title, fields: { amount: "10" } }, person(requester));
    if (!result.ok) throw new Error(result.message);
    return result.value.requestId;
  };
  const approve = async (id: number, by: number, actor = by) => {
    const result = await decideTask({ requestId: id, taskKey: await pendingTaskKey(id, by), decision: "APPROVE" }, person(actor));
    if (!result.ok) throw new Error(result.message);
  };
  ids.full = await raise("V18 fully approved");
  await approve(ids.full, approver);
  await approve(ids.full, approver2);
  ids.half = await raise("V18 half way");
  await approve(ids.half, approver);
  ids.covered = await raise("V18 covered");
  // boss covers for approver today and approves on their behalf
  await getDbPool().query("INSERT INTO delegations (user_id, delegate_id, starts_on, ends_on, created_by) VALUES (?, ?, CURDATE() - INTERVAL 1 DAY, CURDATE() + INTERVAL 1 DAY, ?)", [approver, boss, approver]);
  await approve(ids.covered, approver, boss);
  await getDbPool().query("UPDATE delegations SET ended_at = CURRENT_TIMESTAMP WHERE user_id = ? AND delegate_id = ?", [approver, boss]);
});

afterAll(async () => {
  await getDbPool().query("DELETE FROM custom_approval_settings WHERE id = 1");
  await getDbPool().end();
});

describe("My approved requests", () => {
  it("only my requests that were fully approved, with who approved", async () => {
    const result = await listRequests("APPROVED_MINE", requester, parseListFilters({}, "APPROVED_MINE"));
    expect(result.items.map((item) => item.title)).toEqual(["V18 fully approved"]);
    expect(result.items[0]!.approvedBy).toBe("V18 Approver, V18 Second");
    expect((await listRequests("APPROVED_MINE", requester, parseListFilters({ approvedBy: String(boss) }, "APPROVED_MINE"))).total).toBe(0);
    expect((await listRequests("APPROVED_MINE", requester, parseListFilters({ tab: "noexpiry" }, "APPROVED_MINE"))).total).toBe(1);
    expect((await listChoices("APPROVED_MINE", requester)).approvedBy.map((item) => item.name).sort()).toEqual(["V18 Approver", "V18 Second"]);
    expect((await listRequests("APPROVED_MINE", approver, parseListFilters({}, "APPROVED_MINE"))).total).toBe(0);
  });
});

describe("Approved by me", () => {
  it("every request I approved a step of, where it is now, and for whom", async () => {
    const mine = await listRequests("APPROVED_BY_ME", approver, parseListFilters({}, "APPROVED_BY_ME"));
    expect(mine.items.map((item) => item.title).sort()).toEqual(["V18 fully approved", "V18 half way"]);
    expect(mine.items.find((item) => item.title === "V18 half way")).toMatchObject({ status: "IN_PROGRESS", myStep: "V18 First" });
    const counts = await tabCounts("APPROVED_BY_ME", approver, parseListFilters({}, "APPROVED_BY_ME"));
    expect(counts).toMatchObject({ all: 2, open: 1, approved: 1, behalf: 0 });
    // The boss approved one for the approver they cover.
    const covering = await listRequests("APPROVED_BY_ME", boss, parseListFilters({ tab: "behalf" }, "APPROVED_BY_ME"));
    expect(covering.items.map((item) => item.title)).toEqual(["V18 covered"]);
    expect(covering.items[0]!.myForName).toBe("V18 Approver");
    expect((await listRequests("APPROVED_BY_ME", boss, parseListFilters({ onBehalf: "no" }, "APPROVED_BY_ME"))).total).toBe(0);
    expect((await listRequests("APPROVED_BY_ME", approver2, parseListFilters({ myStep: "V18 Second" }, "APPROVED_BY_ME"))).total).toBe(1);
    expect((await listRequests("APPROVED_BY_ME", requester, parseListFilters({}, "APPROVED_BY_ME"))).total).toBe(0);
  });
});

describe("Custom approval set-up", () => {
  it("IT's fields and fixed step options are applied at submit; requests keep their own fields", async () => {
    const before = await submitCustomRequest({ title: "V18 custom before", builder: { stages: [{ kind: "STEP", step: { id: "s1", label: "OK", approvers: { kind: "PEOPLE", userIds: [approver] }, rule: "ALL" } }] }, fields: { details: "Old form" } }, person(requester));
    expect(before.ok).toBe(true);
    expect((await saveCustomConfig({ form: [], policy: {} }, person(requester))).ok).toBe(false); // IT only
    const saved = await saveCustomConfig(
      {
        form: [
          { key: "vendor", label: "Vendor", type: "TEXT", required: true },
          { key: "cost", label: "Cost", type: "NUMBER", required: false, min: 0 },
        ],
        policy: { rule: { value: "ANY_ONE", editable: false }, slaHours: { value: 24, editable: false }, onNoApprover: { value: "SKIP", editable: true } },
      },
      admin,
    );
    expect(saved).toEqual({ ok: true });
    expect((await loadCustomConfig()).form.map((field) => field.key)).toEqual(["vendor", "cost"]);
    // The new required field is checked.
    const missing = await submitCustomRequest({ title: "V18 custom missing", builder: { stages: [{ kind: "STEP", step: { id: "s1", label: "OK", approvers: { kind: "PEOPLE", userIds: [approver, approver2] }, rule: "ALL" } }] }, fields: {} }, person(requester));
    expect(missing.ok).toBe(false);
    const after = await submitCustomRequest(
      { title: "V18 custom after", builder: { stages: [{ kind: "STEP", step: { id: "s1", label: "OK", approvers: { kind: "PEOPLE", userIds: [approver, approver2] }, rule: "ALL", slaHours: 2 } }] }, fields: { vendor: "Acme", cost: "500" } },
      person(requester),
    );
    if (!after.ok) throw new Error(after.message);
    const [[row]] = await getDbPool().query<RowDataPacket[]>("SELECT v.definition_json, v.form_json FROM approval_requests r JOIN workflow_versions v ON v.id = r.workflow_version_id WHERE r.id = ?", [after.value.requestId]);
    const definition = (typeof row!.definition_json === "string" ? JSON.parse(row!.definition_json) : row!.definition_json) as { nodes: { kind: string; completion?: { type: string }; slaHours?: number }[] };
    const step = definition.nodes.find((node) => node.kind === "APPROVAL")!;
    expect(step.completion?.type).toBe("ANY_ONE"); // fixed by IT, though "ALL" was sent
    expect(step.slaHours).toBe(24);
    // The earlier request keeps its own form.
    if (!before.ok) throw new Error("unreachable");
    const [[old]] = await getDbPool().query<RowDataPacket[]>("SELECT v.form_json FROM approval_requests r JOIN workflow_versions v ON v.id = r.workflow_version_id WHERE r.id = ?", [before.value.requestId]);
    expect(JSON.stringify(old!.form_json)).toContain("details");
  });

  it("work tasks and FYIs can name someone who isn't an approver; approval steps can't", async () => {
    await getDbPool().query("DELETE FROM custom_approval_settings WHERE id = 1");
    const work = await submitCustomRequest(
      {
        title: "V18 work for staff",
        builder: { stages: [{ kind: "STEP", step: { id: "w", label: "Do it", type: "WORK", approvers: { kind: "PEOPLE", userIds: [staff] }, rule: "ALL" } }, { kind: "STEP", step: { id: "a", label: "OK", approvers: { kind: "PEOPLE", userIds: [approver] }, rule: "ALL" } }] },
        fields: { details: "x" },
      },
      person(requester),
    );
    expect(work.ok).toBe(true);
    const approval = await submitCustomRequest({ title: "V18 staff approves", builder: { stages: [{ kind: "STEP", step: { id: "a", label: "OK", approvers: { kind: "PEOPLE", userIds: [staff] }, rule: "ALL" } }] }, fields: { details: "x" } }, person(requester));
    expect(approval.ok).toBe(false);
  });
});

describe("Page access rules", () => {
  it("person over department over everyone; removing a rule falls back", async () => {
    const department = await createDepartment(null);
    await getDbPool().query("UPDATE users SET department_id = ? WHERE id = ?", [department, staff]);
    await setAccessRule({ pageKey: "users.calendar", scope: "EVERYONE", scopeId: 0, level: "HIDDEN", actorId: admin.id });
    await setAccessRule({ pageKey: "users.calendar", scope: "DEPARTMENT", scopeId: department, level: "VIEW", actorId: admin.id });
    try {
      const level = async (id: number, dept: number | null) => effectiveLevel("users.calendar", await rulesForPerson(id, dept), { id, departmentId: dept });
      expect(await level(staff, department)).toBe("VIEW");
      expect(await level(requester, null)).toBe("HIDDEN");
      await setAccessRule({ pageKey: "users.calendar", scope: "USER", scopeId: staff, level: "FULL", actorId: admin.id });
      expect(await level(staff, department)).toBe("FULL");
      await setAccessRule({ pageKey: "users.calendar", scope: "USER", scopeId: staff, level: null, actorId: admin.id });
      expect(await level(staff, department)).toBe("VIEW");
      expect((await listAccessRules()).filter((rule) => rule.pageKey === "users.calendar").map((rule) => rule.scope)).toEqual(["EVERYONE", "DEPARTMENT"]);
    } finally {
      await getDbPool().query("DELETE FROM page_access_rules WHERE page_key = 'users.calendar'");
    }
  });
});

describe("Inactivity sign-out", () => {
  it("defaults to 30 minutes for everyone (v1.12.1); idle time is measured from the last use", async () => {
    expect(await idleLimitMinutes()).toBe(30);
    const sid = crypto.randomUUID();
    await getDbPool().query(
      "INSERT INTO user_sessions (id, user_id, device_id, auth_method, expires_at, last_seen_at) VALUES (?, ?, NULL, 'GOOGLE', DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 1 HOUR), DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 31 MINUTE))",
      [sid, requester],
    );
    expect(await sessionIdleSeconds(sid, requester)).toBeGreaterThanOrEqual(31 * 60);
    expect(await sessionIdleSeconds(sid, staff)).toBeNull(); // someone else's session
    await getDbPool().query("UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?", [sid]);
    expect(await sessionIdleSeconds(sid, requester)).toBeNull();
  });
});
