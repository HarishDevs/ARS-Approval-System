import "server-only";
import { EmailSendError, sendEmail as sendResendEmail, type SendEmailInput } from "@/server/integrations/resend/client";
import { sendSmtpEmail, smtpTransport, type SmtpSender } from "@/server/integrations/email/smtp";
import type { EmailConfig } from "@/server/settings/values";
import { logError } from "@/lib/logging/logger";
import { countSmtpEmailsLastHour } from "@/lib/db/repositories/notifications.repository";

export { EmailSendError, type SendEmailInput };

export type EmailProvider = "RESEND" | "SMTP";

// v1.54.8: every email in the app goes through here. The provider is the
// Super Admin's choice (Email → Provider). With SMTP (the GoDaddy mailbox),
// Resend steps in when SMTP fails or the hourly limit is reached, if a
// Resend key is set and "Use Resend when SMTP fails" is on.
export interface SendDeps {
  fetch: typeof fetch;
  timeoutMs?: number;
  smtp?: SmtpSender;
  // Emails sent through SMTP in the last hour (for the hourly limit).
  smtpSentLastHour?: () => Promise<number>;
}

export async function sendEmail(config: EmailConfig, input: SendEmailInput, deps: SendDeps): Promise<{ id: string | null; provider: EmailProvider }> {
  if (config.provider !== "SMTP") return { ...(await sendResendEmail(config, input, deps)), provider: "RESEND" };

  const smtp = config.smtp;
  const canFallBack = Boolean(config.apiKey && config.fallbackToResend);
  const fallBack = async (reason: unknown) => {
    logError("email: SMTP not used, sending through Resend", reason);
    return { ...(await sendResendEmail(config, input, deps)), provider: "RESEND" as const };
  };
  if (!smtp?.host || !smtp.user || !smtp.password) {
    const error = new EmailSendError("EMAIL_NOT_CONFIGURED", "SMTP is chosen but its server, user or password is not set.", undefined, { provider: "SMTP" });
    if (canFallBack) return fallBack(error);
    throw error;
  }
  const limit = config.smtpHourlyLimit ?? 0;
  if (limit > 0 && deps.smtpSentLastHour) {
    const sent = await deps.smtpSentLastHour().catch(() => 0);
    if (sent >= limit) {
      const error = new EmailSendError("EMAIL_RATE_LIMITED", `The hourly email limit (${limit}) is reached; it will be sent later.`, undefined, { provider: "SMTP", retryAfterSeconds: 15 * 60 });
      if (canFallBack) return fallBack(error);
      throw error;
    }
  }
  try {
    // The mail server only sends as its own mailbox, so the From address is the SMTP user.
    const sent = await sendSmtpEmail({ name: config.fromName, address: smtp.user, replyTo: config.replyTo }, input, deps.smtp ?? smtpTransport(smtp, deps.timeoutMs));
    return { ...sent, provider: "SMTP" };
  } catch (error) {
    // A wrong password is a setup problem: Resend still carries the mail meanwhile.
    if (canFallBack) return fallBack(error);
    throw error;
  }
}

// The provider a failure belongs to (for the delivery record).
export function failedProvider(error: unknown, config: EmailConfig | null): EmailProvider {
  const body = error instanceof EmailSendError ? (error.providerBody as { provider?: string } | null | undefined) : null;
  if (body?.provider === "SMTP") return "SMTP";
  return config?.provider === "SMTP" && !(config.apiKey && config.fallbackToResend) ? "SMTP" : "RESEND";
}

// What the app's own senders pass (the hourly count comes from the delivery records).
export function emailDeps(): SendDeps {
  return { fetch, smtpSentLastHour: () => countSmtpEmailsLastHour() };
}
