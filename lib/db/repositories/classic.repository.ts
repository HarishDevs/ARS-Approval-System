import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";

// D-210: the person's own counts for the Classic view's Gateway and module
// menus. Every count is about the person themselves (their requests, their
// approvals, their tasks, information sent to them).
export interface ClassicCounts {
  waiting: number;
  myOpenRequests: number;
  changesAsked: number;
  myOpenTasks: number;
  myOverdueTasks: number;
  assignedByMeOpen: number;
  infoUnread: number;
  infoAwaitingAck: number;
}

export async function classicCounts(userId: number, db: Queryable = getDbPool()): Promise<ClassicCounts> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT
       (SELECT COUNT(*) FROM approval_tasks t JOIN approval_requests r ON r.id = t.request_id
         WHERE t.approver_id = ? AND t.status = 'PENDING' AND r.status = 'IN_PROGRESS' AND r.deleted_at IS NULL) AS waiting,
       (SELECT COUNT(*) FROM approval_requests WHERE requester_id = ? AND status IN ('IN_PROGRESS', 'ON_HOLD') AND deleted_at IS NULL) AS my_open_requests,
       (SELECT COUNT(*) FROM approval_requests WHERE requester_id = ? AND status = 'CHANGES_REQUIRED' AND deleted_at IS NULL) AS changes_asked,
       (SELECT COUNT(*) FROM tasks WHERE assignee_id = ? AND status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED')) AS my_open_tasks,
       (SELECT COUNT(*) FROM tasks WHERE assignee_id = ? AND status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED') AND due_at IS NOT NULL AND due_at < UTC_TIMESTAMP()) AS my_overdue_tasks,
       (SELECT COUNT(*) FROM tasks WHERE (assigned_by = ? OR created_by = ?) AND assignee_id <> ? AND status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED')) AS assigned_by_me_open,
       (SELECT COUNT(*) FROM info_recipients m JOIN info_items i ON i.id = m.info_id WHERE m.user_id = ? AND i.status = 'PUBLISHED' AND m.read_at IS NULL) AS info_unread,
       (SELECT COUNT(*) FROM info_recipients m JOIN info_items i ON i.id = m.info_id WHERE m.user_id = ? AND i.status = 'PUBLISHED' AND i.ack_required = TRUE AND m.acknowledged_at IS NULL) AS info_awaiting_ack`,
    [userId, userId, userId, userId, userId, userId, userId, userId, userId, userId],
  );
  const row = (rows[0] ?? {}) as Record<string, unknown>;
  return {
    waiting: Number(row.waiting ?? 0),
    myOpenRequests: Number(row.my_open_requests ?? 0),
    changesAsked: Number(row.changes_asked ?? 0),
    myOpenTasks: Number(row.my_open_tasks ?? 0),
    myOverdueTasks: Number(row.my_overdue_tasks ?? 0),
    assignedByMeOpen: Number(row.assigned_by_me_open ?? 0),
    infoUnread: Number(row.info_unread ?? 0),
    infoAwaitingAck: Number(row.info_awaiting_ack ?? 0),
  };
}
