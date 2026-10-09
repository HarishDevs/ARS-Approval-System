import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import type { Directory } from "@/server/engine/types";

// The engine's view of "who is who" (F-13), loaded once per action. Small
// enough for ARS (hundreds of people) to read whole; approvers are then
// resolved against the same snapshot for the whole engine call.
export interface DirectorySnapshot {
  users: { id: number; active: boolean; managerId: number | null; departmentId: number | null; isBreakGlass: boolean; approver?: boolean; designationId?: number | null }[];
  departmentHods: Map<number, number | null>;
  roleMembers: Map<string, number[]>;
  groupMembers: Map<number, number[]>;
  // delegate → the people they may act for today (D-062)
  delegations: Map<number, Set<number>>;
}

// Today's date in India, whatever the database server's own timezone is.
export const INDIA_TODAY_SQL = "DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE))";

export async function loadDirectorySnapshot(db: Queryable = getDbPool()): Promise<DirectorySnapshot> {
  const [users] = await db.query<(RowDataPacket & { id: number; active: number; reporting_manager_id: number | null; department_id: number | null; is_break_glass: number; approver: number; designation_id: number | null })[]>(
    // approver: the designation is ticked as Approver (D-085), for checking choices.
    // designation_id only when the designation is active (D-097 source).
    `SELECT u.id, u.active, u.reporting_manager_id, u.department_id, u.is_break_glass, COALESCE(d.is_approver, FALSE) AS approver,
            IF(d.active, u.designation_id, NULL) AS designation_id
     FROM users u LEFT JOIN designations d ON d.id = u.designation_id`,
  );
  const [departments] = await db.query<(RowDataPacket & { id: number; hod_user_id: number | null; active: number })[]>("SELECT id, hod_user_id, active FROM departments");
  const [roles] = await db.query<(RowDataPacket & { code: string; user_id: number })[]>(
    "SELECT r.code, ur.user_id FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.active = TRUE",
  );
  const [groups] = await db.query<(RowDataPacket & { group_id: number; user_id: number })[]>(
    "SELECT m.group_id, m.user_id FROM approver_group_members m JOIN approver_groups g ON g.id = m.group_id WHERE g.active = TRUE",
  );

  const [delegationRows] = await db.query<(RowDataPacket & { user_id: number; delegate_id: number })[]>(
    `SELECT user_id, delegate_id FROM delegations WHERE ended_at IS NULL AND ${INDIA_TODAY_SQL} BETWEEN starts_on AND ends_on`,
  );
  const delegations = new Map<number, Set<number>>();
  for (const row of delegationRows) delegations.set(row.delegate_id, new Set([...(delegations.get(row.delegate_id) ?? []), row.user_id]));

  const roleMembers = new Map<string, number[]>();
  for (const row of roles) roleMembers.set(row.code, [...(roleMembers.get(row.code) ?? []), row.user_id]);
  const groupMembers = new Map<number, number[]>();
  for (const row of groups) groupMembers.set(row.group_id, [...(groupMembers.get(row.group_id) ?? []), row.user_id]);

  return {
    users: users.map((row) => ({
      id: row.id,
      active: row.active === 1,
      managerId: row.reporting_manager_id,
      departmentId: row.department_id,
      isBreakGlass: row.is_break_glass === 1,
      approver: Number(row.approver) === 1,
      designationId: row.designation_id === null ? null : Number(row.designation_id),
    })),
    departmentHods: new Map(departments.filter((row) => row.active === 1).map((row) => [row.id, row.hod_user_id])),
    roleMembers,
    groupMembers,
    delegations,
  };
}

// Pure adapter (unit-tested): snapshot → the engine's Directory interface.
// The break-glass account is never an approver. A delegate acts only for
// the people who named them, only while active, and never in a chain.
export function toDirectory(snapshot: DirectorySnapshot): Directory {
  const byId = new Map(snapshot.users.map((user) => [user.id, user]));
  const eligible = (id: number | null | undefined): number | null => {
    if (id === null || id === undefined) return null;
    const user = byId.get(id);
    return user && user.active && !user.isBreakGlass ? id : null;
  };
  return {
    isActive: (userId) => eligible(userId) !== null,
    managerOf: (userId) => byId.get(userId)?.managerId ?? null,
    departmentHodOf: (userId) => {
      const departmentId = byId.get(userId)?.departmentId;
      return departmentId ? (snapshot.departmentHods.get(departmentId) ?? null) : null;
    },
    hodOfDepartment: (departmentId) => snapshot.departmentHods.get(departmentId) ?? null,
    usersWithRole: (roleCode) => snapshot.roleMembers.get(roleCode) ?? [],
    groupMembers: (groupId) => snapshot.groupMembers.get(groupId) ?? [],
    canActFor: (actorId, approverId) => eligible(actorId) !== null && (snapshot.delegations.get(actorId)?.has(approverId) ?? false),
    usersWithDesignation: (designationId) => snapshot.users.filter((user) => user.designationId === designationId).map((user) => user.id),
    departmentOf: (userId) => byId.get(userId)?.departmentId ?? null,
  };
}
