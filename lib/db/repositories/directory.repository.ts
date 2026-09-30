import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import type { Directory } from "@/server/engine/types";

// The engine's view of "who is who" (F-13), loaded once per action. Small
// enough for ARS (hundreds of people) to read whole; approvers are then
// resolved against the same snapshot for the whole engine call.
export interface DirectorySnapshot {
  users: { id: number; active: boolean; managerId: number | null; departmentId: number | null; isBreakGlass: boolean }[];
  departmentHods: Map<number, number | null>;
  roleMembers: Map<string, number[]>;
  groupMembers: Map<number, number[]>;
}

export async function loadDirectorySnapshot(db: Queryable = getDbPool()): Promise<DirectorySnapshot> {
  const [users] = await db.query<(RowDataPacket & { id: number; active: number; reporting_manager_id: number | null; department_id: number | null; is_break_glass: number })[]>(
    "SELECT id, active, reporting_manager_id, department_id, is_break_glass FROM users",
  );
  const [departments] = await db.query<(RowDataPacket & { id: number; hod_user_id: number | null; active: number })[]>("SELECT id, hod_user_id, active FROM departments");
  const [roles] = await db.query<(RowDataPacket & { code: string; user_id: number })[]>(
    "SELECT r.code, ur.user_id FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.active = TRUE",
  );
  const [groups] = await db.query<(RowDataPacket & { group_id: number; user_id: number })[]>(
    "SELECT m.group_id, m.user_id FROM approver_group_members m JOIN approver_groups g ON g.id = m.group_id WHERE g.active = TRUE",
  );

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
    })),
    departmentHods: new Map(departments.filter((row) => row.active === 1).map((row) => [row.id, row.hod_user_id])),
    roleMembers,
    groupMembers,
  };
}

// Pure adapter (unit-tested): snapshot → the engine's Directory interface.
// The break-glass account is never an approver. Delegation records don't
// exist yet (P4), so nobody can act for anyone.
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
    canActFor: () => false,
  };
}
