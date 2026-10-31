import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import { parseConfig, type CalendarConfig } from "@/server/calendar/config";
import type { EntityType, ItemFields } from "@/server/calendar/events";

// v1.11.0 Google Calendar sync: settings, connections, links, personal
// calendar entries, jobs, conflicts and OAuth states. Encrypted columns are
// read here but decrypted only in server/calendar/*.

// ---- settings (one row) ---------------------------------------------------
export interface SettingsRow {
  enabled: boolean;
  maintenance: boolean;
  clientId: string | null;
  secretEnc: string | null;
  config: CalendarConfig;
  version: number;
  updatedBy: number | null;
  updatedByName: string | null;
  updatedAt: Date;
  lastTestAt: Date | null;
  lastTestOk: boolean | null;
  lastTest: { checks?: { key: string; ok: boolean; message: string }[] } | null;
}

export async function loadSettingsRow(db: Queryable = getDbPool()): Promise<SettingsRow> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT s.*, u.name AS updated_by_name FROM gcal_settings s LEFT JOIN users u ON u.id = s.updated_by WHERE s.id = 1`,
  );
  const row = rows[0];
  if (!row) throw new Error("gcal_settings row missing (migration not applied)");
  return {
    enabled: Boolean(row.enabled),
    maintenance: Boolean(row.maintenance),
    clientId: row.client_id ?? null,
    secretEnc: row.client_secret_enc ?? null,
    config: parseConfig(row.config_json),
    version: Number(row.version),
    updatedBy: row.updated_by === null ? null : Number(row.updated_by),
    updatedByName: row.updated_by_name ?? null,
    updatedAt: row.updated_at,
    lastTestAt: row.last_test_at ?? null,
    lastTestOk: row.last_test_ok === null ? null : Boolean(row.last_test_ok),
    lastTest: (typeof row.last_test_json === "string" ? JSON.parse(row.last_test_json) : row.last_test_json) ?? null,
  };
}

// A new client ID or secret makes the last test stale: test again.
export async function saveSettings(input: { clientId: string | null; secretEnc?: string; config: CalendarConfig; updatedBy: number }, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>(
    `UPDATE gcal_settings SET
       last_test_ok = IF(client_id <=> ? AND ? IS NULL, last_test_ok, NULL),
       client_id = ?, client_secret_enc = COALESCE(?, client_secret_enc), config_json = ?, version = version + 1, updated_by = ?
     WHERE id = 1`,
    [input.clientId, input.secretEnc ?? null, input.clientId, input.secretEnc ?? null, JSON.stringify(input.config), input.updatedBy],
  );
}

export async function setSwitch(column: "enabled" | "maintenance", on: boolean, by: number, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>(`UPDATE gcal_settings SET ${column === "enabled" ? "enabled" : "maintenance"} = ?, version = version + 1, updated_by = ? WHERE id = 1`, [on, by]);
}

export async function saveTestResult(ok: boolean, checks: { key: string; ok: boolean; message: string }[], db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>("UPDATE gcal_settings SET last_test_at = UTC_TIMESTAMP(), last_test_ok = ?, last_test_json = ? WHERE id = 1", [ok, JSON.stringify({ checks })]);
}

// ---- connections ----------------------------------------------------------
export interface ConnectionRow {
  id: number;
  userId: number;
  googleEmail: string | null;
  scopes: string;
  refreshTokenEnc: string | null;
  accessTokenEnc: string | null;
  accessExpiresAt: Date | null;
  calendarId: string | null;
  calendarName: string | null;
  syncToken: string | null;
  channelId: string | null;
  channelResourceId: string | null;
  channelTokenHash: string | null;
  channelExpiresAt: Date | null;
  status: "ACTIVE" | "NEEDS_REAUTH" | "DISCONNECTED" | "REVOKED";
  lastSyncAt: Date | null;
  lastError: string | null;
  lastErrorAt: Date | null;
  connectedAt: Date | null;
}

const toConnection = (row: RowDataPacket): ConnectionRow => ({
  id: Number(row.id),
  userId: Number(row.user_id),
  googleEmail: row.google_email ?? null,
  scopes: row.scopes ?? "",
  refreshTokenEnc: row.refresh_token_enc ?? null,
  accessTokenEnc: row.access_token_enc ?? null,
  accessExpiresAt: row.access_expires_at ?? null,
  calendarId: row.calendar_id ?? null,
  calendarName: row.calendar_name ?? null,
  syncToken: row.sync_token ?? null,
  channelId: row.channel_id ?? null,
  channelResourceId: row.channel_resource_id ?? null,
  channelTokenHash: row.channel_token_hash ?? null,
  channelExpiresAt: row.channel_expires_at ?? null,
  status: row.status,
  lastSyncAt: row.last_sync_at ?? null,
  lastError: row.last_error ?? null,
  lastErrorAt: row.last_error_at ?? null,
  connectedAt: row.connected_at ?? null,
});

export async function connectionByUser(userId: number, db: Queryable = getDbPool()): Promise<ConnectionRow | null> {
  const [rows] = await db.query<RowDataPacket[]>("SELECT * FROM gcal_connections WHERE user_id = ?", [userId]);
  return rows[0] ? toConnection(rows[0]) : null;
}

export async function connectionById(id: number, db: Queryable = getDbPool()): Promise<ConnectionRow | null> {
  const [rows] = await db.query<RowDataPacket[]>("SELECT * FROM gcal_connections WHERE id = ?", [id]);
  return rows[0] ? toConnection(rows[0]) : null;
}

export async function connectionByChannel(channelId: string, db: Queryable = getDbPool()): Promise<ConnectionRow | null> {
  const [rows] = await db.query<RowDataPacket[]>("SELECT * FROM gcal_connections WHERE channel_id = ?", [channelId]);
  return rows[0] ? toConnection(rows[0]) : null;
}

// After Google's consent screen. Same Google account again: the calendar
// and its sync state are kept. Another account: start over (the old links
// pointed at another calendar).
export async function saveConnection(
  input: { userId: number; googleEmail: string | null; scopes: string; refreshTokenEnc: string; accessTokenEnc: string; accessExpiresAt: Date },
  db: Queryable = getDbPool(),
): Promise<{ id: number; sameAccount: boolean }> {
  const before = await connectionByUser(input.userId, db);
  const sameAccount = Boolean(before && before.googleEmail && before.googleEmail === input.googleEmail);
  await db.query<ResultSetHeader>(
    `INSERT INTO gcal_connections (user_id, google_email, scopes, refresh_token_enc, access_token_enc, access_expires_at, status, connected_at)
     VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE google_email = VALUES(google_email), scopes = VALUES(scopes), refresh_token_enc = VALUES(refresh_token_enc),
       access_token_enc = VALUES(access_token_enc), access_expires_at = VALUES(access_expires_at), status = 'ACTIVE',
       connected_at = UTC_TIMESTAMP(), last_error = NULL, last_error_at = NULL`,
    [input.userId, input.googleEmail, input.scopes.slice(0, 1000), input.refreshTokenEnc, input.accessTokenEnc, input.accessExpiresAt],
  );
  const after = (await connectionByUser(input.userId, db))!;
  if (before && !sameAccount) await resetConnectionState(after.id, db);
  return { id: after.id, sameAccount };
}

export async function resetConnectionState(connectionId: number, db: Queryable = getDbPool()): Promise<void> {
  await db.query("DELETE FROM gcal_conflicts WHERE link_id IN (SELECT id FROM gcal_links WHERE connection_id = ?)", [connectionId]);
  await db.query("DELETE FROM gcal_links WHERE connection_id = ?", [connectionId]);
  await db.query("UPDATE gcal_connections SET calendar_id = NULL, calendar_name = NULL, sync_token = NULL, channel_id = NULL, channel_resource_id = NULL, channel_token_hash = NULL, channel_expires_at = NULL WHERE id = ?", [connectionId]);
}

const CONNECTION_COLUMNS = {
  accessTokenEnc: "access_token_enc",
  accessExpiresAt: "access_expires_at",
  refreshTokenEnc: "refresh_token_enc",
  calendarId: "calendar_id",
  calendarName: "calendar_name",
  syncToken: "sync_token",
  channelId: "channel_id",
  channelResourceId: "channel_resource_id",
  channelTokenHash: "channel_token_hash",
  channelExpiresAt: "channel_expires_at",
  status: "status",
  lastSyncAt: "last_sync_at",
  lastError: "last_error",
  lastErrorAt: "last_error_at",
} as const;

export async function updateConnection(id: number, patch: Partial<Record<keyof typeof CONNECTION_COLUMNS, unknown>>, db: Queryable = getDbPool()): Promise<void> {
  const keys = Object.keys(patch) as (keyof typeof CONNECTION_COLUMNS)[];
  if (!keys.length) return;
  await db.query<ResultSetHeader>(`UPDATE gcal_connections SET ${keys.map((key) => `${CONNECTION_COLUMNS[key]} = ?`).join(", ")} WHERE id = ?`, [...keys.map((key) => patch[key] ?? null), id]);
}

// One sync per connection at a time (brief §14). A lock left by a crashed
// run expires by itself.
export async function claimConnection(id: number, seconds: number, db: Queryable = getDbPool()): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>(
    "UPDATE gcal_connections SET lock_until = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND) WHERE id = ? AND (lock_until IS NULL OR lock_until < UTC_TIMESTAMP())",
    [seconds, id],
  );
  return result.affectedRows === 1;
}

export async function releaseConnection(id: number, db: Queryable = getDbPool()): Promise<void> {
  await db.query("UPDATE gcal_connections SET lock_until = NULL WHERE id = ?", [id]);
}

export interface ConnectionListItem extends Pick<ConnectionRow, "id" | "userId" | "googleEmail" | "calendarName" | "status" | "lastSyncAt" | "lastError" | "channelExpiresAt" | "connectedAt"> {
  userName: string;
  loginId: string;
  openConflicts: number;
  pendingJobs: number;
}

export async function listConnections(db: Queryable = getDbPool()): Promise<ConnectionListItem[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT c.*, u.name AS user_name, u.login_id,
       (SELECT COUNT(*) FROM gcal_conflicts f WHERE f.user_id = c.user_id AND f.status = 'OPEN') AS open_conflicts,
       (SELECT COUNT(*) FROM gcal_jobs j WHERE j.connection_id = c.id AND j.status = 'PENDING') AS pending_jobs
     FROM gcal_connections c JOIN users u ON u.id = c.user_id ORDER BY c.status, u.name LIMIT 1000`,
  );
  return rows.map((row) => ({ ...toConnection(row), userName: row.user_name, loginId: row.login_id, openConflicts: Number(row.open_conflicts), pendingJobs: Number(row.pending_jobs) }));
}

export async function activeConnectionIds(staleMinutes: number, db: Queryable = getDbPool()): Promise<number[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT c.id FROM gcal_connections c JOIN users u ON u.id = c.user_id
     WHERE c.status = 'ACTIVE' AND u.active = TRUE AND c.calendar_id IS NOT NULL
       AND (c.last_sync_at IS NULL OR c.last_sync_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? MINUTE)) LIMIT 500`,
    [staleMinutes],
  );
  return rows.map((row) => Number(row.id));
}

export async function channelsToRenew(db: Queryable = getDbPool()): Promise<number[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id FROM gcal_connections WHERE status = 'ACTIVE' AND calendar_id IS NOT NULL
       AND (channel_id IS NULL OR channel_expires_at IS NULL OR channel_expires_at < DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 DAY)) LIMIT 200`,
  );
  return rows.map((row) => Number(row.id));
}

// ---- links ----------------------------------------------------------------
export interface LinkRow {
  id: number;
  connectionId: number;
  userId: number;
  entityType: EntityType;
  entityId: number;
  calendarId: string;
  googleEventId: string;
  generation: number;
  etag: string | null;
  origin: "ARS" | "GOOGLE";
  contentHash: string | null;
  arsVersion: number | null;
  state: "ACTIVE" | "CANCELLED" | "UNLINKED";
  lastError: string | null;
}

const toLink = (row: RowDataPacket): LinkRow => ({
  id: Number(row.id),
  connectionId: Number(row.connection_id),
  userId: Number(row.user_id),
  entityType: row.entity_type,
  entityId: Number(row.entity_id),
  calendarId: row.calendar_id,
  googleEventId: row.google_event_id,
  generation: Number(row.generation),
  etag: row.etag ?? null,
  origin: row.origin,
  contentHash: row.content_hash ?? null,
  arsVersion: row.ars_version === null ? null : Number(row.ars_version),
  state: row.state,
  lastError: row.last_error ?? null,
});

export async function listLinks(connectionId: number, db: Queryable = getDbPool()): Promise<LinkRow[]> {
  const [rows] = await db.query<RowDataPacket[]>("SELECT * FROM gcal_links WHERE connection_id = ?", [connectionId]);
  return rows.map(toLink);
}

export async function linkByEvent(connectionId: number, googleEventId: string, db: Queryable = getDbPool()): Promise<LinkRow | null> {
  const [rows] = await db.query<RowDataPacket[]>("SELECT * FROM gcal_links WHERE connection_id = ? AND google_event_id = ?", [connectionId, googleEventId]);
  return rows[0] ? toLink(rows[0]) : null;
}

export async function insertLink(
  input: { connectionId: number; userId: number; entityType: EntityType; entityId: number; calendarId: string; googleEventId: string; generation: number; origin: "ARS" | "GOOGLE"; etag?: string | null; contentHash?: string | null; arsVersion?: number | null },
  db: Queryable = getDbPool(),
): Promise<number> {
  const [result] = await db.query<ResultSetHeader>(
    `INSERT INTO gcal_links (connection_id, user_id, entity_type, entity_id, calendar_id, google_event_id, generation, origin, etag, content_hash, ars_version, last_pull_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, IF(? = 'GOOGLE', UTC_TIMESTAMP(), NULL))`,
    [input.connectionId, input.userId, input.entityType, input.entityId, input.calendarId, input.googleEventId, input.generation, input.origin, input.etag ?? null, input.contentHash ?? null, input.arsVersion ?? null, input.origin],
  );
  return result.insertId;
}

const LINK_COLUMNS = {
  googleEventId: "google_event_id",
  generation: "generation",
  etag: "etag",
  contentHash: "content_hash",
  arsVersion: "ars_version",
  state: "state",
  lastError: "last_error",
  lastPushAt: "last_push_at",
  lastPullAt: "last_pull_at",
} as const;

export async function updateLink(id: number, patch: Partial<Record<keyof typeof LINK_COLUMNS, unknown>>, db: Queryable = getDbPool()): Promise<void> {
  const keys = Object.keys(patch) as (keyof typeof LINK_COLUMNS)[];
  if (!keys.length) return;
  await db.query<ResultSetHeader>(`UPDATE gcal_links SET ${keys.map((key) => `${LINK_COLUMNS[key]} = ?`).join(", ")} WHERE id = ?`, [...keys.map((key) => patch[key] ?? null), id]);
}

// For the calendar page: sync state of the person's linked records.
export async function linkStates(userId: number, db: Queryable = getDbPool()): Promise<Map<string, { state: LinkRow["state"]; synced: boolean; error: string | null; conflict: boolean }>> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT l.entity_type, l.entity_id, l.state, l.etag, l.last_error,
       EXISTS (SELECT 1 FROM gcal_conflicts f WHERE f.link_id = l.id AND f.status = 'OPEN') AS conflict
     FROM gcal_links l JOIN gcal_connections c ON c.id = l.connection_id AND c.status = 'ACTIVE' WHERE l.user_id = ?`,
    [userId],
  );
  return new Map(rows.map((row) => [`${row.entity_type}:${row.entity_id}`, { state: row.state, synced: Boolean(row.etag), error: row.last_error ?? null, conflict: Boolean(row.conflict) }]));
}

// ---- personal calendar entries ---------------------------------------------
export interface ItemRow extends ItemFields {
  id: number;
  userId: number;
  origin: "ARS" | "GOOGLE";
  version: number;
  updatedAt: Date;
  deletedAt: Date | null;
}

const ymd = (value: unknown): string | null => (value instanceof Date ? value.toISOString().slice(0, 10) : typeof value === "string" ? value.slice(0, 10) : null);

const toItem = (row: RowDataPacket): ItemRow => ({
  id: Number(row.id),
  userId: Number(row.user_id),
  title: row.title,
  notes: row.notes ?? null,
  allDay: Boolean(row.all_day),
  startsAt: row.starts_at ?? null,
  endsAt: row.ends_at ?? null,
  startDate: ymd(row.start_date),
  endDate: ymd(row.end_date),
  recurring: Boolean(row.recurring),
  origin: row.origin,
  version: Number(row.version),
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at ?? null,
});

export async function itemById(id: number, db: Queryable = getDbPool()): Promise<ItemRow | null> {
  const [rows] = await db.query<RowDataPacket[]>("SELECT * FROM calendar_items WHERE id = ?", [id]);
  return rows[0] ? toItem(rows[0]) : null;
}

export async function listItemsForUser(userId: number, db: Queryable = getDbPool()): Promise<ItemRow[]> {
  const [rows] = await db.query<RowDataPacket[]>("SELECT * FROM calendar_items WHERE user_id = ? AND deleted_at IS NULL ORDER BY id LIMIT 2000", [userId]);
  return rows.map(toItem);
}

// Entries overlapping [fromDate, toDate] (India dates, inclusive).
export async function itemsInRange(userId: number, fromDate: string, toDate: string, db: Queryable = getDbPool()): Promise<ItemRow[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT * FROM calendar_items WHERE user_id = ? AND deleted_at IS NULL AND (
       (all_day = TRUE AND start_date <= ? AND COALESCE(end_date, start_date) >= ?)
       OR (all_day = FALSE AND DATE(DATE_ADD(starts_at, INTERVAL 330 MINUTE)) <= ? AND DATE(DATE_ADD(COALESCE(ends_at, starts_at), INTERVAL 330 MINUTE)) >= ?))
     ORDER BY all_day DESC, start_date, starts_at LIMIT 500`,
    [userId, toDate, fromDate, toDate, fromDate],
  );
  return rows.map(toItem);
}

export async function insertItem(userId: number, fields: ItemFields, origin: "ARS" | "GOOGLE", db: Queryable = getDbPool()): Promise<number> {
  const [result] = await db.query<ResultSetHeader>(
    `INSERT INTO calendar_items (user_id, title, notes, all_day, starts_at, ends_at, start_date, end_date, recurring, origin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, fields.title, fields.notes, fields.allDay, fields.startsAt, fields.endsAt, fields.startDate, fields.endDate, fields.recurring, origin],
  );
  return result.insertId;
}

// Every change raises the version, so the sync can tell "changed in ARS
// since the last sync" from "unchanged".
export async function updateItem(id: number, userId: number, fields: ItemFields, db: Queryable = getDbPool()): Promise<number | null> {
  const [result] = await db.query<ResultSetHeader>(
    `UPDATE calendar_items SET title = ?, notes = ?, all_day = ?, starts_at = ?, ends_at = ?, start_date = ?, end_date = ?, recurring = ?, version = version + 1
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [fields.title, fields.notes, fields.allDay, fields.startsAt, fields.endsAt, fields.startDate, fields.endDate, fields.recurring, id, userId],
  );
  if (result.affectedRows !== 1) return null;
  return (await itemById(id, db))?.version ?? null;
}

export async function softDeleteItem(id: number, userId: number, db: Queryable = getDbPool()): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>("UPDATE calendar_items SET deleted_at = UTC_TIMESTAMP(), version = version + 1 WHERE id = ? AND user_id = ? AND deleted_at IS NULL", [id, userId]);
  return result.affectedRows === 1;
}

export async function softDeleteGoogleItems(userId: number, db: Queryable = getDbPool()): Promise<number> {
  const [result] = await db.query<ResultSetHeader>("UPDATE calendar_items SET deleted_at = UTC_TIMESTAMP(), version = version + 1 WHERE user_id = ? AND origin = 'GOOGLE' AND deleted_at IS NULL", [userId]);
  return result.affectedRows;
}

// ---- jobs -------------------------------------------------------------------
export type JobKind = "SYNC" | "FULL_RESYNC" | "RENEW_CHANNEL";

// Waiting jobs of the same kind for a connection collapse into one
// (duplicate push notifications make one sync). Returns the job id.
export async function enqueueJob(input: { connectionId: number; kind: JobKind; reason: string; delaySeconds?: number; createdBy?: number | null }, db: Queryable = getDbPool()): Promise<number> {
  const [result] = await db.query<ResultSetHeader>(
    `INSERT INTO gcal_jobs (connection_id, kind, reason, next_run_at, pending_key, created_by)
     VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND), ?, ?)
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), next_run_at = LEAST(next_run_at, VALUES(next_run_at))`,
    [input.connectionId, input.kind, input.reason.slice(0, 40), input.delaySeconds ?? 0, `${input.connectionId}:${input.kind}`, input.createdBy ?? null],
  );
  return result.insertId;
}

export interface JobRow {
  id: number;
  connectionId: number;
  kind: JobKind;
  reason: string;
  status: "PENDING" | "RUNNING" | "DONE" | "FAILED" | "DEAD";
  attempts: number;
  nextRunAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  errorCategory: string | null;
  errorDetail: string | null;
  result: Record<string, number> | null;
  createdAt: Date;
}

const toJob = (row: RowDataPacket): JobRow => ({
  id: Number(row.id),
  connectionId: Number(row.connection_id),
  kind: row.kind,
  reason: row.reason,
  status: row.status,
  attempts: Number(row.attempts),
  nextRunAt: row.next_run_at,
  startedAt: row.started_at ?? null,
  finishedAt: row.finished_at ?? null,
  errorCategory: row.error_category ?? null,
  errorDetail: row.error_detail ?? null,
  result: (typeof row.result_json === "string" ? JSON.parse(row.result_json) : row.result_json) ?? null,
  createdAt: row.created_at,
});

// Claims one job: only one runner gets it (PENDING → RUNNING), and from then
// on a new notification queues a fresh job instead of joining this one.
export async function claimJob(id: number, db: Queryable = getDbPool()): Promise<JobRow | null> {
  const [result] = await db.query<ResultSetHeader>("UPDATE gcal_jobs SET status = 'RUNNING', pending_key = NULL, started_at = UTC_TIMESTAMP(), attempts = attempts + 1 WHERE id = ? AND status = 'PENDING'", [id]);
  if (result.affectedRows !== 1) return null;
  const [rows] = await db.query<RowDataPacket[]>("SELECT * FROM gcal_jobs WHERE id = ?", [id]);
  return rows[0] ? toJob(rows[0]) : null;
}

export async function dueJobIds(limit: number, connectionId?: number, db: Queryable = getDbPool()): Promise<number[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id FROM gcal_jobs WHERE status = 'PENDING' AND next_run_at <= UTC_TIMESTAMP() ${connectionId ? "AND connection_id = ?" : ""} ORDER BY next_run_at, id LIMIT ?`,
    connectionId ? [connectionId, limit] : [limit],
  );
  return rows.map((row) => Number(row.id));
}

export async function finishJob(id: number, result: Record<string, number>, db: Queryable = getDbPool()): Promise<void> {
  await db.query("UPDATE gcal_jobs SET status = 'DONE', finished_at = UTC_TIMESTAMP(), result_json = ?, error_category = NULL, error_detail = NULL WHERE id = ?", [JSON.stringify(result), id]);
}

// A failure goes back to waiting with backoff, until the retry limit; then
// it stays as DEAD (the dead-letter state) until someone retries it.
export async function failJob(job: Pick<JobRow, "id" | "connectionId" | "kind" | "attempts">, input: { category: string; detail: string; retryable: boolean; retryMax: number; backoffSeconds: number }, db: Queryable = getDbPool()): Promise<"RETRY" | "DEAD" | "FAILED"> {
  const final = !input.retryable || job.attempts >= input.retryMax;
  if (final) {
    await db.query("UPDATE gcal_jobs SET status = ?, finished_at = UTC_TIMESTAMP(), error_category = ?, error_detail = ? WHERE id = ?", [input.retryable ? "DEAD" : "FAILED", input.category, input.detail.slice(0, 500), job.id]);
    return input.retryable ? "DEAD" : "FAILED";
  }
  try {
    await db.query(
      "UPDATE gcal_jobs SET status = 'PENDING', pending_key = ?, next_run_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND), error_category = ?, error_detail = ? WHERE id = ?",
      [`${job.connectionId}:${job.kind}`, input.backoffSeconds, input.category, input.detail.slice(0, 500), job.id],
    );
    return "RETRY";
  } catch {
    // A newer job of the same kind is already waiting: it does the retry.
    await db.query("UPDATE gcal_jobs SET status = 'FAILED', finished_at = UTC_TIMESTAMP(), error_category = ?, error_detail = ? WHERE id = ?", [input.category, input.detail.slice(0, 500), job.id]);
    return "FAILED";
  }
}

// A job left RUNNING by a process that stopped is put back (recovery after restart).
export async function recoverStuckJobs(db: Queryable = getDbPool()): Promise<number> {
  const [result] = await db.query<ResultSetHeader>(
    `UPDATE gcal_jobs j SET status = 'FAILED', finished_at = UTC_TIMESTAMP(), error_category = 'INTERRUPTED', error_detail = 'The run stopped before finishing; a new sync is queued.'
     WHERE status = 'RUNNING' AND started_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE)`,
  );
  return result.affectedRows;
}

export async function listJobs(filter: { statuses?: JobRow["status"][]; connectionId?: number; limit: number }, db: Queryable = getDbPool()): Promise<(JobRow & { userName: string })[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.statuses?.length) {
    where.push(`j.status IN (${filter.statuses.map(() => "?").join(", ")})`);
    params.push(...filter.statuses);
  }
  if (filter.connectionId) {
    where.push("j.connection_id = ?");
    params.push(filter.connectionId);
  }
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT j.*, u.name AS user_name FROM gcal_jobs j JOIN gcal_connections c ON c.id = j.connection_id JOIN users u ON u.id = c.user_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY j.id DESC LIMIT ?`,
    [...params, filter.limit],
  );
  return rows.map((row) => ({ ...toJob(row), userName: row.user_name }));
}

// Retry: a FAILED or DEAD job becomes a fresh waiting sync (attempts reset).
export async function retryJob(id: number, by: number, db: Queryable = getDbPool()): Promise<number | null> {
  const [rows] = await db.query<RowDataPacket[]>("SELECT connection_id, kind FROM gcal_jobs WHERE id = ? AND status IN ('FAILED', 'DEAD')", [id]);
  if (!rows[0]) return null;
  return enqueueJob({ connectionId: Number(rows[0].connection_id), kind: rows[0].kind, reason: "ADMIN_RETRY", createdBy: by }, db);
}

export async function pendingJobCount(connectionId: number, db: Queryable = getDbPool()): Promise<number> {
  const [rows] = await db.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM gcal_jobs WHERE connection_id = ? AND status IN ('PENDING', 'RUNNING')", [connectionId]);
  return Number(rows[0]?.n ?? 0);
}

// ---- conflicts ------------------------------------------------------------
export interface ConflictRow {
  id: number;
  linkId: number;
  userId: number;
  conflictType: "BOTH_CHANGED" | "DELETED_IN_GOOGLE_CHANGED_IN_ARS";
  ars: { title: string; allDay: boolean; start: string | null; end: string | null };
  google: { title: string; allDay: boolean; start: string | null; end: string | null } | { deleted: true };
  status: "OPEN" | "RESOLVED";
  resolution: "KEEP_ARS" | "KEEP_GOOGLE" | "DISMISSED" | null;
  resolvedByName: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  entityId: number;
}

const json = (value: unknown) => (typeof value === "string" ? JSON.parse(value) : value);

export async function insertConflict(input: { linkId: number; userId: number; type: ConflictRow["conflictType"]; ars: unknown; google: unknown }, db: Queryable = getDbPool()): Promise<number> {
  const [existing] = await db.query<RowDataPacket[]>("SELECT id FROM gcal_conflicts WHERE link_id = ? AND status = 'OPEN'", [input.linkId]);
  if (existing[0]) {
    await db.query("UPDATE gcal_conflicts SET ars_json = ?, google_json = ?, conflict_type = ? WHERE id = ?", [JSON.stringify(input.ars), JSON.stringify(input.google), input.type, existing[0].id]);
    return Number(existing[0].id);
  }
  const [result] = await db.query<ResultSetHeader>("INSERT INTO gcal_conflicts (link_id, user_id, conflict_type, ars_json, google_json) VALUES (?, ?, ?, ?, ?)", [
    input.linkId,
    input.userId,
    input.type,
    JSON.stringify(input.ars),
    JSON.stringify(input.google),
  ]);
  return result.insertId;
}

export async function openConflictLinkIds(connectionId: number, db: Queryable = getDbPool()): Promise<Set<number>> {
  const [rows] = await db.query<RowDataPacket[]>("SELECT f.link_id FROM gcal_conflicts f JOIN gcal_links l ON l.id = f.link_id WHERE l.connection_id = ? AND f.status = 'OPEN'", [connectionId]);
  return new Set(rows.map((row) => Number(row.link_id)));
}

export async function listConflicts(filter: { userId?: number; status?: "OPEN" | "RESOLVED"; limit: number }, db: Queryable = getDbPool()): Promise<(ConflictRow & { userName: string })[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.userId) {
    where.push("f.user_id = ?");
    params.push(filter.userId);
  }
  if (filter.status) {
    where.push("f.status = ?");
    params.push(filter.status);
  }
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT f.*, l.entity_id, u.name AS user_name, r.name AS resolved_by_name FROM gcal_conflicts f
       JOIN gcal_links l ON l.id = f.link_id JOIN users u ON u.id = f.user_id LEFT JOIN users r ON r.id = f.resolved_by
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY f.status = 'OPEN' DESC, f.id DESC LIMIT ?`,
    [...params, filter.limit],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    linkId: Number(row.link_id),
    userId: Number(row.user_id),
    conflictType: row.conflict_type,
    ars: json(row.ars_json),
    google: json(row.google_json),
    status: row.status,
    resolution: row.resolution ?? null,
    resolvedByName: row.resolved_by_name ?? null,
    resolvedAt: row.resolved_at ?? null,
    createdAt: row.created_at,
    entityId: Number(row.entity_id),
    userName: row.user_name,
  }));
}

export async function conflictById(id: number, db: Queryable = getDbPool()): Promise<{ id: number; linkId: number; userId: number; status: string } | null> {
  const [rows] = await db.query<RowDataPacket[]>("SELECT id, link_id, user_id, status FROM gcal_conflicts WHERE id = ?", [id]);
  return rows[0] ? { id: Number(rows[0].id), linkId: Number(rows[0].link_id), userId: Number(rows[0].user_id), status: rows[0].status } : null;
}

export async function closeConflict(id: number, resolution: "KEEP_ARS" | "KEEP_GOOGLE" | "DISMISSED", by: number, db: Queryable = getDbPool()): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>("UPDATE gcal_conflicts SET status = 'RESOLVED', resolution = ?, resolved_by = ?, resolved_at = UTC_TIMESTAMP() WHERE id = ? AND status = 'OPEN'", [resolution, by, id]);
  return result.affectedRows === 1;
}

// ---- OAuth states ---------------------------------------------------------
export async function insertOAuthState(input: { stateHash: string; userId: number; nonceHash: string; ttlSeconds: number }, db: Queryable = getDbPool()): Promise<void> {
  await db.query("DELETE FROM gcal_oauth_states WHERE expires_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)");
  await db.query("INSERT INTO gcal_oauth_states (state_hash, user_id, nonce_hash, expires_at) VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND))", [input.stateHash, input.userId, input.nonceHash, input.ttlSeconds]);
}

// Single use: only the first caller gets it, and only before it expires and
// for the person who started it.
export async function consumeOAuthState(stateHash: string, userId: number, db: Queryable = getDbPool()): Promise<{ nonceHash: string } | null> {
  const [result] = await db.query<ResultSetHeader>("UPDATE gcal_oauth_states SET used_at = UTC_TIMESTAMP() WHERE state_hash = ? AND user_id = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()", [stateHash, userId]);
  if (result.affectedRows !== 1) return null;
  const [rows] = await db.query<RowDataPacket[]>("SELECT nonce_hash FROM gcal_oauth_states WHERE state_hash = ?", [stateHash]);
  return rows[0] ? { nonceHash: rows[0].nonce_hash } : null;
}

// ---- monitoring -----------------------------------------------------------
export interface CalendarStats {
  connections: Record<ConnectionRow["status"], number>;
  jobs24h: { done: number; failed: number; dead: number };
  pendingRetries: number;
  apiErrors24h: number;
  oauthFailures24h: number;
  channelsExpiringSoon: number;
  openConflicts: number;
  avgLatencySeconds: number | null;
  lastSuccessAt: Date | null;
  lastErrorCategories: { category: string; count: number }[];
}

export async function calendarStats(db: Queryable = getDbPool()): Promise<CalendarStats> {
  const [connections] = await db.query<RowDataPacket[]>("SELECT status, COUNT(*) AS n FROM gcal_connections GROUP BY status");
  const [[jobs]] = await db.query<RowDataPacket[]>(
    `SELECT SUM(status = 'DONE') AS done, SUM(status = 'FAILED') AS failed, SUM(status = 'DEAD') AS dead,
       AVG(CASE WHEN status = 'DONE' THEN TIMESTAMPDIFF(SECOND, created_at, finished_at) END) AS latency
     FROM gcal_jobs WHERE created_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)`,
  );
  const [[pending]] = await db.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM gcal_jobs WHERE status = 'PENDING' AND attempts > 0");
  const [[errors]] = await db.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM gcal_jobs WHERE error_category IS NOT NULL AND created_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)");
  const [[oauth]] = await db.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'GCAL_CONNECT_FAILED' AND occurred_at > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 DAY)");
  const [[channels]] = await db.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM gcal_connections WHERE status = 'ACTIVE' AND channel_id IS NOT NULL AND channel_expires_at < DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 DAY)");
  const [[conflicts]] = await db.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM gcal_conflicts WHERE status = 'OPEN'");
  const [[last]] = await db.query<RowDataPacket[]>("SELECT MAX(last_sync_at) AS at FROM gcal_connections");
  const [categories] = await db.query<RowDataPacket[]>(
    "SELECT error_category AS category, COUNT(*) AS n FROM gcal_jobs WHERE error_category IS NOT NULL AND created_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY) GROUP BY error_category ORDER BY n DESC LIMIT 6",
  );
  const byStatus = { ACTIVE: 0, NEEDS_REAUTH: 0, DISCONNECTED: 0, REVOKED: 0 } as Record<ConnectionRow["status"], number>;
  for (const row of connections) byStatus[row.status as ConnectionRow["status"]] = Number(row.n);
  return {
    connections: byStatus,
    jobs24h: { done: Number(jobs?.done ?? 0), failed: Number(jobs?.failed ?? 0), dead: Number(jobs?.dead ?? 0) },
    pendingRetries: Number(pending?.n ?? 0),
    apiErrors24h: Number(errors?.n ?? 0),
    oauthFailures24h: Number(oauth?.n ?? 0),
    channelsExpiringSoon: Number(channels?.n ?? 0),
    openConflicts: Number(conflicts?.n ?? 0),
    avgLatencySeconds: jobs?.latency === null || jobs?.latency === undefined ? null : Math.round(Number(jobs.latency)),
    lastSuccessAt: last?.at ?? null,
    lastErrorCategories: categories.map((row) => ({ category: String(row.category), count: Number(row.n) })),
  };
}
