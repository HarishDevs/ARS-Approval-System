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
import { whatsappValue } from "@/server/notifications/templates";
import { channelWanted, dndApplies, dndHolds, DND_SETTING, NO_DND, parseDnd, type DoNotDisturb } from "@/server/notifications/preferences";
import { getUserSetting } from "@/lib/db/repositories/user-settings.repository";
import { markNotificationRead } from "@/lib/db/repositories/notifications.repository";
import { loadOptOuts } from "@/lib/db/repositories/preferences.repository";
import type { EntityRef } from "@/server/notifications/categories";

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
  entity?: EntityRef | null; // v1.9.0: the record it is about (else read from the link)
  email: { subject: string; text: string } | null;
  // Values by variable_key; mapped to the template's positional {{n}} slots.
  whatsappVariables: Record<string, string> | null;
}

export interface NotifyDeps {
  findRecipient: (userId: number) => Promise<NotificationRecipient | null>;
  createNotification: typeof createNotification;
  createDelivery: typeof createDelivery;
  findActiveTemplate: (eventType: string) => Promise<ActiveTemplate | null>;
  sendWhatsApp: (to: string, template: ActiveTemplate, variables: string[], reference: string) => Promise<{ waMessageId: string }>;
  sendEmail: (to: string, subject: string, text: string) => Promise<{ id: string | null }>;
  // #6: the person's "off" choices (GROUP:CHANNEL). Optional for tests.
  loadOptOuts?: (userId: number) => Promise<Set<string>>;
  // D-231: Do not disturb, and the app alert switched off. Optional for tests.
  loadDnd?: (userId: number) => Promise<DoNotDisturb>;
  markRead?: (notificationId: number) => Promise<void>;
  now?: () => Date;
}

const RETRY_DELAY_SECONDS = 120;

const defaultDeps: NotifyDeps = {
  loadOptOuts: (userId) => loadOptOuts(userId),
  loadDnd: async (userId) => parseDnd(await getUserSetting(userId, DND_SETTING)),
  markRead: (notificationId) => markNotificationRead(notificationId),
  findRecipient,
  createNotification,
  createDelivery,
  findActiveTemplate: (eventType) => findActiveTemplate(eventType),
  async sendWhatsApp(to, template, variables, reference) {
    const config = await getWhatsAppConfig();
    const result = await sendTemplateMessage(
      config,
      { to, templateName: template.providerName, language: template.language, templateVariables: variables, userMessageId: reference },
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
  inactive?: boolean; // nobody to tell (no such active person): nothing to retry
  email: ChannelOutcome;
  whatsapp: ChannelOutcome;
}

export async function notifyWithDeps(input: NotifyInput, deps: NotifyDeps): Promise<NotifySummary> {
  const summary: NotifySummary = { recorded: false, email: null, whatsapp: null };
  let notificationId: number;
  let recipient: NotificationRecipient | null;
  try {
    recipient = await deps.findRecipient(input.userId);
    if (!recipient || !recipient.active) return { ...summary, inactive: true };
    notificationId = await deps.createNotification({
      eventType: input.eventType,
      userId: input.userId,
      title: input.title,
      message: input.message,
      deepLink: input.deepLink ?? null,
      entity: input.entity ?? null,
    });
    summary.recorded = true;
  } catch (error) {
    logError("notify: could not record notification", error, { eventType: input.eventType, userId: input.userId });
    return summary;
  }

  // #6: email / WhatsApp the person switched off for this kind of message.
  // Mandatory kinds always go (preferences.ts). The inbox row above is kept.
  const optOuts = deps.loadOptOuts ? await deps.loadOptOuts(input.userId).catch(() => new Set<string>()) : new Set<string>();
  // D-231: the app alert switched off: the message stays in Notifications, read.
  if (!channelWanted(input.eventType, "INAPP", optOuts) && deps.markRead) await deps.markRead(notificationId).catch(() => undefined);
  // D-231: Do not disturb holds email and WhatsApp (not security messages).
  const dnd = deps.loadDnd ? await deps.loadDnd(input.userId).catch(() => NO_DND) : NO_DND;
  const quiet = dndApplies(input.eventType) && dndHolds(dnd, deps.now ? deps.now() : new Date());
  const skip = (wanted: boolean) => (!wanted ? "USER_PREFERENCE" : quiet ? "DO_NOT_DISTURB" : null);
  const emailSkip = skip(channelWanted(input.eventType, "EMAIL", optOuts));
  const whatsappSkip = skip(channelWanted(input.eventType, "WHATSAPP", optOuts));
  const emailWanted = emailSkip === null;
  const whatsappWanted = whatsappSkip === null;
  if (input.email && emailSkip) {
    summary.email = { status: "SKIPPED", code: emailSkip };
    await safeDelivery(deps, { notificationId, channel: "EMAIL", provider: "RESEND", status: "SKIPPED", failureCode: emailSkip });
  }
  if (input.whatsappVariables && whatsappSkip) {
    summary.whatsapp = { status: "SKIPPED", code: whatsappSkip };
    await safeDelivery(deps, { notificationId, channel: "WHATSAPP", provider: "CEOITBOX", status: "SKIPPED", failureCode: whatsappSkip });
  }

  if (input.email && emailWanted) {
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

  if (input.whatsappVariables && whatsappWanted) {
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
        const variables = template.variableKeys.map((key) => whatsappValue(values[key] ?? ""));
        let sent: { waMessageId: string } | null = null;
        try {
          // Our reference shows in CEOITBox reports (userMessageId).
          sent = await deps.sendWhatsApp(recipient.whatsappNumber, template, variables, `ars-n${notificationId}`);
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
