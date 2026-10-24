import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import type { RoleCode, SignInMethod, ModuleCode } from "@/types/auth";
import { parseModuleSet } from "@/server/modules/modules";

export interface UserRecord {
  id: number;
  loginId: string;
  name: string;
  email: string;
  whatsappNumber: string | null;
  signInMethod: SignInMethod;
  firebaseUid: string | null;
  passwordHash: string | null;
  failedLoginCount: number;
  lockedSecondsRemaining: number;
  active: boolean;
  isBreakGlass: boolean;
  isDemo: boolean;
  breakGlassSecondsRemaining: number;
  hasLoggedInBefore: boolean;
  roles: RoleCode[];
  modules: ModuleCode[]; // D-168
}

interface UserRow extends RowDataPacket {
  id: number;
  login_id: string;
  name: string;
  email: string;
  whatsapp_number: string | null;
  sign_in_method: SignInMethod;
  firebase_uid: string | null;
  password_hash: string | null;
  failed_login_count: number;
  locked_seconds_remaining: number | null;
  active: number;
  is_break_glass: number;
  is_demo: number;
  break_glass_seconds_remaining: number | null;
  last_login_at: Date | null;
  role_codes: string | null;
  module_access: string | null;
}

// Lock/break-glass windows are computed by MySQL against its own clock
// (never mix JS Dates with CURRENT_TIMESTAMP — Power BI site lesson).
const SELECT_USER = `
  SELECT u.id, u.login_id, u.name, u.email, u.whatsapp_number, u.sign_in_method, u.firebase_uid,
         u.password_hash, u.failed_login_count, u.active, u.is_break_glass, u.is_demo, u.last_login_at, u.module_access,
         GREATEST(COALESCE(TIMESTAMPDIFF(SECOND, CURRENT_TIMESTAMP, u.locked_until), 0), 0) AS locked_seconds_remaining,
         GREATEST(COALESCE(TIMESTAMPDIFF(SECOND, CURRENT_TIMESTAMP, u.break_glass_until), 0), 0) AS break_glass_seconds_remaining,
         (SELECT GROUP_CONCAT(r.code) FROM user_roles ur JOIN roles r ON r.id = ur.role_id AND r.active = TRUE
           WHERE ur.user_id = u.id) AS role_codes
  FROM users u`;

function toUser(row: UserRow): UserRecord {
  const roles = (row.role_codes ? row.role_codes.split(",") : []) as RoleCode[];
  if (!roles.includes("USER")) roles.push("USER");
  return {
    id: row.id,
    loginId: row.login_id,
    name: row.name,
    email: row.email,
    whatsappNumber: row.whatsapp_number,
    signInMethod: row.sign_in_method,
    firebaseUid: row.firebase_uid,
    passwordHash: row.password_hash,
    failedLoginCount: row.failed_login_count,
    lockedSecondsRemaining: Number(row.locked_seconds_remaining ?? 0),
    active: row.active === 1,
    isBreakGlass: row.is_break_glass === 1,
    isDemo: row.is_demo === 1,
    breakGlassSecondsRemaining: Number(row.break_glass_seconds_remaining ?? 0),
    hasLoggedInBefore: row.last_login_at !== null,
    roles,
    modules: parseModuleSet(row.module_access),
  };
}

async function findOne(where: string, params: unknown[], db: Queryable): Promise<UserRecord | null> {
  const [rows] = await db.query<UserRow[]>(`${SELECT_USER} WHERE ${where} LIMIT 1`, params);
  return rows[0] ? toUser(rows[0]) : null;
}

export function findUserById(id: number, db: Queryable = getDbPool()) {
  return findOne("u.id = ?", [id], db);
}

export function findUserByLoginId(loginId: string, db: Queryable = getDbPool()) {
  return findOne("LOWER(u.login_id) = LOWER(?)", [loginId.trim()], db);
}

export function findUserByFirebaseUid(uid: string, db: Queryable = getDbPool()) {
  return findOne("u.firebase_uid = ?", [uid], db);
}

// Only an account whose firebase_uid is still empty can be linked by email,
// so an already-linked account is never re-linked (Power BI site rule).
export function findUnlinkedUserByEmail(email: string, db: Queryable = getDbPool()) {
  return findOne("LOWER(u.email) = LOWER(?) AND u.firebase_uid IS NULL", [email.trim()], db);
}

export async function linkFirebaseUid(userId: number, uid: string, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>("UPDATE users SET firebase_uid = ? WHERE id = ? AND firebase_uid IS NULL", [uid, userId]);
}

export async function markLoginSuccess(userId: number, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>(
    "UPDATE users SET last_login_at = CURRENT_TIMESTAMP, failed_login_count = 0, locked_until = NULL WHERE id = ?",
    [userId],
  );
}

export async function resetFailedLogins(userId: number, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>("UPDATE users SET failed_login_count = 0 WHERE id = ?", [userId]);
}

// Returns the new failure count; locks the account when it reaches the
// threshold.
export async function recordFailedPassword(
  userId: number,
  threshold: number,
  lockMinutes: number,
  db: Queryable = getDbPool(),
): Promise<{ failedCount: number; locked: boolean }> {
  await db.query<ResultSetHeader>(
    // MySQL applies SET assignments left to right, so locked_until must be
    // computed before failed_login_count is incremented.
    `UPDATE users SET
       locked_until = IF(failed_login_count + 1 >= ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? MINUTE), locked_until),
       failed_login_count = failed_login_count + 1
     WHERE id = ?`,
    [threshold, lockMinutes, userId],
  );
  const [rows] = await db.query<(RowDataPacket & { failed_login_count: number })[]>(
    "SELECT failed_login_count FROM users WHERE id = ?",
    [userId],
  );
  const failedCount = rows[0]?.failed_login_count ?? 0;
  return { failedCount, locked: failedCount >= threshold };
}

// "This wasn't me": locked until an admin unlocks it (P1-19).
export async function securityLockUser(userId: number, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>("UPDATE users SET locked_until = '9999-12-31 00:00:00' WHERE id = ?", [userId]);
}

export async function listUserIdsWithRole(role: RoleCode, db: Queryable = getDbPool()): Promise<number[]> {
  const [rows] = await db.query<(RowDataPacket & { id: number })[]>(
    `SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
     WHERE r.code = ? AND u.active = TRUE AND u.is_break_glass = FALSE`,
    [role],
  );
  return rows.map((row) => row.id);
}

// ---- the signed-in person's own profile (/users/profile) ------------------
export interface OwnProfile {
  departmentName: string | null;
  designationName: string | null;
  reportingManagerName: string | null;
  lastLoginAt: Date | null;
}

export async function getOwnProfile(userId: number, db: Queryable = getDbPool()): Promise<OwnProfile | null> {
  const [rows] = await db.query<(RowDataPacket & { department_name: string | null; designation_name: string | null; manager_name: string | null; last_login_at: Date | null })[]>(
    `SELECT d.name AS department_name, g.name AS designation_name, m.name AS manager_name, u.last_login_at
     FROM users u
     LEFT JOIN departments d ON d.id = u.department_id
     LEFT JOIN designations g ON g.id = u.designation_id
     LEFT JOIN users m ON m.id = u.reporting_manager_id
     WHERE u.id = ? LIMIT 1`,
    [userId],
  );
  const row = rows[0];
  return row ? { departmentName: row.department_name, designationName: row.designation_name, reportingManagerName: row.manager_name, lastLoginAt: row.last_login_at } : null;
}
