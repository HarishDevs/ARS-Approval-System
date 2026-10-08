import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import type { RoleCode } from "@/types/auth";

// Direct SQL helpers for arranging integration-test data.
let counter = 0;

// Test people get a designation ticked as Approver (D-085) unless a test
// asks for a non-approver.
export async function designationId(approver: boolean): Promise<number> {
  const code = approver ? "IT_APPROVER" : "IT_NON_APPROVER";
  await getDbPool().query("INSERT IGNORE INTO designations (code, name, is_approver) VALUES (?, ?, ?)", [code, approver ? "Test approver" : "Test non-approver", approver]);
  const [rows] = await getDbPool().query<(RowDataPacket & { id: number })[]>("SELECT id FROM designations WHERE code = ?", [code]);
  return rows[0]!.id;
}

export async function createUser(
  input: { name?: string; managerId?: number | null; departmentId?: number | null; roles?: RoleCode[]; active?: boolean; approver?: boolean } = {},
): Promise<number> {
  counter += 1;
  const tag = `${Date.now().toString(36)}${counter}`;
  const [result] = await getDbPool().query<ResultSetHeader>(
    "INSERT INTO users (login_id, name, email, sign_in_method, reporting_manager_id, department_id, designation_id, active) VALUES (?, ?, ?, 'GOOGLE', ?, ?, ?, ?)",
    [`it-${tag}`, input.name ?? `Person ${tag}`, `it-${tag}@example.test`, input.managerId ?? null, input.departmentId ?? null, await designationId(input.approver ?? true), input.active ?? true],
  );
  const id = result.insertId;
  const roles = input.roles ?? ["USER"];
  await getDbPool().query("INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code IN (?)", [id, roles]);
  return id;
}

export async function createDepartment(hodUserId: number | null): Promise<number> {
  counter += 1;
  const [result] = await getDbPool().query<ResultSetHeader>("INSERT INTO departments (code, name, hod_user_id) VALUES (?, ?, ?)", [`D${Date.now().toString(36)}${counter}`.toUpperCase(), `Department ${counter}`, hodUserId]);
  return result.insertId;
}

export async function setDepartment(userId: number, departmentId: number): Promise<void> {
  await getDbPool().query("UPDATE users SET department_id = ? WHERE id = ?", [departmentId, userId]);
}

export async function createGroup(memberIds: number[]): Promise<number> {
  counter += 1;
  const [result] = await getDbPool().query<ResultSetHeader>("INSERT INTO approver_groups (code, name) VALUES (?, ?)", [`G${Date.now().toString(36)}${counter}`.toUpperCase(), `Group ${counter}`]);
  for (const userId of memberIds) await getDbPool().query("INSERT INTO approver_group_members (group_id, user_id) VALUES (?, ?)", [result.insertId, userId]);
  return result.insertId;
}

export async function pendingTaskKey(requestId: number, approverId: number): Promise<string> {
  const [rows] = await getDbPool().query<(RowDataPacket & { task_key: string })[]>(
    "SELECT task_key FROM approval_tasks WHERE request_id = ? AND approver_id = ? AND status = 'PENDING' ORDER BY id DESC LIMIT 1",
    [requestId, approverId],
  );
  if (!rows[0]) throw new Error(`no pending task for user ${approverId} on request ${requestId}`);
  return rows[0].task_key;
}

export async function requestRow(requestId: number) {
  const [rows] = await getDbPool().query<(RowDataPacket & { status: string; round: number; state_version: number; closed_at: Date | null })[]>(
    "SELECT status, round, state_version, closed_at FROM approval_requests WHERE id = ?",
    [requestId],
  );
  return rows[0]!;
}
