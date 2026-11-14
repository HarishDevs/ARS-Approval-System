import "server-only";
import nodemailer from "nodemailer";
import { EmailSendError, EMAIL_TIMEOUT_MS, type SendEmailInput } from "@/server/integrations/resend/client";

// v1.54.8 (owner: send from the GoDaddy cPanel mailbox no_reply@cms.arssteels.net
// instead of Resend). Plain SMTP with sign-in, through the hosting's own mail
// server. GoDaddy may block connections to OTHER mail servers from the
// hosting; the same server's mail service is reached directly, or through
// "localhost" (connectHost) while the certificate is still checked against
// the real server name.
export interface SmtpConfig {
  host: string;
  port: number;
  // "SSL" = TLS from the start (465); "STARTTLS" = upgrade on 587.
  security: "SSL" | "STARTTLS";
  user: string;
  password: string;
  // Optional address to connect to (e.g. 127.0.0.1); TLS still names `host`.
  connectHost?: string | null;
}

export interface SmtpSender {
  sendMail(message: Record<string, unknown>): Promise<{ messageId?: string }>;
}

export function smtpTransport(config: SmtpConfig, timeoutMs = EMAIL_TIMEOUT_MS): SmtpSender {
  return nodemailer.createTransport({
    host: config.connectHost?.trim() || config.host,
    port: config.port,
    secure: config.security === "SSL",
    requireTLS: config.security === "STARTTLS",
    auth: { user: config.user, pass: config.password },
    tls: { servername: config.host, minVersion: "TLSv1.2" },
    connectionTimeout: timeoutMs,
    greetingTimeout: timeoutMs,
    socketTimeout: timeoutMs,
  });
}

// One line only, so a title can't add mail headers (D-QA-15).
const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

export async function sendSmtpEmail(
  from: { name: string; address: string; replyTo?: string | null },
  input: SendEmailInput,
  transport: SmtpSender,
): Promise<{ id: string | null }> {
  try {
    const info = await transport.sendMail({
      from: { name: oneLine(from.name), address: from.address },
      to: input.to,
      subject: oneLine(input.subject),
      text: input.text,
      ...(input.html ? { html: input.html } : {}),
      ...(from.replyTo ? { replyTo: from.replyTo } : {}),
      // A repeat of the same send can be recognised by the receiving side.
      ...(input.idempotencyKey ? { headers: { "X-ARS-Reference": oneLine(input.idempotencyKey).slice(0, 256) } } : {}),
      ...(input.attachments?.length ? { attachments: input.attachments.map((file) => ({ filename: file.filename.replace(/[^A-Za-z0-9._-]/g, "_"), content: Buffer.from(file.content) })) } : {}),
    });
    return { id: info.messageId ?? null };
  } catch (error) {
    const raw = error as { code?: string; responseCode?: number; message?: string } | null;
    const status = typeof raw?.responseCode === "number" ? raw.responseCode : undefined;
    // 4xx = "try later" (including "too many messages"); 535 = wrong password.
    if (status === 535 || raw?.code === "EAUTH") throw new EmailSendError("EMAIL_NOT_CONFIGURED", "The mail server refused the sign-in. Check the SMTP user and password.", status, { provider: "SMTP" });
    if (status !== undefined && status >= 400 && status < 500) throw new EmailSendError("EMAIL_RATE_LIMITED", `The mail server asked to try later (SMTP ${status}).`, status, { provider: "SMTP" });
    // Codes and SMTP statuses only; never the message or the password.
    throw new EmailSendError("EMAIL_REQUEST_FAILED", `SMTP send failed${raw?.code ? ` (${raw.code})` : ""}${status ? ` (SMTP ${status})` : ""}.`, status, { provider: "SMTP" });
  }
}
