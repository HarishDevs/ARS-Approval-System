import "server-only";
import { miniRoads } from "@/server/approvals/road-view";
import { getUserSetting } from "@/lib/db/repositories/user-settings.repository";
import { parseColumns, type ListColumn } from "@/server/requests/list-columns";
import type { ListedRequest } from "@/lib/db/repositories/request-lists.repository";
import type { MiniRoad } from "@/server/approvals/road";
import { priorityRecord } from "@/server/approvals/priority-lookup";
import type { ShownPriority } from "@/server/approvals/priority";

// D-256: what every request list adds to its page of rows: the small road for
// each row (only the rows shown) and the person's chosen columns.
// v1.47.0: and each row's priority (one query for the page).
export async function listExtras(
  listKey: string,
  available: readonly ListColumn[],
  userId: number,
  items: readonly ListedRequest[],
  roles: readonly string[] = [],
): Promise<{ progress: Record<number, MiniRoad>; columns: ListColumn[]; priority: Record<number, ShownPriority> }> {
  const ids = items.map((item) => item.id);
  const [roads, raw, priority] = await Promise.all([
    miniRoads(ids).catch(() => new Map<number, MiniRoad>()),
    getUserSetting(userId, `list.columns.${listKey}`).catch(() => null),
    priorityRecord(ids, { id: userId, roles }),
  ]);
  return { progress: Object.fromEntries(roads), columns: parseColumns(raw, available), priority };
}
