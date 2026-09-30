import "server-only";
import {
  createDelivery,
  createNotification,
  findRecipient,
  type NotificationRecipient,
} from "@/lib/db/repositories/notifications.repository";
import { findActiveTemplate, tryConsumeWhatsAppRateLimit, type ActiveTemplate } from "@/lib/db/repositories/whatsapp.repository";
import { sendTemplateMessage, CeoitboxError } from "@/server/integrations/ceoitbox/client";
import { sendEmail, EmailSendError } from "@/server/integrations/resend/client";
import { getEmailConfig, getWhatsAppConfig } from "@/server/settings/values";
import { logError } from "@/lib/logging/logger";

// Notification hub (F-40, P1-40..P1-47). One call = one event for one
// recipient: an in-app row plus one delivery per channel (email + WhatsApp,
// D-008). It NEVER throws — a delivery failure must never undo or block the
// business action that triggered it.
export interface NotifyInput {
  eventType: string;
  userId: number;
  title: string;
  message: string;
  deepLink?: string | null;
  email: { subject: string; text: string } | null;
  // Values by variable_key; mapped to the template's positional {{n}} slots.
  whatsappVariables: Record<string, string> | null;
}

export interface NotifyDeps {
  findRecipient: (userId: number) => Promise<NotificationRecipient | null>;
  createNotification: typeof createNotification;
  createDelivery: typeof createDelivery;
  findActiveTemplate: (eventType: string) => Promise<ActiveTemplate | null>;
  sendWhatsApp: (to: string, template: ActiveTemplate, variables: string[]) => Promise<{ waMessageId: string }>;
  sendEmail: (to: string, subject: string, text: string) => Promise<{ id: string | null }>;
}

const RETRY_DELAY_SECONDS = 120;

const defaultDeps: NotifyDeps = {
  findRecipient,
  createNotification,
  createDelivery,
  findActiveTemplate: (eventType) => findActiveTemplate(eventType),
  async sendWhatsApp(to, template, variables) {
    const config = await getWhatsAppConfig();
    const result = await sendTemplateMessage(
      config,
      { to, templateName: template.providerName, language: template.language, templateVariables: variables },
      { fetch, tryConsumeRateLimit: tryConsumeWhatsAppRateLimit },
    );
    return { waMessageId: result.waMessageId };
  },
  async sendEmail(to, subject, text) {
    return sendEmail(await getEmailConfig(), { to, subject, text }, { fetch });
  },
};

function failureCode(error: unknown): string {
  if (error instanceof CeoitboxError || error instanceof EmailSendError) return error.code;
  return "UNEXPECTED_ERROR";
}

function isRetryable(code: string): boolean {
  return code === "CEOITBOX_REQUEST_FAILED" || code === "CEOITBOX_TIMEOUT" || code === "CEOITBOX_RATE_LIMITED" || code === "EMAIL_REQUEST_FAILED";
}

export type ChannelOutcome = { status: "SENT" | "FAILED" | "SKIPPED"; code?: string } | null;

// What happened, for callers that show it (e.g. "link emailed"). Never
// thrown: notify() still can't fail the business action.
export interface NotifySummary {
  recorded: boolean;
  email: ChannelOutcome;
  whatsapp: ChannelOutcome;
}

export async function notifyWithDeps(input: NotifyInput, deps: NotifyDeps): Promise<NotifySummary> {
  const summary: NotifySummary = { recorded: false, email: null, whatsapp: null };
  let notificationId: number;
  let recipient: NotificationRecipient | null;
  try {
    recipient = await deps.findRecipient(input.userId);
    if (!recipient || !recipient.active) return summary;
    notificationId = await deps.createNotification({
      eventType: input.eventType,
      userId: input.userId,
      title: input.title,
      message: input.message,
      deepLink: input.deepLink ?? null,
    });
    summary.recorded = true;
  } catch (error) {
    logError("notify: could not record notification", error, { eventType: input.eventType, userId: input.userId });
    return summary;
  }

  if (input.email) {
    // Sending and recording fail separately: a send that worked must never
    // be marked FAILED and retried (that would send it twice).
    let sent: { id: string | null } | null = null;
    try {
      sent = await deps.sendEmail(recipient.email, input.email.subject, input.email.text);
    } catch (error) {
      const code = failureCode(error);
      logError("notify: email failed", error, { eventType: input.eventType, userId: input.userId });
      summary.email = { status: "FAILED", code };
      await safeDelivery(deps, {
        notificationId,
        channel: "EMAIL",
        provider: "RESEND",
        status: "FAILED",
        failureCode: code,
        payload: { to: recipient.email, subject: input.email.subject, text: input.email.text },
        retryInSeconds: isRetryable(code) ? RETRY_DELAY_SECONDS : null,
      });
    }
    if (sent) {
      summary.email = { status: "SENT" };
      await safeDelivery(deps, { notificationId, channel: "EMAIL", provider: "RESEND", status: "SENT", providerReference: sent.id });
    }
  }

  if (input.whatsappVariables) {
    if (!recipient.whatsappNumber) {
      summary.whatsapp = { status: "SKIPPED", code: "NO_WHATSAPP_NUMBER" };
      await safeDelivery(deps, { notificationId, channel: "WHATSAPP", provider: "CEOITBOX", status: "SKIPPED", failureCode: "NO_WHATSAPP_NUMBER" });
    } else {
      let template: ActiveTemplate | null = null;
      try {
        template = await deps.findActiveTemplate(input.eventType);
      } catch (error) {
        logError("notify: template lookup failed", error, { eventType: input.eventType });
      }
      if (!template) {
        // Templates for this event are not supplied/approved yet (Q-013).
        summary.whatsapp = { status: "SKIPPED", code: "TEMPLATE_NOT_CONFIGURED" };
        await safeDelivery(deps, { notificationId, channel: "WHATSAPP", provider: "CEOITBOX", status: "SKIPPED", failureCode: "TEMPLATE_NOT_CONFIGURED" });
      } else {
        const values = input.whatsappVariables;
        const variables = template.variableKeys.map((key) => values[key] ?? "");
        let sent: { waMessageId: string } | null = null;
        try {
          sent = await deps.sendWhatsApp(recipient.whatsappNumber, template, variables);
        } catch (error) {
          const code = failureCode(error);
          logError("notify: WhatsApp failed", error, { eventType: input.eventType, userId: input.userId });
          summary.whatsapp = { status: "FAILED", code };
          await safeDelivery(deps, {
            notificationId,
            channel: "WHATSAPP",
            provider: "CEOITBOX",
            status: "FAILED",
            failureCode: code,
            payload: { to: recipient.whatsappNumber, templateId: template.id, variables },
            retryInSeconds: isRetryable(code) ? RETRY_DELAY_SECONDS : null,
          });
        }
        if (sent) {
          summary.whatsapp = { status: "SENT" };
          await safeDelivery(deps, { notificationId, channel: "WHATSAPP", provider: "CEOITBOX", status: "SENT", providerReference: sent.waMessageId });
        }
      }
    }
  }
  return summary;
}

async function safeDelivery(deps: NotifyDeps, input: Parameters<NotifyDeps["createDelivery"]>[0]): Promise<void> {
  try {
    await deps.createDelivery(input);
  } catch (error) {
    logError("notify: could not record delivery", error, { channel: input.channel });
  }
}

export function notify(input: NotifyInput): Promise<NotifySummary> {
  return notifyWithDeps(input, defaultDeps);
}
