import "server-only";
import crypto from "node:crypto";
import { z } from "zod";
import { after } from "next/server";
import { getDbPool } from "@/lib/db/client";
import { decryptSecret, encryptSecret } from "@/lib/security/encryption";
import { getEnv } from "@/config/environment";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { getRunnerHeartbeat } from "@/lib/db/repositories/jobs.repository";
import { findUserById } from "@/lib/db/repositories/users.repository";
import {
  closeConflict,
  conflictById,
  connectionByChannel,
  connectionById,
  connectionByUser,
  consumeOAuthState,
  enqueueJob,
  insertItem,
  insertOAuthState,
  itemById,
  listJobs,
  listLinks,
  loadSettingsRow,
  resetConnectionState,
  retryJob,
  saveConnection,
  saveSettings,
  saveTestResult,
  setSwitch,
  softDeleteGoogleItems,
  softDeleteItem,
  updateConnection,
  updateItem,
  updateLink,
  type ItemRow,
} from "@/lib/db/repositories/gcal.repository";
import { authUrl, calendarConfigSchema, CLIENT_ID, hasRequiredScope, scopeNames, isValidTimezone, redirectUri, type CalendarConfig } from "@/server/calendar/config";
import { eventIdFor, itemEvent, type ItemFields } from "@/server/calendar/events";
import { accessTokenFor, loadIntegration, stopConnectionChannel } from "@/server/calendar/sync";
import { processDueJobs } from "@/server/calendar/jobs";
import { deleteEvent, emailFromIdToken, exchangeCode, GoogleApiError, listCalendars, probeClient, revokeToken, type CalendarListEntry } from "@/server/integrations/google-calendar/client";
import { logError } from "@/lib/logging/logger";

// v1.11.0 (D-152 to D-155): Google Calendar integration services. Every
// function re-checks who may do it; the pages and actions only call these.
type Result<T = undefined> = { ok: true; value: T } | { ok: false; message: string };
const ok = <T,>(value: T): Result<T> => ({ ok: true, value });
const fail = (message: string): Result<never> => ({ ok: false, message });

export interface Actor {
  id: number;
  roles: readonly string[];
  sessionId?: string | null;
}
const isSuperAdmin = (actor: Actor) => actor.roles.includes("SUPER_ADMIN");
const AUDIT_ENTITY = { entityType: "INTEGRATION", entityId: "google_calendar" } as const;

// ---- Super Admin: configuration --------------------------------------------
export const configInputSchema = z.object({
  clientId: z.string().trim().max(255),
  clientSecret: z.string().trim().max(500), // blank = keep the saved one
  config: calendarConfigSchema,
});

export async function saveConfiguration(actor: Actor, input: z.infer<typeof configInputSchema>): Promise<Result<{ secretChanged: boolean }>> {
  if (!isSuperAdmin(actor)) return fail("Only the Super Admin can change the Google Calendar set-up.");
  const parsed = configInputSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the values.");
  const { clientId, clientSecret, config } = parsed.data;
  if (clientId && !CLIENT_ID.test(clientId)) return fail("The client ID should look like 1234567890-abc123.apps.googleusercontent.com.");
  if (clientSecret && (clientSecret.length < 10 || /\s/.test(clientSecret))) return fail("That client secret doesn't look right. Copy it again from Google Cloud Console.");
  if (!isValidTimezone(config.timezone)) return fail("Unknown time zone. Use a name like Asia/Kolkata.");
  const before = await loadSettingsRow();
  await saveSettings({ clientId: clientId || null, secretEnc: clientSecret ? encryptSecret(clientSecret) : undefined, config, updatedBy: actor.id });
  const changed = (Object.keys(config) as (keyof CalendarConfig)[]).filter((key) => JSON.stringify(config[key]) !== JSON.stringify(before.config[key]));
  await recordAudit({
    actorUserId: actor.id,
    action: clientSecret ? "GCAL_CREDENTIALS_ROTATED" : "GCAL_CONFIG_CHANGED",
    ...AUDIT_ENTITY,
    sessionId: actor.sessionId ?? null,
    // Never the secret: only that it changed.
    metadata: { changed, clientIdChanged: (clientId || null) !== before.clientId, secretChanged: Boolean(clientSecret), version: before.version + 1 },
  });
  return ok({ secretChanged: Boolean(clientSecret) });
}

export interface Check {
  key: string;
  ok: boolean;
  message: string;
}

// "Test configuration" (brief 3.3). Nothing secret is shown in the results.
export async function testConfiguration(actor: Actor): Promise<Result<{ ok: boolean; checks: Check[] }>> {
  if (!isSuperAdmin(actor)) return fail("Only the Super Admin can test the set-up.");
  const checks: Check[] = [];
  const settings = await loadSettingsRow();
  try {
    await getDbPool().query("SELECT 1 FROM gcal_jobs LIMIT 1");
    checks.push({ key: "database", ok: true, message: "Database tables are in place (migration applied)." });
  } catch {
    checks.push({ key: "database", ok: false, message: "The calendar tables are missing: the v1.11.0 migration hasn't run." });
  }
  let secret: string | null = null;
  try {
    secret = settings.secretEnc ? decryptSecret(settings.secretEnc) : null;
    decryptSecret(encryptSecret("check"));
    checks.push({ key: "encryption", ok: true, message: "Encryption key works; tokens and the secret are stored encrypted." });
  } catch {
    checks.push({ key: "encryption", ok: false, message: "The saved secret can't be read with the current ENCRYPTION_KEY. Enter the client secret again." });
  }
  checks.push(settings.clientId && CLIENT_ID.test(settings.clientId) ? { key: "client_id", ok: true, message: "Client ID is set." } : { key: "client_id", ok: false, message: "Enter the OAuth client ID." });
  checks.push(secret ? { key: "client_secret", ok: true, message: "Client secret is saved (hidden)." } : { key: "client_secret", ok: false, message: "Enter the OAuth client secret." });
  const base = getEnv().APP_BASE_URL;
  const redirect = redirectUri(base);
  const httpsOk = Boolean(base && (base.startsWith("https://") || process.env.NODE_ENV !== "production"));
  checks.push(
    redirect && httpsOk
      ? { key: "redirect", ok: true, message: `Redirect URI: ${redirect}. It must be listed exactly so under the OAuth client's "Authorised redirect URIs".` }
      : { key: "redirect", ok: false, message: "APP_BASE_URL must be set to the site's https:// address on the server." },
  );
  if (settings.clientId && secret && redirect) {
    const probe = await probeClient({ clientId: settings.clientId, clientSecret: secret, redirectUri: redirect });
    checks.push(
      probe === "OK"
        ? { key: "google", ok: true, message: "Google accepted the client ID and secret." }
        : probe === "BAD_CLIENT"
          ? { key: "google", ok: false, message: "Google rejected the client ID or secret. Check both in Google Cloud Console → APIs & Services → Credentials." }
          : probe === "UNREACHABLE"
            ? { key: "google", ok: false, message: "Couldn't reach Google from the server. Try again; if it persists, check the host's outbound access." }
            : { key: "google", ok: false, message: "Google gave an unexpected answer. Check the OAuth client type is \"Web application\"." },
    );
  } else checks.push({ key: "google", ok: false, message: "Google check skipped until the client ID, secret and redirect URI are set." });
  const heartbeat = await getRunnerHeartbeat().catch(() => null);
  checks.push(
    heartbeat && heartbeat.minutesAgo <= 15
      ? { key: "jobs", ok: true, message: `Background jobs are running (last run ${heartbeat.minutesAgo} min ago).` }
      : { key: "jobs", ok: false, message: "The 5-minute job runner hasn't run recently, so syncs wouldn't happen. Check the cron job (DEPLOYMENT.md)." },
  );
  const recent = await listJobs({ statuses: ["FAILED", "DEAD"], limit: 50 });
  const apiOff = recent.some((job) => job.errorCategory === "API_DISABLED");
  checks.push(
    apiOff
      ? { key: "calendar_api", ok: false, message: "Google says the Calendar API isn't enabled: APIs & Services → Library → Google Calendar API → Enable." }
      : { key: "calendar_api", ok: true, message: "Calendar API: no problem reported (it is confirmed when the first person syncs)." },
  );
  const passed = checks.every((check) => check.ok);
  await saveTestResult(passed, checks);
  await recordAudit({ actorUserId: actor.id, action: "GCAL_CONFIG_TESTED", ...AUDIT_ENTITY, sessionId: actor.sessionId ?? null, result: passed ? "SUCCESS" : "FAILURE", metadata: { failed: checks.filter((check) => !check.ok).map((check) => check.key) } });
  return ok({ ok: passed, checks });
}

export async function setIntegrationEnabled(actor: Actor, on: boolean): Promise<Result<{ checks?: Check[] }>> {
  if (!isSuperAdmin(actor)) return fail("Only the Super Admin can switch the integration.");
  if (on) {
    const test = await testConfiguration(actor);
    if (!test.ok) return test;
    if (!test.value.ok) return fail(`Not enabled. Fix first: ${test.value.checks.filter((check) => !check.ok).map((check) => check.message).join(" ")}`);
  }
  await setSwitch("enabled", on, actor.id);
  await recordAudit({ actorUserId: actor.id, action: on ? "GCAL_ENABLED" : "GCAL_DISABLED", ...AUDIT_ENTITY, sessionId: actor.sessionId ?? null });
  return ok({});
}

export async function setMaintenance(actor: Actor, on: boolean): Promise<Result> {
  if (!isSuperAdmin(actor)) return fail("Only the Super Admin can change this.");
  await setSwitch("maintenance", on, actor.id);
  await recordAudit({ actorUserId: actor.id, action: on ? "GCAL_MAINTENANCE_ON" : "GCAL_MAINTENANCE_OFF", ...AUDIT_ENTITY, sessionId: actor.sessionId ?? null });
  return ok(undefined);
}

export async function adminRetryJob(actor: Actor, jobId: number | "ALL"): Promise<Result<{ queued: number }>> {
  if (!isSuperAdmin(actor)) return fail("Only the Super Admin can retry syncs.");
  const ids = jobId === "ALL" ? (await listJobs({ statuses: ["FAILED", "DEAD"], limit: 500 })).map((job) => job.id) : [jobId];
  const connections = new Set<number>();
  let queued = 0;
  for (const id of ids) {
    const job = (await listJobs({ statuses: ["FAILED", "DEAD"], limit: 500 })).find((item) => item.id === id);
    if (!job || connections.has(job.connectionId)) continue; // one retry per connection is enough
    if ((await retryJob(id, actor.id)) !== null) {
      connections.add(job.connectionId);
      queued += 1;
    }
  }
  await recordAudit({ actorUserId: actor.id, action: "GCAL_SYNC_RETRIED", ...AUDIT_ENTITY, sessionId: actor.sessionId ?? null, metadata: { jobs: jobId === "ALL" ? "all" : jobId, queued } });
  return ok({ queued });
}

export async function adminFullResync(actor: Actor, connectionId: number): Promise<Result> {
  if (!isSuperAdmin(actor)) return fail("Only the Super Admin can do this.");
  const connection = await connectionById(connectionId);
  if (!connection) return fail("Not found.");
  await enqueueJob({ connectionId, kind: "FULL_RESYNC", reason: "ADMIN", createdBy: actor.id });
  await recordAudit({ actorUserId: actor.id, action: "GCAL_FULL_RESYNC", ...AUDIT_ENTITY, sessionId: actor.sessionId ?? null, metadata: { connectionId, userId: connection.userId } });
  return ok(undefined);
}

// ---- connections -----------------------------------------------------------
// Disconnect (the person) or revoke (the Super Admin): stop the channel,
// optionally remove the events ARS wrote, revoke the token at Google, and
// forget the tokens. ARS records are never touched.
export async function disconnect(actor: Actor, connectionId: number, options: { removeEvents: boolean; revokedByAdmin: boolean }): Promise<Result<{ removed: number }>> {
  const connection = await connectionById(connectionId);
  if (!connection) return fail("Not found.");
  if (options.revokedByAdmin ? !isSuperAdmin(actor) : connection.userId !== actor.id) return fail("Not found.");
  const { credentials } = await loadIntegration();
  let removed = 0;
  if (options.removeEvents && credentials && connection.status === "ACTIVE") {
    try {
      const token = await accessTokenFor(connection, credentials);
      for (const link of await listLinks(connection.id)) {
        if (link.origin !== "ARS" || !link.etag || link.state !== "ACTIVE") continue;
        await deleteEvent(token, link.calendarId, link.googleEventId);
        removed += 1;
      }
    } catch (error) {
      if (!(error instanceof GoogleApiError)) logError("calendar disconnect: removing events failed", error);
    }
  }
  await stopConnectionChannel(connection, credentials);
  if (connection.refreshTokenEnc) {
    try {
      await revokeToken(decryptSecret(connection.refreshTokenEnc));
    } catch {
      // Best effort: the tokens are deleted here either way.
    }
  }
  await resetConnectionState(connection.id);
  await updateConnection(connection.id, { status: options.revokedByAdmin ? "REVOKED" : "DISCONNECTED", refreshTokenEnc: null, accessTokenEnc: null, accessExpiresAt: null, lastError: null });
  await softDeleteGoogleItems(connection.userId); // copies of Google events go with the connection
  await recordAudit({
    actorUserId: actor.id,
    action: options.revokedByAdmin ? "GCAL_CONNECTION_REVOKED" : "GCAL_DISCONNECTED",
    entityType: "USER",
    entityId: connection.userId,
    sessionId: actor.sessionId ?? null,
    metadata: { connectionId: connection.id, removedEvents: removed },
  });
  return ok({ removed });
}

// ---- OAuth (the person) -------------------------------------------------------
export const NONCE_COOKIE = "ars_gcal_nonce";
const STATE_TTL = 600;
const sha = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

export async function availability(): Promise<{ active: boolean; allowConnections: boolean; config: CalendarConfig }> {
  const { settings, active } = await loadIntegration();
  return { active, allowConnections: active && settings.config.allowConnections, config: settings.config };
}

export async function startConnect(user: { id: number; email: string }): Promise<Result<{ url: string; nonce: string }>> {
  const { settings, credentials, active } = await loadIntegration();
  if (!active || !credentials) return fail("Google Calendar isn't available right now.");
  if (!settings.config.allowConnections) return fail("Connecting calendars is switched off by the Super Admin.");
  const redirect = redirectUri(getEnv().APP_BASE_URL);
  if (!redirect) return fail("Google Calendar isn't available right now.");
  const state = crypto.randomBytes(32).toString("base64url");
  const nonce = crypto.randomBytes(32).toString("base64url");
  await insertOAuthState({ stateHash: sha(state), userId: user.id, nonceHash: sha(nonce), ttlSeconds: STATE_TTL });
  return ok({ url: authUrl({ clientId: credentials.clientId, redirectUri: redirect, state, loginHint: user.email }), nonce });
}

export type CallbackError = "DENIED" | "STATE" | "UNAVAILABLE" | "SCOPE" | "NO_REFRESH" | "GOOGLE";

// The callback: the state must be this person's, unused, unexpired, and
// match the nonce cookie set in this browser when they started.
export async function finishConnect(user: { id: number; sessionId?: string | null }, params: { code: string | null; state: string | null; error: string | null }, nonce: string | null): Promise<{ ok: true } | { ok: false; error: CallbackError }> {
  const failed = async (error: CallbackError, detail: Record<string, unknown> = {}) => {
    await recordAudit({ actorUserId: user.id, action: "GCAL_CONNECT_FAILED", entityType: "USER", entityId: user.id, result: "FAILURE", sessionId: user.sessionId ?? null, metadata: { reason: error, ...detail } });
    return { ok: false as const, error };
  };
  if (!params.state || !nonce) return failed("STATE");
  const saved = await consumeOAuthState(sha(params.state), user.id);
  if (!saved || !crypto.timingSafeEqual(Buffer.from(saved.nonceHash), Buffer.from(sha(nonce)))) return failed("STATE");
  if (params.error) return failed("DENIED");
  if (!params.code) return failed("STATE");
  const { credentials, active, settings } = await loadIntegration();
  const redirect = redirectUri(getEnv().APP_BASE_URL);
  if (!active || !credentials || !redirect || !settings.config.allowConnections) return failed("UNAVAILABLE");
  const person = await findUserById(user.id);
  if (!person?.active) return failed("UNAVAILABLE");
  try {
    const tokens = await exchangeCode({ ...credentials, code: params.code, redirectUri: redirect });
    // Scope names only are recorded (never tokens), to tell an unticked
    // calendar box from a missing refresh token.
    const granted = { granted: scopeNames(tokens.scope ?? ""), refreshToken: Boolean(tokens.refresh_token) };
    if (!hasRequiredScope(tokens.scope ?? "")) {
      if (tokens.refresh_token) await revokeToken(tokens.refresh_token);
      return failed("SCOPE", granted);
    }
    if (!tokens.refresh_token) return failed("NO_REFRESH", granted);
    const saved = await saveConnection({
      userId: user.id,
      googleEmail: emailFromIdToken(tokens.id_token),
      scopes: tokens.scope ?? "",
      refreshTokenEnc: encryptSecret(tokens.refresh_token),
      accessTokenEnc: encryptSecret(tokens.access_token),
      accessExpiresAt: new Date(Date.now() + Math.max(60, tokens.expires_in - 30) * 1000),
    });
    // The default calendar (brief 3.1): the primary one, unless the person
    // chooses. Same account again keeps their earlier choice.
    const connection = (await connectionById(saved.id))!;
    if (!connection.calendarId) await updateConnection(connection.id, { calendarId: "primary", calendarName: "Primary calendar" });
    await enqueueJob({ connectionId: connection.id, kind: "FULL_RESYNC", reason: "CONNECTED" });
    await enqueueJob({ connectionId: connection.id, kind: "RENEW_CHANNEL", reason: "CONNECTED" });
    await recordAudit({ actorUserId: user.id, action: "GCAL_CONNECTED", entityType: "USER", entityId: user.id, sessionId: user.sessionId ?? null, metadata: { connectionId: connection.id, sameAccount: saved.sameAccount } });
    return { ok: true };
  } catch (error) {
    if (!(error instanceof GoogleApiError)) logError("calendar connect failed", error);
    return failed("GOOGLE");
  }
}

export async function myCalendars(userId: number): Promise<Result<CalendarListEntry[]>> {
  const connection = await connectionByUser(userId);
  const { credentials, active } = await loadIntegration();
  if (!connection || connection.status !== "ACTIVE" || !credentials || !active) return fail("Not connected.");
  try {
    return ok(await listCalendars(await accessTokenFor(connection, credentials)));
  } catch (error) {
    return fail(error instanceof GoogleApiError ? "Google didn't list your calendars. Try again in a moment." : "Your connection needs reauthorising.");
  }
}

export async function chooseCalendar(actor: Actor, calendarId: string): Promise<Result> {
  const connection = await connectionByUser(actor.id);
  const { settings } = await loadIntegration();
  if (!connection || connection.status !== "ACTIVE") return fail("Not connected.");
  if (!settings.config.allowCalendarChoice) return fail("The Super Admin has set which calendar is used.");
  const calendars = await myCalendars(actor.id);
  if (!calendars.ok) return calendars;
  const chosen = calendars.value.find((calendar) => calendar.id === calendarId);
  if (!chosen) return fail("Choose one of the calendars you own.");
  if (chosen.id === connection.calendarId || (chosen.primary && connection.calendarId === "primary")) return ok(undefined);
  await stopConnectionChannel(connection, (await loadIntegration()).credentials);
  await resetConnectionState(connection.id); // links pointed at the old calendar
  await softDeleteGoogleItems(actor.id);
  await updateConnection(connection.id, { calendarId: chosen.id, calendarName: chosen.summary.slice(0, 255) });
  await enqueueJob({ connectionId: connection.id, kind: "FULL_RESYNC", reason: "CALENDAR_CHOSEN" });
  await enqueueJob({ connectionId: connection.id, kind: "RENEW_CHANNEL", reason: "CALENDAR_CHOSEN" });
  await recordAudit({ actorUserId: actor.id, action: "GCAL_CALENDAR_CHOSEN", entityType: "USER", entityId: actor.id, sessionId: actor.sessionId ?? null });
  return ok(undefined);
}

// "Sync now": queued, then run straight after the answer is sent (never
// inside the request itself, brief §14).
export async function syncNow(actor: Actor, reason = "USER"): Promise<Result> {
  const connection = await connectionByUser(actor.id);
  if (!connection || connection.status !== "ACTIVE") return fail("Not connected.");
  await enqueueJob({ connectionId: connection.id, kind: "SYNC", reason });
  try {
    after(() => processDueJobs({ budgetMs: 20_000, maxJobs: 3, connectionId: connection.id }).then(() => undefined).catch((error) => logError("calendar sync after request failed", error)));
  } catch {
    // Outside a request (tests, scripts): the job runner picks it up.
  }
  return ok(undefined);
}

// ---- conflicts --------------------------------------------------------------
export async function resolveConflict(actor: Actor, conflictId: number, resolution: "KEEP_ARS" | "KEEP_GOOGLE" | "DISMISSED"): Promise<Result> {
  const conflict = await conflictById(conflictId);
  if (!conflict || (conflict.userId !== actor.id && !isSuperAdmin(actor))) return fail("Not found.");
  if (conflict.status !== "OPEN") return fail("This conflict is already resolved.");
  const [rows] = await getDbPool().query<import("mysql2/promise").RowDataPacket[]>("SELECT l.*, f.google_json, f.conflict_type FROM gcal_conflicts f JOIN gcal_links l ON l.id = f.link_id WHERE f.id = ?", [conflictId]);
  const row = rows[0];
  if (!row) return fail("Not found.");
  const item = await itemById(Number(row.entity_id));
  const { settings } = await loadIntegration();
  const google = typeof row.google_json === "string" ? JSON.parse(row.google_json) : row.google_json;
  const deletedInGoogle = row.conflict_type === "DELETED_IN_GOOGLE_CHANGED_IN_ARS";
  if (resolution === "KEEP_ARS") {
    if (deletedInGoogle) {
      const generation = Number(row.generation) + 1;
      await updateLink(Number(row.id), { generation, googleEventId: eventIdFor(Number(row.connection_id), "ITEM", Number(row.entity_id), generation), etag: null, contentHash: null, state: "ACTIVE" });
    } else await updateLink(Number(row.id), { contentHash: null }); // the next push writes the ARS version
  } else if (resolution === "KEEP_GOOGLE" && item) {
    if (deletedInGoogle) {
      await softDeleteItem(item.id, item.userId);
      await updateLink(Number(row.id), { state: "CANCELLED", etag: null });
    } else {
      // Google's title and times (notes are kept: only title and times are stored for review).
      const fields: ItemFields = google.allDay
        ? { ...item, title: google.title, allDay: true, startDate: google.start, endDate: google.end, startsAt: null, endsAt: null }
        : { ...item, title: google.title, allDay: false, startsAt: google.start ? new Date(google.start) : null, endsAt: google.end ? new Date(google.end) : null, startDate: null, endDate: null };
      const version = await updateItem(item.id, item.userId, fields);
      const updated = await itemById(item.id);
      await updateLink(Number(row.id), { arsVersion: version, contentHash: updated ? (itemEvent(updated, settings.config.timezone)?.hash ?? null) : null });
    }
  } else if (item) {
    // Dismiss: leave both sides as they are.
    await updateLink(Number(row.id), { arsVersion: item.version, contentHash: itemEvent(item, settings.config.timezone)?.hash ?? null });
  }
  await closeConflict(conflictId, resolution, actor.id);
  await recordAudit({ actorUserId: actor.id, action: "GCAL_CONFLICT_RESOLVED", entityType: "USER", entityId: conflict.userId, sessionId: actor.sessionId ?? null, metadata: { conflictId, resolution } });
  const connection = await connectionByUser(conflict.userId);
  if (connection?.status === "ACTIVE") await enqueueJob({ connectionId: connection.id, kind: "SYNC", reason: "CONFLICT_RESOLVED" });
  return ok(undefined);
}

// ---- personal calendar entries ------------------------------------------------
export const itemInputSchema = z
  .object({
    title: z.string().trim().min(1, "Give it a title.").max(200),
    notes: z.string().trim().max(2000).optional().default(""),
    allDay: z.boolean(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date."),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
    start: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
    end: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
  })
  .superRefine((value, ctx) => {
    if (!value.allDay && !value.start) ctx.addIssue({ code: "custom", path: ["start"], message: "Choose a start time, or tick All day." });
    if (value.allDay && value.endDate && value.endDate < value.date) ctx.addIssue({ code: "custom", path: ["endDate"], message: "The end date is before the start." });
    if (!value.allDay && value.start && value.end && value.end <= value.start) ctx.addIssue({ code: "custom", path: ["end"], message: "The end is before the start." });
  });

// Times are entered in India time and stored as UTC instants.
const indiaInstant = (date: string, time: string) => new Date(new Date(`${date}T${time}:00Z`).getTime() - 330 * 60_000);

export function fieldsFromInput(input: z.infer<typeof itemInputSchema>): ItemFields {
  if (input.allDay) return { title: input.title, notes: input.notes || null, allDay: true, startsAt: null, endsAt: null, startDate: input.date, endDate: input.endDate || input.date, recurring: false };
  const startsAt = indiaInstant(input.date, input.start!);
  const endsAt = input.end ? indiaInstant(input.date, input.end) : new Date(startsAt.getTime() + 30 * 60_000);
  return { title: input.title, notes: input.notes || null, allDay: false, startsAt, endsAt, startDate: null, endDate: null, recurring: false };
}

async function queueIfConnected(userId: number): Promise<void> {
  const connection = await connectionByUser(userId);
  if (connection?.status === "ACTIVE") await syncNow({ id: userId, roles: [] }, "CHANGE");
}

export async function createPersonalItem(actor: Actor, input: unknown): Promise<Result<{ id: number }> & { fieldErrors?: Record<string, string> }> {
  const parsed = itemInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the highlighted fields.", fieldErrors: Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0] ?? "title"), issue.message])) };
  const id = await insertItem(actor.id, fieldsFromInput(parsed.data), "ARS");
  await queueIfConnected(actor.id);
  return ok({ id });
}

export async function editPersonalItem(actor: Actor, itemId: number, input: unknown): Promise<Result & { fieldErrors?: Record<string, string> }> {
  const item = await itemById(itemId);
  if (!item || item.userId !== actor.id || item.deletedAt) return fail("Not found.");
  const parsed = itemInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the highlighted fields.", fieldErrors: Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0] ?? "title"), issue.message])) };
  await updateItem(itemId, actor.id, { ...fieldsFromInput(parsed.data), recurring: item.recurring });
  await queueIfConnected(actor.id);
  return ok(undefined);
}

export async function deletePersonalItem(actor: Actor, itemId: number): Promise<Result> {
  const item = await itemById(itemId);
  if (!item || item.userId !== actor.id || !(await softDeleteItem(itemId, actor.id))) return fail("Not found.");
  await queueIfConnected(actor.id);
  return ok(undefined);
}

export async function personalItem(actor: Actor, itemId: number): Promise<ItemRow | null> {
  const item = await itemById(itemId);
  return item && item.userId === actor.id && !item.deletedAt ? item : null;
}

// Webhook (brief §5): the channel id, resource id and token must all match a
// live connection; then a sync is queued (duplicates collapse into one).
export async function handleNotification(headers: { channelId: string | null; resourceId: string | null; token: string | null; state: string | null }): Promise<"QUEUED" | "IGNORED" | "UNKNOWN"> {
  if (!headers.channelId || !headers.resourceId || !headers.token) return "UNKNOWN";
  const connection = await connectionByChannel(headers.channelId);
  if (!connection || connection.channelResourceId !== headers.resourceId || !connection.channelTokenHash) return "UNKNOWN";
  if (!crypto.timingSafeEqual(Buffer.from(connection.channelTokenHash), Buffer.from(sha(headers.token)))) return "UNKNOWN";
  if (connection.status !== "ACTIVE" || headers.state === "sync") return "IGNORED"; // "sync" = the channel was just made
  await enqueueJob({ connectionId: connection.id, kind: "SYNC", reason: "PUSH_NOTIFICATION" });
  return "QUEUED";
}

