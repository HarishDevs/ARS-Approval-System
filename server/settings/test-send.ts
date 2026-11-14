import "server-only";
import { createDelivery, createNotification } from "@/lib/db/repositories/notifications.repository";
import { findActiveTemplate, tryConsumeWhatsAppRateLimit } from "@/lib/db/repositories/whatsapp.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { CeoitboxError, sendTemplateMessage } from "@/server/integrations/ceoitbox/client";
import { EmailSendError, emailDeps, failedProvider, sendEmail } from "@/server/integrations/email/send";
import { getEmailConfig, getWhatsAppConfig } from "@/server/settings/values";
import { generateOtpCode } from "@/lib/security/otp";
import { logError } from "@/lib/logging/logger";
import type { AuthenticatedUser } from "@/types/auth";

// F-52 test send (S2-02): the Super Admin checks a provider by sending to
// their OWN address or number only, never to anyone else. The result, including
// the provider's error code, is shown only here (this area is Super Admin only).
export interface TestSendResult {
  ok: boolean;
  message: string;
}

const TEST_EVENT = "PROVIDER_TEST";

function describeFailure(error: unknown): { code: string; detail: string } {
  if (error instanceof CeoitboxError || error instanceof EmailSendError) {
    return { code: error.code, detail: error.message };
  }
  return { code: "UNEXPECTED_ERROR", detail: "Unexpected error. See the server log." };
}

export async function sendTestEmail(user: AuthenticatedUser, sessionId: string): Promise<TestSendResult> {
  const notificationId = await createNotification({
    eventType: TEST_EVENT,
    userId: user.id,
    title: "Email test",
    message: "Test email from the Super Admin settings page.",
    deepLink: null,
  });
  // v1.54.9: the test checks the chosen provider itself: no Resend fallback,
  // so an SMTP problem shows its own code instead of Resend's.
  const config = { ...(await getEmailConfig()), fallbackToResend: false };
  try {
    const sent = await sendEmail(
      config,
      {
        to: user.email,
        subject: "ARS CMS: test email",
        text: `Hello ${user.name},\n\nThis is a test from the ARS CMS settings page. Email delivery is working.\n\nARS CMS`,
      },
      emailDeps(),
    );
    await createDelivery({ notificationId, channel: "EMAIL", provider: sent.provider, status: "SENT", providerReference: sent.id });
    await recordAudit({ actorUserId: user.id, action: "PROVIDER_TEST_SENT", entityType: "PROVIDER", entityId: sent.provider, sessionId });
    // v1.54.8: says which way it went (SMTP chosen but Resend carried it = SMTP needs attention).
    const via = sent.provider === "SMTP" ? `through ${config.smtp?.host ?? "SMTP"} as ${config.smtp?.user ?? ""}` : config.provider === "SMTP" ? "through Resend, because SMTP failed or the hourly limit was reached (see the server log)" : "through Resend";
    return { ok: true, message: `Test email sent to ${user.email} ${via}.` };
  } catch (error) {
    const failure = describeFailure(error);
    logError("provider test: email failed", error);
    const provider = failedProvider(error, config);
    await createDelivery({ notificationId, channel: "EMAIL", provider, status: "FAILED", failureCode: failure.code });
    await recordAudit({ actorUserId: user.id, action: "PROVIDER_TEST_SENT", entityType: "PROVIDER", entityId: provider, result: "FAILURE", sessionId, metadata: { code: failure.code } });
    if (provider === "SMTP") {
      const hint = failure.code === "EMAIL_NOT_CONFIGURED" ? " Check the SMTP user and password." : " If the hosting blocks this connection, set Connect through to localhost, Save and test again.";
      return { ok: false, message: `SMTP: ${failure.code}: ${failure.detail}${hint}` };
    }
    return { ok: false, message: `${failure.code}: ${failure.detail}` };
  }
}

// WhatsApp only allows Meta-approved templates, so the test uses the active
// sign-in code template with a random code that is never stored and can't
// be used to sign in.
export async function sendTestWhatsApp(user: AuthenticatedUser, sessionId: string): Promise<TestSendResult> {
  if (!user.whatsappNumber) return { ok: false, message: "Your account has no WhatsApp number. Add it in Users first." };
  const template = await findActiveTemplate("OTP_LOGIN");
  if (!template) return { ok: false, message: "TEMPLATE_NOT_CONFIGURED: no active, approved sign-in code template." };

  const notificationId = await createNotification({
    eventType: TEST_EVENT,
    userId: user.id,
    title: "WhatsApp test",
    message: "Test WhatsApp message from the Super Admin settings page.",
    deepLink: null,
  });
  const variables = template.variableKeys.map((key) => (key === "otp_code" ? generateOtpCode(6) : ""));
  try {
    const sent = await sendTemplateMessage(
      await getWhatsAppConfig(),
      { to: user.whatsappNumber, templateName: template.providerName, language: template.language, templateVariables: variables },
      { fetch, tryConsumeRateLimit: tryConsumeWhatsAppRateLimit },
    );
    await createDelivery({ notificationId, channel: "WHATSAPP", provider: "CEOITBOX", status: "SENT", providerReference: sent.waMessageId });
    await recordAudit({ actorUserId: user.id, action: "PROVIDER_TEST_SENT", entityType: "PROVIDER", entityId: "CEOITBOX", sessionId });
    return { ok: true, message: "Test WhatsApp message sent to your number. It shows a sign-in code that can't be used." };
  } catch (error) {
    const failure = describeFailure(error);
    logError("provider test: WhatsApp failed", error);
    await createDelivery({ notificationId, channel: "WHATSAPP", provider: "CEOITBOX", status: "FAILED", failureCode: failure.code });
    await recordAudit({ actorUserId: user.id, action: "PROVIDER_TEST_SENT", entityType: "PROVIDER", entityId: "CEOITBOX", result: "FAILURE", sessionId, metadata: { code: failure.code } });
    return { ok: false, message: `${failure.code}: ${failure.detail}` };
  }
}
