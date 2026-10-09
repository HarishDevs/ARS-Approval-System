import { z } from "zod";

// Every configurable setting, edited only in /superadmin (D-016, D-039).
// A static registry: adding a key is a code change, which keeps validation,
// type and encryption rules reviewable in one place.
export type SettingValueType = "STRING" | "NUMBER" | "BOOLEAN";

export interface SettingDefinition {
  key: string;
  group: "GENERAL" | "AUTHENTICATION" | "EMAIL" | "WHATSAPP";
  label: string;
  valueType: SettingValueType;
  encrypted: boolean;
  schema: z.ZodTypeAny;
  defaultValue?: string;
}

export const SETTING_DEFINITIONS: readonly SettingDefinition[] = [
  { key: "general.app_name", group: "GENERAL", label: "Application name", valueType: "STRING", encrypted: false, schema: z.string().trim().min(1).max(150), defaultValue: "ARS Approvals" },
  { key: "general.timezone", group: "GENERAL", label: "Timezone", valueType: "STRING", encrypted: false, schema: z.string().trim().min(1).max(100), defaultValue: "Asia/Kolkata" },

  // OTP and sign-in security (P1-12, P1-15, P1-16, P1-17). Safe min/max bounds
  // so nobody can weaken security by accident.
  { key: "auth.otp_length", group: "AUTHENTICATION", label: "OTP length", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().int().min(4).max(8), defaultValue: "6" },
  { key: "auth.otp_expiry_seconds", group: "AUTHENTICATION", label: "OTP expiry (seconds)", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().int().min(60).max(900), defaultValue: "300" },
  { key: "auth.otp_max_attempts", group: "AUTHENTICATION", label: "OTP wrong tries allowed", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().int().min(3).max(10), defaultValue: "5" },
  { key: "auth.otp_cooldown_seconds", group: "AUTHENTICATION", label: "OTP resend wait (seconds)", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().int().min(15).max(300), defaultValue: "30" },
  { key: "auth.otp_max_per_hour", group: "AUTHENTICATION", label: "OTPs per user per hour", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().int().min(3).max(20), defaultValue: "5" },
  { key: "auth.password_min_length", group: "AUTHENTICATION", label: "Minimum password length", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().int().min(10).max(64), defaultValue: "10" },
  { key: "auth.lockout_threshold", group: "AUTHENTICATION", label: "Wrong passwords before lock", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().int().min(3).max(10), defaultValue: "5" },
  { key: "auth.lockout_minutes", group: "AUTHENTICATION", label: "Lock duration (minutes)", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().int().min(5).max(1440), defaultValue: "15" },
  { key: "auth.idle_timeout_minutes", group: "AUTHENTICATION", label: "Sign out after no activity (minutes)", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().int().min(15).max(720), defaultValue: "120" },
  { key: "auth.trusted_device_days", group: "AUTHENTICATION", label: "Remember a device for (days)", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().int().min(1).max(90), defaultValue: "30" },

  // Email via Resend (D-037). GoDaddy's Node hosting blocks outbound SMTP.
  { key: "email.resend_api_key", group: "EMAIL", label: "Resend API key", valueType: "STRING", encrypted: true, schema: z.string().min(1).max(500) },
  { key: "email.from_address", group: "EMAIL", label: "From address", valueType: "STRING", encrypted: false, schema: z.string().trim().email(), defaultValue: "no_reply@approval.arssteels.net" },
  // D-080: replies to a notification reach IT, not the no-reply sender.
  { key: "email.reply_to", group: "EMAIL", label: "Reply-to address", valueType: "STRING", encrypted: false, schema: z.string().trim().email(), defaultValue: "itadmin@arssteels.co.in" },
  { key: "email.from_name", group: "EMAIL", label: "From name", valueType: "STRING", encrypted: false, schema: z.string().trim().min(1).max(100), defaultValue: "ARS Approvals" },

  // WhatsApp via CEOITBox, the same number and API as the Power BI site (D-036).
  { key: "whatsapp.ceoitbox_base_url", group: "WHATSAPP", label: "CEOITBox base URL", valueType: "STRING", encrypted: false, schema: z.string().trim().url(), defaultValue: "https://official.ceoitbox.com" },
  { key: "whatsapp.ceoitbox_phone_id", group: "WHATSAPP", label: "CEOITBox phone ID (x-phone-id)", valueType: "STRING", encrypted: false, schema: z.string().trim().min(1).max(255), defaultValue: "1057554220785929" },
  { key: "whatsapp.ceoitbox_api_key", group: "WHATSAPP", label: "CEOITBox API key (x-api-key)", valueType: "STRING", encrypted: true, schema: z.string().min(1).max(500) },
  { key: "whatsapp.ceoitbox_timeout_ms", group: "WHATSAPP", label: "Request timeout (ms)", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().int().min(1000).max(60000), defaultValue: "10000" },
  { key: "whatsapp.ceoitbox_rate_limit_per_minute", group: "WHATSAPP", label: "Send limit per minute", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().int().min(1).max(1000), defaultValue: "60" },
  { key: "whatsapp.retry_limit", group: "WHATSAPP", label: "Retries for a failed send", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().int().min(0).max(10), defaultValue: "3" },
];

export function findSettingDefinition(key: string): SettingDefinition | undefined {
  return SETTING_DEFINITIONS.find((definition) => definition.key === key);
}
