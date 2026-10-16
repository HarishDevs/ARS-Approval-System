import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import type { InfoPriority } from "@/server/modules/settings";
import type { InfoStatus } from "@/server/modules/info-rules";

// v1.9.0 (D-143, D-145): information records, their targets, recipients
// (read and acknowledged kept apart) and history.
export interface InfoRecord {
  id: number;
  infoNo: string;
  typeVersionId: number;
  typeId: number;
  typeName: string;
  title: string;
  body: string;
  priority: InfoPriority;
  status: InfoStatus;
  ackRequired: boolean;
  effectiveOn: string | null;
  expiresOn: string | null;
  formData: Record<string, unknown>;
  createdBy: number;
  createdByName: string;
  publishedAt: Date | null;
  withdrawnAt: Date | null;
  withdrawReason: string | null;
  archivedAt: Date | null;
  rowVersion: number;
  createdAt: Date;
}

type InfoRow = RowDataPacket & {
  id: number;
  info_no: string;
  type_version_id: number;
  type_id: number;
  type_name: string;
  title: string;
  body: string;
  priority: InfoPriority;
  status: InfoStatus;
  ack_required: number;
  effective_on: string | Date | null;
  expires_on: string | Date | null;
  form_data_json: unknown;
  created_by: number;
  created_by_name: string;
  published_at: Date | null;
  withdrawn_at: Date | null;
  withdraw_reason: string | null;
  archived_at: Date | null;
  row_version: number;
  created_at: Date;
};

const day = (value: string | Date | null) => (value === null ? null : typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10));
const toInfo = (row: InfoRow): InfoRecord => ({
  id: row.id,
  infoNo: row.info_no,
  typeVersionId: row.type_version_id,
  typeId: row.type_id,
  typeName: row.type_name,
  title: row.title,
  body: row.body,
  priority: row.priority,
  status: row.status,
  ackRequired: row.ack_required === 1,
  effectiveOn: day(row.effective_on),
  expiresOn: day(row.expires_on),
  formData: (typeof row.form_data_json === "string" ? JSON.parse(row.form_data_json) : row.form_data_json) as Record<string, unknown>,
  createdBy: row.created_by,
  createdByName: row.created_by_name,
  publishedAt: row.published_at,
  withdrawnAt: row.withdrawn_at,
  withdrawReason: row.withdraw_reason,
  archivedAt: row.archived_at,
  rowVersion: row.row_version,
  createdAt: row.created_at,
});

export const INFO_SELECT = `SELECT i.*, v.type_id, mt.name AS type_name, c.name AS created_by_name
  FROM info_items i
  JOIN module_type_versions v ON v.id = i.type_version_id
  JOIN module_types mt ON mt.id = v.type_id
  JOIN users c ON c.id = i.created_by`;

export async function findInfo(id: number, db: Queryable = getDbPool(), lock = false): Promise<InfoRecord | null> {
  if (lock) await db.query("SELECT id FROM info_items WHERE id = ? FOR UPDATE", [id]);
  const [rows] = await db.query<InfoRow[]>(`${INFO_SELECT} WHERE i.id = ?`, [id]);
  return rows[0] ? toInfo(rows[0]) : null;
}

export interface InfoWrite {
  title: string;
  body: string;
  priority: InfoPriority;
  ackRequired: boolean;
  effectiveOn: string | null;
  expiresOn: string | null;
  formData: Record<string, unknown>;
}

export async function insertInfo(input: InfoWrite & { infoNo: string; typeVersionId: number; createdBy: number }, db: Queryable): Promise<number> {
  const [result] = await db.query<ResultSetHeader>(
    `INSERT INTO info_items (info_no, type_version_id, title, body, priority, status, ack_required, effective_on, expires_on, form_data_json, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
    [input.infoNo, input.typeVersionId, input.title, input.body, input.priority, input.ackRequired, input.effectiveOn, input.expiresOn, JSON.stringify(input.formData), input.createdBy],
  );
  return result.insertId;
}

export async function updateInfo(id: number, expectedVersion: number, changes: Record<string, unknown>, db: Queryable): Promise<boolean> {
  const allowed = ["title", "body", "priority", "status", "ack_required", "effective_on", "expires_on", "form_data_json", "published_at", "withdrawn_by", "withdrawn_at", "withdraw_reason", "archived_at"];
  const keys = Object.keys(changes).filter((key) => allowed.includes(key));
  if (keys.length === 0) return true;
  const [result] = await db.query<ResultSetHeader>(`UPDATE info_items SET ${keys.map((key) => `${key} = ?`).join(", ")}, row_version = row_version + 1 WHERE id = ? AND row_version = ?`, [
    ...keys.map((key) => (key === "form_data_json" ? JSON.stringify(changes[key]) : changes[key])),
    id,
    expectedVersion,
  ]);
  return result.affectedRows === 1;
}

export async function deleteDraftInfo(id: number, db: Queryable): Promise<void> {
  await db.query("DELETE FROM info_targets WHERE info_id = ?", [id]);
  await db.query("DELETE FROM info_items WHERE id = ? AND status = 'DRAFT'", [id]);
}

export interface InfoTargets {
  people: number[];
  departments: number[];
  groups: number[];
  everyone: boolean;
}

export async function replaceTargets(infoId: number, targets: InfoTargets, db: Queryable): Promise<void> {
  await db.query("DELETE FROM info_targets WHERE info_id = ?", [infoId]);
  const rows: [number, string, number][] = [
    ...targets.people.map((id) => [infoId, "USER", id] as [number, string, number]),
    ...targets.departments.map((id) => [infoId, "DEPARTMENT", id] as [number, string, number]),
    ...targets.groups.map((id) => [infoId, "GROUP", id] as [number, string, number]),
    ...(targets.everyone ? [[infoId, "EVERYONE", 0] as [number, string, number]] : []),
  ];
  if (rows.length) await db.query("INSERT INTO info_targets (info_id, target_type, target_id) VALUES ?", [rows]);
}

export async function loadTargets(infoId: number, db: Queryable = getDbPool()): Promise<InfoTargets> {
  const [rows] = await db.query<(RowDataPacket & { target_type: string; target_id: number })[]>("SELECT target_type, target_id FROM info_targets WHERE info_id = ?", [infoId]);
  return {
    people: rows.filter((row) => row.target_type === "USER").map((row) => row.target_id),
    departments: rows.filter((row) => row.target_type === "DEPARTMENT").map((row) => row.target_id),
    groups: rows.filter((row) => row.target_type === "GROUP").map((row) => row.target_id),
    everyone: rows.some((row) => row.target_type === "EVERYONE"),
  };
}

export async function insertRecipients(infoId: number, recipients: ReadonlyMap<number, string>, db: Queryable): Promise<void> {
  const rows = [...recipients].map(([userId, source]) => [infoId, userId, source]);
  for (let index = 0; index < rows.length; index += 500) await db.query("INSERT IGNORE INTO info_recipients (info_id, user_id, source, added_at) VALUES ?", [rows.slice(index, index + 500).map((row) => [...row, new Date()])]);
}

export interface RecipientRow {
  userId: number;
  name: string;
  departmentName: string | null;
  source: string;
  readAt: Date | null;
  acknowledgedAt: Date | null;
}

export async function listRecipients(infoId: number, db: Queryable = getDbPool()): Promise<RecipientRow[]> {
  const [rows] = await db.query<(RowDataPacket & { user_id: number; name: string; department_name: string | null; source: string; read_at: Date | null; acknowledged_at: Date | null })[]>(
    `SELECT r.user_id, u.name, d.name AS department_name, r.source, r.read_at, r.acknowledged_at
     FROM info_recipients r JOIN users u ON u.id = r.user_id LEFT JOIN departments d ON d.id = u.department_id
     WHERE r.info_id = ? ORDER BY u.name`,
    [infoId],
  );
  return rows.map((row) => ({ userId: row.user_id, name: row.name, departmentName: row.department_name, source: row.source, readAt: row.read_at, acknowledgedAt: row.acknowledged_at }));
}

export async function findRecipient(infoId: number, userId: number, db: Queryable = getDbPool()): Promise<{ readAt: Date | null; acknowledgedAt: Date | null } | null> {
  const [rows] = await db.query<(RowDataPacket & { read_at: Date | null; acknowledged_at: Date | null })[]>("SELECT read_at, acknowledged_at FROM info_recipients WHERE info_id = ? AND user_id = ?", [infoId, userId]);
  return rows[0] ? { readAt: rows[0].read_at, acknowledgedAt: rows[0].acknowledged_at } : null;
}

// Opening marks it read (only the first time). Never acknowledges.
export async function markInfoRead(infoId: number, userId: number, db: Queryable = getDbPool()): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>("UPDATE info_recipients SET read_at = UTC_TIMESTAMP() WHERE info_id = ? AND user_id = ? AND read_at IS NULL", [infoId, userId]);
  return result.affectedRows === 1;
}

export async function acknowledge(infoId: number, userId: number, db: Queryable): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>(
    "UPDATE info_recipients SET acknowledged_at = UTC_TIMESTAMP(), read_at = COALESCE(read_at, UTC_TIMESTAMP()) WHERE info_id = ? AND user_id = ? AND acknowledged_at IS NULL",
    [infoId, userId],
  );
  return result.affectedRows === 1;
}

export async function appendInfoEvent(infoId: number, event: { actorId: number | null; type: string; body?: string | null; payload?: Record<string, unknown> | null }, db: Queryable): Promise<void> {
  await db.query<ResultSetHeader>("INSERT INTO info_events (info_id, actor_id, event_type, body, payload_json) VALUES (?, ?, ?, ?, ?)", [infoId, event.actorId, event.type, event.body ?? null, event.payload ? JSON.stringify(event.payload) : null]);
}

export async function listInfoEvents(infoId: number, db: Queryable = getDbPool()) {
  const [rows] = await db.query<(RowDataPacket & { id: number; name: string | null; event_type: string; body: string | null; payload_json: unknown; created_at: Date })[]>(
    "SELECT e.id, u.name, e.event_type, e.body, e.payload_json, e.created_at FROM info_events e LEFT JOIN users u ON u.id = e.actor_id WHERE e.info_id = ? ORDER BY e.id",
    [infoId],
  );
  return rows.map((row) => ({ id: row.id, actorName: row.name, eventType: row.event_type, body: row.body, payload: (typeof row.payload_json === "string" ? JSON.parse(row.payload_json) : row.payload_json) as Record<string, unknown> | null, createdAt: row.created_at }));
}

// ---- lists ------------------------------------------------------------------------------
export interface InfoListItem {
  id: number;
  infoNo: string;
  title: string;
  typeName: string;
  priority: InfoPriority;
  status: InfoStatus;
  ackRequired: boolean;
  expiresOn: string | null;
  createdByName: string;
  publishedAt: Date | null;
  createdAt: Date;
  readAt: Date | null;
  acknowledgedAt: Date | null;
  recipients: number;
  read: number;
  acknowledged: number;
  formData: Record<string, unknown>;
}

export async function listInfo(where: string[], params: unknown[], orderBy: string, limit: number, offset: number, viewerId: number, db: Queryable = getDbPool()): Promise<{ rows: InfoListItem[]; total: number }> {
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [rows] = await db.query<(InfoRow & { my_read: Date | null; my_ack: Date | null; recipients: number; read_count: number; ack_count: number })[]>(
    `SELECT i.*, v.type_id, mt.name AS type_name, c.name AS created_by_name, me.read_at AS my_read, me.acknowledged_at AS my_ack,
       (SELECT COUNT(*) FROM info_recipients x WHERE x.info_id = i.id) AS recipients,
       (SELECT COUNT(*) FROM info_recipients x WHERE x.info_id = i.id AND x.read_at IS NOT NULL) AS read_count,
       (SELECT COUNT(*) FROM info_recipients x WHERE x.info_id = i.id AND x.acknowledged_at IS NOT NULL) AS ack_count
     FROM info_items i JOIN module_type_versions v ON v.id = i.type_version_id JOIN module_types mt ON mt.id = v.type_id JOIN users c ON c.id = i.created_by
     LEFT JOIN info_recipients me ON me.info_id = i.id AND me.user_id = ?
     ${clause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [viewerId, ...params, limit, offset],
  );
  const [count] = await db.query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) AS total FROM info_items i JOIN module_type_versions v ON v.id = i.type_version_id LEFT JOIN info_recipients me ON me.info_id = i.id AND me.user_id = ? ${clause}`,
    [viewerId, ...params],
  );
  return {
    rows: rows.map((row) => ({
      ...toInfo(row),
      readAt: row.my_read,
      acknowledgedAt: row.my_ack,
      recipients: Number(row.recipients),
      read: Number(row.read_count),
      acknowledged: Number(row.ack_count),
    })),
    total: Number(count[0]?.total ?? 0),
  };
}

export async function countInfo(where: string[], params: unknown[], viewerId: number, db: Queryable = getDbPool()): Promise<number> {
  const [count] = await db.query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) AS total FROM info_items i JOIN module_type_versions v ON v.id = i.type_version_id LEFT JOIN info_recipients me ON me.info_id = i.id AND me.user_id = ? ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`,
    [viewerId, ...params],
  );
  return Number(count[0]?.total ?? 0);
}

// ---- reminders (job runner) -------------------------------------------------------------
export async function listAckReminders(limit: number, db: Queryable = getDbPool()): Promise<{ infoId: number; userId: number; infoNo: string; title: string; settings: unknown; publishedAt: Date }[]> {
  const [rows] = await db.query<(RowDataPacket & { info_id: number; user_id: number; info_no: string; title: string; settings_json: unknown; published_at: Date })[]>(
    `SELECT r.info_id, r.user_id, i.info_no, i.title, v.settings_json, i.published_at
     FROM info_recipients r JOIN info_items i ON i.id = r.info_id JOIN module_type_versions v ON v.id = i.type_version_id JOIN users u ON u.id = r.user_id AND u.active = TRUE
     WHERE i.status = 'PUBLISHED' AND i.ack_required = TRUE AND r.acknowledged_at IS NULL AND r.reminded_at IS NULL
       AND (i.expires_on IS NULL OR i.expires_on >= DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE)))
     ORDER BY r.info_id LIMIT ?`,
    [limit],
  );
  return rows.map((row) => ({ infoId: row.info_id, userId: row.user_id, infoNo: row.info_no, title: row.title, settings: typeof row.settings_json === "string" ? JSON.parse(row.settings_json) : row.settings_json, publishedAt: row.published_at }));
}

export async function claimAckReminder(infoId: number, userId: number, db: Queryable = getDbPool()): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>("UPDATE info_recipients SET reminded_at = UTC_TIMESTAMP() WHERE info_id = ? AND user_id = ? AND reminded_at IS NULL AND acknowledged_at IS NULL", [infoId, userId]);
  return result.affectedRows === 1;
}
