import "server-only";
import { calendarKindAllowed } from "@/server/modules/modules";
import crypto from "node:crypto";
import { decryptSecret, encryptSecret } from "@/lib/security/encryption";
import { getEnv } from "@/config/environment";
import { findUserById } from "@/lib/db/repositories/users.repository";
import {
  claimConnection,
  connectionById,
  insertConflict,
  insertItem,
  insertLink,
  itemById,
  linkByEvent,
  listItemsForUser,
  listLinks,
  loadSettingsRow,
  openConflictLinkIds,
  releaseConnection,
  softDeleteItem,
  updateConnection,
  updateItem,
  updateLink,
  type ConnectionRow,
  type LinkRow,
  type SettingsRow,
} from "@/lib/db/repositories/gcal.repository";
import { integrationStatus, WEBHOOK_PATH, type CalendarConfig } from "@/server/calendar/config";
import { businessEvent, decideConflict, eventIdFor, isArsEvent, itemEvent, itemFromGoogle, sameItem, summaryOf, addDays, type DesiredEvent } from "@/server/calendar/events";
import { businessSources, indiaDate } from "@/server/calendar/sources";
import {
  deleteEvent,
  GoogleApiError,
  insertEvent,
  listEvents,
  patchEvent,
  refreshAccessToken,
  stopChannel,
  watchEvents,
  type GoogleEvent,
} from "@/server/integrations/google-calendar/client";

// v1.11.0 (D-153, D-154): two-way sync of one connection.
//   1. Pull: Google's changes since the last sync token (410 → a controlled
//      full listing). Our own writes come back with the etag we stored and
//      are skipped, so nothing loops.
//   2. Push: what ARS wants in the calendar (business dates + personal
//      entries) against what was last written: create, update or remove.
// Event ids are fixed per record, so a repeated run never duplicates.
// Business records are never changed by a sync (brief §5 critical rule).

export class SyncStop extends Error {
  constructor(
    readonly category: string,
    message: string,
  ) {
    super(message);
    this.name = "SyncStop";
  }
}

export interface SyncResult {
  pulled: number;
  imported: number;
  updatedFromGoogle: number;
  deletedFromGoogle: number;
  restored: number;
  conflicts: number;
  created: number;
  updated: number;
  removed: number;
  itemErrors: number;
  fullResync: number;
  skipped: number;
  more: number;
}

const emptyResult = (): SyncResult => ({ pulled: 0, imported: 0, updatedFromGoogle: 0, deletedFromGoogle: 0, restored: 0, conflicts: 0, created: 0, updated: 0, removed: 0, itemErrors: 0, fullResync: 0, skipped: 0, more: 0 });

const MAX_PAGES = 40;
const MAX_WRITES = 300;
const LOCK_SECONDS = 300;

export interface Credentials {
  clientId: string;
  clientSecret: string;
}

export async function loadIntegration(): Promise<{ settings: SettingsRow; credentials: Credentials | null; active: boolean }> {
  const settings = await loadSettingsRow();
  let clientSecret: string | null = null;
  try {
    clientSecret = settings.secretEnc ? decryptSecret(settings.secretEnc) : null;
  } catch {
    clientSecret = null; // ENCRYPTION_KEY changed: the secret must be entered again
  }
  const status = integrationStatus({ enabled: settings.enabled, maintenance: settings.maintenance, clientId: settings.clientId, hasSecret: Boolean(clientSecret), lastTestOk: settings.lastTestOk });
  return { settings, credentials: settings.clientId && clientSecret ? { clientId: settings.clientId, clientSecret } : null, active: status === "ENABLED" };
}

// A valid access token for the connection, refreshed when it is about to
// expire. A refusal from Google (consent withdrawn, refresh token expired in
// testing mode) marks the connection "needs reauthorisation" and stops: stale
// credentials are never retried.
export async function accessTokenFor(connection: ConnectionRow, credentials: Credentials): Promise<string> {
  if (connection.accessTokenEnc && connection.accessExpiresAt && connection.accessExpiresAt.getTime() > Date.now() + 60_000) {
    try {
      return decryptSecret(connection.accessTokenEnc);
    } catch {
      // fall through to a refresh
    }
  }
  if (!connection.refreshTokenEnc) throw await needsReauth(connection.id, "No refresh token: connect again.");
  let refreshToken: string;
  try {
    refreshToken = decryptSecret(connection.refreshTokenEnc);
  } catch {
    throw await needsReauth(connection.id, "The stored token can't be read: connect again.");
  }
  try {
    const tokens = await refreshAccessToken({ ...credentials, refreshToken });
    await updateConnection(connection.id, {
      accessTokenEnc: encryptSecret(tokens.access_token),
      accessExpiresAt: new Date(Date.now() + Math.max(60, tokens.expires_in - 30) * 1000),
      ...(tokens.refresh_token ? { refreshTokenEnc: encryptSecret(tokens.refresh_token) } : {}),
    });
    return tokens.access_token;
  } catch (error) {
    if (error instanceof GoogleApiError && (error.category === "AUTH" || error.category === "BAD_REQUEST")) throw await needsReauth(connection.id, "Google no longer accepts this connection: reauthorise it.");
    throw error;
  }
}

async function needsReauth(connectionId: number, message: string): Promise<SyncStop> {
  await updateConnection(connectionId, { status: "NEEDS_REAUTH", lastError: message, lastErrorAt: new Date(), accessTokenEnc: null, accessExpiresAt: null });
  return new SyncStop("AUTH", message);
}

// What ARS wants in this person's Google Calendar right now.
export async function desiredEvents(connection: ConnectionRow, config: CalendarConfig, baseUrl: string): Promise<DesiredEvent[]> {
  const user = await findUserById(connection.userId);
  if (!user || !user.active) return [];
  const today = indiaDate(new Date());
  // D-246 (audit FI-D03, AI-04b): only the kinds of entry this person's
  // modules allow, as on the in-app calendar (calendarKindAllowed).
  const allowed = (kind: Parameters<typeof calendarKindAllowed>[1]) => calendarKindAllowed({ roles: user.roles, modules: user.modules }, kind);
  const switches = {
    ...config.modules,
    approvalDue: config.modules.approvalDue && allowed("approval"),
    neededBy: config.modules.neededBy && allowed("needed"),
    taskDue: config.modules.taskDue && allowed("task"),
    infoEvents: config.modules.infoEvents && allowed("info"),
  };
  const sources = await businessSources({ id: user.id, roles: user.roles }, { from: addDays(today, -7), to: addDays(today, 365) }, switches);
  const out = sources.map((source) => businessEvent(source, config, baseUrl));
  if (config.modules.personal) {
    for (const item of await listItemsForUser(connection.userId)) {
      const desired = itemEvent(item, config.timezone);
      if (desired) out.push(desired);
    }
  }
  return out;
}

export async function syncConnection(connectionId: number, options: { full?: boolean; baseUrl?: string } = {}): Promise<SyncResult> {
  const result = emptyResult();
  const { settings, credentials, active } = await loadIntegration();
  const connection = await connectionById(connectionId);
  if (!active || !credentials || !connection || connection.status !== "ACTIVE" || !connection.calendarId) {
    result.skipped = 1;
    return result;
  }
  const owner = await findUserById(connection.userId);
  if (!owner?.active) {
    result.skipped = 1;
    return result;
  }
  if (!(await claimConnection(connection.id, LOCK_SECONDS))) throw new SyncStop("LOCKED", "Another sync of this connection is running.");
  try {
    const token = await accessTokenFor(connection, credentials);
    const config = settings.config;
    const baseUrl = options.baseUrl ?? getEnv().APP_BASE_URL ?? "";
    await pull(connection, token, config, result, Boolean(options.full));
    if (config.direction !== "GOOGLE_TO_ARS") await push(connection, token, config, baseUrl, result);
    await updateConnection(connection.id, { lastSyncAt: new Date(), lastError: null, lastErrorAt: null });
    return result;
  } catch (error) {
    if (!(error instanceof SyncStop && error.category === "AUTH")) {
      const message = error instanceof GoogleApiError ? `Google: ${error.category.toLowerCase().replace("_", " ")} (${error.reason})` : error instanceof SyncStop ? error.message : "Sync failed; it will be tried again.";
      await updateConnection(connection.id, { lastError: message.slice(0, 500), lastErrorAt: new Date() });
    }
    throw error;
  } finally {
    await releaseConnection(connection.id);
  }
}

// ---- Google → ARS ---------------------------------------------------------
async function pull(connection: ConnectionRow, token: string, config: CalendarConfig, result: SyncResult, forceFull: boolean): Promise<void> {
  const calendarId = connection.calendarId!;
  let syncToken = forceFull ? null : connection.syncToken;
  const timeMin = new Date(Date.now() - config.importWindowDays * 86_400_000).toISOString();
  let pageToken: string | null = null;
  let nextSyncToken: string | undefined;
  if (!syncToken) result.fullResync = 1;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    let body;
    try {
      body = await listEvents(token, calendarId, { syncToken, pageToken, timeMin: syncToken ? undefined : timeMin });
    } catch (error) {
      if (error instanceof GoogleApiError && error.category === "GONE" && syncToken) {
        // The sync token expired (410): start a controlled full listing.
        syncToken = null;
        pageToken = null;
        result.fullResync = 1;
        await updateConnection(connection.id, { syncToken: null });
        continue;
      }
      throw error;
    }
    for (const event of body.items ?? []) {
      result.pulled += 1;
      await applyGoogleEvent(connection, event, config, result);
    }
    if (body.nextPageToken) {
      pageToken = body.nextPageToken;
      continue;
    }
    nextSyncToken = body.nextSyncToken;
    break;
  }
  if (nextSyncToken) await updateConnection(connection.id, { syncToken: nextSyncToken });
  else result.more = 1; // too many pages for one run: the next run carries on
}

async function applyGoogleEvent(connection: ConnectionRow, event: GoogleEvent, config: CalendarConfig, result: SyncResult): Promise<void> {
  const link = await linkByEvent(connection.id, event.id);
  const cancelled = event.status === "cancelled";
  if (!link) {
    // New in Google. Events ARS wrote are never imported back (no loop, no
    // duplicate), nor are cancellations of events ARS never knew.
    if (cancelled || isArsEvent(event) || event.recurringEventId) return;
    if (config.direction === "ARS_TO_GOOGLE" || !config.modules.personal) return;
    const fields = itemFromGoogle(event);
    if (!fields) return;
    const itemId = await insertItem(connection.userId, fields, "GOOGLE");
    const item = (await itemById(itemId))!;
    await insertLink({ connectionId: connection.id, userId: connection.userId, entityType: "ITEM", entityId: itemId, calendarId: connection.calendarId!, googleEventId: event.id, generation: 0, origin: "GOOGLE", etag: event.etag ?? null, contentHash: itemEvent(item, config.timezone)?.hash ?? null, arsVersion: item.version });
    result.imported += 1;
    return;
  }
  if (link.state === "UNLINKED") return;
  if (!cancelled && event.etag && event.etag === link.etag) return; // our own write coming back

  if (link.entityType !== "ITEM") {
    // A business date: ARS is the source of truth. A Google edit is put back
    // on the next push; a Google deletion follows the deletion policy. The
    // approval, task or information record itself is never touched.
    if (cancelled) {
      if (config.googleDeletion === "RECREATE") await updateLink(link.id, { generation: link.generation + 1, googleEventId: eventIdFor(connection.id, link.entityType, link.entityId, link.generation + 1), etag: null, contentHash: null, lastPullAt: new Date() });
      else await updateLink(link.id, { state: "UNLINKED", lastPullAt: new Date() });
      result.deletedFromGoogle += 1;
    } else {
      await updateLink(link.id, { etag: event.etag ?? null, contentHash: null, lastPullAt: new Date() });
      result.restored += 1;
    }
    return;
  }

  // A personal entry: two-way.
  const item = await itemById(link.entityId);
  if (!item || item.deletedAt) {
    if (!cancelled) await updateLink(link.id, { etag: event.etag ?? null, lastPullAt: new Date() }); // removed in ARS: the push deletes it in Google
    else await updateLink(link.id, { state: "CANCELLED", etag: null, lastPullAt: new Date() });
    return;
  }
  const changedInArs = link.arsVersion !== null && item.version > link.arsVersion;
  const googleAt = event.updated ? new Date(event.updated) : null;

  if (cancelled) {
    const choice = changedInArs ? decideConflict(config.conflictPolicy, { arsAt: item.updatedAt, googleAt }) : "GOOGLE";
    if (choice === "GOOGLE") {
      await softDeleteItem(item.id, item.userId);
      await updateLink(link.id, { state: "CANCELLED", etag: null, lastPullAt: new Date() });
      result.deletedFromGoogle += 1;
    } else if (choice === "ARS") {
      await recreate(link, connection);
      result.restored += 1;
    } else {
      await insertConflict({ linkId: link.id, userId: item.userId, type: "DELETED_IN_GOOGLE_CHANGED_IN_ARS", ars: summaryOf(item), google: { deleted: true } });
      await updateLink(link.id, { etag: null, lastPullAt: new Date() });
      result.conflicts += 1;
    }
    return;
  }

  const fields = itemFromGoogle(event);
  if (!fields) return;
  if (sameItem(fields, item)) {
    await updateLink(link.id, { etag: event.etag ?? null, lastPullAt: new Date() });
    return;
  }
  const choice = changedInArs ? decideConflict(config.conflictPolicy, { arsAt: item.updatedAt, googleAt }) : "GOOGLE";
  if (choice === "GOOGLE") {
    const version = await updateItem(item.id, item.userId, { ...fields, recurring: fields.recurring || item.recurring });
    const updated = await itemById(item.id);
    await updateLink(link.id, { etag: event.etag ?? null, arsVersion: version, contentHash: updated ? (itemEvent(updated, config.timezone)?.hash ?? null) : null, lastPullAt: new Date() });
    result.updatedFromGoogle += 1;
  } else if (choice === "ARS") {
    await updateLink(link.id, { etag: event.etag ?? null, contentHash: null, lastPullAt: new Date() });
    result.restored += 1;
  } else {
    await insertConflict({ linkId: link.id, userId: item.userId, type: "BOTH_CHANGED", ars: summaryOf(item), google: summaryOf(fields) });
    await updateLink(link.id, { etag: event.etag ?? null, lastPullAt: new Date() });
    result.conflicts += 1;
  }
}

// Make the event again under a new id (a deleted event's id can't be reused).
async function recreate(link: LinkRow, connection: ConnectionRow): Promise<void> {
  const generation = link.generation + 1;
  await updateLink(link.id, { generation, googleEventId: eventIdFor(connection.id, link.entityType, link.entityId, generation), etag: null, contentHash: null, state: "ACTIVE" });
}

// ---- ARS → Google ---------------------------------------------------------
async function push(connection: ConnectionRow, token: string, config: CalendarConfig, baseUrl: string, result: SyncResult): Promise<void> {
  const calendarId = connection.calendarId!;
  const desired = await desiredEvents(connection, config, baseUrl);
  const links = await listLinks(connection.id);
  const byKey = new Map(links.map((link) => [`${link.entityType}:${link.entityId}`, link]));
  const wanted = new Set(desired.map((event) => `${event.entityType}:${event.entityId}`));
  const paused = await openConflictLinkIds(connection.id);
  let writes = 0;

  for (const event of desired) {
    if (writes >= MAX_WRITES) {
      result.more = 1;
      break;
    }
    let link = byKey.get(`${event.entityType}:${event.entityId}`) ?? null;
    if (link && (paused.has(link.id) || link.state === "UNLINKED")) continue;
    if (link && link.state === "CANCELLED") {
      if (event.entityType === "ITEM") continue;
      await recreate(link, connection); // eligible again (e.g. a task reopened)
      link = { ...link, generation: link.generation + 1, googleEventId: eventIdFor(connection.id, link.entityType, link.entityId, link.generation + 1), etag: null, contentHash: null, state: "ACTIVE" };
    }
    if (link && link.etag && link.contentHash === event.hash) continue; // nothing new
    if (!link) {
      const googleEventId = eventIdFor(connection.id, event.entityType, event.entityId, 0);
      const id = await insertLink({ connectionId: connection.id, userId: connection.userId, entityType: event.entityType, entityId: event.entityId, calendarId, googleEventId, generation: 0, origin: "ARS", arsVersion: event.arsVersion });
      link = { id, connectionId: connection.id, userId: connection.userId, entityType: event.entityType, entityId: event.entityId, calendarId, googleEventId, generation: 0, etag: null, origin: "ARS", contentHash: null, arsVersion: event.arsVersion, state: "ACTIVE", lastError: null };
    }
    writes += 1;
    try {
      const written = await writeEvent(token, calendarId, link, event, connection);
      await updateLink(link.id, { googleEventId: written.googleEventId, generation: written.generation, etag: written.etag, contentHash: event.hash, arsVersion: event.arsVersion, lastPushAt: new Date(), lastError: null, state: "ACTIVE" });
      if (link.etag) result.updated += 1;
      else result.created += 1;
    } catch (error) {
      if (error instanceof GoogleApiError && !error.transient && error.category !== "AUTH") {
        await updateLink(link.id, { lastError: `${error.category}: ${error.reason}`.slice(0, 500) });
        result.itemErrors += 1;
        continue;
      }
      throw error;
    }
  }

  // Records that left the calendar (decided, completed, cancelled, removed).
  for (const link of links) {
    if (link.state !== "ACTIVE" || wanted.has(`${link.entityType}:${link.entityId}`) || paused.has(link.id)) continue;
    if (link.entityType === "ITEM" && !config.modules.personal) continue;
    if (writes >= MAX_WRITES) {
      result.more = 1;
      break;
    }
    writes += 1;
    const removeEvent = link.entityType === "ITEM" || config.arsDeletion === "DELETE_EVENT";
    try {
      if (removeEvent && link.etag) await deleteEvent(token, link.calendarId, link.googleEventId);
      await updateLink(link.id, { state: removeEvent ? "CANCELLED" : "UNLINKED", etag: removeEvent ? null : link.etag, lastPushAt: new Date(), lastError: null });
      result.removed += 1;
    } catch (error) {
      if (error instanceof GoogleApiError && !error.transient && error.category !== "AUTH") {
        await updateLink(link.id, { lastError: `${error.category}: ${error.reason}`.slice(0, 500) });
        result.itemErrors += 1;
        continue;
      }
      throw error;
    }
  }
}

async function writeEvent(token: string, calendarId: string, link: LinkRow, event: DesiredEvent, connection: ConnectionRow): Promise<{ etag: string | null; googleEventId: string; generation: number }> {
  // Personal entries brought in from Google keep their own Google fields:
  // only the title, notes and times are written back.
  const body = link.origin === "GOOGLE" ? { summary: event.body.summary, description: event.body.description, start: event.body.start, end: event.body.end } : event.body;
  if (link.etag) {
    try {
      const updated = await patchEvent(token, calendarId, link.googleEventId, body);
      return { etag: updated.etag ?? null, googleEventId: link.googleEventId, generation: link.generation };
    } catch (error) {
      if (!(error instanceof GoogleApiError && (error.category === "NOT_FOUND" || error.category === "GONE"))) throw error;
      // Gone from Google without us hearing: make it again under a new id.
      const generation = link.generation + 1;
      const id = eventIdFor(connection.id, link.entityType, link.entityId, generation);
      const created = await insertEvent(token, calendarId, { ...event.body, id });
      return { etag: created.etag ?? null, googleEventId: id, generation };
    }
  }
  try {
    const created = await insertEvent(token, calendarId, { ...event.body, id: link.googleEventId });
    return { etag: created.etag ?? null, googleEventId: link.googleEventId, generation: link.generation };
  } catch (error) {
    // A retried insert: the event already exists under our fixed id.
    if (!(error instanceof GoogleApiError && error.category === "CONFLICT")) throw error;
    const updated = await patchEvent(token, calendarId, link.googleEventId, { ...body, status: "confirmed" });
    return { etag: updated.etag ?? null, googleEventId: link.googleEventId, generation: link.generation };
  }
}

// ---- push notifications ---------------------------------------------------
export function hashChannelToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// A watch channel tells us when the calendar changes (a signal only; the
// sync still lists the changes). Needs a public HTTPS address; without one
// (local runs) the scheduled reconciliation does the work.
export async function renewChannel(connectionId: number): Promise<{ renewed: number; skipped: number }> {
  const { credentials, active } = await loadIntegration();
  const connection = await connectionById(connectionId);
  const baseUrl = getEnv().APP_BASE_URL;
  if (!active || !credentials || !connection || connection.status !== "ACTIVE" || !connection.calendarId || !baseUrl?.startsWith("https://")) return { renewed: 0, skipped: 1 };
  const token = await accessTokenFor(connection, credentials);
  const channelId = crypto.randomUUID();
  const channelToken = crypto.randomBytes(24).toString("hex");
  const channel = await watchEvents(token, connection.calendarId, { channelId, address: new URL(WEBHOOK_PATH, baseUrl).toString(), channelToken, ttlSeconds: 7 * 86_400 });
  const expires = channel.expiration ? new Date(Number(channel.expiration)) : new Date(Date.now() + 7 * 86_400_000);
  await updateConnection(connection.id, { channelId, channelResourceId: channel.resourceId, channelTokenHash: hashChannelToken(channelToken), channelExpiresAt: expires });
  if (connection.channelId && connection.channelResourceId) await stopChannel(token, connection.channelId, connection.channelResourceId);
  return { renewed: 1, skipped: 0 };
}

export async function stopConnectionChannel(connection: ConnectionRow, credentials: Credentials | null): Promise<void> {
  if (!connection.channelId || !connection.channelResourceId || !credentials) return;
  try {
    const token = await accessTokenFor(connection, credentials);
    await stopChannel(token, connection.channelId, connection.channelResourceId);
  } catch {
    // The channel expires by itself within a week.
  }
}
