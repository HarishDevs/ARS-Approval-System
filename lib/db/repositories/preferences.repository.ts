import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import { optionalKeys, type Channel } from "@/server/notifications/preferences";

// Notification preferences (#6). Only "off" choices matter; a missing row is on.
export async function loadOptOuts(userId: number, db: Queryable = getDbPool()): Promise<Set<string>> {
  const [rows] = await db.query<(RowDataPacket & { event_group: string; channel: Channel })[]>(
    "SELECT event_group, channel FROM notification_preferences WHERE user_id = ? AND enabled = FALSE",
    [userId],
  );
  return new Set(rows.map((row) => `${row.event_group}:${row.channel}`));
}

// Replaces the person's choices (D-231: groups and single kinds, for the
// app, email and WhatsApp). Only "off" keys a person may switch off are kept;
// mandatory groups can't be switched off here or when sending.
export async function saveOptOuts(userId: number, off: ReadonlySet<string>, db: Queryable = getDbPool()): Promise<void> {
  const allowed = optionalKeys();
  await db.query<ResultSetHeader>("DELETE FROM notification_preferences WHERE user_id = ?", [userId]);
  for (const key of off) {
    if (!allowed.has(key)) continue;
    const at = key.lastIndexOf(":");
    await db.query<ResultSetHeader>("INSERT INTO notification_preferences (user_id, event_group, channel, enabled) VALUES (?, ?, ?, FALSE)", [userId, key.slice(0, at), key.slice(at + 1) as Channel]);
  }
}
