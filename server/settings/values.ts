import "server-only";
import { DAILY_SCOPES, type DailySessionScope } from "@/lib/session/daily";
import { findSettingDefinition } from "@/server/settings/definitions";
import { getRawSetting } from "@/lib/db/repositories/settings.repository";
import { decryptSecret } from "@/lib/security/encryption";

// Server-only resolution of a setting's real value (decrypting secrets).
// Read fresh on every call so a change in /superadmin applies on the next
// request without a restart.
export async function getSettingValue(key: string): Promise<string | null> {
  const definition = findSettingDefinition(key);
  if (!definition) throw new Error(`Unknown setting key ${key}`);
  const raw = await getRawSetting(key);
  if (raw?.value) return definition.encrypted ? decryptSecret(raw.value) : raw.value;
  return definition.defaultValue ?? null;
}

export async function getNumberSetting(key: string): Promise<number> {
  const value = await getSettingValue(key);
  const number = Number(value);
  if (value === null || !Number.isFinite(number)) throw new Error(`Setting ${key} has no numeric value`);
  return number;
}

export interface AuthSecurityConfig {
  otpLength: number;
  otpTtlSeconds: number;
  otpMaxAttempts: number;
  otpCooldownSeconds: number;
  otpMaxPerHour: number;
  passwordMinLength: number;
  lockoutThreshold: number;
  lockoutMinutes: number;
  trustedDeviceDays: number;
}

export async function getAuthSecurityConfig(): Promise<AuthSecurityConfig> {
  const [otpLength, otpTtlSeconds, otpMaxAttempts, otpCooldownSeconds, otpMaxPerHour, passwordMinLength, lockoutThreshold, lockoutMinutes, trustedDeviceDays] =
    await Promise.all([
      getNumberSetting("auth.otp_length"),
      getNumberSetting("auth.otp_expiry_seconds"),
      getNumberSetting("auth.otp_max_attempts"),
      getNumberSetting("auth.otp_cooldown_seconds"),
      getNumberSetting("auth.otp_max_per_hour"),
      getNumberSetting("auth.password_min_length"),
      getNumberSetting("auth.lockout_threshold"),
      getNumberSetting("auth.lockout_minutes"),
      getNumberSetting("auth.trusted_device_days"),
    ]);
  return { otpLength, otpTtlSeconds, otpMaxAttempts, otpCooldownSeconds, otpMaxPerHour, passwordMinLength, lockoutThreshold, lockoutMinutes, trustedDeviceDays };
}

export interface WhatsAppConfig {
  baseUrl: string;
  phoneId: string | null;
  apiKey: string | null;
  timeoutMs: number;
  rateLimitPerMinute: number;
  retryLimit: number;
}

export async function getWhatsAppConfig(): Promise<WhatsAppConfig> {
  const [baseUrl, phoneId, apiKey, timeoutMs, rateLimitPerMinute, retryLimit] = await Promise.all([
    getSettingValue("whatsapp.ceoitbox_base_url"),
    getSettingValue("whatsapp.ceoitbox_phone_id"),
    getSettingValue("whatsapp.ceoitbox_api_key"),
    getNumberSetting("whatsapp.ceoitbox_timeout_ms"),
    getNumberSetting("whatsapp.ceoitbox_rate_limit_per_minute"),
    getNumberSetting("whatsapp.retry_limit"),
  ]);
  return { baseUrl: baseUrl ?? "https://official.ceoitbox.com", phoneId, apiKey, timeoutMs, rateLimitPerMinute, retryLimit };
}

export interface EmailConfig {
  apiKey: string | null;
  fromAddress: string;
  fromName: string;
  replyTo?: string | null;
  // v1.54.8: RESEND (default) or SMTP (the GoDaddy cPanel mailbox).
  provider?: "RESEND" | "SMTP" | "SENDMAIL";
  // v1.54.10: SENDMAIL = the hosting's mail program (path), sending as smtp.user.
  sendmailPath?: string;
  smtp?: { host: string; port: number; security: "SSL" | "STARTTLS"; user: string; password: string; connectHost?: string | null } | null;
  smtpHourlyLimit?: number;
  fallbackToResend?: boolean;
}

export async function getEmailConfig(): Promise<EmailConfig> {
  const [apiKey, fromAddress, fromName, replyTo, provider, host, port, security, user, password, connectHost, hourly, fallback] = await Promise.all([
    getSettingValue("email.resend_api_key"),
    getSettingValue("email.from_address"),
    getSettingValue("email.from_name"),
    getSettingValue("email.reply_to"),
    getSettingValue("email.provider").catch(() => null),
    getSettingValue("email.smtp_host").catch(() => null),
    getSettingValue("email.smtp_port").catch(() => null),
    getSettingValue("email.smtp_security").catch(() => null),
    getSettingValue("email.smtp_user").catch(() => null),
    getSettingValue("email.smtp_password").catch(() => null),
    getSettingValue("email.smtp_connect_host").catch(() => null),
    getSettingValue("email.smtp_hourly_limit").catch(() => null),
    getSettingValue("email.fallback_resend").catch(() => null),
  ]);
  const sendmailPath = await getSettingValue("email.sendmail_path").catch(() => null);
  const smtpOn = provider === "SMTP" || provider === "SENDMAIL";
  return {
    apiKey,
    fromAddress: fromAddress ?? "no_reply@approval.arssteels.net",
    fromName: fromName ?? "ARS CMS",
    replyTo,
    provider: provider === "SENDMAIL" ? "SENDMAIL" : provider === "SMTP" ? "SMTP" : "RESEND",
    sendmailPath: sendmailPath ?? "/usr/sbin/sendmail",
    smtp: smtpOn ? { host: host ?? "", port: Number(port) || 465, security: security === "STARTTLS" ? "STARTTLS" : "SSL", user: user ?? "", password: password ?? "", connectHost } : null,
    smtpHourlyLimit: Number(hourly ?? 100) || 0,
    fallbackToResend: fallback !== "OFF",
  };
}

// D-250: who gets the daily session (until midnight IST, no idle sign-out).
export async function getDailySessionScope(): Promise<DailySessionScope> {
  const value = await getSettingValue("auth.daily_session_scope").catch(() => null);
  return (DAILY_SCOPES as readonly string[]).includes(value ?? "") ? (value as DailySessionScope) : "DEVICES";
}
