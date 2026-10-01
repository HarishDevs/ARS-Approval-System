import recreateTestDatabase from "../integration/global-setup";
import { db } from "./db";

// Fresh test database with the real migrations and seeds, then the people
// the scenarios need:
//   E2E_ADMIN (IT Admin), E2E_REQ (requester), E2E_MGR (requester's manager),
//   E2E_HOD (HOD of the requester's department), E2E_STAFF (plain user).
export default async function globalSetup(): Promise<void> {
  await recreateTestDatabase();
  const conn = await db();
  try {
    const add = async (loginId: string, name: string, roles: string[], managerId: number | null = null, departmentId: number | null = null) => {
      const [result] = await conn.query<import("mysql2/promise").ResultSetHeader>(
        "INSERT INTO users (login_id, name, email, sign_in_method, reporting_manager_id, department_id, active, last_login_at) VALUES (?, ?, ?, 'GOOGLE', ?, ?, TRUE, CURRENT_TIMESTAMP)",
        [loginId, name, `${loginId.toLowerCase()}@example.test`, managerId, departmentId],
      );
      await conn.query("INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code IN (?)", [result.insertId, roles]);
      return result.insertId;
    };
    await add("E2E_ADMIN", "Elena Admin", ["USER", "IT_ADMIN"]);
    const hod = await add("E2E_HOD", "Harini HOD", ["USER"]);
    const [dept] = await conn.query<import("mysql2/promise").ResultSetHeader>("INSERT INTO departments (code, name, hod_user_id) VALUES ('E2E', 'E2E Department', ?)", [hod]);
    const manager = await add("E2E_MGR", "Manoj Manager", ["USER"], null, dept.insertId);
    await add("E2E_REQ", "Ravi Requester", ["USER"], manager, dept.insertId);
    await add("E2E_STAFF", "Sita Staff", ["USER"]);
  } finally {
    await conn.end();
  }
}
