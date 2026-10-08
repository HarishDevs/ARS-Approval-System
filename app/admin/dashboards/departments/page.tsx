import { DashboardFrame, DashboardTable, KpiTiles, MeasureBar, OutcomeBar } from "@/features/admin/dashboards/DashboardFrame";
import { dashboardPage, type DashboardSearch } from "@/features/admin/dashboards/page-data";
import { loadDepartments } from "@/lib/db/repositories/dashboards.repository";
import { approvalRate, hoursText } from "@/server/dashboards/filters";

// Department-wise raised (F-74): by the raiser's department.
export default async function DepartmentsDashboardPage({ searchParams }: { searchParams: DashboardSearch }) {
  const { today, filter, choices } = await dashboardPage(searchParams);
  const rows = await loadDepartments(filter);
  const total = rows.reduce((sum, row) => sum + row.raised, 0);
  const top = rows[0];
  const max = Math.max(0, ...rows.map((row) => row.raised));
  const open = rows.reduce((sum, row) => sum + row.open, 0);
  return (
    <DashboardFrame slug="departments" filter={filter} today={today} choices={choices} departmentNote="Department = the raiser's department today.">
      <KpiTiles
        tiles={[
          { label: "Requests raised", value: total.toLocaleString("en-IN") },
          { label: "Departments raising", value: String(rows.filter((row) => row.departmentId !== null).length) },
          { label: "Raises the most", value: top ? top.name : "—", note: top ? `${top.raised.toLocaleString("en-IN")} requests` : undefined },
          { label: "Still open", value: open.toLocaleString("en-IN") },
        ]}
      />
      <DashboardTable
        legend
        empty="No requests in this period."
        head={[
          { label: "Department" },
          { label: "Raised" },
          { label: "Outcome" },
          { label: "Raisers", numeric: true },
          { label: "Approved", numeric: true },
          { label: "Rejected", numeric: true },
          { label: "Open", numeric: true },
          { label: "Approval rate", numeric: true },
          { label: "Avg to close", numeric: true },
          { label: "Top approval types" },
        ]}
        rows={rows.map((row) => {
          const rate = approvalRate(row.approved, row.rejected);
          return [
            row.name,
            <MeasureBar key="raised" value={row.raised} max={max} />,
            <OutcomeBar key="bar" approved={row.approved} rejected={row.rejected} open={row.open} withdrawn={row.withdrawn} />,
            row.raisers,
            row.approved,
            row.rejected,
            row.open,
            rate === null ? "—" : `${rate}%`,
            hoursText(row.avgCloseHours),
            <span key="top" className="text-label text-ink-muted">
              {row.topTypes.map((type) => `${type.name} (${type.raised})`).join(", ")}
            </span>,
          ];
        })}
      />
    </DashboardFrame>
  );
}
