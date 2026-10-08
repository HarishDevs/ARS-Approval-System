import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import { isApproverEligible, type ApproverStatus } from "@/server/approvals/approver-rules";

// Approver eligibility reads (S11-03, D-085).
const STATUS_SQL = `SELECT u.id, u.name, u.login_id, u.active, u.is_break_glass, d.name AS designation, COALESCE(d.is_approver, FALSE) AS designation_is_approver
  FROM users u LEFT JOIN designations d ON d.id = u.designation_id`;

type StatusRow = RowDataPacket & { id: number; name: string; login_id: string; active: number; is_break_glass: number; designation: string | null; designation_is_approver: number };

const toStatus = (row: StatusRow): ApproverStatus => ({
  id: row.id,
  name: row.name,
  active: Number(row.active) === 1,
  isBreakGlass: Number(row.is_break_glass) === 1,
  designation: row.designation,
  designationIsApprover: Number(row.designation_is_approver) === 1,
});

export async function approverStatuses(ids: readonly number[], db: Queryable = getDbPool()): Promise<Map<number, ApproverStatus>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const [rows] = await db.query<StatusRow[]>(`${STATUS_SQL} WHERE u.id IN (?)`, [unique]);
  return new Map(rows.map((row) => [row.id, toStatus(row)]));
}

export interface PersonOption {
  id: number;
  name: string;
  loginId: string;
}

// For approver pickers: eligible people, plus any ids passed in `keep`
// (values already saved, which stay selectable until changed).
export async function listApproverOptions(keep: readonly (number | null | undefined)[] = [], db: Queryable = getDbPool()): Promise<PersonOption[]> {
  const keepIds = keep.filter((id): id is number => typeof id === "number");
  const [rows] = await db.query<StatusRow[]>(
    `${STATUS_SQL} WHERE (u.active = TRUE AND u.is_break_glass = FALSE AND d.is_approver = TRUE)${keepIds.length ? " OR u.id IN (?)" : ""} ORDER BY u.name`,
    keepIds.length ? [keepIds] : [],
  );
  return rows.map((row) => {
    const status = toStatus(row);
    return { id: row.id, name: isApproverEligible(status) ? row.name : `${row.name} — not an approver`, loginId: row.login_id };
  });
}
