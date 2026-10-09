import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import type { PendingTaskAge } from "@/server/workload/summary";

// #12: every pending approval or work task right now, with its age. Small
// enough for ARS to read whole (hundreds of people).
export async function listPendingTaskAges(db: Queryable = getDbPool()): Promise<PendingTaskAge[]> {
  const [rows] = await db.query<(RowDataPacket & { approver_id: number; name: string; age_seconds: number; overdue: number; on_hold: number })[]>(
    `SELECT t.approver_id, u.name, TIMESTAMPDIFF(SECOND, t.created_at, CURRENT_TIMESTAMP) AS age_seconds,
            (t.due_at IS NOT NULL AND t.due_at < CURRENT_TIMESTAMP AND r.status = 'IN_PROGRESS') AS overdue,
            (r.status = 'ON_HOLD') AS on_hold
     FROM approval_tasks t
     JOIN approval_requests r ON r.id = t.request_id
     JOIN users u ON u.id = t.approver_id
     WHERE t.status = 'PENDING' AND r.status IN ('IN_PROGRESS', 'ON_HOLD') AND r.deleted_at IS NULL
     LIMIT 20000`,
  );
  return rows.map((row) => ({
    approverId: row.approver_id,
    name: row.name,
    ageHours: Math.max(0, Number(row.age_seconds)) / 3600,
    overdue: Number(row.overdue) === 1,
    onHold: Number(row.on_hold) === 1,
  }));
}

export async function pendingCountsByApprover(db: Queryable = getDbPool()): Promise<Map<number, number>> {
  const [rows] = await db.query<(RowDataPacket & { approver_id: number; total: number })[]>(
    `SELECT t.approver_id, COUNT(*) AS total FROM approval_tasks t JOIN approval_requests r ON r.id = t.request_id
     WHERE t.status = 'PENDING' AND r.status IN ('IN_PROGRESS', 'ON_HOLD') AND r.deleted_at IS NULL
     GROUP BY t.approver_id`,
  );
  return new Map(rows.map((row) => [row.approver_id, Number(row.total)]));
}
