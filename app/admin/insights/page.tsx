import Link from "next/link";
import { PageHeader } from "@/features/shell/PageHeader";
import { requireArea } from "@/server/authorization/guards";
import { loadInsights } from "@/lib/db/repositories/insights.repository";

// F-70 / D-069 management dashboard: headline numbers as tiles, the detail
// as plain tables (exact values matter more than shapes here).
function hours(value: number | null): string {
  if (value === null) return "—";
  if (value * 60 < 1) return "under 1 min";
  if (value < 1) return `${Math.round(value * 60)} min`;
  if (value < 48) return `${value.toFixed(1)} h`;
  return `${(value / 24).toFixed(1)} days`;
}

function monthLabel(month: string): string {
  const [year, m] = month.split("-");
  return new Date(Date.UTC(Number(year), Number(m) - 1, 1)).toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
}

function Table({ title, empty, head, rows }: { title: string; empty: string; head: string[]; rows: React.ReactNode[][] }) {
  return (
    <section className="card overflow-x-auto">
      <h2 className="border-b border-line px-5 py-4 font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="px-5 py-4 text-label text-ink-muted">{empty}</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              {head.map((cell, index) => (
                <th key={cell} className={index > 1 ? "text-right" : undefined}>
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, index) => (
                  <td key={index} className={index > 1 ? "text-right tabular-nums" : undefined}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default async function InsightsPage() {
  await requireArea("admin");
  const data = await loadInsights();
  const tiles = [
    { label: "Open requests", value: data.totals.open.toLocaleString("en-IN") },
    { label: "Overdue approvals", value: data.totals.overdue.toLocaleString("en-IN"), alert: data.totals.overdue > 0 },
    { label: "Approved, last 30 days", value: data.totals.approved30.toLocaleString("en-IN") },
    { label: "Average time to full approval (90 days)", value: hours(data.totals.avgHoursToApprove90) },
  ];
  return (
    <>
      <PageHeader title="Insights" description="Where requests are waiting, how long each level takes, and who is deciding. Updated live." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="card p-5">
            <p className="text-label text-ink-muted">{tile.label}</p>
            <p className={`mt-2 text-display font-bold tabular-nums ${tile.alert ? "text-danger-600" : ""}`}>{tile.value}</p>
            {tile.alert && <p className="text-caption text-danger-600">See the overdue list below</p>}
          </div>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Table
          title="Waiting now, by level"
          empty="Nothing is waiting."
          head={["Approval type", "Level", "Requests"]}
          rows={data.openByStep.map((row) => [row.workflow, row.level, row.requests])}
        />
        <Table
          title="Time to decide, per level (last 90 days)"
          empty="No decisions yet."
          head={["Approval type", "Level", "Decisions", "Average", "Slowest"]}
          rows={data.speedByLevel.map((row) => [row.workflow, row.level, row.decisions, hours(row.avgHours), hours(row.maxHours)])}
        />
        <Table
          title="Overdue approvals"
          empty="Nothing is overdue."
          head={["Request", "Level", "Approver", "Overdue by"]}
          rows={data.overdue.map((row) => [
            <Link key="link" href={`/users/requests/${row.requestId}`} className="link">
              {row.requestNo}
            </Link>,
            row.level,
            row.approver,
            hours(row.hoursOverdue),
          ])}
        />
        <Table
          title="Decisions by person (last 30 days)"
          empty="No decisions in the last 30 days."
          head={["Person", "Approved", "Rejected", "Changes asked", "Average time"]}
          rows={data.byPerson.map((row) => [row.name, row.approved, row.rejected, row.changes, hours(row.avgHours)])}
        />
        <Table
          title="Requests by month (last 6 months)"
          empty="No requests yet."
          head={["Month", "Raised", "Approved", "Rejected", "Withdrawn", "Still open"]}
          rows={data.byMonth.map((row) => [monthLabel(row.month), row.raised, row.approved, row.rejected, row.withdrawn, row.open])}
        />
      </div>
    </>
  );
}
