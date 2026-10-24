import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";

// D-169 (AI module branch): the read-only queries behind the AI's data tools.
// Every query is fixed and parameterised, and limited to the person asking
// (their own queue, requests, tasks and inbox). Nothing here writes, and the
// model never writes SQL. Titles are business text, so they are passed to the
// model as data, never as instructions (see server/ai/assistant.ts).
const num = (value: unknown) => Number(value ?? 0);

export interface WaitingForMe {
  pending: number;
  overdue: number;
  oldestWaitingHours: number | null;
  oldest: { requestNo: string; title: string; waitingHours: number; href: string }[];
}

export async function approvalsWaitingFor(userId: number, db: Queryable = getDbPool()): Promise<WaitingForMe> {
  const [[totals]] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS pending,
            SUM(t.due_at IS NOT NULL AND t.due_at < CURRENT_TIMESTAMP) AS overdue,
            MAX(TIMESTAMPDIFF(HOUR, t.created_at, CURRENT_TIMESTAMP)) AS oldest_hours
     FROM approval_tasks t JOIN approval_requests r ON r.id = t.request_id AND r.deleted_at IS NULL
     WHERE t.approver_id = ? AND t.status = 'PENDING'`,
    [userId],
  );
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT r.id, r.request_no, r.title, TIMESTAMPDIFF(HOUR, t.created_at, CURRENT_TIMESTAMP) AS waiting_hours
     FROM approval_tasks t JOIN approval_requests r ON r.id = t.request_id AND r.deleted_at IS NULL
     WHERE t.approver_id = ? AND t.status = 'PENDING'
     ORDER BY t.created_at ASC LIMIT 5`,
    [userId],
  );
  return {
    pending: num(totals?.pending),
    overdue: num(totals?.overdue),
    oldestWaitingHours: totals?.oldest_hours === null || totals?.oldest_hours === undefined ? null : num(totals.oldest_hours),
    oldest: rows.map((row) => ({ requestNo: String(row.request_no), title: String(row.title), waitingHours: num(row.waiting_hours), href: `/users/requests/${row.id}` })),
  };
}

export interface MyRequests {
  periodDays: number;
  submitted: number;
  byStatus: Record<string, number>;
  averageHoursToClose: number | null;
}

export async function myRequestsSummary(userId: number, periodDays: number, db: Queryable = getDbPool()): Promise<MyRequests> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT r.status, COUNT(*) AS n, AVG(CASE WHEN r.closed_at IS NULL THEN NULL ELSE TIMESTAMPDIFF(MINUTE, r.submitted_at, r.closed_at) END) AS avg_minutes
     FROM approval_requests r
     WHERE r.requester_id = ? AND r.deleted_at IS NULL AND r.submitted_at >= CURRENT_TIMESTAMP - INTERVAL ? DAY
     GROUP BY r.status`,
    [userId, periodDays],
  );
  const byStatus: Record<string, number> = {};
  let closedMinutes = 0;
  let closedCount = 0;
  for (const row of rows) {
    byStatus[String(row.status)] = num(row.n);
    if (row.avg_minutes !== null) {
      closedMinutes += Number(row.avg_minutes) * num(row.n);
      closedCount += num(row.n);
    }
  }
  return {
    periodDays,
    submitted: Object.values(byStatus).reduce((sum, value) => sum + value, 0),
    byStatus,
    averageHoursToClose: closedCount ? Math.round((closedMinutes / closedCount / 60) * 10) / 10 : null,
  };
}

export interface MyTasks {
  open: number;
  inProgress: number;
  blocked: number;
  overdue: number;
  dueWithin7Days: number;
  completedLast30Days: number;
}

export async function myTasksSummary(userId: number, db: Queryable = getDbPool()): Promise<MyTasks> {
  const [[row]] = await db.query<RowDataPacket[]>(
    `SELECT SUM(status = 'OPEN') AS open_count, SUM(status = 'IN_PROGRESS') AS in_progress, SUM(status = 'BLOCKED') AS blocked,
            SUM(status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED') AND due_at IS NOT NULL AND due_at < CURRENT_TIMESTAMP) AS overdue,
            SUM(status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED') AND due_at >= CURRENT_TIMESTAMP AND due_at < CURRENT_TIMESTAMP + INTERVAL 7 DAY) AS due_soon,
            SUM(status = 'COMPLETED' AND completed_at >= CURRENT_TIMESTAMP - INTERVAL 30 DAY) AS completed_recent
     FROM tasks WHERE assignee_id = ?`,
    [userId],
  );
  return {
    open: num(row?.open_count),
    inProgress: num(row?.in_progress),
    blocked: num(row?.blocked),
    overdue: num(row?.overdue),
    dueWithin7Days: num(row?.due_soon),
    completedLast30Days: num(row?.completed_recent),
  };
}

export interface MyInformation {
  unread: number;
  awaitingMyAcknowledgement: number;
}

export async function myInformationSummary(userId: number, db: Queryable = getDbPool()): Promise<MyInformation> {
  const [[row]] = await db.query<RowDataPacket[]>(
    `SELECT SUM(rc.read_at IS NULL) AS unread, SUM(i.ack_required AND rc.acknowledged_at IS NULL) AS awaiting_ack
     FROM info_recipients rc JOIN info_items i ON i.id = rc.info_id AND i.status = 'PUBLISHED'
     WHERE rc.user_id = ?`,
    [userId],
  );
  return { unread: num(row?.unread), awaitingMyAcknowledgement: num(row?.awaiting_ack) };
}

// Phase 6: records copied from an external source, counted per dataset.
export async function sourceDatasetCounts(sourceKey: string, db: Queryable = getDbPool()): Promise<{ dataset: string; records: number; lastSyncedAt: Date | null }[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT dataset, COUNT(*) AS n, MAX(synced_at) AS last_synced FROM ai_source_records WHERE source_key = ? GROUP BY dataset ORDER BY dataset",
    [sourceKey],
  );
  return rows.map((row) => ({ dataset: String(row.dataset), records: num(row.n), lastSyncedAt: row.last_synced ?? null }));
}
