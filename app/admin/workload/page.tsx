import Link from "next/link";
import { PageHeader } from "@/features/shell/PageHeader";
import { requireArea } from "@/server/authorization/guards";
import { listPendingTaskAges } from "@/lib/db/repositories/workload.repository";
import { AGE_BANDS, ageText, summarizeWorkload } from "@/server/workload/summary";

// #12 workload: who has how much waiting right now, its age and what is
// overdue. A person's page has "Hand over pending approvals".
export default async function WorkloadPage() {
  await requireArea("admin");
  const { rows, total, overdue, medianHours } = summarizeWorkload(await listPendingTaskAges());
  const tiles = [
    { label: "Waiting now", value: total.toLocaleString("en-IN") },
    { label: "Overdue", value: overdue.toLocaleString("en-IN"), alert: overdue > 0 },
    { label: "People with something waiting", value: rows.length.toLocaleString("en-IN") },
    { label: "Typical wait (median)", value: total ? ageText(medianHours) : "—" },
  ];
  return (
    <>
      <PageHeader title="Workload" description="Approvals and work tasks waiting on each person right now, how long they have waited, and what is overdue. Ages count calendar time." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="card p-5">
            <p className="text-label text-ink-muted">{tile.label}</p>
            <p className={`mt-2 text-display font-bold tabular-nums ${tile.alert ? "text-danger-600" : ""}`}>{tile.value}</p>
          </div>
        ))}
      </div>
      <section className="card overflow-x-auto">
        <h2 className="border-b border-line px-5 py-4 font-semibold">By person</h2>
        {rows.length === 0 ? (
          <p className="px-5 py-4 text-label text-ink-muted">Nothing is waiting on anyone.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Person</th>
                <th className="text-right">Waiting</th>
                <th className="text-right">Overdue</th>
                {AGE_BANDS.map((band) => (
                  <th key={band.key} className="text-right">
                    {band.label}
                  </th>
                ))}
                <th className="text-right">Median wait</th>
                <th className="text-right">Oldest</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.approverId}>
                  <td>
                    <Link href={`/admin/users/${row.approverId}`} className="link">
                      {row.name}
                    </Link>
                    {row.onHold > 0 && <span className="block text-caption text-ink-muted">{row.onHold} on hold</span>}
                  </td>
                  <td className="text-right tabular-nums">{row.pending}</td>
                  <td className={`text-right tabular-nums ${row.overdue ? "font-semibold text-danger-600" : ""}`}>{row.overdue}</td>
                  {AGE_BANDS.map((band) => (
                    <td key={band.key} className="text-right tabular-nums">
                      {row.bands[band.key] || "—"}
                    </td>
                  ))}
                  <td className="text-right tabular-nums">{ageText(row.medianHours)}</td>
                  <td className="text-right tabular-nums">{ageText(row.oldestHours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <p className="mt-3 text-label text-ink-muted">To move someone&apos;s approvals, open their name and use &quot;Hand over pending approvals&quot;; it suggests the people with the fewest waiting.</p>
    </>
  );
}
