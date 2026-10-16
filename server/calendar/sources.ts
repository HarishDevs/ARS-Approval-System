import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { loadNeededBy } from "@/server/approvals/calendar";
import { parseInfoSettings } from "@/server/modules/settings";
import { addDays, type BusinessSource } from "@/server/calendar/events";

// v1.11.0 (D-153): the business dates on one person's calendar, both for the
// calendar page and for Google. Only the person's own work, which they can
// already open in its module (brief §6-8, §13):
//   - approvals waiting on them, by due time;
//   - their own requests (or those waiting on them), by "needed by" date;
//   - tasks assigned to them that are still open, by due time;
//   - information sent to them, of a type marked for the calendar, by its
//     effective date.
// Nothing here changes a record: a calendar event is never a decision,
// a completion or an acknowledgement.
export interface SourceSwitches {
  approvalDue: boolean;
  neededBy: boolean;
  taskDue: boolean;
  infoEvents: boolean;
}

const DEADLINE_MINUTES = 30;
const timed = (due: Date) => ({ kind: "timed" as const, start: due, end: new Date(due.getTime() + DEADLINE_MINUTES * 60_000) });
const IST = 330 * 60_000;
export const indiaDate = (value: Date) => new Date(value.getTime() + IST).toISOString().slice(0, 10);
// The UTC instant at which an India date starts.
const indiaStart = (date: string) => new Date(new Date(`${date}T00:00:00Z`).getTime() - IST);

export async function businessSources(user: { id: number; roles: readonly string[] }, range: { from: string; to: string }, switches: SourceSwitches): Promise<BusinessSource[]> {
  const db = getDbPool();
  const out: BusinessSource[] = [];
  const fromUtc = indiaStart(range.from);
  const toUtc = indiaStart(addDays(range.to, 1));

  if (switches.approvalDue) {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT t.id, t.due_at, r.id AS request_id, r.request_no, r.title
       FROM approval_tasks t JOIN approval_requests r ON r.id = t.request_id
       WHERE t.approver_id = ? AND t.status = 'PENDING' AND t.task_type = 'APPROVAL' AND r.status = 'IN_PROGRESS' AND r.deleted_at IS NULL
         AND t.due_at IS NOT NULL AND t.due_at >= ? AND t.due_at < ?
       ORDER BY t.due_at LIMIT 500`,
      [user.id, fromUtc, toUtc],
    );
    for (const row of rows) out.push({ entityType: "APPROVAL_TASK", entityId: Number(row.id), ref: row.request_no, title: row.title, path: `/users/requests/${row.request_id}`, when: timed(row.due_at) });
  }

  if (switches.neededBy) {
    const months = new Set<string>();
    for (let day = range.from; day <= range.to && months.size < 14; day = addDays(day, 28)) months.add(day.slice(0, 7));
    months.add(range.to.slice(0, 7));
    const seen = new Set<number>();
    for (const month of months) {
      for (const item of await loadNeededBy({ id: user.id, roles: user.roles as never }, month, { mine: true })) {
        if (seen.has(item.id) || item.date < range.from || item.date > range.to || !["IN_PROGRESS", "ON_HOLD", "APPROVED"].includes(item.status)) continue;
        seen.add(item.id);
        out.push({ entityType: "REQUEST", entityId: item.id, ref: item.requestNo, title: item.title, path: `/users/requests/${item.id}`, when: { kind: "allDay", startDate: item.date, endDate: item.date } });
      }
    }
  }

  if (switches.taskDue) {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT id, task_no, title, due_at FROM tasks
       WHERE assignee_id = ? AND status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED') AND due_at IS NOT NULL AND due_at >= ? AND due_at < ?
       ORDER BY due_at LIMIT 500`,
      [user.id, fromUtc, toUtc],
    );
    for (const row of rows) out.push({ entityType: "TASK", entityId: Number(row.id), ref: row.task_no, title: row.title, path: `/users/tasks/${row.id}`, when: timed(row.due_at) });
  }

  if (switches.infoEvents) {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT i.id, i.info_no, i.title, i.effective_on, v.settings_json
       FROM info_items i JOIN info_recipients rc ON rc.info_id = i.id AND rc.user_id = ?
         JOIN module_type_versions v ON v.id = i.type_version_id
       WHERE i.status = 'PUBLISHED' AND i.effective_on IS NOT NULL AND i.effective_on BETWEEN ? AND ?
       ORDER BY i.effective_on LIMIT 500`,
      [user.id, range.from, range.to],
    );
    for (const row of rows) {
      if (!parseInfoSettings(row.settings_json).calendar) continue; // only types marked for the calendar
      const date = row.effective_on instanceof Date ? row.effective_on.toISOString().slice(0, 10) : String(row.effective_on).slice(0, 10);
      out.push({ entityType: "INFO", entityId: Number(row.id), ref: row.info_no, title: row.title, path: `/users/information/${row.id}`, when: { kind: "allDay", startDate: date, endDate: date } });
    }
  }
  return out;
}
