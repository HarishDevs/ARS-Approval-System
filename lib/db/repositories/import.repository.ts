import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import type { Snapshot, SnapshotUser } from "@/server/import/plan";
import type { RoleCode, SignInMethod } from "@/types/auth";

// Reads for bulk import (S10, F-59): everything the planner compares a file
// against, in a few queries. Password hashes and Google ids are never
// selected, only whether they are set.
export async function loadImportSnapshot(db: Queryable = getDbPool()): Promise<Omit<Snapshot, "actor">> {
  const [users] = await db.query<
    (RowDataPacket & {
      id: number;
      login_id: string;
      name: string;
      email: string;
      whatsapp_number: string | null;
      department_id: number | null;
      designation_id: number | null;
      reporting_manager_id: number | null;
      sign_in_method: SignInMethod;
      active: number;
      is_break_glass: number;
      is_demo: number;
      approver: number;
      google_linked: number;
      has_password: number;
      roles: string | null;
    })[]
  >(
    `SELECT u.id, u.login_id, u.name, u.email, u.whatsapp_number, u.department_id, u.designation_id, u.reporting_manager_id,
            u.sign_in_method, u.active, u.is_break_glass, u.is_demo,
            COALESCE((SELECT d.is_approver FROM designations d WHERE d.id = u.designation_id), FALSE) AS approver,
            (u.firebase_uid IS NOT NULL) AS google_linked, (u.password_hash IS NOT NULL) AS has_password,
            (SELECT GROUP_CONCAT(r.code ORDER BY r.id) FROM user_roles ur JOIN roles r ON r.id = ur.role_id AND r.active = TRUE WHERE ur.user_id = u.id) AS roles
     FROM users u ORDER BY u.name`,
  );
  const [departments] = await db.query<(RowDataPacket & { id: number; code: string; name: string; hod_user_id: number | null; active: number })[]>(
    "SELECT id, code, name, hod_user_id, active FROM departments ORDER BY name",
  );
  const [designations] = await db.query<(RowDataPacket & { id: number; code: string; name: string; is_approver: number; active: number })[]>(
    "SELECT id, code, name, is_approver, active FROM designations ORDER BY name",
  );
  const [groups] = await db.query<(RowDataPacket & { id: number; code: string; name: string; active: number; members: string | null })[]>(
    `SELECT g.id, g.code, g.name, g.active, (SELECT GROUP_CONCAT(m.user_id) FROM approver_group_members m WHERE m.group_id = g.id) AS members
     FROM approver_groups g ORDER BY g.name`,
  );
  const [holidays] = await db.query<(RowDataPacket & { day: string; name: string })[]>(
    "SELECT DATE_FORMAT(holiday_on, '%Y-%m-%d') AS day, name FROM holidays ORDER BY holiday_on",
  );
  return {
    users: users.map(
      (row): SnapshotUser => ({
        id: row.id,
        loginId: row.login_id,
        name: row.name,
        email: row.email,
        whatsappNumber: row.whatsapp_number,
        departmentId: row.department_id,
        designationId: row.designation_id,
        reportingManagerId: row.reporting_manager_id,
        signInMethod: row.sign_in_method,
        roles: (() => {
          const roles = (row.roles ? row.roles.split(",") : []) as RoleCode[];
          return roles.includes("USER") ? roles : (["USER", ...roles] as RoleCode[]);
        })(),
        active: Number(row.active) === 1,
        isBreakGlass: Number(row.is_break_glass) === 1,
        isDemo: Number(row.is_demo) === 1,
        approver: Number(row.approver) === 1,
        googleLinked: Number(row.google_linked) === 1,
        hasPassword: Number(row.has_password) === 1,
      }),
    ),
    departments: departments.map((row) => ({ id: row.id, code: row.code, name: row.name, hodUserId: row.hod_user_id, active: Number(row.active) === 1 })),
    designations: designations.map((row) => ({ id: row.id, code: row.code, name: row.name, isApprover: Number(row.is_approver) === 1, active: Number(row.active) === 1 })),
    groups: groups.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      active: Number(row.active) === 1,
      memberIds: row.members ? row.members.split(",").map(Number) : [],
    })),
    holidays: holidays.map((row) => ({ date: row.day, name: row.name })),
  };
}

export async function setReportingManager(userId: number, managerId: number, updatedBy: number, db: Queryable): Promise<void> {
  await db.query<ResultSetHeader>("UPDATE users SET reporting_manager_id = ?, updated_by = ? WHERE id = ?", [managerId, updatedBy, userId]);
}

export async function upsertHoliday(date: string, name: string, createdBy: number, db: Queryable): Promise<void> {
  await db.query<ResultSetHeader>("INSERT INTO holidays (holiday_on, name, created_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)", [date, name, createdBy]);
}
