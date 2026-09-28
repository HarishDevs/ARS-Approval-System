import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";

export interface RawSetting {
  key: string;
  encrypted: boolean;
  value: string | null;
  updatedAt: Date;
}

interface SettingRow extends RowDataPacket {
  setting_key: string;
  encrypted: number;
  value: string | null;
  updated_at: Date;
}

export async function getRawSetting(key: string, db: Queryable = getDbPool()): Promise<RawSetting | null> {
  const [rows] = await db.query<SettingRow[]>(
    "SELECT setting_key, encrypted, value, updated_at FROM system_settings WHERE setting_key = ? LIMIT 1",
    [key],
  );
  const row = rows[0];
  return row ? { key: row.setting_key, encrypted: row.encrypted === 1, value: row.value, updatedAt: row.updated_at } : null;
}

export async function listRawSettings(db: Queryable = getDbPool()): Promise<RawSetting[]> {
  const [rows] = await db.query<SettingRow[]>("SELECT setting_key, encrypted, value, updated_at FROM system_settings");
  return rows.map((row) => ({ key: row.setting_key, encrypted: row.encrypted === 1, value: row.value, updatedAt: row.updated_at }));
}

export async function upsertSetting(
  input: { key: string; group: string; valueType: string; encrypted: boolean; storedValue: string; updatedBy: number },
  db: Queryable = getDbPool(),
): Promise<void> {
  await db.query<ResultSetHeader>(
    `INSERT INTO system_settings (setting_key, setting_group, value_type, encrypted, value, updated_by)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE value_type = VALUES(value_type), encrypted = VALUES(encrypted),
       value = VALUES(value), updated_by = VALUES(updated_by)`,
    [input.key, input.group, input.valueType, input.encrypted, input.storedValue, input.updatedBy],
  );
}

export async function recordSettingHistory(
  input: { key: string; changedBy: number; changeType: "CREATE" | "UPDATE"; oldRef: string | null; newRef: string | null },
  db: Queryable = getDbPool(),
): Promise<void> {
  await db.query<ResultSetHeader>(
    `INSERT INTO settings_change_history (setting_key, changed_by, change_type, old_value_reference, new_value_reference)
     VALUES (?, ?, ?, ?, ?)`,
    [input.key, input.changedBy, input.changeType, input.oldRef, input.newRef],
  );
}
