import { Fragment } from "react";
import { DashboardFrame, KpiTiles, OutcomeBar, OutcomeLegend } from "@/features/admin/dashboards/DashboardFrame";
import { dashboardPage, type DashboardSearch } from "@/features/admin/dashboards/page-data";
import { loadRaisers, type RaiserRow } from "@/lib/db/repositories/dashboards.repository";
import { approvalRate, hoursText } from "@/server/dashboards/filters";
import { formatIndiaTime } from "@/server/notifications/security-messages";

type Measure = "raised" | "approved" | "rejected" | "open" | "withdrawn";
const total = (items: RaiserRow[], key: Measure) => items.reduce((sum, item) => sum + item[key], 0);
const rateText = (approved: number, rejected: number) => {
  const rate = approvalRate(approved, rejected);
  return rate === null ? "—" : `${rate}%`;
};

// Raiser-wise by department (F-74): each raiser under their department, with
// a subtotal row per department.
export default async function RaisersDashboardPage({ searchParams }: { searchParams: DashboardSearch }) {
  const { today, filter, choices } = await dashboardPage(searchParams);
  const rows = await loadRaisers(filter);
  const groups = new Map<string, RaiserRow[]>();
  for (const row of rows) groups.set(row.department, [...(groups.get(row.department) ?? []), row]);
  const raised = total(rows, "raised");
  const top = [...rows].sort((a, b) => b.raised - a.raised)[0];
  return (
    <DashboardFrame slug="raisers" filter={filter} today={today} choices={choices} departmentNote="Department = the raiser's department today.">
      <KpiTiles
        tiles={[
          { label: "Requests raised", value: raised.toLocaleString("en-IN") },
          { label: "People raising", value: rows.length.toLocaleString("en-IN") },
          { label: "Average per person", value: rows.length ? (raised / rows.length).toFixed(1) : "—" },
          { label: "Raises the most", value: top ? top.name : "—", note: top ? `${top.raised} · ${top.department}` : undefined },
        ]}
      />
      <section className="card overflow-x-auto">
        {rows.length === 0 ? (
          <p className="px-5 py-4 text-label text-ink-muted">No requests in this period.</p>
        ) : (
          <>
            <OutcomeLegend />
            <table className="data-table">
              <thead>
                <tr>
                  <th>Raised by</th>
                  <th className="text-right">Raised</th>
                  <th>Outcome</th>
                  <th className="text-right">Approved</th>
                  <th className="text-right">Rejected</th>
                  <th className="text-right">Open</th>
                  <th className="text-right">Approval rate</th>
                  <th className="text-right">Avg to close</th>
                  <th>Last raised</th>
                </tr>
              </thead>
              <tbody>
                {[...groups].map(([department, people]) => (
                  <Fragment key={department}>
                    <tr className="bg-surface-muted">
                      <th scope="rowgroup" className="min-w-48 px-4 py-2 text-left !text-label !font-semibold !normal-case !tracking-normal !text-ink">
                        {department} <span className="font-normal text-ink-muted">· {people.length === 1 ? "1 person" : `${people.length} people`}</span>
                      </th>
                      <td className="text-right font-semibold tabular-nums">{total(people, "raised")}</td>
                      <td>
                        <OutcomeBar approved={total(people, "approved")} rejected={total(people, "rejected")} open={total(people, "open")} withdrawn={total(people, "withdrawn")} />
                      </td>
                      <td className="text-right tabular-nums">{total(people, "approved")}</td>
                      <td className="text-right tabular-nums">{total(people, "rejected")}</td>
                      <td className="text-right tabular-nums">{total(people, "open")}</td>
                      <td className="text-right tabular-nums">{rateText(total(people, "approved"), total(people, "rejected"))}</td>
                      <td />
                      <td />
                    </tr>
                    {people.map((row) => (
                      <tr key={row.requesterId}>
                        <td className="pl-8">{row.name}</td>
                        <td className="text-right tabular-nums">{row.raised}</td>
                        <td>
                          <OutcomeBar approved={row.approved} rejected={row.rejected} open={row.open} withdrawn={row.withdrawn} />
                        </td>
                        <td className="text-right tabular-nums">{row.approved}</td>
                        <td className="text-right tabular-nums">{row.rejected}</td>
                        <td className="text-right tabular-nums">{row.open}</td>
                        <td className="text-right tabular-nums">{rateText(row.approved, row.rejected)}</td>
                        <td className="text-right tabular-nums">{hoursText(row.avgCloseHours)}</td>
                        <td className="whitespace-nowrap text-label text-ink-muted">{row.lastRaisedAt ? formatIndiaTime(row.lastRaisedAt) : "—"}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>
    </DashboardFrame>
  );
}
