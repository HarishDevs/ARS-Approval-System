import "server-only";
import { requireArea } from "@/server/authorization/guards";
import { indiaToday } from "@/lib/db/repositories/collab.repository";
import { dashboardChoices } from "@/lib/db/repositories/dashboards.repository";
import { parseDashboardFilter } from "@/server/dashboards/filters";

export type DashboardSearch = Promise<Record<string, string | undefined>>;

// Every dashboard page: Admin space check, today's India date, the filter
// from the address, and the filter choices.
export async function dashboardPage(searchParams: DashboardSearch) {
  await requireArea("admin");
  const today = await indiaToday();
  const [params, choices] = await Promise.all([searchParams, dashboardChoices()]);
  return { today, filter: parseDashboardFilter(params, today), choices };
}
