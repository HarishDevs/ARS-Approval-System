import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { insertOutbox } from "@/lib/db/repositories/outbox.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { deliverOutbox } from "@/server/approvals/service";
import { requestLink } from "@/server/approvals/messages";
import { expiryState, EXPIRY_NOTICE_DAYS } from "@/server/approvals/expiry-rules";
import { appBaseUrl } from "@/lib/http/app-url";

export { expiryState, EXPIRY_NOTICE_DAYS };

const indiaDay = (date: Date) => date.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });

// Job-runner step (A1): tells the requester once, 7 days before an approval
// stops being valid (or straight away if it already has). Each request is
// claimed before its message is queued, so it is never told twice.
export async function runExpiryNotices(limit = 200): Promise<{ expiryNotices: number }> {
  const db = getDbPool();
  const [rows] = await db.query<(RowDataPacket & { id: number; request_no: string; title: string; requester_id: number; valid_until: Date })[]>(
    `SELECT id, request_no, title, requester_id, valid_until FROM approval_requests
     WHERE deleted_at IS NULL AND status = 'APPROVED' AND valid_until IS NOT NULL AND expiry_notified_at IS NULL
       AND valid_until <= DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? DAY)
     ORDER BY valid_until LIMIT ?`,
    [EXPIRY_NOTICE_DAYS, limit],
  );
  const base = appBaseUrl();
  let sent = 0;
  for (const row of rows) {
    const ids = await withTransaction(async (connection) => {
      const [claim] = await connection.query<ResultSetHeader>("UPDATE approval_requests SET expiry_notified_at = CURRENT_TIMESTAMP WHERE id = ? AND expiry_notified_at IS NULL AND status = 'APPROVED'", [row.id]);
      if (claim.affectedRows !== 1) return [];
      const expired = expiryState(row.valid_until) === "EXPIRED";
      const when = indiaDay(row.valid_until);
      const ref = `${row.request_no} · ${row.title}`;
      const link = requestLink(base, row.id);
      const text = expired ? `The approval of ${ref} expired on ${when}.` : `The approval of ${ref} is valid until ${when}.`;
      await recordAudit({ actorUserId: null, action: "REQUEST_EXPIRY_NOTICE", entityType: "REQUEST", entityId: row.id, metadata: { validUntil: row.valid_until.toISOString() } }, connection);
      return insertOutbox(
        row.id,
        [
          {
            eventType: "APPROVAL_EXPIRING",
            userId: row.requester_id,
            title: expired ? "An approval has expired" : "An approval expires soon",
            message: text,
            deepLink: link,
            email: { subject: `${row.request_no}: approval ${expired ? "expired" : `valid until ${when}`}`, text: `${text}\n\nIf you still need it, raise a new request or propose an amendment before then.\n\n${link}` },
            whatsappVariables: null,
          },
        ],
        connection,
      );
    });
    if (ids.length) {
      await deliverOutbox(ids);
      sent += 1;
    }
  }
  return { expiryNotices: sent };
}
