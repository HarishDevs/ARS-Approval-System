import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { listUserIdsWithRole } from "@/lib/db/repositories/users.repository";
import { notify } from "@/server/notifications/notify";
import { getEnv } from "@/config/environment";
import { logError } from "@/lib/logging/logger";

// #14: the Super Admin hears when the job runner or the daily backup fails,
// at most once a day per kind (the audit log is the "already sent" record).
// No details of the error go in the message: they are in the server log,
// under the reference shown.
export type OpsAlertKind = "JOB_RUNNER_FAILED" | "BACKUP_FAILED";

const TEXT: Record<OpsAlertKind, { title: string; body: string }> = {
  JOB_RUNNER_FAILED: { title: "Scheduled jobs failed", body: "The 5-minute job run (messages, reminders, backups) failed." },
  BACKUP_FAILED: { title: "Daily backup failed", body: "Today's database backup could not be made. The job runner will keep trying." },
};

export async function alertSuperAdmin(kind: OpsAlertKind, reference: string | null): Promise<boolean> {
  try {
    const [sent] = await getDbPool().query<RowDataPacket[]>(
      "SELECT 1 FROM audit_logs WHERE action = 'OPS_ALERT_SENT' AND entity_type = 'SYSTEM' AND entity_id = ? AND occurred_at > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 DAY) LIMIT 1",
      [kind],
    );
    if (sent.length > 0) return false;
    await recordAudit({ actorUserId: null, action: "OPS_ALERT_SENT", entityType: "SYSTEM", entityId: kind, metadata: { reference } });
    const base = getEnv().APP_BASE_URL ?? "https://approval.arssteels.net";
    const text = TEXT[kind];
    const ref = reference ? ` Reference: ${reference}.` : "";
    for (const userId of await listUserIdsWithRole("SUPER_ADMIN")) {
      await notify({
        eventType: "OPS_ALERT",
        userId,
        title: text.title,
        message: `${text.body}${ref}`,
        deepLink: `${base}/superadmin`,
        email: { subject: `ARS Approvals: ${text.title.toLowerCase()}`, text: `${text.body}${ref}\n\nCheck System health in the Super Admin area and the server log.\n${base}/superadmin\n\nYou get this at most once a day.` },
        whatsappVariables: null,
      });
    }
    return true;
  } catch (error) {
    logError("ops alert failed", error, { kind });
    return false;
  }
}
