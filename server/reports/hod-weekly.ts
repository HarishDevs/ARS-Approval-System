import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { sendEmail } from "@/server/integrations/resend/client";
import { getEmailConfig, getSettingValue } from "@/server/settings/values";
import { appBaseUrl } from "@/lib/http/app-url";
import { logError } from "@/lib/logging/logger";
import { hodReportText, hodWeekDue, type HodWeekStats } from "@/server/reports/hod-weekly-text";

// D-247 (audit FI-D01, BD-5): every Monday from 09:00 India time, each active
// department's head gets one email about the requests raised by their
// department in the last 7 days: raised, approved, rejected, open now,
// overdue now, and the oldest still waiting. Off until the Super Admin
// switches it on (Settings → General). Each department is claimed once per
// week (hod_report_runs) before sending, so nobody gets it twice.
export async function runHodWeekly(now = new Date()): Promise<Record<string, number | string>> {
  if ((await getSettingValue("general.hod_weekly_report")) !== "ON") return { hodWeekly: "off" };
  const week = hodWeekDue(now);
  if (!week) return { hodWeekly: "not due" };
  const db = getDbPool();
  const [departments] = await db.query<RowDataPacket[]>(
    `SELECT d.id, d.name, u.id AS hod_id, u.name AS hod_name, u.email AS hod_email
     FROM departments d JOIN users u ON u.id = d.hod_user_id
     WHERE d.active = TRUE AND u.active = TRUE AND u.email IS NOT NULL AND u.email <> ''`,
  );
  let sent = 0;
  let failed = 0;
  for (const department of departments) {
    const [claim] = await db.query<ResultSetHeader>("INSERT IGNORE INTO hod_report_runs (week_start, department_id, hod_user_id) VALUES (?, ?, ?)", [week.weekStart, department.id, department.hod_id]);
    if (claim.affectedRows === 0) continue; // already sent (or being sent) this week
    try {
      const stats = await departmentWeek(Number(department.id), week.from, week.to, now);
      const text = hodReportText({ department: String(department.name), hodName: String(department.hod_name), weekLabel: week.label, stats, link: `${appBaseUrl()}/admin/analytics` });
      await sendEmail(
        await getEmailConfig(),
        { to: String(department.hod_email), subject: `ARS CMS: ${department.name} weekly report (${week.label})`, text, idempotencyKey: `ars-hod-${week.weekStart}-d${department.id}` },
        { fetch },
      );
      await db.query("UPDATE hod_report_runs SET status = 'SENT' WHERE week_start = ? AND department_id = ?", [week.weekStart, department.id]);
      sent += 1;
    } catch (error) {
      failed += 1;
      logError("weekly HOD report failed", error, { departmentId: department.id });
      const note = error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 500) : "Failed";
      await db.query("UPDATE hod_report_runs SET status = 'FAILED', note = ? WHERE week_start = ? AND department_id = ?", [note, week.weekStart, department.id]).catch(() => undefined);
    }
  }
  return { hodWeekly: week.weekStart, sent, failed };
}

async function departmentWeek(departmentId: number, from: Date, to: Date, now: Date): Promise<HodWeekStats> {
  const db = getDbPool();
  const scope = "r.deleted_at IS NULL AND u.department_id = ?";
  const [[counts]] = await db.query<RowDataPacket[]>(
    `SELECT
       SUM(r.submitted_at >= ? AND r.submitted_at < ?) AS raised,
       SUM(r.status = 'APPROVED' AND r.closed_at >= ? AND r.closed_at < ?) AS approved,
       SUM(r.status = 'REJECTED' AND r.closed_at >= ? AND r.closed_at < ?) AS rejected,
       SUM(r.status IN ('IN_PROGRESS', 'ON_HOLD')) AS open_now
     FROM approval_requests r JOIN users u ON u.id = r.requester_id WHERE ${scope}`,
    [from, to, from, to, from, to, departmentId],
  );
  const [[late]] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(DISTINCT r.id) AS overdue
     FROM approval_requests r JOIN users u ON u.id = r.requester_id
     JOIN approval_tasks t ON t.request_id = r.id AND t.status = 'PENDING' AND t.due_at IS NOT NULL AND t.due_at < ?
     WHERE ${scope} AND r.status = 'IN_PROGRESS'`,
    [now, departmentId],
  );
  const [oldest] = await db.query<RowDataPacket[]>(
    `SELECT r.request_no, r.title, r.submitted_at FROM approval_requests r JOIN users u ON u.id = r.requester_id
     WHERE ${scope} AND r.status IN ('IN_PROGRESS', 'ON_HOLD') ORDER BY r.submitted_at LIMIT 5`,
    [departmentId],
  );
  return {
    raised: Number(counts?.raised ?? 0),
    approved: Number(counts?.approved ?? 0),
    rejected: Number(counts?.rejected ?? 0),
    openNow: Number(counts?.open_now ?? 0),
    overdueNow: Number(late?.overdue ?? 0),
    oldest: oldest.map((row) => ({ requestNo: String(row.request_no), title: String(row.title), submittedAt: row.submitted_at as Date })),
  };
}
