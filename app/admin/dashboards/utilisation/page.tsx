import { DashboardFrame, DashboardTable, KpiTiles, MeasureBar, OutcomeBar } from "@/features/admin/dashboards/DashboardFrame";
import { dashboardPage, type DashboardSearch } from "@/features/admin/dashboards/page-data";
import { loadUtilisation } from "@/lib/db/repositories/dashboards.repository";
import { approvalRate, hoursText } from "@/server/dashboards/filters";
import { formatIndiaTime } from "@/server/notifications/security-messages";

// Utilisation (F-74): every approval type, used or not, and how it ends.
export default async function UtilisationPage({ searchParams }: { searchParams: DashboardSearch }) {
  const { today, filter, choices } = await dashboardPage(searchParams);
  const rows = await loadUtilisation(filter);
  const live = rows.filter((row) => row.workflowId !== null && row.active && row.published);
  const used = live.filter((row) => row.raised > 0);
  const total = rows.reduce((sum, row) => sum + row.raised, 0);
  const approved = rows.reduce((sum, row) => sum + row.approved, 0);
  const rejected = rows.reduce((sum, row) => sum + row.rejected, 0);
  const decided = rows.reduce((sum, row) => sum + (row.avgCloseHours === null ? 0 : row.approved + row.rejected), 0);
  const weighted = rows.reduce((sum, row) => sum + (row.avgCloseHours ?? 0) * (row.approved + row.rejected), 0);
  const max = Math.max(0, ...rows.map((row) => row.raised));
  const rate = approvalRate(approved, rejected);
  return (
    <DashboardFrame slug="utilisation" filter={filter} today={today} choices={choices} departmentNote="Department = the raiser's department.">
      <KpiTiles
        tiles={[
          { label: "Requests raised", value: total.toLocaleString("en-IN") },
          { label: "Live types used", value: `${used.length} of ${live.length}`, note: live.length ? `${Math.round((used.length / live.length) * 100)}% of live approval types` : undefined },
          { label: "Approval rate", value: rate === null ? "—" : `${rate}%`, note: "approved ÷ (approved + rejected)" },
          { label: "Average time to close", value: hoursText(decided ? weighted / decided : null), note: "raised → approved or rejected" },
        ]}
      />
      <DashboardTable
        legend
        empty="No approval types yet."
        head={[
          { label: "Approval type" },
          { label: "Raised" },
          { label: "Outcome" },
          { label: "Approved", numeric: true },
          { label: "Rejected", numeric: true },
          { label: "Open", numeric: true },
          { label: "Withdrawn", numeric: true },
          { label: "Approval rate", numeric: true },
          { label: "Avg to close", numeric: true },
          { label: "Last raised" },
        ]}
        rows={rows.map((row) => {
          const typeRate = approvalRate(row.approved, row.rejected);
          return [
            <span key="name">
              {row.name}
              {row.workflowId !== null && (!row.active || !row.published) && <span className="badge ml-2 bg-surface-muted text-ink-muted">{row.active ? "Not published" : "Inactive"}</span>}
            </span>,
            <MeasureBar key="raised" value={row.raised} max={max} />,
            <OutcomeBar key="bar" approved={row.approved} rejected={row.rejected} open={row.open} withdrawn={row.withdrawn} />,
            row.approved,
            row.rejected,
            row.open,
            row.withdrawn,
            typeRate === null ? "—" : `${typeRate}%`,
            hoursText(row.avgCloseHours),
            row.lastRaisedAt ? (
              <span key="last" className="whitespace-nowrap text-label text-ink-muted">
                {formatIndiaTime(row.lastRaisedAt)}
              </span>
            ) : (
              <span key="last" className="text-ink-faint">
                Not in period
              </span>
            ),
          ];
        })}
      />
    </DashboardFrame>
  );
}
