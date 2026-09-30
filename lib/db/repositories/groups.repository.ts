import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";

// Approver groups (S3-06): the GROUP approver source, e.g. "Finance
// checkers", where any one or any N of them can approve.
export interface ApproverGroup {
  id: number;
  code: string;
  name: string;
  active: boolean;
  members: { id: number; name: string; active: boolean }[];
}

export async function listGroups(db: Queryable = getDbPool()): Promise<ApproverGroup[]> {
  const [groups] = await db.query<(RowDataPacket & { id: number; code: string; name: string; active: number })[]>(
    "SELECT id, code, name, active FROM approver_groups ORDER BY active DESC, name",
  );
  const [members] = await db.query<(RowDataPacket & { group_id: number; id: number; name: string; active: number })[]>(
    "SELECT m.group_id, u.id, u.name, u.active FROM approver_group_members m JOIN users u ON u.id = m.user_id ORDER BY u.name",
  );
  return groups.map((group) => ({
    id: group.id,
    code: group.code,
    name: group.name,
    active: group.active === 1,
    members: members.filter((member) => member.group_id === group.id).map((member) => ({ id: member.id, name: member.name, active: member.active === 1 })),
  }));
}

export async function insertGroup(input: { code: string; name: string; createdBy: number }, db: Queryable = getDbPool()): Promise<number> {
  const [result] = await db.query<ResultSetHeader>("INSERT INTO approver_groups (code, name, created_by) VALUES (?, ?, ?)", [input.code, input.name, input.createdBy]);
  return result.insertId;
}

export async function updateGroup(id: number, input: { name: string; active: boolean }, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>("UPDATE approver_groups SET name = ?, active = ? WHERE id = ?", [input.name, input.active, id]);
}

export async function addGroupMember(groupId: number, userId: number, addedBy: number, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>("INSERT IGNORE INTO approver_group_members (group_id, user_id, added_by) VALUES (?, ?, ?)", [groupId, userId, addedBy]);
}

export async function removeGroupMember(groupId: number, userId: number, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>("DELETE FROM approver_group_members WHERE group_id = ? AND user_id = ?", [groupId, userId]);
}

export async function listRoleCodes(db: Queryable = getDbPool()): Promise<{ code: string; name: string }[]> {
  const [rows] = await db.query<(RowDataPacket & { code: string; name: string })[]>("SELECT code, name FROM roles WHERE active = TRUE ORDER BY name");
  return rows.map((row) => ({ code: row.code, name: row.name }));
}
