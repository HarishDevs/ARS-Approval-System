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

export async function notifyWithDeps(input: NotifyInput, deps: NotifyDeps): Promise<void> {
  let notificationId: number;
  let recipient: NotificationRecipient | null;
  try {
    recipient = await deps.findRecipient(input.userId);
    if (!recipient || !recipient.active) return;
    notificationId = await deps.createNotification({
      eventType: input.eventType,
      userId: input.userId,
      title: input.title,
      message: input.message,
      deepLink: input.deepLink ?? null,
    });
  } catch (error) {
    logError("notify: could not record notification", error, { eventType: input.eventType, userId: input.userId });
    return;
  }

  if (input.email) {
    try {
      const sent = await deps.sendEmail(recipient.email, input.email.subject, input.email.text);
      await deps.createDelivery({ notificationId, channel: "EMAIL", provider: "RESEND", status: "SENT", providerReference: sent.id });
    } catch (error) {
      const code = failureCode(error);
      logError("notify: email failed", error, { eventType: input.eventType, userId: input.userId });
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
  }

  if (input.whatsappVariables) {
    if (!recipient.whatsappNumber) {
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
        await safeDelivery(deps, { notificationId, channel: "WHATSAPP", provider: "CEOITBOX", status: "SKIPPED", failureCode: "TEMPLATE_NOT_CONFIGURED" });
      } else {
        const values = input.whatsappVariables;
        const variables = template.variableKeys.map((key) => values[key] ?? "");
        try {
          const sent = await deps.sendWhatsApp(recipient.whatsappNumber, template, variables);
          await deps.createDelivery({ notificationId, channel: "WHATSAPP", provider: "CEOITBOX", status: "SENT", providerReference: sent.waMessageId });
        } catch (error) {
          const code = failureCode(error);
          logError("notify: WhatsApp failed", error, { eventType: input.eventType, userId: input.userId });
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
      }
    }
  }
}

async function safeDelivery(deps: NotifyDeps, input: Parameters<NotifyDeps["createDelivery"]>[0]): Promise<void> {
  try {
    await deps.createDelivery(input);
  } catch (error) {
    logError("notify: could not record delivery", error, { channel: input.channel });
  }
}

export function notify(input: NotifyInput): Promise<void> {
  return notifyWithDeps(input, defaultDeps);
}
