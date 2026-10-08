import { DashboardFrame, DashboardTable, KpiTiles, MeasureBar } from "@/features/admin/dashboards/DashboardFrame";
import { dashboardPage, type DashboardSearch } from "@/features/admin/dashboards/page-data";
import { loadApprovers } from "@/lib/db/repositories/dashboards.repository";
import { hoursText, percent } from "@/server/dashboards/filters";

// Approver-wise (F-74): approvals given to each person in the period.
export default async function ApproversDashboardPage({ searchParams }: { searchParams: DashboardSearch }) {
  const { today, filter, choices } = await dashboardPage(searchParams);
  const rows = await loadApprovers(filter);
  const assigned = rows.reduce((sum, row) => sum + row.assigned, 0);
  const pending = rows.reduce((sum, row) => sum + row.pending, 0);
  const overdue = rows.reduce((sum, row) => sum + row.overdue, 0);
  const decided = rows.reduce((sum, row) => sum + row.approved + row.rejected + row.changes, 0);
  const timed = rows.filter((row) => row.onTimePercent !== null);
  const onTime = timed.length ? Math.round(timed.reduce((sum, row) => sum + (row.onTimePercent ?? 0), 0) / timed.length) : null;
  const decidedShare = percent(decided, assigned);
  const max = Math.max(0, ...rows.map((row) => row.assigned));
  return (
    <DashboardFrame
      slug="approvers"
      filter={filter}
      today={today}
      choices={choices}
      departmentNote="Department = the approver's department. A delegate's decision counts for the approver."
    >
      <KpiTiles
        tiles={[
          { label: "Approvals given", value: assigned.toLocaleString("en-IN"), note: `${rows.length} approvers` },
          { label: "Decided", value: decided.toLocaleString("en-IN"), note: decidedShare === null ? undefined : `${decidedShare}% of those given` },
          { label: "Waiting now", value: pending.toLocaleString("en-IN"), note: overdue ? `${overdue} overdue` : "none overdue" },
          { label: "Decided on time", value: onTime === null ? "—" : `${onTime}%`, note: "average across approvers with a response time" },
        ]}
      />
      <DashboardTable
        empty="No approvals were given in this period."
        head={[
          { label: "Approver" },
          { label: "Given" },
          { label: "Approved", numeric: true },
          { label: "Rejected", numeric: true },
          { label: "Changes asked", numeric: true },
          { label: "Not needed", numeric: true },
          { label: "Waiting now", numeric: true },
          { label: "Overdue now", numeric: true },
          { label: "Avg to decide", numeric: true },
          { label: "On time", numeric: true },
        ]}
        rows={rows.map((row) => [
          <span key="name">
            {row.name}
            <span className="block text-caption text-ink-muted">{[row.designation, row.department].filter(Boolean).join(" · ") || "—"}</span>
          </span>,
          <MeasureBar key="given" value={row.assigned} max={max} />,
          row.approved,
          row.rejected,
          row.changes,
          row.notNeeded,
          row.pending,
          row.overdue ? (
            <span key="overdue" className="font-semibold text-danger-600">
              {row.overdue}
            </span>
          ) : (
            0
          ),
          hoursText(row.avgDecideHours),
          row.onTimePercent === null ? "—" : `${row.onTimePercent}%`,
        ])}
      />
      <p className="mt-3 text-caption text-ink-muted">
        Not needed = an any-one or any-N step that someone else in the step completed first. On time = decided within the step&apos;s response time.
      </p>
    </DashboardFrame>
  );
}
