import "server-only";
import type { EmailConfig } from "@/server/settings/values";

// Resend HTTP API (D-037). GoDaddy's Node.js hosting blocks outbound SMTP
// entirely, so an HTTPS provider is required (Power BI site, 2026-09-12).
export class EmailSendError extends Error {
  constructor(
    readonly code: "EMAIL_NOT_CONFIGURED" | "EMAIL_REQUEST_FAILED",
    message: string,
    readonly providerStatus?: number,
    readonly providerBody?: unknown,
  ) {
    super(message);
    this.name = "EmailSendError";
  }
}

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail(
  config: EmailConfig,
  input: SendEmailInput,
  deps: { fetch: typeof fetch },
): Promise<{ id: string | null }> {
  if (!config.apiKey) throw new EmailSendError("EMAIL_NOT_CONFIGURED", "Resend API key is not configured.");
  let response: Response;
  try {
    response = await deps.fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${config.fromName} <${config.fromAddress}>`,
        to: input.to,
        subject: input.subject,
        text: input.text,
        ...(input.html ? { html: input.html } : {}),
      }),
    });
  } catch (error) {
    throw new EmailSendError("EMAIL_REQUEST_FAILED", "Resend request failed.", undefined, String(error));
  }
  const body = (await response.json().catch(() => null)) as { id?: string } | null;
  if (!response.ok) {
    throw new EmailSendError("EMAIL_REQUEST_FAILED", `Resend rejected the email (HTTP ${response.status}).`, response.status, body);
  }
  return { id: body?.id ?? null };
}
