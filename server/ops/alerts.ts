import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { listUserIdsWithRole } from "@/lib/db/repositories/users.repository";
import { notify } from "@/server/notifications/notify";
import { logError } from "@/lib/logging/logger";
import { getRunnerHeartbeat } from "@/lib/db/repositories/jobs.repository";
import { appBaseUrl } from "@/lib/http/app-url";

// #14: the Super Admin hears when the job runner or the daily backup fails,
// at most once a day per kind (the audit log is the "already sent" record).
// No details of the error go in the message: they are in the server log,
// under the reference shown.
export type OpsAlertKind = "JOB_RUNNER_FAILED" | "BACKUP_FAILED" | "JOB_RUNNER_STOPPED" | "CALENDAR_SYNC_FAILED" | "FILE_STORAGE_FAILED";

const TEXT: Record<OpsAlertKind, { title: string; body: string }> = {
  JOB_RUNNER_FAILED: { title: "Scheduled jobs failed", body: "The 5-minute job run (messages, reminders, backups) failed." },
  BACKUP_FAILED: { title: "Daily backup failed", body: "Today's database backup could not be made. The job runner will keep trying." },
  JOB_RUNNER_STOPPED: { title: "Scheduled jobs have stopped", body: "The 5-minute job run hasn't run for over 2 hours, so messages, reminders, expiry notices and backups are waiting. Check the cron job in cPanel." },
  FILE_STORAGE_FAILED: { title: "File uploads are failing", body: "Files people attach can't be written to the server's upload folder, so uploads fail. See Super Admin → Overview → File storage for the cause and the fix (DEPLOYMENT Part C)." },
  CALENDAR_SYNC_FAILED: { title: "Google Calendar sync is failing", body: "A Google Calendar sync has failed every retry. See Super Admin → Integrations → Google Calendar for the failed syncs and retry them." },
};

export async function alertSuperAdmin(kind: OpsAlertKind, reference: string | null): Promise<boolean> {
  try {
    const [sent] = await getDbPool().query<RowDataPacket[]>(
      "SELECT 1 FROM audit_logs WHERE action = 'OPS_ALERT_SENT' AND entity_type = 'SYSTEM' AND entity_id = ? AND occurred_at > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 DAY) LIMIT 1",
      [kind],
    );
    if (sent.length > 0) return false;
    await recordAudit({ actorUserId: null, action: "OPS_ALERT_SENT", entityType: "SYSTEM", entityId: kind, metadata: { reference } });
    const base = appBaseUrl();
    const text = TEXT[kind];
    const ref = reference ? ` Reference: ${reference}.` : "";
    for (const userId of await listUserIdsWithRole("SUPER_ADMIN")) {
      await notify({
        eventType: "OPS_ALERT",
        userId,
        title: text.title,
        message: `${text.body}${ref}`,
        deepLink: `${base}/superadmin`,
        email: { subject: `ARS CMS: ${text.title.toLowerCase()}`, text: `${text.body}${ref}\n\nCheck System health in the Super Admin area and the server log.\n${base}/superadmin\n\nYou get this at most once a day.` },
        whatsappVariables: null,
      });
    }
    return true;
  } catch (error) {
    logError("ops alert failed", error, { kind });
    return false;
  }
}

// v1.7.0 (A5, BD-02): a stopped cron can't report itself, so the check runs
// when someone asks: the health check (uptime monitor) and IT / Super Admin
// pages. At most one look every 10 minutes per server process, and the
// alert itself at most once a day. A runner that never ran isn't "stopped"
// (it was never set up; System health already shows NEVER).
export const STOPPED_AFTER_MINUTES = 120;
let lastLook = 0;

export async function checkJobRunnerStopped(now = Date.now()): Promise<boolean> {
  if (now - lastLook < 10 * 60_000) return false;
  lastLook = now;
  try {
    const heartbeat = await getRunnerHeartbeat();
    if (!heartbeat || heartbeat.minutesAgo <= STOPPED_AFTER_MINUTES) return false;
    return await alertSuperAdmin("JOB_RUNNER_STOPPED", `last run ${heartbeat.minutesAgo} minutes ago`);
  } catch (error) {
    logError("job runner check failed", error);
    return false;
  }
}

export function resetJobRunnerCheck(): void {
  lastLook = 0;
}
