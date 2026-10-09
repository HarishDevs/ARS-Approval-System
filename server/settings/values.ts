import "server-only";
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
}

export async function getEmailConfig(): Promise<EmailConfig> {
  const [apiKey, fromAddress, fromName, replyTo] = await Promise.all([
    getSettingValue("email.resend_api_key"),
    getSettingValue("email.from_address"),
    getSettingValue("email.from_name"),
    getSettingValue("email.reply_to"),
  ]);
  return { apiKey, fromAddress: fromAddress ?? "no_reply@approval.arssteels.net", fromName: fromName ?? "ARS Approvals", replyTo };
}
