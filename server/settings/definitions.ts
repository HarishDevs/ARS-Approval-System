import { z } from "zod";

// Every configurable setting, edited only in /superadmin (D-016, D-039).
// A static registry: adding a key is a code change, which keeps validation,
// type and encryption rules reviewable in one place.
export type SettingValueType = "STRING" | "NUMBER" | "BOOLEAN";

export interface SettingDefinition {
  key: string;
  group: "GENERAL" | "AUTHENTICATION" | "EMAIL" | "WHATSAPP" | "FEATURES" | "RETENTION" | "AI" | "AI_DATA";
  label: string;
  valueType: SettingValueType;
  encrypted: boolean;
  schema: z.ZodTypeAny;
  defaultValue?: string;
}

export const SETTING_DEFINITIONS: readonly SettingDefinition[] = [
  { key: "general.app_name", group: "GENERAL", label: "Application name", valueType: "STRING", encrypted: false, schema: z.string().trim().min(1).max(150), defaultValue: "ARS Approvals" },
  { key: "general.escalation_levels", group: "GENERAL", label: "Escalation levels for late approvals (1 = manager, 2 = + manager's manager, 3 = one more)", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().int().min(1).max(3), defaultValue: "2" },
  // Unified prompt (BD-3): over-budget requests warn by default; BLOCK is an owner decision.
  { key: "general.budget_policy", group: "GENERAL", label: "Over-budget requests: WARN (warn, ask to confirm) or BLOCK (refuse)", valueType: "STRING", encrypted: false, schema: z.enum(["WARN", "BLOCK"]), defaultValue: "WARN" },
  // FN2: an open request with no activity for this many days is listed as possibly stuck.
  { key: "general.stuck_idle_days", group: "GENERAL", label: "Days without activity before a request is listed as possibly stuck", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().int().min(1).max(90), defaultValue: "7" },
  // Feature switches (Addendum B, D-124): ON, OFF, or IT_ONLY for a trial with
  // the IT team first. A switch only hides or shows a feature; who may see
  // what is still decided by the server-side access checks.
  { key: "features.analytics", group: "FEATURES", label: "Analytics (ON, OFF or IT_ONLY)", valueType: "STRING", encrypted: false, schema: z.enum(["ON", "OFF", "IT_ONLY"]), defaultValue: "ON" },
  { key: "features.reports", group: "FEATURES", label: "Reports and downloads (ON, OFF or IT_ONLY)", valueType: "STRING", encrypted: false, schema: z.enum(["ON", "OFF", "IT_ONLY"]), defaultValue: "ON" },
  { key: "features.scheduled_reports", group: "FEATURES", label: "Scheduled reports and alerts (ON, OFF or IT_ONLY)", valueType: "STRING", encrypted: false, schema: z.enum(["ON", "OFF", "IT_ONLY"]), defaultValue: "ON" },
  { key: "features.amendments", group: "FEATURES", label: "Amendments after approval (ON, OFF or IT_ONLY)", valueType: "STRING", encrypted: false, schema: z.enum(["ON", "OFF", "IT_ONLY"]), defaultValue: "ON" },
  // v1.7.0 (A9): downloads for everyone (default), or only people with the
  // "Can export" role (IT and the Super Admin always can).
  { key: "features.exports", group: "FEATURES", label: "Report downloads: EVERYONE, or ROLE (only people with the Can export role, plus IT)", valueType: "STRING", encrypted: false, schema: z.enum(["EVERYONE", "ROLE"]), defaultValue: "EVERYONE" },
  // v1.9.0 (owner): the Task and Information modules.
  { key: "features.tasks", group: "FEATURES", label: "Task Management (ON, OFF or IT_ONLY)", valueType: "STRING", encrypted: false, schema: z.enum(["ON", "OFF", "IT_ONLY"]), defaultValue: "ON" },
  { key: "features.information", group: "FEATURES", label: "Information Management (ON, OFF or IT_ONLY)", valueType: "STRING", encrypted: false, schema: z.enum(["ON", "OFF", "IT_ONLY"]), defaultValue: "ON" },
  { key: "features.ai", group: "FEATURES", label: "AI module (ON, OFF or IT_ONLY); people also need the AI module ticked on their user page", valueType: "STRING", encrypted: false, schema: z.enum(["ON", "OFF", "IT_ONLY"]), defaultValue: "ON" },
  { key: "features.templates", group: "FEATURES", label: "Request templates and raise again (ON, OFF or IT_ONLY)", valueType: "STRING", encrypted: false, schema: z.enum(["ON", "OFF", "IT_ONLY"]), defaultValue: "ON" },
  // Retention (FN10, D-126): 0 = not set, keep for ever. Setting a value only
  // changes the dry run; nothing is archived or deleted automatically.
  { key: "retention.requests_years", group: "RETENTION", label: "Keep finished requests for (years; 0 = keep for ever)", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().int().min(0).max(50), defaultValue: "0" },
  { key: "retention.notifications_days", group: "RETENTION", label: "Keep in-app notifications for (days; 0 = keep for ever)", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().int().min(0).max(3650), defaultValue: "0" },
  // v1.12.0 (Analytics Center): age buckets for task and information backlogs, in days (e.g. 1,3,7,14 → under 1 day, 1–3, 4–7, 8–14, over 14).
  { key: "analytics.aging_days", group: "GENERAL", label: "Analytics age buckets (days, comma-separated, e.g. 1,3,7,14)", valueType: "STRING", encrypted: false, schema: z.string().trim().regex(/^\d{1,3}(,\d{1,3}){0,5}$/, "Use up to 6 whole numbers of days, separated by commas."), defaultValue: "1,3,7,14" },
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
  // v1.8.0 (owner): 30 minutes by default; users and IT admins only, never the Super Admin.
  { key: "auth.idle_timeout_minutes", group: "AUTHENTICATION", label: "Sign everyone out after no activity (minutes, 5 to 480; the Super Admin too)", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().int().min(5).max(480), defaultValue: "30" },
  { key: "auth.trusted_device_days", group: "AUTHENTICATION", label: "Remember a device for (days)", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().int().min(1).max(90), defaultValue: "30" },

  // Email via Resend (D-037). GoDaddy's Node hosting blocks outbound SMTP.
  { key: "email.resend_api_key", group: "EMAIL", label: "Resend API key", valueType: "STRING", encrypted: true, schema: z.string().min(1).max(500) },
  { key: "email.from_address", group: "EMAIL", label: "From address", valueType: "STRING", encrypted: false, schema: z.string().trim().email(), defaultValue: "no_reply@approval.arssteels.net" },
  // D-080: replies to a notification reach IT, not the no-reply sender.
  { key: "email.reply_to", group: "EMAIL", label: "Reply-to address", valueType: "STRING", encrypted: false, schema: z.string().trim().email(), defaultValue: "itadmin@arssteels.co.in" },
  { key: "email.from_name", group: "EMAIL", label: "From name", valueType: "STRING", encrypted: false, schema: z.string().trim().min(1).max(100), defaultValue: "ARS Approvals" },

  // WhatsApp via CEOITBox, the same number and API as the Power BI site (D-036).
  { key: "whatsapp.ceoitbox_base_url", group: "WHATSAPP", label: "CEOITBox base URL", valueType: "STRING", encrypted: false, schema: z.string().trim().url().refine((value) => value.startsWith("https://"), "Use an https:// address: the API key is sent with every call."), defaultValue: "https://official.ceoitbox.com" },
  { key: "whatsapp.ceoitbox_phone_id", group: "WHATSAPP", label: "CEOITBox phone ID (x-phone-id)", valueType: "STRING", encrypted: false, schema: z.string().trim().min(1).max(255), defaultValue: "1057554220785929" },
  { key: "whatsapp.ceoitbox_api_key", group: "WHATSAPP", label: "CEOITBox API key (x-api-key)", valueType: "STRING", encrypted: true, schema: z.string().min(1).max(500) },
  { key: "whatsapp.ceoitbox_timeout_ms", group: "WHATSAPP", label: "Request timeout (ms)", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().int().min(1000).max(60000), defaultValue: "10000" },
  { key: "whatsapp.ceoitbox_rate_limit_per_minute", group: "WHATSAPP", label: "Send limit per minute", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().int().min(1).max(1000), defaultValue: "60" },
  // S8-03: CEOITBox sends delivery/read receipts with this in the x-webhook-secret header.
  { key: "whatsapp.webhook_secret", group: "WHATSAPP", label: "Webhook secret (for delivery receipts)", valueType: "STRING", encrypted: true, schema: z.string().min(24, "Use at least 24 characters.").max(200) },
  { key: "whatsapp.retry_limit", group: "WHATSAPP", label: "Retries for a failed send", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().int().min(0).max(10), defaultValue: "3" },
  // D-169 (AI module branch): AI providers. Keys are encrypted and never shown
  // back. A provider is usable once it has a key and a model; the active one
  // answers, the fallback answers only when the active one is unavailable.
  { key: "ai.active_provider", group: "AI", label: "Active provider: NONE, CLAUDE, OPENAI (ChatGPT), GROK or DEEPSEEK", valueType: "STRING", encrypted: false, schema: z.enum(["NONE", "CLAUDE", "OPENAI", "GROK", "DEEPSEEK"]), defaultValue: "NONE" },
  { key: "ai.fallback_provider", group: "AI", label: "Fallback provider when the active one is unavailable (NONE for no fallback)", valueType: "STRING", encrypted: false, schema: z.enum(["NONE", "CLAUDE", "OPENAI", "GROK", "DEEPSEEK"]), defaultValue: "NONE" },
  { key: "ai.claude.api_key", group: "AI", label: "Claude (Anthropic) API key", valueType: "STRING", encrypted: true, schema: z.string().trim().min(10).max(500) },
  { key: "ai.claude.model", group: "AI", label: "Claude model", valueType: "STRING", encrypted: false, schema: z.string().trim().min(2).max(100).regex(/^[\w.:-]+$/, "Use the model name from the provider's documentation."), defaultValue: "claude-sonnet-5-5" },
  { key: "ai.openai.api_key", group: "AI", label: "ChatGPT (OpenAI) API key", valueType: "STRING", encrypted: true, schema: z.string().trim().min(10).max(500) },
  { key: "ai.openai.model", group: "AI", label: "ChatGPT model (from OpenAI's model list)", valueType: "STRING", encrypted: false, schema: z.string().trim().min(2).max(100).regex(/^[\w.:-]+$/, "Use the model name from the provider's documentation.") },
  { key: "ai.grok.api_key", group: "AI", label: "Grok (xAI) API key", valueType: "STRING", encrypted: true, schema: z.string().trim().min(10).max(500) },
  { key: "ai.grok.model", group: "AI", label: "Grok model (from xAI's model list)", valueType: "STRING", encrypted: false, schema: z.string().trim().min(2).max(100).regex(/^[\w.:-]+$/, "Use the model name from the provider's documentation.") },
  { key: "ai.deepseek.api_key", group: "AI", label: "DeepSeek API key", valueType: "STRING", encrypted: true, schema: z.string().trim().min(10).max(500) },
  { key: "ai.deepseek.model", group: "AI", label: "DeepSeek model", valueType: "STRING", encrypted: false, schema: z.string().trim().min(2).max(100).regex(/^[\w.:-]+$/, "Use the model name from the provider's documentation."), defaultValue: "deepseek-chat" },
  // Which providers may see ARS business data (tool results). Off by default:
  // the Super Admin approves each provider explicitly (D-169, R-06, R-18).
  { key: "ai.claude.business_data", group: "AI", label: "Claude may see business data: ALLOWED or NOT_ALLOWED", valueType: "STRING", encrypted: false, schema: z.enum(["ALLOWED", "NOT_ALLOWED"]), defaultValue: "NOT_ALLOWED" },
  { key: "ai.openai.business_data", group: "AI", label: "ChatGPT may see business data: ALLOWED or NOT_ALLOWED", valueType: "STRING", encrypted: false, schema: z.enum(["ALLOWED", "NOT_ALLOWED"]), defaultValue: "NOT_ALLOWED" },
  { key: "ai.grok.business_data", group: "AI", label: "Grok may see business data: ALLOWED or NOT_ALLOWED", valueType: "STRING", encrypted: false, schema: z.enum(["ALLOWED", "NOT_ALLOWED"]), defaultValue: "NOT_ALLOWED" },
  { key: "ai.deepseek.business_data", group: "AI", label: "DeepSeek may see business data: ALLOWED or NOT_ALLOWED", valueType: "STRING", encrypted: false, schema: z.enum(["ALLOWED", "NOT_ALLOWED"]), defaultValue: "NOT_ALLOWED" },
  { key: "ai.daily_questions_per_person", group: "AI", label: "Questions per person per day", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().int().min(1).max(1000), defaultValue: "50" },
  { key: "ai.max_question_chars", group: "AI", label: "Longest question (characters)", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().int().min(100).max(20000), defaultValue: "4000" },
  { key: "ai.timeout_seconds", group: "AI", label: "How long to wait for an answer (seconds)", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().int().min(5).max(180), defaultValue: "60" },
  { key: "ai.conversation_keep_days", group: "AI", label: "Keep AI conversations for (days; 0 keeps them)", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().int().min(0).max(3650), defaultValue: "365" },
  // Phase 6 (D-169): Salesforce, read-only, through a dedicated integration
  // user (OAuth 2.0 client credentials). Nothing syncs until all are set and
  // the Super Admin presses Sync now (or the hourly job runs).
  { key: "ai.salesforce.instance_url", group: "AI_DATA", label: "Salesforce My Domain URL (https://yourcompany.my.salesforce.com; a sandbox first)", valueType: "STRING", encrypted: false, schema: z.string().trim().url().regex(/^https:\/\/[\w.-]+\.(salesforce|force)\.com\/?$/, "Use your https://….my.salesforce.com address.") },
  { key: "ai.salesforce.client_id", group: "AI_DATA", label: "Salesforce connected app: consumer key", valueType: "STRING", encrypted: true, schema: z.string().trim().min(10).max(300) },
  { key: "ai.salesforce.client_secret", group: "AI_DATA", label: "Salesforce connected app: consumer secret", valueType: "STRING", encrypted: true, schema: z.string().trim().min(10).max(300) },
  { key: "ai.salesforce.objects", group: "AI_DATA", label: "Objects and fields to copy, e.g. Account:Name,Industry;Opportunity:Name,Amount,StageName,CloseDate (Id and SystemModstamp are added)", valueType: "STRING", encrypted: false, schema: z.string().trim().max(2000).regex(/^(\w+:\w+(,\w+)*)(;\w+:\w+(,\w+)*)*$/, "Use Object:Field,Field;Object:Field.") },
  { key: "ai.salesforce.visible_to", group: "AI_DATA", label: "Who may ask about Salesforce data: IT_ONLY or AI_USERS", valueType: "STRING", encrypted: false, schema: z.enum(["IT_ONLY", "AI_USERS"]), defaultValue: "IT_ONLY" },
];

export function findSettingDefinition(key: string): SettingDefinition | undefined {
  return SETTING_DEFINITIONS.find((definition) => definition.key === key);
}
