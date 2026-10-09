import Link from "next/link";
import { PendingLink } from "@/features/ui/PendingLink";
import { PageHeader } from "@/features/shell/PageHeader";
import { CUSTOM_TYPE, filterQuery, presets, type DashboardFilter } from "@/server/dashboards/filters";

// Shared frame of the four admin dashboards (S11-12, F-74): tabs, one filter
// bar (GET, so every view is a link that can be shared), period presets and
// the CSV download of what is on screen.
export const DASHBOARDS = [
  { slug: "utilisation", label: "Utilisation", title: "Approval utilisation", description: "How much each approval type is used, and how it ends." },
  { slug: "departments", label: "Department-wise raised", title: "Requests raised by department", description: "What each department raises, and how those requests end." },
  { slug: "approvers", label: "Approver-wise", title: "Approvers", description: "What each approver was given in the period, what they decided, and how fast." },
  { slug: "raisers", label: "Raiser-wise by department", title: "Raisers by department", description: "Who raises requests, grouped by their department." },
] as const;
export type DashboardSlug = (typeof DASHBOARDS)[number]["slug"];

export function DashboardFrame({
  slug,
  filter,
  today,
  choices,
  departmentNote,
  children,
}: {
  slug: DashboardSlug;
  filter: DashboardFilter;
  today: string;
  choices: { types: { id: number; name: string }[]; departments: { id: number; name: string }[] };
  departmentNote: string;
  children: React.ReactNode;
}) {
  const current = DASHBOARDS.find((item) => item.slug === slug)!;
  const query = filterQuery(filter);
  return (
    <>
      <PageHeader title={current.title} description={current.description}>
        <a href={`/api/admin/dashboards/${slug}?${query}`} className="btn-secondary btn-compact" download>
          Download CSV
        </a>
      </PageHeader>
      <nav aria-label="Dashboards" className="mb-4 flex flex-wrap gap-2">
        {DASHBOARDS.map((item) => (
          <Link
            key={item.slug}
            href={`/admin/dashboards/${item.slug}?${query}`}
            aria-current={item.slug === slug ? "page" : undefined}
            className={`rounded-full border px-4 py-1.5 text-label font-semibold transition-colors ${
              item.slug === slug ? "border-primary-600 bg-primary-600 text-white" : "border-line bg-surface text-ink hover:bg-surface-muted"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <form method="get" action={`/admin/dashboards/${slug}`} className="card mb-2 flex flex-wrap items-end gap-3 px-4 py-3" aria-label="Filters">
        <div>
          <label htmlFor="from" className="field-label">
            From
          </label>
          <input id="from" name="from" type="date" defaultValue={filter.from} max={today} className="field-input" />
        </div>
        <div>
          <label htmlFor="to" className="field-label">
            To
          </label>
          <input id="to" name="to" type="date" defaultValue={filter.to} max={today} className="field-input" />
        </div>
        <div className="min-w-[180px] flex-1">
          <label htmlFor="type" className="field-label">
            Approval type
          </label>
          <select id="type" name="type" defaultValue={filter.workflowId ?? ""} className="field-input">
            <option value="">All types</option>
            {choices.types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
            <option value={CUSTOM_TYPE}>Custom approvals</option>
          </select>
        </div>
        <div className="min-w-[180px] flex-1">
          <label htmlFor="dept" className="field-label">
            Department
          </label>
          <select id="dept" name="dept" defaultValue={filter.departmentId ?? ""} className="field-input">
            <option value="">All departments</option>
            {choices.departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-primary btn-compact h-11">
          Apply
        </button>
      </form>
      <p className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-muted">
        <span>Quick:</span>
        {/* Plain links with a pending spinner: the last click always wins (QA DEF-04). */}
        {presets(today).map((preset) => (
          <PendingLink key={preset.label} className="link font-normal" href={`/admin/dashboards/${slug}?${filterQuery({ ...filter, from: preset.from, to: preset.to })}`}>
            {preset.label}
          </PendingLink>
        ))}
        <span aria-hidden="true">·</span>
        <span>{departmentNote} Deleted requests are never counted.</span>
      </p>
      {children}
    </>
  );
}

export function KpiTiles({ tiles }: { tiles: { label: string; value: string; note?: string }[] }) {
  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.label} className="card px-4 py-3">
          <p className="text-label text-ink-muted">{tile.label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{tile.value}</p>
          {tile.note && <p className="text-caption text-ink-muted">{tile.note}</p>}
        </div>
      ))}
    </div>
  );
}

// How requests ended, as one thin stacked bar. The numbers are in the
// table's columns as well, so the colours are never the only carrier.
const SEGMENTS = [
  { key: "approved", label: "Approved", className: "bg-success-600" },
  { key: "rejected", label: "Rejected", className: "bg-danger-600" },
  { key: "open", label: "Open", className: "bg-warning-600" },
  { key: "withdrawn", label: "Withdrawn", className: "bg-ink-faint" },
] as const;

export function OutcomeLegend() {
  return (
    <p className="flex flex-wrap gap-4 border-b border-line px-5 py-3 text-caption text-ink-muted" aria-hidden="true">
      {SEGMENTS.map((segment) => (
        <span key={segment.key} className="inline-flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-sm ${segment.className}`} />
          {segment.label}
        </span>
      ))}
    </p>
  );
}

export function OutcomeBar({ approved, rejected, open, withdrawn }: { approved: number; rejected: number; open: number; withdrawn: number }) {
  const total = approved + rejected + open + withdrawn;
  const values = { approved, rejected, open, withdrawn };
  if (total === 0) return <span className="text-caption text-ink-faint">Not used</span>;
  return (
    <div
      role="img"
      aria-label={`${approved} approved, ${rejected} rejected, ${open} open, ${withdrawn} withdrawn`}
      title={`${approved} approved · ${rejected} rejected · ${open} open · ${withdrawn} withdrawn`}
      className="flex h-2.5 w-32 gap-px overflow-hidden rounded-full bg-surface-muted"
    >
      {SEGMENTS.map((segment) =>
        values[segment.key] > 0 ? <span key={segment.key} className={segment.className} style={{ width: `${(values[segment.key] / total) * 100}%` }} /> : null,
      )}
    </div>
  );
}

// A single-measure bar next to a number (e.g. requests raised).
export function MeasureBar({ value, max }: { value: number; max: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="w-10 text-right tabular-nums">{value.toLocaleString("en-IN")}</span>
      <span aria-hidden="true" className="h-2 w-24 overflow-hidden rounded-full bg-surface-muted">
        <span className="block h-full rounded-full bg-primary-600" style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
      </span>
    </span>
  );
}

export function DashboardTable({ title, empty, head, rows, legend }: { title?: string; empty: string; head: { label: string; numeric?: boolean }[]; rows: React.ReactNode[][]; legend?: boolean }) {
  return (
    <section className="card overflow-x-auto">
      {title && <h2 className="border-b border-line px-5 py-4 font-semibold">{title}</h2>}
      {legend && rows.length > 0 && <OutcomeLegend />}
      {rows.length === 0 ? (
        <p className="px-5 py-4 text-label text-ink-muted">{empty}</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              {head.map((cell) => (
                <th key={cell.label} className={cell.numeric ? "text-right" : undefined}>
                  {cell.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, index) => (
                  <td key={index} className={head[index]?.numeric ? "text-right tabular-nums" : index === 0 ? "min-w-48" : undefined}>
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
