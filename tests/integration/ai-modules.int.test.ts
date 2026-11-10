import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { createUser as createUserService, updateUser } from "@/server/admin/users";
import { getUserForAdmin, listUsersForAdmin } from "@/lib/db/repositories/admin-users.repository";
import { findUserById } from "@/lib/db/repositories/users.repository";
import { checkPageKey } from "@/server/authorization/page-access";
import type { ParsedUserInput } from "@/server/admin/user-input";
import { createUser } from "./helpers";

// D-168 (AI module branch): module access against MySQL: the column default
// (existing and new people keep today's access), saving, audit, the rules,
// the users-list filter and page refusal.
const tag = Date.now().toString(36).toUpperCase();
const itAdmin = (id: number) => ({ id, roles: ["USER", "IT_ADMIN"] as const, sessionId: "mod", ipAddress: null });
const superAdmin = (id: number) => ({ id, roles: ["USER", "IT_ADMIN", "SUPER_ADMIN"] as const, sessionId: "mod", ipAddress: null });

let adminId: number;
let otherAdminId: number;
let superId: number;
let staffId: number;

async function input(id: number, change: Partial<ParsedUserInput> = {}): Promise<ParsedUserInput> {
  const user = (await getUserForAdmin(id))!;
  return {
    loginId: user.loginId,
    name: user.name,
    email: user.email,
    whatsappNumber: user.whatsappNumber,
    departmentId: user.departmentId,
    designationId: user.designationId,
    reportingManagerId: user.reportingManagerId,
    signInMethod: user.signInMethod,
    roles: user.roles,
    ...change,
  };
}

async function auditsFor(id: number): Promise<{ action: string; metadata: Record<string, unknown> }[]> {
  const [rows] = await getDbPool().query<RowDataPacket[]>("SELECT action, metadata_json FROM audit_logs WHERE entity_type = 'USER' AND entity_id = ? ORDER BY id", [String(id)]);
  return rows.map((row) => ({ action: row.action as string, metadata: typeof row.metadata_json === "string" ? JSON.parse(row.metadata_json) : row.metadata_json }));
}

beforeAll(async () => {
  adminId = await createUser({ name: `Mod admin ${tag}`, roles: ["USER", "IT_ADMIN"] });
  otherAdminId = await createUser({ name: `Mod admin two ${tag}`, roles: ["USER", "IT_ADMIN"] });
  superId = await createUser({ name: `Mod super ${tag}`, roles: ["USER", "IT_ADMIN", "SUPER_ADMIN"] });
  staffId = await createUser({ name: `Mod staff ${tag}` });
});

afterAll(async () => {
  await getDbPool().end();
});

describe("module access in the database", () => {
  it("anyone created without a choice has Approval, Task and Information, never AI (the safe default for every path)", async () => {
    expect((await findUserById(staffId))!.modules).toEqual(["APPROVAL", "TASK", "INFORMATION"]);
    const created = await createUserService(
      { loginId: `m-${tag}`.toLowerCase(), name: "Module default", email: `m-${tag}@example.test`.toLowerCase(), whatsappNumber: null, departmentId: null, designationId: null, reportingManagerId: null, signInMethod: "GOOGLE", roles: ["USER"] },
      itAdmin(adminId),
    );
    if (!created.ok) throw new Error(created.message);
    expect((await findUserById(created.value))!.modules).toEqual(["APPROVAL", "TASK", "INFORMATION"]);
  });

  it("a chosen set is saved at creation, including AI alone, and audited", async () => {
    const created = await createUserService(
      { loginId: `ai-${tag}`.toLowerCase(), name: "AI only", email: `ai-${tag}@example.test`.toLowerCase(), whatsappNumber: null, departmentId: null, designationId: null, reportingManagerId: null, signInMethod: "GOOGLE", roles: ["USER"], modules: ["AI"] },
      itAdmin(adminId),
    );
    if (!created.ok) throw new Error(created.message);
    expect((await findUserById(created.value))!.modules).toEqual(["AI"]);
    expect((await auditsFor(created.value)).find((entry) => entry.action === "USER_CREATED")?.metadata).toMatchObject({ after: { modules: ["AI"] } });
  });

  it("an edit saves modules with before and after in the audit; they persist", async () => {
    expect(await updateUser(staffId, await input(staffId, { modules: ["APPROVAL", "AI"] }), itAdmin(adminId))).toEqual({ ok: true, value: undefined });
    expect((await getUserForAdmin(staffId))!.modules).toEqual(["APPROVAL", "AI"]);
    const entry = (await auditsFor(staffId)).filter((item) => item.action === "USER_UPDATED").at(-1)!;
    expect(entry.metadata).toMatchObject({ modules: { before: ["APPROVAL", "TASK", "INFORMATION"], after: ["APPROVAL", "AI"] } });
  });

  it("editing other details never changes modules (the form didn't send them)", async () => {
    expect((await updateUser(staffId, await input(staffId, { name: `Mod staff renamed ${tag}` }), itAdmin(adminId))).ok).toBe(true);
    expect((await getUserForAdmin(staffId))!.modules).toEqual(["APPROVAL", "AI"]);
    const entry = (await auditsFor(staffId)).filter((item) => item.action === "USER_UPDATED").at(-1)!;
    expect(entry.metadata).not.toHaveProperty("modules");
  });

  it("refused: changing your own; another IT Admin's unless Super Admin; nothing is saved", async () => {
    const own = await updateUser(adminId, await input(adminId, { modules: ["APPROVAL", "TASK", "INFORMATION", "AI"] }), itAdmin(adminId));
    expect(own).toMatchObject({ ok: false, fieldErrors: { modules: expect.stringContaining("your own") } });
    expect((await getUserForAdmin(adminId))!.modules).not.toContain("AI");
    const other = await updateUser(otherAdminId, await input(otherAdminId, { modules: ["AI"] }), itAdmin(adminId));
    expect(other).toMatchObject({ ok: false, fieldErrors: { modules: expect.stringContaining("Super Admin") } });
    expect((await updateUser(otherAdminId, await input(otherAdminId, { modules: ["APPROVAL", "AI"] }), superAdmin(superId))).ok).toBe(true);
    // Sending the same modules back (an admin saving their own unchanged form) is fine.
    expect((await updateUser(adminId, await input(adminId, { modules: (await getUserForAdmin(adminId))!.modules, name: `Mod admin ${tag} 2` }), itAdmin(adminId))).ok).toBe(true);
  });

  it("the users list shows modules and filters by them", async () => {
    const withAi = await listUsersForAdmin({ search: tag, status: "all", module: "AI" }, { limit: 50, offset: 0 });
    expect(withAi.items.map((item) => item.id)).toEqual(expect.arrayContaining([staffId, otherAdminId]));
    expect(withAi.items.map((item) => item.id)).not.toContain(adminId);
    expect(withAi.items.find((item) => item.id === staffId)?.modules).toEqual(["APPROVAL", "AI"]);
  });

  it("a page of a module the person lacks is refused, actions included; the Super Admin is exempt", async () => {
    const staff = (await findUserById(staffId))!; // Approval + AI
    expect(await checkPageKey(staff, "users.tasks", true)).toEqual({ ok: false, reason: "MODULE", pageKey: "users.tasks" });
    // v1.50.1: one task's page opens without the module; the page shows only tasks the person is on.
    expect(await checkPageKey(staff, "users.task", true)).toMatchObject({ ok: true });
    expect(await checkPageKey(staff, "users.information", false)).toMatchObject({ ok: false, reason: "MODULE" });
    expect(await checkPageKey(staff, "users.request", true)).toMatchObject({ ok: true });
    expect(await checkPageKey(staff, "users.calendar", false)).toMatchObject({ ok: true }); // shared
    expect(await checkPageKey({ id: superId, roles: ["USER", "SUPER_ADMIN"], modules: [] }, "users.task", true)).toEqual({ ok: true, level: null });
  });
});
