import "server-only";
import { miniRoads } from "@/server/approvals/road-view";
import { getUserSetting } from "@/lib/db/repositories/user-settings.repository";
import { parseColumns, type ListColumn } from "@/server/requests/list-columns";
import type { ListedRequest } from "@/lib/db/repositories/request-lists.repository";
import type { MiniRoad } from "@/server/approvals/road";

// D-256: what every request list adds to its page of rows: the small road for
// each row (only the rows shown) and the person's chosen columns.
export async function listExtras(listKey: string, available: readonly ListColumn[], userId: number, items: readonly ListedRequest[]): Promise<{ progress: Record<number, MiniRoad>; columns: ListColumn[] }> {
  const [roads, raw] = await Promise.all([miniRoads(items.map((item) => item.id)).catch(() => new Map<number, MiniRoad>()), getUserSetting(userId, `list.columns.${listKey}`).catch(() => null)]);
  return { progress: Object.fromEntries(roads), columns: parseColumns(raw, available) };
}
