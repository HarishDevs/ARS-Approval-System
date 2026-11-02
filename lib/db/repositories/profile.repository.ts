import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";

// D-230: the profile: everything the user master holds about a person, their
// photo and "About me". Only active people are shown to others.
export interface PersonProfile {
  id: number;
  name: string;
  loginId: string;
  email: string;
  whatsappNumber: string | null;
  active: boolean;
  departmentName: string | null;
  departmentHeadName: string | null;
  designationName: string | null;
  /** v1.49.0: their designation is ticked Approver (the blue default picture). */
  isApprover: boolean;
  managerId: number | null;
  managerName: string | null;
  managerDesignation: string | null;
  signInMethod: string;
  moduleAccess: string;
  roles: string[];
  createdAt: Date;
  lastLoginAt: Date | null;
  photoUpdatedAt: Date | null;
  aboutMe: string | null;
  directReports: { id: number; name: string; designation: string | null; photoUpdatedAt: Date | null; isApprover: boolean }[];
  away: { until: string; delegateName: string } | null;
}

export async function personProfile(userId: number, db: Queryable = getDbPool()): Promise<PersonProfile | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT u.id, u.name, u.login_id, u.email, u.whatsapp_number, u.active, u.sign_in_method, u.module_access, u.created_at, u.last_login_at,
            u.photo_updated_at, u.about_me, u.reporting_manager_id,
            d.name AS department_name, h.name AS hod_name, g.name AS designation_name, COALESCE(g.is_approver, FALSE) AS designation_is_approver, m.name AS manager_name, mg.name AS manager_designation
     FROM users u
     LEFT JOIN departments d ON d.id = u.department_id
     LEFT JOIN users h ON h.id = d.hod_user_id
     LEFT JOIN designations g ON g.id = u.designation_id
     LEFT JOIN users m ON m.id = u.reporting_manager_id
     LEFT JOIN designations mg ON mg.id = m.designation_id
     WHERE u.id = ? LIMIT 1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  const [[roles], [reports], [away]] = await Promise.all([
    db.query<RowDataPacket[]>("SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? ORDER BY r.code", [userId]),
    db.query<RowDataPacket[]>(
      `SELECT u.id, u.name, g.name AS designation, COALESCE(g.is_approver, FALSE) AS is_approver, u.photo_updated_at FROM users u LEFT JOIN designations g ON g.id = u.designation_id
       WHERE u.reporting_manager_id = ? AND u.active = TRUE ORDER BY u.name LIMIT 200`,
      [userId],
    ),
    db.query<RowDataPacket[]>(
      `SELECT DATE_FORMAT(dl.ends_on, '%Y-%m-%d') AS ends_on, du.name AS delegate_name FROM delegations dl JOIN users du ON du.id = dl.delegate_id
       WHERE dl.user_id = ? AND dl.ended_at IS NULL AND dl.starts_on <= CURRENT_DATE AND dl.ends_on >= CURRENT_DATE ORDER BY dl.ends_on DESC LIMIT 1`,
      [userId],
    ),
  ]);
  return {
    id: Number(row.id),
    name: String(row.name),
    loginId: String(row.login_id),
    email: String(row.email),
    whatsappNumber: row.whatsapp_number ? String(row.whatsapp_number) : null,
    active: Boolean(row.active),
    departmentName: row.department_name ?? null,
    departmentHeadName: row.hod_name ?? null,
    designationName: row.designation_name ?? null,
    isApprover: Boolean(Number(row.designation_is_approver)) && Boolean(row.active),
    managerId: row.reporting_manager_id ? Number(row.reporting_manager_id) : null,
    managerName: row.manager_name ?? null,
    managerDesignation: row.manager_designation ?? null,
    signInMethod: String(row.sign_in_method),
    moduleAccess: String(row.module_access ?? ""),
    roles: roles.map((role) => String(role.code)),
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at ?? null,
    photoUpdatedAt: row.photo_updated_at ?? null,
    aboutMe: row.about_me ?? null,
    directReports: reports.map((report) => ({ id: Number(report.id), name: String(report.name), designation: report.designation ?? null, photoUpdatedAt: report.photo_updated_at ?? null, isApprover: Boolean(Number(report.is_approver)) })),
    away: away[0] ? { until: String(away[0].ends_on), delegateName: String(away[0].delegate_name) } : null,
  };
}

export async function photoOf(userId: number, db: Queryable = getDbPool()): Promise<{ path: string; type: string; updatedAt: Date } | null> {
  const [rows] = await db.query<RowDataPacket[]>("SELECT photo_path, photo_type, photo_updated_at FROM users WHERE id = ? AND active = TRUE AND photo_path IS NOT NULL LIMIT 1", [userId]);
  const row = rows[0];
  return row ? { path: String(row.photo_path), type: String(row.photo_type), updatedAt: row.photo_updated_at } : null;
}

// v1.49.0: whether the person's designation is ticked Approver (their default
// profile picture is the blue icon, else the white one).
export async function isApproverDesignation(userId: number, db: Queryable = getDbPool()): Promise<boolean> {
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT COALESCE(g.is_approver, FALSE) AS is_approver FROM users u LEFT JOIN designations g ON g.id = u.designation_id WHERE u.id = ? LIMIT 1",
    [userId],
  );
  return Boolean(Number(rows[0]?.is_approver ?? 0));
}

export async function photoVersion(userId: number, db: Queryable = getDbPool()): Promise<Date | null> {
  const [rows] = await db.query<RowDataPacket[]>("SELECT photo_updated_at FROM users WHERE id = ? LIMIT 1", [userId]);
  return rows[0]?.photo_updated_at ?? null;
}

// Returns the previous file, for the caller to remove once the change is saved.
export async function setPhoto(userId: number, photo: { path: string; type: string } | null, db: Queryable = getDbPool()): Promise<string | null> {
  const [rows] = await db.query<RowDataPacket[]>("SELECT photo_path FROM users WHERE id = ? LIMIT 1", [userId]);
  await db.query<ResultSetHeader>("UPDATE users SET photo_path = ?, photo_type = ?, photo_updated_at = ? WHERE id = ?", [photo?.path ?? null, photo?.type ?? null, photo ? new Date() : null, userId]);
  return rows[0]?.photo_path ?? null;
}

export async function setAboutMe(userId: number, about: string | null, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>("UPDATE users SET about_me = ? WHERE id = ?", [about, userId]);
}

// D-232: people for the universal search (an active colleague's name, email or
// User ID), like Asana's People results.
export async function searchPeople(
  q: string,
  limit = 6,
  db: Queryable = getDbPool(),
): Promise<{ id: number; name: string; email: string; designation: string | null; department: string | null; photoUpdatedAt: Date | null }[]> {
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT u.id, u.name, u.email, g.name AS designation, d.name AS department, u.photo_updated_at
     FROM users u LEFT JOIN designations g ON g.id = u.designation_id LEFT JOIN departments d ON d.id = u.department_id
     WHERE u.active = TRUE AND u.is_break_glass = FALSE AND (u.name LIKE ? OR u.email LIKE ? OR u.login_id LIKE ?)
     ORDER BY u.name LIMIT ?`,
    [like, like, like, limit],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    name: String(row.name),
    email: String(row.email),
    designation: row.designation ?? null,
    department: row.department ?? null,
    photoUpdatedAt: row.photo_updated_at ?? null,
  }));
}
