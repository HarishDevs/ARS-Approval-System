import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { INDIA_TODAY_SQL } from "@/lib/db/repositories/directory.repository";
import { listUserIdsWithRole } from "@/lib/db/repositories/users.repository";
import { getEnv } from "@/config/environment";
import { notify } from "@/server/notifications/notify";
import { requestLink } from "@/server/approvals/messages";
import { getNumberSetting } from "@/server/settings/values";
import { logError } from "@/lib/logging/logger";

// SLA reminders and escalation (F-31, D-063, D-100), run by the job runner.
// With a response time T on the step:
//   T passed   → REMINDER to the approver and their active delegate
//   2×T passed → ESCALATION   to the approver's manager and the IT Admins
//   3×T passed → ESCALATION_2 to the manager's manager        (if levels ≥ 2)
//   4×T passed → ESCALATION_3 to the next manager up          (if levels = 3)
// "Escalation levels" (Super Admin → General, 1–3, default 2) sets how far
// it goes. Each notice is sent once per task (task_reminders). Requests on
// hold are skipped.
export type SlaKind = "REMINDER" | "ESCALATION" | "ESCALATION_2" | "ESCALATION_3";
const ESCALATIONS: SlaKind[] = ["ESCALATION", "ESCALATION_2", "ESCALATION_3"];

export interface SlaRow {
  taskId: number;
  isDue: boolean;
  isEscalationDue: boolean;
  reminded: boolean;
  escalated: boolean;
  // How many escalation levels are due by time (0–3) and allowed by the setting.
  levelsDue?: number;
  levelsAllowed?: number;
  sent?: readonly SlaKind[];
}

// Pure (unit-tested): what to send now for one task.
export function slaActions(row: SlaRow): SlaKind[] {
  const sent = new Set<SlaKind>(row.sent ?? [...(row.reminded ? (["REMINDER"] as const) : []), ...(row.escalated ? (["ESCALATION"] as const) : [])]);
  const actions: SlaKind[] = [];
  if (row.isDue && !sent.has("REMINDER")) actions.push("REMINDER");
  const due = row.levelsDue ?? (row.isEscalationDue ? 1 : 0);
  const allowed = row.levelsAllowed ?? 1;
  ESCALATIONS.slice(0, Math.min(due, allowed)).forEach((kind) => {
    if (!sent.has(kind)) actions.push(kind);
  });
  return actions;
}

// #12 "due soon": once 75% of the time to the due time has gone and nothing
// was sent yet, the approver (and their active delegate) gets one heads-up.
// Inbox and email only (no WhatsApp template for it yet); a person can
// switch it off with the other reminders (Notification settings).
export const DUE_SOON_SHARE = 0.75;

export async function runDueSoon(): Promise<number> {
  const [rows] = await getDbPool().query<(RowDataPacket & { id: number; request_id: number; request_no: string; title: string; node_label: string; approver_id: number; due_at: Date })[]>(
    `SELECT t.id, t.request_id, r.request_no, r.title, t.node_label, t.approver_id, t.due_at
     FROM approval_tasks t JOIN approval_requests r ON r.id = t.request_id
     WHERE t.status = 'PENDING' AND r.status = 'IN_PROGRESS' AND r.deleted_at IS NULL
       AND t.due_at IS NOT NULL AND t.due_at > CURRENT_TIMESTAMP
       AND TIMESTAMPDIFF(SECOND, t.created_at, CURRENT_TIMESTAMP) >= ? * TIMESTAMPDIFF(SECOND, t.created_at, t.due_at)
       AND NOT EXISTS (SELECT 1 FROM task_reminders m WHERE m.task_id = t.id)
     ORDER BY t.due_at LIMIT 200`,
    [DUE_SOON_SHARE],
  );
  const base = getEnv().APP_BASE_URL ?? "https://approval.arssteels.net";
  let sent = 0;
  for (const row of rows) {
    const [claim] = await getDbPool().query<ResultSetHeader>("INSERT IGNORE INTO task_reminders (task_id, kind) VALUES (?, 'DUE_SOON')", [row.id]);
    if (claim.affectedRows !== 1) continue;
    const link = requestLink(base, row.request_id);
    const ref = `${row.request_no} · ${row.title}`;
    const due = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(row.due_at);
    try {
      const [delegates] = await getDbPool().query<(RowDataPacket & { delegate_id: number })[]>(
        `SELECT delegate_id FROM delegations WHERE user_id = ? AND ended_at IS NULL AND ${INDIA_TODAY_SQL} BETWEEN starts_on AND ends_on`,
        [row.approver_id],
      );
      for (const userId of [row.approver_id, ...delegates.map((d) => d.delegate_id)]) {
        await notify({
          eventType: "APPROVAL_DUE_SOON",
          userId,
          title: "Approval due soon",
          message: `"${row.node_label}" is due by ${due}: ${ref}`,
          deepLink: link,
          email: { subject: `Due soon: ${row.request_no}`, text: `This approval is due by ${due} (India time).

${ref}
Step: ${row.node_label}

${link}` },
          whatsappVariables: null,
        });
      }
      sent += 1;
    } catch (error) {
      logError("sla: due-soon notify failed", error, { taskId: row.id });
    }
  }
  return sent;
}

export async function runSlaChecks(): Promise<{ reminders: number; escalations: number; dueSoon: number }> {
  const levelsAllowed = Math.min(3, Math.max(1, await getNumberSetting("general.escalation_levels").catch(() => 2)));
  // Tasks past their due time that still have a notice to come: once every
  // notice was sent, a task drops out, so it can't crowd out newer ones (R-08).
  const [rows] = await getDbPool().query<
    (RowDataPacket & {
      id: number;
      request_id: number;
      request_no: string;
      title: string;
      node_label: string;
      approver_id: number;
      approver_name: string;
      manager_1: number | null;
      manager_2: number | null;
      manager_3: number | null;
      levels_due: number;
      sent: string | null;
    })[]
  >(
    `SELECT t.id, t.request_id, r.request_no, r.title, t.node_label, t.approver_id, u.name AS approver_name,
            u.reporting_manager_id AS manager_1, m1.reporting_manager_id AS manager_2, m2.reporting_manager_id AS manager_3,
            -- level 1 at the stored escalation time (working hours), then one more level per response time
            IF(COALESCE(t.escalate_at, DATE_ADD(t.due_at, INTERVAL TIMESTAMPDIFF(SECOND, t.created_at, t.due_at) SECOND)) <= CURRENT_TIMESTAMP,
               1 + FLOOR(TIMESTAMPDIFF(SECOND, COALESCE(t.escalate_at, DATE_ADD(t.due_at, INTERVAL TIMESTAMPDIFF(SECOND, t.created_at, t.due_at) SECOND)), CURRENT_TIMESTAMP)
                         / GREATEST(TIMESTAMPDIFF(SECOND, t.created_at, t.due_at), 1)),
               0) AS levels_due,
            (SELECT GROUP_CONCAT(m.kind) FROM task_reminders m WHERE m.task_id = t.id AND m.kind <> 'DUE_SOON') AS sent
     FROM approval_tasks t
     JOIN approval_requests r ON r.id = t.request_id
     JOIN users u ON u.id = t.approver_id
     LEFT JOIN users m1 ON m1.id = u.reporting_manager_id
     LEFT JOIN users m2 ON m2.id = m1.reporting_manager_id
     WHERE t.status = 'PENDING' AND r.status = 'IN_PROGRESS' AND r.deleted_at IS NULL AND t.due_at IS NOT NULL AND t.due_at <= CURRENT_TIMESTAMP
       AND (SELECT COUNT(*) FROM task_reminders m WHERE m.task_id = t.id AND m.kind <> 'DUE_SOON') < ?
     ORDER BY t.due_at LIMIT 200`,
    [1 + levelsAllowed],
  );
  const base = getEnv().APP_BASE_URL ?? "https://approval.arssteels.net";
  let adminIds: number[] | null = null;
  const result = { reminders: 0, escalations: 0, dueSoon: await runDueSoon() };

  for (const row of rows) {
    const sent = (row.sent ? row.sent.split(",") : []) as SlaKind[];
    const actions = slaActions({ taskId: row.id, isDue: true, isEscalationDue: false, reminded: false, escalated: false, levelsDue: Math.max(0, Number(row.levels_due)), levelsAllowed, sent });
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
          const level = ESCALATIONS.indexOf(kind) + 1;
          const manager = [row.manager_1, row.manager_2, row.manager_3][level - 1] ?? null;
          const recipients = new Set<number>(manager ? [manager] : []);
          if (level === 1) {
            adminIds ??= await listUserIdsWithRole("IT_ADMIN");
            adminIds.forEach((id) => recipients.add(id));
          }
          recipients.delete(row.approver_id);
          const times = level + 1;
          for (const userId of recipients) {
            await notify({
              eventType: "APPROVAL_ESCALATED",
              userId,
              title: level === 1 ? "Approval escalated" : `Approval escalated (level ${level})`,
              message: `${row.approver_name} hasn't acted on "${row.node_label}" for ${times} times the allowed time: ${ref}`,
              deepLink: link,
              email: {
                subject: `Escalation${level > 1 ? ` (level ${level})` : ""}: ${row.request_no} is stuck with ${row.approver_name}`,
                text: `${row.approver_name} hasn't acted on "${row.node_label}" for ${times} times the allowed time.\n\n${ref}\n\nIT can hand the approval over if needed.\n${link}`,
              },
              whatsappVariables: { approver_name: row.approver_name, step: row.node_label, request_no: row.request_no, title: row.title, link },
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
