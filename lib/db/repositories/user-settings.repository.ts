import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";

// Per-person settings (v1.6.0). Every query filters on user_id.
export async function getUserSetting(userId: number, key: string, db: Queryable = getDbPool()): Promise<string | null> {
  const [rows] = await db.query<(RowDataPacket & { value: string })[]>("SELECT value FROM user_settings WHERE user_id = ? AND setting_key = ?", [userId, key]);
  return rows[0]?.value ?? null;
}

export async function setUserSetting(userId: number, key: string, value: string, db: Queryable = getDbPool()): Promise<void> {
  await db.query("INSERT INTO user_settings (user_id, setting_key, value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [userId, key, value]);
}
