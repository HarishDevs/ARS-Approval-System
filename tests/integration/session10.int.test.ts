import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { currentDataCsv, runImport, templateCsv, checkImport } from "@/server/import/service";
import { parseCsv } from "@/server/import/csv";
import type { AdminActor } from "@/server/admin/users";
import { createUser } from "./helpers";

// Session 10: bulk import (F-59, D-084) against MySQL. Test-only values.
const tag = Date.now().toString(36).toUpperCase();
let itAdmin: AdminActor;
let superAdmin: AdminActor;

beforeAll(async () => {
  itAdmin = { id: await createUser({ name: "IT 10", roles: ["USER", "IT_ADMIN"] }), roles: ["USER", "IT_ADMIN"], sessionId: "s10-it", ipAddress: null };
  superAdmin = { id: await createUser({ name: "Super 10", roles: ["USER", "IT_ADMIN", "SUPER_ADMIN"] }), roles: ["USER", "IT_ADMIN", "SUPER_ADMIN"], sessionId: "s10-sa", ipAddress: null };
});

afterAll(async () => {
  await getDbPool().end();
});

const one = async <T extends RowDataPacket>(sql: string, params: unknown[]) => ((await getDbPool().query<T[]>(sql, params))[0][0] as T | undefined) ?? null;

describe("bulk import (F-59)", () => {
  it("templates are the header row only", () => {
    expect(parseCsv(templateCsv("users")).header).toEqual(["login_id", "name", "email", "whatsapp_number", "department_code", "designation_code", "manager_login_id", "sign_in_method", "modules", "roles"]);
    expect(parseCsv(templateCsv("holidays")).rows).toEqual([]);
  });

  it("imports designations, departments, then users whose manager is in the same file", async () => {
    expect((await runImport("designations", `code,name,approver,active\nD${tag},Deputy ${tag},Yes,Yes`, "d.csv", itAdmin)).ok).toBe(true);
    expect((await runImport("departments", `code,name,hod_login_id,active\nP${tag},Plant ${tag},,Yes`, "p.csv", itAdmin)).ok).toBe(true);

    const users = [
      // v1.49.2: module access in the same file (empty = the default).
      "login_id,name,email,whatsapp_number,department_code,designation_code,manager_login_id,sign_in_method,modules,roles",
      `emp-${tag},Employee ${tag},emp-${tag}@example.test,,P${tag},D${tag},boss-${tag},GOOGLE,TASK;AI,USER`,
      `boss-${tag},Boss ${tag},boss-${tag}@example.test,9${String(Date.now()).slice(-9)},P${tag},D${tag},,PASSWORD,,USER;IT_ADMIN`,
    ].join("\n");
    const check = await checkImport("users", users, itAdmin);
    expect(check.summary).toMatchObject({ create: 2, error: 0 });
    const outcome = await runImport("users", users, "users.csv", itAdmin);
    expect(outcome.ok).toBe(true);

    const emp = await one<RowDataPacket & { manager: string; dept: string; desig: string }>(
      `SELECT m.login_id AS manager, d.code AS dept, g.code AS desig FROM users u
       JOIN users m ON m.id = u.reporting_manager_id JOIN departments d ON d.id = u.department_id JOIN designations g ON g.id = u.designation_id
       WHERE u.login_id = ?`,
      [`emp-${tag}`],
    );
    expect(emp).toMatchObject({ manager: `boss-${tag}`, dept: `P${tag}`, desig: `D${tag}` });
    const roles = await one<RowDataPacket & { roles: string }>(
      "SELECT GROUP_CONCAT(r.code ORDER BY r.code) AS roles FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id WHERE u.login_id = ?",
      [`boss-${tag}`],
    );
    expect(roles?.roles).toBe("IT_ADMIN,USER");
    const modules = await one<RowDataPacket & { emp: string; boss: string }>(
      "SELECT (SELECT module_access FROM users WHERE login_id = ?) AS emp, (SELECT module_access FROM users WHERE login_id = ?) AS boss",
      [`emp-${tag}`, `boss-${tag}`],
    );
    expect(modules).toMatchObject({ emp: "TASK,AI", boss: "APPROVAL,TASK" });
    const audit = await one<RowDataPacket & { n: number }>("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'USER_CREATED' AND actor_user_id = ? AND JSON_EXTRACT(metadata_json, '$.source') = 'IMPORT'", [itAdmin.id]);
    expect(Number(audit?.n)).toBe(2);
    const summary = await one<RowDataPacket & { metadata_json: string }>("SELECT metadata_json FROM audit_logs WHERE action = 'IMPORT_COMPLETED' AND entity_id = 'users' AND actor_user_id = ? ORDER BY id DESC LIMIT 1", [itAdmin.id]);
    expect(typeof summary?.metadata_json === "string" ? JSON.parse(summary.metadata_json) : summary?.metadata_json).toMatchObject({ kind: "users", fileName: "users.csv", create: 2 });
  });

  it("all or nothing: one bad row and nothing is written", async () => {
    const file = [
      "login_id,name,email,whatsapp_number,department_code,designation_code,manager_login_id,sign_in_method,roles",
      `good-${tag},Good ${tag},good-${tag}@example.test,,,,,,`,
      `bad-${tag},Bad ${tag},bad-${tag}@example.test,,NOPE${tag},,,,`,
    ].join("\n");
    const outcome = await runImport("users", file, "bad.csv", itAdmin);
    expect(outcome).toMatchObject({ ok: false, plan: { summary: { error: 1 } } });
    expect(await one("SELECT id FROM users WHERE login_id = ?", [`good-${tag}`])).toBeNull();
  });

  it("only a Super Admin can grant the Super Admin role by import", async () => {
    const file = `login_id,name,email,whatsapp_number,department_code,designation_code,manager_login_id,sign_in_method,roles\nsa-${tag},SA ${tag},sa-${tag}@example.test,,,,,,USER;SUPER_ADMIN`;
    expect((await runImport("users", file, "sa.csv", itAdmin)).ok).toBe(false);
    expect((await runImport("users", file, "sa.csv", superAdmin)).ok).toBe(true);
  });

  it("the current-data download imports back with nothing to change", async () => {
    for (const kind of ["users", "departments", "designations", "groups", "holidays"] as const) {
      const plan = await checkImport(kind, await currentDataCsv(kind), superAdmin);
      if (plan.summary.total === 0) continue;
      expect({ kind, problems: plan.rows.filter((row) => row.action === "error") }).toEqual({ kind, problems: [] });
      expect({ kind, create: plan.summary.create, update: plan.summary.update }).toEqual({ kind, create: 0, update: 0 });
    }
  });

  it("an email change by import ends the person's sessions, like the form", async () => {
    const id = Number((await one<RowDataPacket & { id: number }>("SELECT id FROM users WHERE login_id = ?", [`emp-${tag}`]))?.id);
    await getDbPool().query("INSERT INTO user_sessions (id, user_id, auth_method, expires_at) VALUES (?, ?, 'GOOGLE', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR))", [`s10-${tag}`, id]);
    const file = `login_id,name,email,whatsapp_number,department_code,designation_code,manager_login_id,sign_in_method,roles\nemp-${tag},Employee ${tag},emp2-${tag}@example.test,,P${tag},D${tag},boss-${tag},GOOGLE,USER`;
    const outcome = await runImport("users", file, "email.csv", itAdmin);
    expect(outcome.ok && outcome.plan.rows[0]).toMatchObject({ action: "update", changes: ["email"] });
    const session = await one<RowDataPacket & { revoke_reason: string | null }>("SELECT revoke_reason FROM user_sessions WHERE id = ?", [`s10-${tag}`]);
    expect(session?.revoke_reason).toBe("ACCOUNT_CHANGED_BY_ADMIN");
  });

  it("groups take the members list as written; holidays add and rename by date", async () => {
    expect((await runImport("groups", `code,name,members,active\nG${tag},Desk ${tag},emp-${tag};boss-${tag},Yes`, "g.csv", itAdmin)).ok).toBe(true);
    expect((await runImport("groups", `code,name,members,active\nG${tag},Desk ${tag},boss-${tag},Yes`, "g.csv", itAdmin)).ok).toBe(true);
    const members = await one<RowDataPacket & { logins: string }>(
      "SELECT GROUP_CONCAT(u.login_id) AS logins FROM approver_groups g JOIN approver_group_members m ON m.group_id = g.id JOIN users u ON u.id = m.user_id WHERE g.code = ?",
      [`G${tag}`],
    );
    expect(members?.logins).toBe(`boss-${tag}`);

    expect((await runImport("holidays", "date,name\n01-01-2099,New Year", "h.csv", itAdmin)).ok).toBe(true);
    expect((await runImport("holidays", "date,name\n2099-01-01,New Year's Day", "h.csv", itAdmin)).ok).toBe(true);
    const holiday = await one<RowDataPacket & { name: string }>("SELECT name FROM holidays WHERE holiday_on = '2099-01-01'", []);
    expect(holiday?.name).toBe("New Year's Day");
  });
});
