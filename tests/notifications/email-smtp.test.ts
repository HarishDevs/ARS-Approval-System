import { describe, expect, it, vi } from "vitest";
import { sendEmail, EmailSendError } from "@/server/integrations/email/send";
import type { EmailConfig } from "@/server/settings/values";
import { providerRetryAfterSeconds, isRetryableCode } from "@/server/notifications/retry-policy";

vi.mock("@/lib/db/repositories/notifications.repository", () => ({ countSmtpEmailsLastHour: vi.fn(async () => 0) }));

// v1.54.8 (owner: send from the GoDaddy cPanel mailbox no_reply@cms.arssteels.net).
const smtpConfig = (over: Partial<EmailConfig> = {}): EmailConfig => ({
  apiKey: "re_test",
  fromAddress: "no_reply@approval.arssteels.net",
  fromName: "ARS CMS",
  replyTo: "itadmin@arssteels.co.in",
  provider: "SMTP",
  smtp: { host: "bom1plzcpnl493872.prod.bom1.secureserver.net", port: 465, security: "SSL", user: "no_reply@cms.arssteels.net", password: "pw", connectHost: null },
  smtpHourlyLimit: 100,
  fallbackToResend: true,
  ...over,
});
const resendOk = () => vi.fn(async () => new Response(JSON.stringify({ id: "re-1" }), { status: 200 }));
const input = { to: "ravi@example.test", subject: "Line one\r\nBcc: evil@example.test", text: "Hello", idempotencyKey: "ars-n1-email" };

describe("email through the GoDaddy mailbox (SMTP)", () => {
  it("sends through SMTP as the mailbox, one-line subject, reply-to IT; Resend untouched", async () => {
    const smtp = { sendMail: vi.fn<(message: Record<string, unknown>) => Promise<{ messageId: string }>>(async () => ({ messageId: "<m1@cms>" })) };
    const fetch = resendOk();
    const sent = await sendEmail(smtpConfig(), input, { fetch, smtp, smtpSentLastHour: async () => 3 });
    expect(sent).toEqual({ id: "<m1@cms>", provider: "SMTP" });
    expect(fetch).not.toHaveBeenCalled();
    const message = smtp.sendMail.mock.calls[0]![0] as Record<string, unknown>;
    expect(message.from).toEqual({ name: "ARS CMS", address: "no_reply@cms.arssteels.net" });
    expect(message.subject).toBe("Line one Bcc: evil@example.test");
    expect(message.replyTo).toBe("itadmin@arssteels.co.in");
  });

  it("falls back to Resend when SMTP fails (and fallback is on)", async () => {
    const smtp = { sendMail: vi.fn(async () => Promise.reject(Object.assign(new Error("connect ECONNREFUSED"), { code: "ESOCKET" }))) };
    const fetch = resendOk();
    const sent = await sendEmail(smtpConfig(), input, { fetch, smtp, smtpSentLastHour: async () => 0 });
    expect(sent.provider).toBe("RESEND");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("without fallback a failure is reported with its code, never the password", async () => {
    const smtp = { sendMail: vi.fn(async () => Promise.reject(Object.assign(new Error("Invalid login: pw"), { code: "EAUTH", responseCode: 535 }))) };
    const error = (await sendEmail(smtpConfig({ fallbackToResend: false }), input, { fetch: resendOk(), smtp }).catch((caught: unknown) => caught)) as EmailSendError;
    expect(error).toBeInstanceOf(EmailSendError);
    expect(error.code).toBe("EMAIL_NOT_CONFIGURED");
    expect(error.message).not.toContain("pw");
  });

  it("the hourly limit: Resend carries it, or it waits and is retried later", async () => {
    const smtp = { sendMail: vi.fn(async () => ({ messageId: "x" })) };
    const viaResend = await sendEmail(smtpConfig(), input, { fetch: resendOk(), smtp, smtpSentLastHour: async () => 100 });
    expect(viaResend.provider).toBe("RESEND");
    expect(smtp.sendMail).not.toHaveBeenCalled();
    const error = (await sendEmail(smtpConfig({ fallbackToResend: false }), input, { fetch: resendOk(), smtp, smtpSentLastHour: async () => 100 }).catch((caught: unknown) => caught)) as EmailSendError;
    expect(error.code).toBe("EMAIL_RATE_LIMITED");
    expect(isRetryableCode(error.code)).toBe(true);
    expect(providerRetryAfterSeconds(error)).toBe(900);
  });

  it("a mail server 'try later' (4xx) is retryable", async () => {
    const smtp = { sendMail: vi.fn(async () => Promise.reject(Object.assign(new Error("Too many messages"), { responseCode: 451 }))) };
    const error = (await sendEmail(smtpConfig({ fallbackToResend: false }), input, { fetch: resendOk(), smtp }).catch((caught: unknown) => caught)) as EmailSendError;
    expect(error.code).toBe("EMAIL_RATE_LIMITED");
  });

  it("SMTP chosen without a password: Resend if allowed, otherwise not configured", async () => {
    const noPassword = smtpConfig({ smtp: { ...smtpConfig().smtp!, password: "" } });
    expect((await sendEmail(noPassword, input, { fetch: resendOk() })).provider).toBe("RESEND");
    const error = (await sendEmail({ ...noPassword, fallbackToResend: false }, input, { fetch: resendOk() }).catch((caught: unknown) => caught)) as EmailSendError;
    expect(error.code).toBe("EMAIL_NOT_CONFIGURED");
  });

  it("Resend stays the default provider", async () => {
    const fetch = resendOk();
    const sent = await sendEmail(smtpConfig({ provider: "RESEND", smtp: null }), input, { fetch });
    expect(sent).toEqual({ id: "re-1", provider: "RESEND" });
  });
});
