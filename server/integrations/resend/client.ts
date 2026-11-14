import "server-only";
import type { EmailConfig } from "@/server/settings/values";

// Resend HTTP API (D-037). GoDaddy's Node.js hosting blocks outbound SMTP to
// other mail servers (Power BI site, 2026-09-12). v1.54.8: the app can also
// send through the hosting's own cPanel mailbox (server/integrations/email);
// callers use server/integrations/email/send.ts, which picks the provider.
export class EmailSendError extends Error {
  constructor(
    readonly code: "EMAIL_NOT_CONFIGURED" | "EMAIL_REQUEST_FAILED" | "EMAIL_RATE_LIMITED",
    message: string,
    readonly providerStatus?: number,
    readonly providerBody?: unknown,
  ) {
    super(message);
    this.name = "EmailSendError";
  }
}

// A hung Resend call would hold up the person's action and the cron run
// (audit S-04), so each request gives up after this long and is retried.
export const EMAIL_TIMEOUT_MS = 15_000;

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  // Scheduled reports (D-123): small files only; the caller caps the size.
  attachments?: { filename: string; content: Uint8Array | string }[];
  // D-243: Resend sends one email per key within 24 hours, so a repeat of the
  // same send (a retry after a timeout that did reach Resend) isn't delivered
  // twice. 1-256 characters.
  idempotencyKey?: string;
}

export async function sendEmail(
  config: EmailConfig,
  input: SendEmailInput,
  deps: { fetch: typeof fetch; timeoutMs?: number },
): Promise<{ id: string | null }> {
  if (!config.apiKey) throw new EmailSendError("EMAIL_NOT_CONFIGURED", "Resend API key is not configured.");
  let response: Response;
  const timeoutMs = deps.timeoutMs ?? EMAIL_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    response = await deps.fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey.slice(0, 256) } : {}),
      },
      body: JSON.stringify({
        from: `${config.fromName} <${config.fromAddress}>`,
        to: input.to,
        // D-QA-15: one line only, so a title can't add mail headers.
        subject: input.subject.replace(/[\r\n]+/g, " ").trim(),
        text: input.text,
        ...(config.replyTo ? { reply_to: config.replyTo } : {}),
        ...(input.html ? { html: input.html } : {}),
        ...(input.attachments?.length ? { attachments: input.attachments.map((file) => ({ filename: file.filename.replace(/[^A-Za-z0-9._-]/g, "_"), content: Buffer.from(file.content).toString("base64") })) } : {}),
      }),
    });
  } catch (error) {
    clearTimeout(timer);
    if (controller.signal.aborted) throw new EmailSendError("EMAIL_REQUEST_FAILED", `Resend request timed out after ${timeoutMs}ms.`);
    throw new EmailSendError("EMAIL_REQUEST_FAILED", "Resend request failed.", undefined, String(error));
  }
  const body = (await response.json().catch(() => null)) as { id?: string } | null;
  clearTimeout(timer);
  if (!response.ok) {
    throw new EmailSendError("EMAIL_REQUEST_FAILED", `Resend rejected the email (HTTP ${response.status}).`, response.status, body);
  }
  return { id: body?.id ?? null };
}
