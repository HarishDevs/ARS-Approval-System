import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import type { RoleCode, SignInMethod, ModuleCode } from "@/types/auth";
import { parseModuleSet } from "@/server/modules/modules";
import { isSalesforceScope, parseChatModes, type ChatMode, type SalesforceScope } from "@/server/ai/chat-access";

// Admin-side reads and writes for users (F-06, S2-03). The password hash is
// never selected here.
export interface AdminUserListItem {
  id: number;
  loginId: string;
  name: string;
  email: string;
  departmentName: string | null;
  signInMethod: SignInMethod;
  roles: RoleCode[];
  active: boolean;
  locked: boolean;
  isBreakGlass: boolean;
  lastLoginAt: Date | null;
  modules: ModuleCode[]; // D-168
}

export interface AdminUserDetail extends AdminUserListItem {
  chatModes: ChatMode[]; // D-172
  salesforceScope: SalesforceScope; // D-172
  whatsappNumber: string | null;
  departmentId: number | null;
  designationId: number | null;
  reportingManagerId: number | null;
  reportingManagerName: string | null;
  hasPassword: boolean;
  googleLinked: boolean;
  lockedSecondsRemaining: number;
  openSessionCount: number;
  createdAt: Date;
}

const ROLE_CODES_SQL = `(SELECT GROUP_CONCAT(r.code ORDER BY r.id) FROM user_roles ur JOIN roles r ON r.id = ur.role_id AND r.active = TRUE WHERE ur.user_id = u.id)`;

function roleList(value: string | null): RoleCode[] {
  const roles = (value ? value.split(",") : []) as RoleCode[];
  return roles.includes("USER") ? roles : ["USER", ...roles];
}

export async function listUsersForAdmin(
  filter: { search?: string; status?: "active" | "inactive" | "all"; module?: ModuleCode },
  page: { limit: number; offset: number },
  db: Queryable = getDbPool(),
): Promise<{ items: AdminUserListItem[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.search) {
    where.push("(u.name LIKE ? OR u.email LIKE ? OR u.login_id LIKE ?)");
    const like = `%${filter.search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    params.push(like, like, like);
  }
  if (filter.status === "active") where.push("u.active = TRUE");
  if (filter.status === "inactive") where.push("u.active = FALSE");
  // D-168: who has a module (FIND_IN_SET on the SET column).
  if (filter.module) {
    where.push("FIND_IN_SET(?, u.module_access) > 0");
    params.push(filter.module);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [countRows] = await db.query<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total FROM users u ${whereSql}`, params);
  const [rows] = await db.query<
    (RowDataPacket & {
      id: number;
      login_id: string;
      name: string;
      email: string;
      department_name: string | null;
      sign_in_method: SignInMethod;
      role_codes: string | null;
      active: number;
      locked: number;
      is_break_glass: number;
      last_login_at: Date | null;
      module_access: string | null;
    })[]
  >(
    `SELECT u.id, u.login_id, u.name, u.email, d.name AS department_name, u.sign_in_method, ${ROLE_CODES_SQL} AS role_codes,
            u.active, (u.locked_until IS NOT NULL AND u.locked_until > CURRENT_TIMESTAMP) AS locked, u.is_break_glass, u.last_login_at, u.module_access
     FROM users u LEFT JOIN departments d ON d.id = u.department_id
     ${whereSql}
     ORDER BY u.active DESC, u.name
     LIMIT ? OFFSET ?`,
    [...params, page.limit, page.offset],
  );
  return {
    total: Number(countRows[0]?.total ?? 0),
    items: rows.map((row) => ({
      id: row.id,
      loginId: row.login_id,
      name: row.name,
      email: row.email,
      departmentName: row.department_name,
      signInMethod: row.sign_in_method,
      roles: roleList(row.role_codes),
      active: row.active === 1,
      locked: Number(row.locked) === 1,
      isBreakGlass: row.is_break_glass === 1,
      lastLoginAt: row.last_login_at,
      modules: parseModuleSet(row.module_access),
    })),
  };
}

export async function getUserForAdmin(id: number, db: Queryable = getDbPool()): Promise<AdminUserDetail | null> {
  const [rows] = await db.query<
    (RowDataPacket & {
      id: number;
      login_id: string;
      name: string;
      email: string;
      whatsapp_number: string | null;
      department_id: number | null;
      department_name: string | null;
      designation_id: number | null;
      reporting_manager_id: number | null;
      manager_name: string | null;
      sign_in_method: SignInMethod;
      role_codes: string | null;
      active: number;
      is_break_glass: number;
      last_login_at: Date | null;
      has_password: number;
      google_linked: number;
      locked_seconds_remaining: number | null;
      open_sessions: number;
      created_at: Date;
      module_access: string | null;
      chat_modes: string | null;
      salesforce_scope: string | null;
    })[]
  >(
    `SELECT u.id, u.login_id, u.name, u.email, u.whatsapp_number, u.department_id, d.name AS department_name, u.designation_id,
            u.reporting_manager_id, m.name AS manager_name, u.sign_in_method, ${ROLE_CODES_SQL} AS role_codes,
            u.active, u.is_break_glass, u.last_login_at, (u.password_hash IS NOT NULL) AS has_password,
            (u.firebase_uid IS NOT NULL) AS google_linked,
            GREATEST(COALESCE(TIMESTAMPDIFF(SECOND, CURRENT_TIMESTAMP, u.locked_until), 0), 0) AS locked_seconds_remaining,
            (SELECT COUNT(*) FROM user_sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP) AS open_sessions,
            u.created_at, u.module_access, u.chat_modes, u.salesforce_scope
     FROM users u
     LEFT JOIN departments d ON d.id = u.department_id
     LEFT JOIN users m ON m.id = u.reporting_manager_id
     WHERE u.id = ? LIMIT 1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  const lockedSecondsRemaining = Number(row.locked_seconds_remaining ?? 0);
  return {
    id: row.id,
    loginId: row.login_id,
    name: row.name,
    email: row.email,
    whatsappNumber: row.whatsapp_number,
    departmentId: row.department_id,
    departmentName: row.department_name,
    designationId: row.designation_id,
    reportingManagerId: row.reporting_manager_id,
    reportingManagerName: row.manager_name,
    signInMethod: row.sign_in_method,
    roles: roleList(row.role_codes),
    active: row.active === 1,
    locked: lockedSecondsRemaining > 0,
    lockedSecondsRemaining,
    isBreakGlass: row.is_break_glass === 1,
    lastLoginAt: row.last_login_at,
    hasPassword: Number(row.has_password) === 1,
    googleLinked: Number(row.google_linked) === 1,
    openSessionCount: Number(row.open_sessions),
    createdAt: row.created_at,
    modules: parseModuleSet(row.module_access),
    chatModes: parseChatModes(row.chat_modes),
    salesforceScope: isSalesforceScope(row.salesforce_scope) ? row.salesforce_scope : "NONE",
  };
}

// For pickers (manager, HOD): active people only.
export async function listActiveUserOptions(db: Queryable = getDbPool()): Promise<{ id: number; name: string; loginId: string }[]> {
  const [rows] = await db.query<(RowDataPacket & { id: number; name: string; login_id: string })[]>(
    "SELECT id, name, login_id FROM users WHERE active = TRUE AND is_break_glass = FALSE ORDER BY name",
  );
  return rows.map((row) => ({ id: row.id, name: row.name, loginId: row.login_id }));
}

export async function getManagerMap(db: Queryable = getDbPool()): Promise<Map<number, number | null>> {
  const [rows] = await db.query<(RowDataPacket & { id: number; reporting_manager_id: number | null })[]>("SELECT id, reporting_manager_id FROM users");
  return new Map(rows.map((row) => [row.id, row.reporting_manager_id]));
}

export async function countActiveSuperAdmins(db: Queryable = getDbPool()): Promise<number> {
  const [rows] = await db.query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(DISTINCT u.id) AS total FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
     WHERE r.code = 'SUPER_ADMIN' AND u.active = TRUE AND u.is_break_glass = FALSE`,
  );
  return Number(rows[0]?.total ?? 0);
}

export interface UserWriteInput {
  loginId: string;
  name: string;
  email: string;
  whatsappNumber: string | null;
  departmentId: number | null;
  designationId: number | null;
  reportingManagerId: number | null;
  signInMethod: SignInMethod;
}

export async function insertUser(input: UserWriteInput, createdBy: number, db: Queryable = getDbPool()): Promise<number> {
  const [result] = await db.query<ResultSetHeader>(
    `INSERT INTO users (login_id, name, email, whatsapp_number, department_id, designation_id, reporting_manager_id, sign_in_method, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.loginId, input.name, input.email, input.whatsappNumber, input.departmentId, input.designationId, input.reportingManagerId, input.signInMethod, createdBy, createdBy],
  );
  return result.insertId;
}

// D-168: a person's modules (the SET column), only through this function.
export async function setUserModules(id: number, modules: readonly ModuleCode[], updatedBy: number, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>("UPDATE users SET module_access = ?, updated_by = ? WHERE id = ?", [modules.join(","), updatedBy, id]);
}

// D-172: Pic bot chat modes and Salesforce scope, only through this function.
export async function setUserChatAccess(id: number, access: { chatModes: readonly ChatMode[]; salesforceScope: SalesforceScope }, updatedBy: number, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>("UPDATE users SET chat_modes = ?, salesforce_scope = ?, updated_by = ? WHERE id = ?", [access.chatModes.join(","), access.salesforceScope, updatedBy, id]);
}

// Changing the email unlinks Google (so the new account links on its next
// sign-in); switching to Google removes the password (F-06).
export async function updateUserRecord(
  id: number,
  input: UserWriteInput,
  effects: { unlinkGoogle: boolean; clearPassword: boolean },
  updatedBy: number,
  db: Queryable = getDbPool(),
): Promise<void> {
  await db.query<ResultSetHeader>(
    `UPDATE users SET login_id = ?, name = ?, email = ?, whatsapp_number = ?, department_id = ?, designation_id = ?,
       reporting_manager_id = ?, sign_in_method = ?, updated_by = ?,
       firebase_uid = IF(?, NULL, firebase_uid),
       password_hash = IF(?, NULL, password_hash),
       password_set_at = IF(?, NULL, password_set_at)
     WHERE id = ?`,
    [
      input.loginId,
      input.name,
      input.email,
      input.whatsappNumber,
      input.departmentId,
      input.designationId,
      input.reportingManagerId,
      input.signInMethod,
      updatedBy,
      effects.unlinkGoogle,
      effects.clearPassword,
      effects.clearPassword,
      id,
    ],
  );
}

export async function replaceUserRoles(userId: number, roles: readonly RoleCode[], assignedBy: number, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>("DELETE FROM user_roles WHERE user_id = ?", [userId]);
  if (roles.length === 0) return;
  await db.query<ResultSetHeader>(
    `INSERT INTO user_roles (user_id, role_id, assigned_by) SELECT ?, r.id, ? FROM roles r WHERE r.code IN (?)`,
    [userId, assignedBy, roles],
  );
}

export async function setUserActive(userId: number, active: boolean, updatedBy: number, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>("UPDATE users SET active = ?, updated_by = ? WHERE id = ?", [active, updatedBy, userId]);
}

export async function unlockUser(userId: number, updatedBy: number, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>("UPDATE users SET locked_until = NULL, failed_login_count = 0, updated_by = ? WHERE id = ?", [updatedBy, userId]);
}
