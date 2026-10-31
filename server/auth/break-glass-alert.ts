import "server-only";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { listUserIdsWithRole } from "@/lib/db/repositories/users.repository";
import { notify } from "@/server/notifications/notify";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import { logError } from "@/lib/logging/logger";

// D-246 (audit FI-D06, F-07): the break-glass account alerts on every sign-in
// and on what it does. Every change it makes is audited; the Super Admins
// (and the holder) are told at most once per session every ALERT_EVERY_MS, so
// a burst of actions doesn't flood them. Nothing here can block the action.
const ALERT_EVERY_MS = 10 * 60_000;
const lastAlert = new Map<string, number>();

export function breakGlassAlertDue(sessionId: string, now = Date.now()): boolean {
  const last = lastAlert.get(sessionId);
  if (last !== undefined && now - last < ALERT_EVERY_MS) return false;
  lastAlert.set(sessionId, now);
  if (lastAlert.size > 1000) for (const [key, at] of lastAlert) if (now - at >= ALERT_EVERY_MS) lastAlert.delete(key);
  return true;
}

export async function alertBreakGlassAction(session: { sessionId: string; user: { id: number; name: string } }, where: string): Promise<void> {
  try {
    await recordAudit({ actorUserId: session.user.id, action: "BREAK_GLASS_ACTION", entityType: "PAGE", entityId: where.slice(0, 100), sessionId: session.sessionId });
    if (!breakGlassAlertDue(session.sessionId)) return;
    const when = formatIndiaTime(new Date());
    const text = [`Break-glass account in use: ${session.user.name}`, `Changed something on: ${where}`, `When: ${when}`].join("\n");
    const recipients = new Set([...(await listUserIdsWithRole("SUPER_ADMIN")), session.user.id]);
    for (const userId of recipients) {
      await notify({
        eventType: "BREAK_GLASS_USED",
        userId,
        title: "Break-glass account in use",
        message: `${session.user.name} changed something on ${where} at ${when}.`,
        email: { subject: "Break-glass account in use", text },
        whatsappVariables: { user_name: session.user.name, time: when, device: where, ip_address: "see the audit log" },
      });
    }
  } catch (error) {
    logError("break-glass action alert failed", error);
  }
}
