import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { visibleToSql } from "@/lib/db/repositories/visibility";
import type { FormField } from "@/server/forms/fields";
import type { Actor } from "@/server/approvals/service";
import { monthGrid, neededByOf, type CalendarItem } from "@/server/approvals/calendar-rules";

export { monthGrid, type CalendarItem };

const isAdmin = (actor: Actor) => actor.roles.includes("IT_ADMIN") || actor.roles.includes("SUPER_ADMIN");

// A2: the needed-by calendar. Open (and approved) requests whose type marks
// a date field as "needed by", in one month, limited to what the viewer may
// see (D-057; IT sees all). "mine" = raised by me or waiting on me.
export async function loadNeededBy(viewer: Actor, month: string, options: { mine?: boolean } = {}): Promise<CalendarItem[]> {
  const visibility = visibleToSql("r");
  const everyone = isAdmin(viewer) && !options.mine;
  const where = options.mine
    ? "(r.requester_id = ? OR EXISTS (SELECT 1 FROM approval_tasks mt WHERE mt.request_id = r.id AND mt.approver_id = ? AND mt.status = 'PENDING'))"
    : everyone
      ? "1 = 1"
      : visibility.sql;
  const params = options.mine ? [viewer.id, viewer.id] : everyone ? [] : visibility.params(viewer.id);
  const [rows] = await getDbPool().query<
    (RowDataPacket & { id: number; request_no: string; title: string; status: CalendarItem["status"]; requester_id: number; requester_name: string; workflow_name: string; form_data_json: unknown; form_json: unknown })[]
  >(
    `SELECT r.id, r.request_no, r.title, r.status, r.requester_id, u.name AS requester_name, w.name AS workflow_name, r.form_data_json, v.form_json
     FROM approval_requests r
     JOIN workflow_versions v ON v.id = r.workflow_version_id
     JOIN workflow_definitions w ON w.id = v.workflow_id
     JOIN users u ON u.id = r.requester_id
     WHERE r.deleted_at IS NULL AND r.status IN ('IN_PROGRESS', 'ON_HOLD', 'CHANGES_REQUIRED', 'APPROVED')
       AND CAST(v.form_json AS CHAR) LIKE '%"neededBy": true%'
       AND ${where}
     ORDER BY r.id DESC LIMIT 3000`,
    params,
  );
  const items: CalendarItem[] = [];
  for (const row of rows) {
    const form = (typeof row.form_json === "string" ? JSON.parse(row.form_json) : row.form_json) as FormField[];
    const data = (typeof row.form_data_json === "string" ? JSON.parse(row.form_data_json) : row.form_data_json) as Record<string, unknown>;
    const date = neededByOf(form, data);
    if (!date || !date.startsWith(month)) continue;
    items.push({ id: row.id, requestNo: row.request_no, title: row.title, status: row.status, requesterName: row.requester_name, workflowName: row.workflow_name, date });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || a.requestNo.localeCompare(b.requestNo));
}
