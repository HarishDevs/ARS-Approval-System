import "server-only";
import { EmailSendError, sendEmail as sendResendEmail, type SendEmailInput } from "@/server/integrations/resend/client";
import { sendmailTransport, sendSmtpEmail, smtpTransport, type SmtpSender } from "@/server/integrations/email/smtp";
import type { EmailConfig } from "@/server/settings/values";
import { logError } from "@/lib/logging/logger";
import { countSmtpEmailsLastHour } from "@/lib/db/repositories/notifications.repository";

export { EmailSendError, type SendEmailInput };

export type EmailProvider = "RESEND" | "SMTP" | "SENDMAIL";

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

export async function sendEmail(config: EmailConfig, input: SendEmailInput, deps: SendDeps): Promise<{ id: string | null; provider: EmailProvider; receipt?: string }> {
  if (config.provider !== "SMTP" && config.provider !== "SENDMAIL") return { ...(await sendResendEmail(config, input, deps)), provider: "RESEND" };

  const via: "SMTP" | "SENDMAIL" = config.provider;
  const smtp = config.smtp;
  const canFallBack = Boolean(config.apiKey && config.fallbackToResend);
  const fallBack = async (reason: unknown) => {
    logError("email: SMTP not used, sending through Resend", reason);
    return { ...(await sendResendEmail(config, input, deps)), provider: "RESEND" as const };
  };
  // RELAY (GoDaddy's port-25 relay) needs no password.
  const ready = via === "SENDMAIL" ? Boolean(smtp?.user && config.sendmailPath) : Boolean(smtp?.host && smtp.user && (smtp.password || smtp.security === "RELAY"));
  if (!smtp || !ready) {
    const error = new EmailSendError("EMAIL_NOT_CONFIGURED", via === "SENDMAIL" ? "SENDMAIL is chosen but the mailbox (SMTP user) or the program path is not set." : "SMTP is chosen but its server, user or password is not set.", undefined, { provider: via });
    if (canFallBack) return fallBack(error);
    throw error;
  }
  const limit = config.smtpHourlyLimit ?? 0;
  if (limit > 0 && deps.smtpSentLastHour) {
    const sent = await deps.smtpSentLastHour().catch(() => 0);
    if (sent >= limit) {
      const error = new EmailSendError("EMAIL_RATE_LIMITED", `The hourly email limit (${limit}) is reached; it will be sent later.`, undefined, { provider: via, retryAfterSeconds: 15 * 60 });
      if (canFallBack) return fallBack(error);
      throw error;
    }
  }
  try {
    // The mail server only sends as its own mailbox, so the From address is the SMTP user.
    const transport = deps.smtp ?? (via === "SENDMAIL" ? sendmailTransport(config.sendmailPath ?? "/usr/sbin/sendmail") : smtpTransport(smtp, deps.timeoutMs));
    const sent = await sendSmtpEmail({ name: config.fromName, address: smtp.user, replyTo: config.replyTo }, input, transport, via);
    return { ...sent, provider: via };
  } catch (error) {
    // A wrong password is a setup problem: Resend still carries the mail meanwhile.
    // Not when the outcome is unknown (it may have gone out): no second copy.
    if (canFallBack && !(error instanceof EmailSendError && error.code === "EMAIL_UNCONFIRMED")) return fallBack(error);
    throw error;
  }
}

// The provider a failure belongs to (for the delivery record).
export function failedProvider(error: unknown, config: EmailConfig | null): EmailProvider {
  const body = error instanceof EmailSendError ? (error.providerBody as { provider?: string } | null | undefined) : null;
  if (body?.provider === "SMTP" || body?.provider === "SENDMAIL") return body.provider;
  return (config?.provider === "SMTP" || config?.provider === "SENDMAIL") && !(config.apiKey && config.fallbackToResend) ? config.provider : "RESEND";
}

// What the app's own senders pass (the hourly count comes from the delivery records).
export function emailDeps(): SendDeps {
  return { fetch, smtpSentLastHour: () => countSmtpEmailsLastHour() };
}
