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
  // v1.54.12 "RELAY" = GoDaddy's documented relay for scripts on Web Hosting
  // (cPanel): localhost or relay-hosting.secureserver.net, port 25, no SSL, no
  // sign-in (the hosting itself is trusted; 500 a day per sender).
  security: "SSL" | "STARTTLS" | "RELAY";
  user: string;
  password: string;
  // Optional address to connect to (e.g. 127.0.0.1); TLS still names `host`.
  connectHost?: string | null;
}

export interface SmtpSender {
  sendMail(message: Record<string, unknown>): Promise<{ messageId?: string; response?: string }>;
}

// v1.54.10 (live: "connect EACCES <host>:465"): GoDaddy's hosting blocks the
// app's network connections to mail servers, its own included. The hosting's
// mail program (sendmail, as PHP's mail() uses) needs no connection: it hands
// the email to the server's own mail system, which sends it as the cPanel user.
export function sendmailTransport(path: string): SmtpSender {
  return nodemailer.createTransport({ sendmail: true, newline: "unix", path });
}

export function smtpTransport(config: SmtpConfig, timeoutMs = EMAIL_TIMEOUT_MS): SmtpSender {
  if (config.security === "RELAY") {
    return nodemailer.createTransport({
      host: config.connectHost?.trim() || config.host,
      port: config.port,
      secure: false,
      // No STARTTLS: on localhost the certificate can't match, and GoDaddy says SSL off.
      ignoreTLS: true,
      connectionTimeout: timeoutMs,
      greetingTimeout: timeoutMs,
      socketTimeout: timeoutMs,
    });
  }
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

export const SENDMAIL_TIMEOUT_MS = 20_000;

const short = (value: string, max: number) => value.replace(/\s+/g, " ").trim().slice(0, max);

// One line only, so a title can't add mail headers (D-QA-15).
const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

export async function sendSmtpEmail(
  from: { name: string; address: string; replyTo?: string | null },
  input: SendEmailInput,
  transport: SmtpSender,
  provider: "SMTP" | "SENDMAIL" = "SMTP",
  timeoutMs = SENDMAIL_TIMEOUT_MS,
): Promise<{ id: string | null; receipt?: string }> {
  // v1.54.11 (live: the SENDMAIL test hit the page's 30 s limit): the mail
  // program gets 20 s. When it doesn't finish, the email may still go out, so
  // this is EMAIL_UNCONFIRMED: reported, never retried automatically (no duplicates).
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new EmailSendError("EMAIL_UNCONFIRMED", `The ${provider === "SENDMAIL" ? "mail program" : "mail server"} didn't finish within ${Math.round(timeoutMs / 1000)} s; the email may still be delivered (see cPanel → Track Delivery).`, undefined, { provider })), timeoutMs);
  });
  try {
    const info = await Promise.race([late, transport.sendMail({
      from: { name: oneLine(from.name), address: from.address },
      // The bounce address is the mailbox too (sendmail -f).
      envelope: { from: from.address, to: input.to },
      to: input.to,
      subject: oneLine(input.subject),
      text: input.text,
      ...(input.html ? { html: input.html } : {}),
      ...(from.replyTo ? { replyTo: from.replyTo } : {}),
      // A repeat of the same send can be recognised by the receiving side.
      ...(input.idempotencyKey ? { headers: { "X-ARS-Reference": oneLine(input.idempotencyKey).slice(0, 256) } } : {}),
      ...(input.attachments?.length ? { attachments: input.attachments.map((file) => ({ filename: file.filename.replace(/[^A-Za-z0-9._-]/g, "_"), content: Buffer.from(file.content) })) } : {}),
    })]);
    // v1.54.13: the relay's own receipt ("250 OK id=…"), so a lost email can be traced.
    const receipt = typeof info.response === "string" ? (info.response.trim().split(/\r?\n/)[0] ?? "").slice(0, 160) : "";
    return { id: info.messageId ?? null, ...(receipt ? { receipt } : {}) };
  } catch (error) {
    if (error instanceof EmailSendError) throw error;
    const raw = error as { code?: string; responseCode?: number; message?: string } | null;
    const status = typeof raw?.responseCode === "number" ? raw.responseCode : undefined;
    // 4xx = "try later" (including "too many messages"); 535 = wrong password.
    if (status === 535 || raw?.code === "EAUTH") throw new EmailSendError("EMAIL_NOT_CONFIGURED", "The mail server refused the sign-in. Check the SMTP user and password.", status, { provider });
    if (status !== undefined && status >= 400 && status < 500) throw new EmailSendError("EMAIL_RATE_LIMITED", `The mail server asked to try later (SMTP ${status}).`, status, { provider });
    // v1.54.14: 5xx is a permanent refusal (e.g. unknown recipient, sender not allowed): not retried.
    if (status !== undefined && status >= 500) {
      const said = short(raw?.message ?? "", 160);
      throw new EmailSendError("EMAIL_REJECTED", `The mail server refused the email (SMTP ${status})${said ? `: ${said}` : ""}.`, status, { provider });
    }
    // Codes and SMTP statuses only; never the message or the password.
    // v1.54.9: the network reason too (e.g. "connect ECONNREFUSED 1.2.3.4:465"), so
    // the test says why; connection messages carry no password or message text.
    const reason = (raw?.message ?? "").match(/(connect|getaddrinfo|Greeting never received|Connection timeout|Timeout|self[- ]signed|certificate|ETIMEDOUT|ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENOTFOUND|spawn|ENOENT|EACCES|exited with code)[^\n]{0,100}/i)?.[0];
    // The mail program's own words (exim prints why it refused), first line only.
    const stderr = (error as { stderr?: unknown } | null)?.stderr;
    const said = typeof stderr === "string" && stderr.trim() ? ` (${stderr.trim().split("\n")[0]!.slice(0, 160)})` : "";
    throw new EmailSendError("EMAIL_REQUEST_FAILED", `${provider} send failed${said}${raw?.code ? ` (${raw.code})` : ""}${status ? ` (SMTP ${status})` : ""}${reason ? `: ${reason}` : ""}.`, status, { provider });
  } finally {
    clearTimeout(timer);
  }
}
