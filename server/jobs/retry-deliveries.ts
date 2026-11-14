import "server-only";
import { findTemplateById, leaseDueDeliveries, markRetryFailed, markRetrySent, pruneDeliveryPayloads, pruneRateLimitHits, type DueDelivery } from "@/lib/db/repositories/jobs.repository";
import { sendTemplateMessage, CeoitboxError } from "@/server/integrations/ceoitbox/client";
import { emailDeps, sendEmail, EmailSendError } from "@/server/integrations/email/send";
import { tryConsumeWhatsAppRateLimit } from "@/lib/db/repositories/whatsapp.repository";
import { getEmailConfig, getWhatsAppConfig } from "@/server/settings/values";
import { logError } from "@/lib/logging/logger";
import { retryDelayMinutes } from "@/server/notifications/retry-policy";
import { pruneExpiredDrafts } from "@/lib/db/repositories/drafts.repository";
import { pruneRecentViews } from "@/lib/db/repositories/recent.repository";

// Retry runner (F-41, P1-48, D-058). Called by cPanel cron through the
// signed /api/jobs/run endpoint. Pure decisions (backoff) are exported for
// unit tests; sending is injectable.
export interface RetryDeps {
  lease: (limit: number, onlyIds?: readonly number[]) => Promise<DueDelivery[]>;
  sendEmail: (payload: { to: string; subject: string; text: string; idempotencyKey: string }) => Promise<string | null>;
  sendWhatsApp: (payload: { to: string; templateId: number; variables: string[]; reference: string }) => Promise<string>;
  markSent: (id: number, reference: string | null) => Promise<void>;
  markFailed: (id: number, code: string, retryInMinutes: number | null) => Promise<void>;
  retryLimit: () => Promise<number>;
}

// Backoff and the retry limit (D-243): shared with notify(), which makes the
// first retry. Re-exported for the existing tests.
export { nextRetryMinutes } from "@/server/notifications/retry-policy";

function codeOf(error: unknown): string {
  if (error instanceof CeoitboxError || error instanceof EmailSendError) return error.code;
  if (error instanceof Error && error.message === "TEMPLATE_NOT_CONFIGURED") return "TEMPLATE_NOT_CONFIGURED";
  return "UNEXPECTED_ERROR";
}

const defaultDeps: RetryDeps = {
  lease: leaseDueDeliveries,
  async sendEmail(payload) {
    return (await sendEmail(await getEmailConfig(), { to: payload.to, subject: payload.subject, text: payload.text, idempotencyKey: payload.idempotencyKey }, emailDeps())).id;
  },
  async sendWhatsApp(payload) {
    const template = await findTemplateById(payload.templateId);
    if (!template) throw new Error("TEMPLATE_NOT_CONFIGURED");
    const result = await sendTemplateMessage(
      await getWhatsAppConfig(),
      { to: payload.to, templateName: template.providerName, language: template.language, templateVariables: payload.variables, userMessageId: payload.reference },
      { fetch, tryConsumeRateLimit: tryConsumeWhatsAppRateLimit },
    );
    return result.waMessageId;
  },
  markSent: (id, reference) => markRetrySent(id, reference),
  markFailed: (id, code, minutes) => markRetryFailed(id, code, minutes),
  retryLimit: async () => (await getWhatsAppConfig()).retryLimit,
};

export interface RetryReport {
  attempted: number;
  sent: number;
  rescheduled: number;
  gaveUp: number;
  // D-243: sent, but recording it failed. Left for review, never resent.
  unconfirmed: number;
}

// D-243: a send that worked is recorded with one more try if the first write
// fails; it is never turned into a failure (that would resend it).
async function recordSent(deps: RetryDeps, id: number, reference: string | null): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await deps.markSent(id, reference);
      return true;
    } catch (error) {
      logError("retry runner: sent, but couldn't record it", error, { deliveryId: id, attempt });
    }
  }
  return false;
}

export async function runDeliveryRetriesWithDeps(deps: RetryDeps, options: { limit?: number; onlyIds?: readonly number[] } = {}): Promise<RetryReport> {
  const report: RetryReport = { attempted: 0, sent: 0, rescheduled: 0, gaveUp: 0, unconfirmed: 0 };
  const due = await deps.lease(options.limit ?? 20, options.onlyIds);
  const limit = await deps.retryLimit();
  for (const delivery of due) {
    report.attempted += 1;
    const payload = delivery.payload ?? {};
    let reference: string | null;
    try {
      // D-243: the same email idempotency key and WhatsApp reference as the
      // first send (older rows without one get a stable key per delivery).
      reference =
        delivery.channel === "EMAIL"
          ? await deps.sendEmail({ to: String(payload.to), subject: String(payload.subject), text: String(payload.text), idempotencyKey: typeof payload.idempotencyKey === "string" ? payload.idempotencyKey : `ars-d${delivery.id}-email` })
          : await deps.sendWhatsApp({ to: String(payload.to), templateId: Number(payload.templateId), variables: (payload.variables as string[]) ?? [], reference: typeof payload.reference === "string" ? payload.reference : `ars-d${delivery.id}` });
    } catch (error) {
      const code = codeOf(error);
      // attempt_count is the sends made before this one, so this send is +1.
      const minutes = retryDelayMinutes(code, error, delivery.attemptCount + 1, limit);
      logError("retry runner: resend failed", error, { deliveryId: delivery.id, code });
      await deps.markFailed(delivery.id, code, minutes);
      if (minutes === null) report.gaveUp += 1;
      else report.rescheduled += 1;
      continue;
    }
    // D-243: recorded apart from the send. If recording fails the delivery
    // stays leased as SEND_UNCONFIRMED (no next try), so it's never resent.
    if (await recordSent(deps, delivery.id, reference)) report.sent += 1;
    else report.unconfirmed += 1;
  }
  return report;
}

export const runDeliveryRetries = (options?: { limit?: number; onlyIds?: readonly number[] }) => runDeliveryRetriesWithDeps(defaultDeps, options);

export async function runHousekeeping(): Promise<{ rateLimitHitsDeleted: number; payloadsCleared: number; draftsExpired: number; recentViewsPruned: number }> {
  return { rateLimitHitsDeleted: await pruneRateLimitHits(), payloadsCleared: await pruneDeliveryPayloads(), draftsExpired: await pruneExpiredDrafts(), recentViewsPruned: await pruneRecentViews() };
}
