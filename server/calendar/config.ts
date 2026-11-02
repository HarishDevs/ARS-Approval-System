import { z } from "zod";

// v1.11.0 (D-152): the Google Calendar integration's global set-up, made by
// the Super Admin. Pure: validation, defaults and the status shown.
// The client secret is never part of this object; it is stored encrypted
// on its own and only its presence is shown.

export const SYNC_DIRECTIONS = ["TWO_WAY", "ARS_TO_GOOGLE", "GOOGLE_TO_ARS"] as const;
export const CONFLICT_POLICIES = ["ARS_WINS", "GOOGLE_WINS", "LATEST", "MANUAL"] as const;
export const ARS_DELETION = ["DELETE_EVENT", "KEEP_EVENT"] as const;
export const GOOGLE_DELETION = ["UNLINK", "RECREATE"] as const;
export const PRIVACY = ["PRIVATE", "CALENDAR_DEFAULT"] as const;
export const CALENDAR_POLICIES = ["PRIMARY", "PERSON_CHOOSES"] as const;

export const TEMPLATE_VARIABLES = ["{kind}", "{ref}", "{title}", "{link}"] as const;
const template = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => (value.match(/\{[a-z]+\}/g) ?? []).every((token) => (TEMPLATE_VARIABLES as readonly string[]).includes(token)), "Use only {kind}, {ref}, {title} and {link}.");

export const calendarConfigSchema = z.object({
  allowConnections: z.boolean().default(true),
  allowCalendarChoice: z.boolean().default(true),
  calendarPolicy: z.enum(CALENDAR_POLICIES).default("PRIMARY"),
  direction: z.enum(SYNC_DIRECTIONS).default("TWO_WAY"),
  modules: z
    .object({
      approvalDue: z.boolean().default(true), // approvals waiting on the person, by their due time
      neededBy: z.boolean().default(false), // the person's own requests, by their "needed by" date
      taskDue: z.boolean().default(true), // tasks assigned to the person, by their due time
      infoEvents: z.boolean().default(true), // information of calendar-eligible types, by its effective date
      personal: z.boolean().default(true), // the person's own calendar entries, both ways
    })
    // zod 4: prefault parses {} so the field defaults apply (default would skip parsing).
    .prefault({}),
  privacy: z.enum(PRIVACY).default("PRIVATE"),
  titleTemplate: template(120).default("{kind}: {ref}"),
  descriptionTemplate: template(500).default("Open in ARS CMS: {link}"),
  timezone: z.string().trim().min(1).max(64).default("Asia/Kolkata"),
  intervalMinutes: z.number().int().min(5).max(1440).default(15),
  retryMax: z.number().int().min(1).max(10).default(5),
  conflictPolicy: z.enum(CONFLICT_POLICIES).default("MANUAL"),
  arsDeletion: z.enum(ARS_DELETION).default("DELETE_EVENT"),
  googleDeletion: z.enum(GOOGLE_DELETION).default("UNLINK"),
  importWindowDays: z.number().int().min(1).max(365).default(30),
  alertOnFailure: z.boolean().default(true),
});
export type CalendarConfig = z.infer<typeof calendarConfigSchema>;

export const DEFAULT_CONFIG: CalendarConfig = calendarConfigSchema.parse({});

export function parseConfig(raw: unknown): CalendarConfig {
  const value = typeof raw === "string" ? safeJson(raw) : raw;
  const parsed = calendarConfigSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : DEFAULT_CONFIG;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

// A Google OAuth client ID looks like 1234-abc.apps.googleusercontent.com.
export const CLIENT_ID = /^[0-9]+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i;

export function isValidTimezone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export type IntegrationStatus = "NOT_CONFIGURED" | "DISABLED" | "ENABLED" | "MAINTENANCE";

export const STATUS_LABEL: Record<IntegrationStatus, string> = {
  NOT_CONFIGURED: "Not configured",
  DISABLED: "Disabled",
  ENABLED: "Enabled",
  MAINTENANCE: "Maintenance",
};

// "Enabled" only when switched on AND the set-up is complete and its last
// test passed; otherwise it shows as Not configured (brief 3.3).
export function integrationStatus(state: { enabled: boolean; maintenance: boolean; clientId: string | null; hasSecret: boolean; lastTestOk: boolean | null }): IntegrationStatus {
  if (!state.clientId || !state.hasSecret || state.lastTestOk !== true) return "NOT_CONFIGURED";
  if (!state.enabled) return "DISABLED";
  return state.maintenance ? "MAINTENANCE" : "ENABLED";
}

// The callback address registered in Google Cloud Console.
export const CALLBACK_PATH = "/api/integrations/google-calendar/callback";
export const WEBHOOK_PATH = "/api/webhooks/google-calendar";

export function redirectUri(baseUrl: string | undefined): string | null {
  if (!baseUrl) return null;
  try {
    const url = new URL(CALLBACK_PATH, baseUrl);
    return url.toString();
  } catch {
    return null;
  }
}

// Least privilege (brief §4): read and write events ON CALENDARS THE PERSON
// OWNS (v1.12.2, D-162: calendar.events.owned, narrower than calendar.events,
// which covers every calendar they can see; every Calendar method the sync
// uses accepts it), list their calendars to choose one, and the account
// email to show what is connected.
export const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events.owned", "https://www.googleapis.com/auth/calendar.calendarlist.readonly"] as const;
export const REQUIRED_SCOPE = "https://www.googleapis.com/auth/calendar.events.owned";

// Google may return a broader calendar scope the person granted earlier
// (incremental consent) instead of the narrow one asked for; any scope that
// covers writing events on their own calendars is enough.
const COVERING_SCOPES = [REQUIRED_SCOPE, "https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar"];

export function hasRequiredScope(granted: string): boolean {
  const scopes = granted.split(/\s+/);
  return COVERING_SCOPES.some((scope) => scopes.includes(scope));
}

// For diagnosis (audit only): the short names of the scopes Google granted.
export function scopeNames(granted: string): string[] {
  return granted.split(/\s+/).filter(Boolean).map((scope) => scope.replace("https://www.googleapis.com/auth/", "")).slice(0, 10);
}

export function authUrl(input: { clientId: string; redirectUri: string; state: string; loginHint?: string | null }): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent"); // always returns a refresh token
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", input.state);
  if (input.loginHint) url.searchParams.set("login_hint", input.loginHint);
  return url.toString();
}
