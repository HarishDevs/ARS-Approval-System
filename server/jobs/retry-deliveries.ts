import "server-only";
import { findTemplateById, leaseDueDeliveries, markRetryFailed, markRetrySent, pruneDeliveryPayloads, pruneRateLimitHits, type DueDelivery } from "@/lib/db/repositories/jobs.repository";
import { sendTemplateMessage, CeoitboxError } from "@/server/integrations/ceoitbox/client";
import { sendEmail, EmailSendError } from "@/server/integrations/resend/client";
import { tryConsumeWhatsAppRateLimit } from "@/lib/db/repositories/whatsapp.repository";
import { getEmailConfig, getWhatsAppConfig } from "@/server/settings/values";
import { logError } from "@/lib/logging/logger";
import { pruneExpiredDrafts } from "@/lib/db/repositories/drafts.repository";

// Retry runner (F-41, P1-48, D-058). Called by cPanel cron through the
// signed /api/jobs/run endpoint. Pure decisions (backoff) are exported for
// unit tests; sending is injectable.
export interface RetryDeps {
  lease: (limit: number, onlyIds?: readonly number[]) => Promise<DueDelivery[]>;
  sendEmail: (payload: { to: string; subject: string; text: string }) => Promise<string | null>;
  sendWhatsApp: (payload: { to: string; templateId: number; variables: string[] }) => Promise<string>;
  markSent: (id: number, reference: string | null) => Promise<void>;
  markFailed: (id: number, code: string, retryInMinutes: number | null) => Promise<void>;
  retryLimit: () => Promise<number>;
}

// attemptsSoFar counts the first send. Retries wait 2, 4, 8… minutes, and
// stop after `retryLimit` retries.
export function nextRetryMinutes(attemptsSoFar: number, retryLimit: number): number | null {
  const retriesDone = attemptsSoFar - 1;
  if (retriesDone + 1 >= retryLimit) return null;
  return 2 ** (retriesDone + 1);
}

const RETRYABLE = new Set(["CEOITBOX_REQUEST_FAILED", "CEOITBOX_TIMEOUT", "CEOITBOX_RATE_LIMITED", "EMAIL_REQUEST_FAILED"]);

function codeOf(error: unknown): string {
  if (error instanceof CeoitboxError || error instanceof EmailSendError) return error.code;
  if (error instanceof Error && error.message === "TEMPLATE_NOT_CONFIGURED") return "TEMPLATE_NOT_CONFIGURED";
  return "UNEXPECTED_ERROR";
}

const defaultDeps: RetryDeps = {
  lease: leaseDueDeliveries,
  async sendEmail(payload) {
    return (await sendEmail(await getEmailConfig(), payload, { fetch })).id;
  },
  async sendWhatsApp(payload) {
    const template = await findTemplateById(payload.templateId);
    if (!template) throw new Error("TEMPLATE_NOT_CONFIGURED");
    const result = await sendTemplateMessage(
      await getWhatsAppConfig(),
      { to: payload.to, templateName: template.providerName, language: template.language, templateVariables: payload.variables },
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
}

export async function runDeliveryRetriesWithDeps(deps: RetryDeps, options: { limit?: number; onlyIds?: readonly number[] } = {}): Promise<RetryReport> {
  const report: RetryReport = { attempted: 0, sent: 0, rescheduled: 0, gaveUp: 0 };
  const due = await deps.lease(options.limit ?? 20, options.onlyIds);
  const limit = await deps.retryLimit();
  for (const delivery of due) {
    report.attempted += 1;
    try {
      const payload = delivery.payload ?? {};
      const reference =
        delivery.channel === "EMAIL"
          ? await deps.sendEmail({ to: String(payload.to), subject: String(payload.subject), text: String(payload.text) })
          : await deps.sendWhatsApp({ to: String(payload.to), templateId: Number(payload.templateId), variables: (payload.variables as string[]) ?? [] });
      await deps.markSent(delivery.id, reference);
      report.sent += 1;
    } catch (error) {
      const code = codeOf(error);
      const minutes = RETRYABLE.has(code) ? nextRetryMinutes(delivery.attemptCount + 1, limit) : null;
      logError("retry runner: resend failed", error, { deliveryId: delivery.id, code });
      await deps.markFailed(delivery.id, code, minutes);
      if (minutes === null) report.gaveUp += 1;
      else report.rescheduled += 1;
    }
  }
  return report;
}

export const runDeliveryRetries = (options?: { limit?: number; onlyIds?: readonly number[] }) => runDeliveryRetriesWithDeps(defaultDeps, options);

export async function runHousekeeping(): Promise<{ rateLimitHitsDeleted: number; payloadsCleared: number; draftsExpired: number }> {
  return { rateLimitHitsDeleted: await pruneRateLimitHits(), payloadsCleared: await pruneDeliveryPayloads(), draftsExpired: await pruneExpiredDrafts() };
}
