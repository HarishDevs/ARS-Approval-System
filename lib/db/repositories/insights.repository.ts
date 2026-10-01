import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";

// Management dashboard (F-70, D-069). Read-only aggregates.
export interface Insights {
  totals: { open: number; overdue: number; approved30: number; avgHoursToApprove90: number | null };
  openByStep: { workflow: string; level: string; requests: number }[];
  speedByLevel: { workflow: string; level: string; decisions: number; avgHours: number; maxHours: number }[];
  overdue: { requestId: number; requestNo: string; title: string; level: string; approver: string; hoursOverdue: number }[];
  byPerson: { name: string; approved: number; rejected: number; changes: number; avgHours: number }[];
  byMonth: { month: string; raised: number; approved: number; rejected: number; withdrawn: number; open: number }[];
}

const n = (value: unknown) => Number(value ?? 0);

export async function loadInsights(db: Queryable = getDbPool()): Promise<Insights> {
  const [[totals]] = await db.query<RowDataPacket[]>(
    `SELECT
       (SELECT COUNT(*) FROM approval_requests WHERE status IN ('IN_PROGRESS', 'ON_HOLD', 'CHANGES_REQUIRED')) AS open_count,
       (SELECT COUNT(*) FROM approval_tasks t JOIN approval_requests r ON r.id = t.request_id
         WHERE t.status = 'PENDING' AND r.status = 'IN_PROGRESS' AND t.due_at < CURRENT_TIMESTAMP) AS overdue_count,
       (SELECT COUNT(*) FROM approval_requests WHERE status = 'APPROVED' AND closed_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 30 DAY)) AS approved_30,
       (SELECT AVG(TIMESTAMPDIFF(MINUTE, submitted_at, closed_at)) / 60 FROM approval_requests
         WHERE status = 'APPROVED' AND closed_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 90 DAY)) AS avg_hours`,
  );
  const [openByStep] = await db.query<RowDataPacket[]>(
    `SELECT w.name AS workflow, t.node_label AS level, COUNT(DISTINCT t.request_id) AS requests
     FROM approval_tasks t
     JOIN approval_requests r ON r.id = t.request_id
     JOIN workflow_versions v ON v.id = r.workflow_version_id
     JOIN workflow_definitions w ON w.id = v.workflow_id
     WHERE t.status = 'PENDING' AND r.status IN ('IN_PROGRESS', 'ON_HOLD')
     GROUP BY w.name, t.node_label ORDER BY requests DESC, w.name LIMIT 50`,
  );
  const [speed] = await db.query<RowDataPacket[]>(
    `SELECT w.name AS workflow, t.node_label AS level, COUNT(*) AS decisions,
            AVG(TIMESTAMPDIFF(MINUTE, t.created_at, t.decided_at)) / 60 AS avg_hours,
            MAX(TIMESTAMPDIFF(MINUTE, t.created_at, t.decided_at)) / 60 AS max_hours
     FROM approval_tasks t
     JOIN approval_requests r ON r.id = t.request_id
     JOIN workflow_versions v ON v.id = r.workflow_version_id
     JOIN workflow_definitions w ON w.id = v.workflow_id
     WHERE t.decided_at IS NOT NULL AND t.status IN ('APPROVED', 'REJECTED', 'CHANGES_REQUESTED')
       AND t.decided_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 90 DAY)
     GROUP BY w.name, t.node_label ORDER BY avg_hours DESC LIMIT 50`,
  );
  const [overdue] = await db.query<RowDataPacket[]>(
    `SELECT r.id AS request_id, r.request_no, r.title, t.node_label AS level, u.name AS approver,
            TIMESTAMPDIFF(MINUTE, t.due_at, CURRENT_TIMESTAMP) / 60 AS hours_overdue
     FROM approval_tasks t
     JOIN approval_requests r ON r.id = t.request_id
     JOIN users u ON u.id = t.approver_id
     WHERE t.status = 'PENDING' AND r.status = 'IN_PROGRESS' AND t.due_at < CURRENT_TIMESTAMP
     ORDER BY t.due_at LIMIT 100`,
  );
  const [byPerson] = await db.query<RowDataPacket[]>(
    `SELECT u.name,
            SUM(t.status = 'APPROVED') AS approved, SUM(t.status = 'REJECTED') AS rejected, SUM(t.status = 'CHANGES_REQUESTED') AS changes,
            AVG(TIMESTAMPDIFF(MINUTE, t.created_at, t.decided_at)) / 60 AS avg_hours
     FROM approval_tasks t JOIN users u ON u.id = t.decided_by
     WHERE t.decided_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 30 DAY) AND t.status IN ('APPROVED', 'REJECTED', 'CHANGES_REQUESTED')
     GROUP BY u.id, u.name ORDER BY approved + rejected + changes DESC LIMIT 50`,
  );
  const [byMonth] = await db.query<RowDataPacket[]>(
    `SELECT DATE_FORMAT(submitted_at, '%Y-%m') AS month, COUNT(*) AS raised,
            SUM(status = 'APPROVED') AS approved, SUM(status = 'REJECTED') AS rejected, SUM(status = 'CANCELLED') AS withdrawn,
            SUM(status IN ('IN_PROGRESS', 'ON_HOLD', 'CHANGES_REQUIRED')) AS open_count
     FROM approval_requests
     WHERE submitted_at >= DATE_SUB(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL 5 MONTH)
     GROUP BY month ORDER BY month DESC`,
  );
  return {
    totals: { open: n(totals?.open_count), overdue: n(totals?.overdue_count), approved30: n(totals?.approved_30), avgHoursToApprove90: totals?.avg_hours === null ? null : n(totals?.avg_hours) },
    openByStep: openByStep.map((row) => ({ workflow: row.workflow, level: row.level, requests: n(row.requests) })),
    speedByLevel: speed.map((row) => ({ workflow: row.workflow, level: row.level, decisions: n(row.decisions), avgHours: n(row.avg_hours), maxHours: n(row.max_hours) })),
    overdue: overdue.map((row) => ({ requestId: row.request_id, requestNo: row.request_no, title: row.title, level: row.level, approver: row.approver, hoursOverdue: n(row.hours_overdue) })),
    byPerson: byPerson.map((row) => ({ name: row.name, approved: n(row.approved), rejected: n(row.rejected), changes: n(row.changes), avgHours: n(row.avg_hours) })),
    byMonth: byMonth.map((row) => ({ month: row.month, raised: n(row.raised), approved: n(row.approved), rejected: n(row.rejected), withdrawn: n(row.withdrawn), open: n(row.open_count) })),
  };
}
