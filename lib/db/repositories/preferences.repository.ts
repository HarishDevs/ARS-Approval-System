import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import { EVENT_GROUPS, type Channel } from "@/server/notifications/preferences";

// Notification preferences (#6). Only "off" choices matter; a missing row is on.
export async function loadOptOuts(userId: number, db: Queryable = getDbPool()): Promise<Set<string>> {
  const [rows] = await db.query<(RowDataPacket & { event_group: string; channel: Channel })[]>(
    "SELECT event_group, channel FROM notification_preferences WHERE user_id = ? AND enabled = FALSE",
    [userId],
  );
  return new Set(rows.map((row) => `${row.event_group}:${row.channel}`));
}

// Replaces the person's choices. Mandatory groups can't be switched off: any
// such value is ignored here as well as when sending.
export async function saveOptOuts(userId: number, off: ReadonlySet<string>, db: Queryable = getDbPool()): Promise<void> {
  const optional = EVENT_GROUPS.filter((group) => !group.mandatory);
  for (const group of optional) {
    for (const channel of ["EMAIL", "WHATSAPP"] as const) {
      const enabled = !off.has(`${group.key}:${channel}`);
      await db.query<ResultSetHeader>(
        `INSERT INTO notification_preferences (user_id, event_group, channel, enabled) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE enabled = VALUES(enabled)`,
        [userId, group.key, channel, enabled],
      );
    }
  }
}
