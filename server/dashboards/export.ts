import "server-only";
import { loadApprovers, loadDepartments, loadRaisers, loadUtilisation } from "@/lib/db/repositories/dashboards.repository";
import { toCsv } from "@/server/import/csv";
import { approvalRate, type DashboardFilter } from "@/server/dashboards/filters";

// CSV of each admin dashboard (S11-12, F-74): the same numbers as the page.
const hours = (value: number | null) => (value === null ? "" : value.toFixed(1));
const date = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : "");
const pct = (value: number | null) => (value === null ? "" : String(value));

export async function dashboardCsv(slug: string, filter: DashboardFilter): Promise<string | null> {
  switch (slug) {
    case "utilisation":
      return toCsv(
        ["approval_type", "live", "raised", "approved", "rejected", "withdrawn", "open", "approval_rate_percent", "avg_hours_to_close", "last_raised"],
        (await loadUtilisation(filter)).map((row) => [row.name, row.active && row.published ? "Yes" : "No", row.raised, row.approved, row.rejected, row.withdrawn, row.open, pct(approvalRate(row.approved, row.rejected)), hours(row.avgCloseHours), date(row.lastRaisedAt)]),
      );
    case "departments":
      return toCsv(
        ["department", "raisers", "raised", "approved", "rejected", "withdrawn", "open", "approval_rate_percent", "avg_hours_to_close", "top_types"],
        (await loadDepartments(filter)).map((row) => [row.name, row.raisers, row.raised, row.approved, row.rejected, row.withdrawn, row.open, pct(approvalRate(row.approved, row.rejected)), hours(row.avgCloseHours), row.topTypes.map((type) => `${type.name} (${type.raised})`).join("; ")]),
      );
    case "approvers":
      return toCsv(
        ["approver", "designation", "department", "assigned", "approved", "rejected", "changes_asked", "not_needed", "pending_now", "overdue_now", "avg_hours_to_decide", "on_time_percent"],
        (await loadApprovers(filter)).map((row) => [row.name, row.designation, row.department, row.assigned, row.approved, row.rejected, row.changes, row.notNeeded, row.pending, row.overdue, hours(row.avgDecideHours), pct(row.onTimePercent)]),
      );
    case "raisers":
      return toCsv(
        ["department", "raiser", "raised", "approved", "rejected", "withdrawn", "open", "approval_rate_percent", "avg_hours_to_close", "last_raised"],
        (await loadRaisers(filter)).map((row) => [row.department, row.name, row.raised, row.approved, row.rejected, row.withdrawn, row.open, pct(approvalRate(row.approved, row.rejected)), hours(row.avgCloseHours), date(row.lastRaisedAt)]),
      );
    default:
      return null;
  }
}
