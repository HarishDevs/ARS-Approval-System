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
  { key: "general.budget_policy", group: "GENERAL", label: "Over-budget requests (Warn asks to confirm; Block refuses)", valueType: "STRING", encrypted: false, schema: z.enum(["WARN", "BLOCK"]), defaultValue: "WARN" },
  // FN2: an open request with no activity for this many days is listed as possibly stuck.
  { key: "general.stuck_idle_days", group: "GENERAL", label: "Days without activity before a request is listed as possibly stuck", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().int().min(1).max(90), defaultValue: "7" },
  // Feature switches (Addendum B, D-124): ON, OFF, or IT_ONLY for a trial with
  // the IT team first. A switch only hides or shows a feature; who may see
  // what is still decided by the server-side access checks.
  { key: "features.analytics", group: "FEATURES", label: "Analytics", valueType: "STRING", encrypted: false, schema: z.enum(["ON", "OFF", "IT_ONLY"]), defaultValue: "ON" },
  { key: "features.reports", group: "FEATURES", label: "Reports and downloads", valueType: "STRING", encrypted: false, schema: z.enum(["ON", "OFF", "IT_ONLY"]), defaultValue: "ON" },
  { key: "features.scheduled_reports", group: "FEATURES", label: "Scheduled reports and alerts", valueType: "STRING", encrypted: false, schema: z.enum(["ON", "OFF", "IT_ONLY"]), defaultValue: "ON" },
  { key: "features.amendments", group: "FEATURES", label: "Amendments after approval", valueType: "STRING", encrypted: false, schema: z.enum(["ON", "OFF", "IT_ONLY"]), defaultValue: "ON" },
  // v1.7.0 (A9): downloads for everyone (default), or only people with the
  // "Can export" role (IT and the Super Admin always can).
  { key: "features.exports", group: "FEATURES", label: "Report downloads (By role = only people with the Can export role, plus IT)", valueType: "STRING", encrypted: false, schema: z.enum(["EVERYONE", "ROLE"]), defaultValue: "EVERYONE" },
  // v1.9.0 (owner): the Task and Information modules.
  { key: "features.tasks", group: "FEATURES", label: "Task Management", valueType: "STRING", encrypted: false, schema: z.enum(["ON", "OFF", "IT_ONLY"]), defaultValue: "ON" },
  { key: "features.information", group: "FEATURES", label: "Information Management", valueType: "STRING", encrypted: false, schema: z.enum(["ON", "OFF", "IT_ONLY"]), defaultValue: "ON" },
  { key: "features.ai", group: "FEATURES", label: "AI module; people also need the AI module ticked on their user page", valueType: "STRING", encrypted: false, schema: z.enum(["ON", "OFF", "IT_ONLY"]), defaultValue: "ON" },
  { key: "features.templates", group: "FEATURES", label: "Request templates and raise again", valueType: "STRING", encrypted: false, schema: z.enum(["ON", "OFF", "IT_ONLY"]), defaultValue: "ON" },
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
  { key: "ai.active_provider", group: "AI", label: "Active provider", valueType: "STRING", encrypted: false, schema: z.enum(["NONE", "CLAUDE", "OPENAI", "GROK", "DEEPSEEK", "GROQ", "GEMINI", "NVIDIA"]), defaultValue: "NONE" },
  { key: "ai.fallback_provider", group: "AI", label: "Fallback provider when the active one is unavailable", valueType: "STRING", encrypted: false, schema: z.enum(["NONE", "CLAUDE", "OPENAI", "GROK", "DEEPSEEK", "GROQ", "GEMINI", "NVIDIA"]), defaultValue: "NONE" },
  { key: "ai.claude.api_key", group: "AI", label: "Claude (Anthropic) API key", valueType: "STRING", encrypted: true, schema: z.string().trim().min(10).max(500) },
  { key: "ai.claude.model", group: "AI", label: "Claude model", valueType: "STRING", encrypted: false, schema: z.string().trim().min(2).max(100).regex(/^[\w.:/-]+$/, "Use the model name from the provider's documentation."), defaultValue: "claude-sonnet-5-5" },
  { key: "ai.openai.api_key", group: "AI", label: "ChatGPT (OpenAI) API key", valueType: "STRING", encrypted: true, schema: z.string().trim().min(10).max(500) },
  { key: "ai.openai.model", group: "AI", label: "ChatGPT model (from OpenAI's model list)", valueType: "STRING", encrypted: false, schema: z.string().trim().min(2).max(100).regex(/^[\w.:/-]+$/, "Use the model name from the provider's documentation.") },
  { key: "ai.grok.api_key", group: "AI", label: "Grok (xAI) API key", valueType: "STRING", encrypted: true, schema: z.string().trim().min(10).max(500) },
  { key: "ai.grok.model", group: "AI", label: "Grok model (from xAI's model list)", valueType: "STRING", encrypted: false, schema: z.string().trim().min(2).max(100).regex(/^[\w.:/-]+$/, "Use the model name from the provider's documentation.") },
  { key: "ai.deepseek.api_key", group: "AI", label: "DeepSeek API key", valueType: "STRING", encrypted: true, schema: z.string().trim().min(10).max(500) },
  { key: "ai.deepseek.model", group: "AI", label: "DeepSeek model", valueType: "STRING", encrypted: false, schema: z.string().trim().min(2).max(100).regex(/^[\w.:/-]+$/, "Use the model name from the provider's documentation."), defaultValue: "deepseek-chat" },
  // D-174: Groq, Gemini and NVIDIA (Nemotron), all OpenAI-style.
  { key: "ai.groq.api_key", group: "AI", label: "Groq API key (groq.com, starts with gsk_; not xAI's Grok)", valueType: "STRING", encrypted: true, schema: z.string().trim().min(10).max(500) },
  { key: "ai.groq.model", group: "AI", label: "Groq model (from Groq's model list)", valueType: "STRING", encrypted: false, schema: z.string().trim().min(2).max(100).regex(/^[\w.:/-]+$/, "Use the model name from the provider's documentation."), defaultValue: "openai/gpt-oss-120b" },
  { key: "ai.gemini.api_key", group: "AI", label: "Gemini API key (Google AI Studio)", valueType: "STRING", encrypted: true, schema: z.string().trim().min(10).max(500) },
  { key: "ai.gemini.model", group: "AI", label: "Gemini model (from Google AI Studio's model list)", valueType: "STRING", encrypted: false, schema: z.string().trim().min(2).max(100).regex(/^[\w.:/-]+$/, "Use the model name from the provider's documentation."), defaultValue: "gemini-2.5-flash" },
  { key: "ai.nvidia.api_key", group: "AI", label: "NVIDIA API key (build.nvidia.com, starts with nvapi-)", valueType: "STRING", encrypted: true, schema: z.string().trim().min(10).max(500) },
  { key: "ai.nvidia.model", group: "AI", label: "NVIDIA model (a Nemotron model from build.nvidia.com)", valueType: "STRING", encrypted: false, schema: z.string().trim().min(2).max(100).regex(/^[\w.:/-]+$/, "Use the model name from the provider's documentation."), defaultValue: "nvidia/llama-3.3-nemotron-super-49b-v1.5" },
  // Which providers may see ARS business data (tool results). Off by default:
  // the Super Admin approves each provider explicitly (D-169, R-06, R-18).
  { key: "ai.claude.business_data", group: "AI", label: "Claude may see business data", valueType: "STRING", encrypted: false, schema: z.enum(["ALLOWED", "NOT_ALLOWED"]), defaultValue: "NOT_ALLOWED" },
  { key: "ai.openai.business_data", group: "AI", label: "ChatGPT may see business data", valueType: "STRING", encrypted: false, schema: z.enum(["ALLOWED", "NOT_ALLOWED"]), defaultValue: "NOT_ALLOWED" },
  { key: "ai.grok.business_data", group: "AI", label: "Grok may see business data", valueType: "STRING", encrypted: false, schema: z.enum(["ALLOWED", "NOT_ALLOWED"]), defaultValue: "NOT_ALLOWED" },
  { key: "ai.deepseek.business_data", group: "AI", label: "DeepSeek may see business data", valueType: "STRING", encrypted: false, schema: z.enum(["ALLOWED", "NOT_ALLOWED"]), defaultValue: "NOT_ALLOWED" },
  { key: "ai.groq.business_data", group: "AI", label: "Groq may see business data", valueType: "STRING", encrypted: false, schema: z.enum(["ALLOWED", "NOT_ALLOWED"]), defaultValue: "NOT_ALLOWED" },
  { key: "ai.gemini.business_data", group: "AI", label: "Gemini may see business data", valueType: "STRING", encrypted: false, schema: z.enum(["ALLOWED", "NOT_ALLOWED"]), defaultValue: "NOT_ALLOWED" },
  { key: "ai.nvidia.business_data", group: "AI", label: "NVIDIA may see business data", valueType: "STRING", encrypted: false, schema: z.enum(["ALLOWED", "NOT_ALLOWED"]), defaultValue: "NOT_ALLOWED" },
  { key: "ai.daily_questions_per_person", group: "AI", label: "Questions per person per day", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().int().min(1).max(1000), defaultValue: "50" },
  { key: "ai.max_question_chars", group: "AI", label: "Longest question (characters)", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().int().min(100).max(20000), defaultValue: "4000" },
  { key: "ai.timeout_seconds", group: "AI", label: "How long to wait for an answer (seconds)", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().int().min(5).max(180), defaultValue: "60" },
  { key: "ai.conversation_keep_days", group: "AI", label: "Keep AI conversations for (days; 0 keeps them)", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().int().min(0).max(3650), defaultValue: "365" },
  // Pic bot - ai (D-172): switches and limits. Defaults deny: general chat,
  // combined chat and the emergency stop must be turned on deliberately.
  { key: "ai.emergency_stop", group: "AI", label: "Emergency stop (On refuses every AI request at once; Off for normal use)", valueType: "STRING", encrypted: false, schema: z.enum(["ON", "OFF"]), defaultValue: "OFF" },
  { key: "ai.launcher", group: "AI", label: "Floating Pic bot launcher on every page", valueType: "STRING", encrypted: false, schema: z.enum(["ON", "OFF"]), defaultValue: "ON" },
  { key: "ai.general_chat", group: "AI", label: "General AI chat (non-business questions) for people allowed it", valueType: "STRING", encrypted: false, schema: z.enum(["ON", "OFF"]), defaultValue: "OFF" },
  { key: "ai.combined_chat", group: "AI", label: "Combined chat (business data and general answers together) for people allowed it", valueType: "STRING", encrypted: false, schema: z.enum(["ON", "OFF"]), defaultValue: "OFF" },
  { key: "ai.module_modes", group: "AI", label: "Module chats available: any of APPROVAL,TASK,INFORMATION,SALESFORCE (comma-separated; empty for none)", valueType: "STRING", encrypted: false, schema: z.string().trim().max(60).regex(/^$|^(APPROVAL|TASK|INFORMATION|SALESFORCE)(,(APPROVAL|TASK|INFORMATION|SALESFORCE))*$/, "Use APPROVAL, TASK, INFORMATION, SALESFORCE separated by commas."), defaultValue: "APPROVAL,TASK,INFORMATION,SALESFORCE" },
  { key: "ai.requests_per_minute", group: "AI", label: "Questions per person per minute", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().int().min(1).max(60), defaultValue: "6" },
  { key: "ai.concurrent_per_person", group: "AI", label: "Questions one person may have waiting at once", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().int().min(1).max(5), defaultValue: "2" },
  { key: "ai.concurrent_global", group: "AI", label: "Questions sent to providers at once, for everyone (this server)", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().int().min(1).max(50), defaultValue: "10" },
  { key: "ai.history_turns", group: "AI", label: "Earlier messages sent with each question (context)", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().int().min(0).max(30), defaultValue: "10" },
  { key: "ai.max_output_tokens", group: "AI", label: "Longest answer (output tokens)", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().int().min(100).max(8000), defaultValue: "1200" },
  { key: "ai.price_in_per_million", group: "AI", label: "Your provider price per million input tokens, in ₹ (for the cost estimate; leave empty for none)", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().min(0).max(100000) },
  { key: "ai.price_out_per_million", group: "AI", label: "Your provider price per million output tokens, in ₹ (for the cost estimate; leave empty for none)", valueType: "NUMBER", encrypted: false, schema: z.coerce.number().min(0).max(100000) },
  // Salesforce (D-172): OAuth 2.0 web server flow with PKCE, connected once by
  // the Super Admin (Connect Salesforce). Read-only queries, allowlisted
  // objects and fields, Salesforce's own sharing and field security (USER_MODE).
  { key: "ai.salesforce.environment", group: "AI_DATA", label: "Salesforce environment (test in Sandbox first)", valueType: "STRING", encrypted: false, schema: z.enum(["SANDBOX", "PRODUCTION"]), defaultValue: "SANDBOX" },
  { key: "ai.salesforce.my_domain", group: "AI_DATA", label: "Salesforce My Domain login URL (optional, e.g. https://yourcompany--uat.sandbox.my.salesforce.com)", valueType: "STRING", encrypted: false, schema: z.string().trim().url().regex(/^https:\/\/[\w.-]+\.(salesforce|force)\.com\/?$/, "Use your https://….my.salesforce.com address.") },
  { key: "ai.salesforce.client_id", group: "AI_DATA", label: "Salesforce app consumer key", valueType: "STRING", encrypted: true, schema: z.string().trim().min(10).max(300) },
  { key: "ai.salesforce.client_secret", group: "AI_DATA", label: "Salesforce app consumer secret", valueType: "STRING", encrypted: true, schema: z.string().trim().min(10).max(300) },
  { key: "ai.salesforce.scopes", group: "AI_DATA", label: "OAuth scopes (least privilege)", valueType: "STRING", encrypted: false, schema: z.string().trim().regex(/^[a-z_]+( [a-z_]+)*$/, "Space-separated scope names."), defaultValue: "api refresh_token" },
  { key: "ai.salesforce.objects", group: "AI_DATA", label: "Objects and fields Pic bot may read, e.g. Account:Name,Industry;Opportunity:Name,Amount,StageName,CloseDate,AccountId (Id, OwnerId, SystemModstamp are added)", valueType: "STRING", encrypted: false, schema: z.string().trim().max(2000).regex(/^(\w+:\w+(,\w+)*)(;\w+:\w+(,\w+)*)*$/, "Use Object:Field,Field;Object:Field.") },
  { key: "ai.salesforce.copy_hourly", group: "AI_DATA", label: "Also copy those objects hourly for the dashboard", valueType: "STRING", encrypted: false, schema: z.enum(["ON", "OFF"]), defaultValue: "OFF" },

];

export function findSettingDefinition(key: string): SettingDefinition | undefined {
  return SETTING_DEFINITIONS.find((definition) => definition.key === key);
}
