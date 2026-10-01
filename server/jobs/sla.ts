import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { INDIA_TODAY_SQL } from "@/lib/db/repositories/directory.repository";
import { listUserIdsWithRole } from "@/lib/db/repositories/users.repository";
import { getEnv } from "@/config/environment";
import { notify } from "@/server/notifications/notify";
import { requestLink } from "@/server/approvals/messages";
import { logError } from "@/lib/logging/logger";

// SLA reminders and escalation (F-31, D-063), run by the job runner.
//   due time reached      → REMINDER to the approver and their active delegate
//   twice the time passed → ESCALATION to the approver's manager and IT Admins
// Each is sent once per task (task_reminders). Requests on hold are skipped.
export interface SlaRow {
  taskId: number;
  isDue: boolean;
  isEscalationDue: boolean;
  reminded: boolean;
  escalated: boolean;
}

// Pure (unit-tested): what to send now for one task.
export function slaActions(row: SlaRow): ("REMINDER" | "ESCALATION")[] {
  const actions: ("REMINDER" | "ESCALATION")[] = [];
  if (row.isDue && !row.reminded) actions.push("REMINDER");
  if (row.isEscalationDue && !row.escalated) actions.push("ESCALATION");
  return actions;
}

export async function runSlaChecks(): Promise<{ reminders: number; escalations: number }> {
  const [rows] = await getDbPool().query<
    (RowDataPacket & {
      id: number;
      request_id: number;
      request_no: string;
      title: string;
      node_label: string;
      approver_id: number;
      approver_name: string;
      manager_id: number | null;
      is_due: number;
      is_escalation_due: number;
      reminded: number;
      escalated: number;
    })[]
  >(
    `SELECT t.id, t.request_id, r.request_no, r.title, t.node_label, t.approver_id, u.name AS approver_name, u.reporting_manager_id AS manager_id,
            (t.due_at <= CURRENT_TIMESTAMP) AS is_due,
            (DATE_ADD(t.due_at, INTERVAL TIMESTAMPDIFF(SECOND, t.created_at, t.due_at) SECOND) <= CURRENT_TIMESTAMP) AS is_escalation_due,
            EXISTS (SELECT 1 FROM task_reminders m WHERE m.task_id = t.id AND m.kind = 'REMINDER') AS reminded,
            EXISTS (SELECT 1 FROM task_reminders m WHERE m.task_id = t.id AND m.kind = 'ESCALATION') AS escalated
     FROM approval_tasks t
     JOIN approval_requests r ON r.id = t.request_id
     JOIN users u ON u.id = t.approver_id
     WHERE t.status = 'PENDING' AND r.status = 'IN_PROGRESS' AND t.due_at IS NOT NULL AND t.due_at <= CURRENT_TIMESTAMP
     ORDER BY t.due_at LIMIT 200`,
  );
  const base = getEnv().APP_BASE_URL ?? "https://approvals.arssteels.net";
  let adminIds: number[] | null = null;
  const result = { reminders: 0, escalations: 0 };

  for (const row of rows) {
    const actions = slaActions({ taskId: row.id, isDue: row.is_due === 1, isEscalationDue: Number(row.is_escalation_due) === 1, reminded: Number(row.reminded) === 1, escalated: Number(row.escalated) === 1 });
    for (const kind of actions) {
      // Claim first: only one runner ever sends a given notice.
      const [claim] = await getDbPool().query<ResultSetHeader>("INSERT IGNORE INTO task_reminders (task_id, kind) VALUES (?, ?)", [row.id, kind]);
      if (claim.affectedRows !== 1) continue;
      const link = requestLink(base, row.request_id);
      const ref = `${row.request_no} · ${row.title}`;
      try {
        if (kind === "REMINDER") {
          const [delegates] = await getDbPool().query<(RowDataPacket & { delegate_id: number })[]>(
            `SELECT delegate_id FROM delegations WHERE user_id = ? AND ended_at IS NULL AND ${INDIA_TODAY_SQL} BETWEEN starts_on AND ends_on`,
            [row.approver_id],
          );
          for (const userId of [row.approver_id, ...delegates.map((d) => d.delegate_id)]) {
            await notify({
              eventType: "APPROVAL_REMINDER",
              userId,
              title: "Approval overdue",
              message: `"${row.node_label}" is waiting for a decision: ${ref}`,
              deepLink: link,
              email: { subject: `Reminder: ${row.request_no} is waiting for you`, text: `This approval has passed its response time.\n\n${ref}\nStep: ${row.node_label}\n\n${link}` },
              whatsappVariables: { request_no: row.request_no, title: row.title, link },
            });
          }
          result.reminders += 1;
        } else {
          adminIds ??= await listUserIdsWithRole("IT_ADMIN");
          const recipients = new Set<number>([...(row.manager_id ? [row.manager_id] : []), ...adminIds]);
          recipients.delete(row.approver_id);
          for (const userId of recipients) {
            await notify({
              eventType: "APPROVAL_ESCALATED",
              userId,
              title: "Approval escalated",
              message: `${row.approver_name} hasn't acted on "${row.node_label}" for twice the allowed time: ${ref}`,
              deepLink: link,
              email: {
                subject: `Escalation: ${row.request_no} is stuck with ${row.approver_name}`,
                text: `${row.approver_name} hasn't acted on "${row.node_label}" for twice the allowed time.\n\n${ref}\n\nIT can hand the approval over if needed.\n${link}`,
              },
              whatsappVariables: null,
            });
          }
          result.escalations += 1;
        }
      } catch (error) {
        logError("sla: notify failed", error, { taskId: row.id, kind });
      }
    }
  }
  return result;
}
