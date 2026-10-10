import Link from "next/link";
import { canExport, featureOn } from "@/server/settings/features";
import { notFound, redirect } from "next/navigation";
import { Download } from "lucide-react";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { Breadcrumbs } from "@/features/ui/Display";
import { BackgroundExportForm, SavedViews, SaveViewForm, ScheduleForm } from "@/features/analytics/ReportForms";
import { listActiveUserOptions } from "@/lib/db/repositories/admin-users.repository";
import { cleanQuery, runReport } from "@/server/reports/run";
import { PERIOD_LABEL, type PeriodKey } from "@/server/analytics/periods";
import { dashboardChoices } from "@/lib/db/repositories/dashboards.repository";
import { listViews } from "@/lib/db/repositories/analytics-views.repository";
import type { Cell, Column } from "@/server/reports/catalogue";
import { formatIndiaTime } from "@/server/notifications/security-messages";

export const dynamic = "force-dynamic";

const PREVIEW = 200;

function show(cell: Cell, column: Column): string {
  if (cell === null || cell === "") return "—";
  if (column.kind === "datetime" && typeof cell === "string") return formatIndiaTime(new Date(cell));
  if (typeof cell === "number") return column.kind === "percent" ? `${cell.toLocaleString("en-IN", { maximumFractionDigits: 1 })}%` : cell.toLocaleString("en-IN", { maximumFractionDigits: 1 });
  return String(cell);
}

// One report (Addendum A §10): filters, preview, downloads, schedule, views.
export default async function ReportPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { user } = await requireArea("users");
  if (!(await featureOn("reports", user))) notFound();
  // A9: downloads (and emailed schedules, which carry a file) may need "Can export".
  const exporting = await canExport(user);
  const scheduling = exporting && (await featureOn("scheduled_reports", user));
  const { key } = await params;
  const raw = await searchParams;
  const query = cleanQuery(raw);
  const ran = await runReport(key, query, { id: user.id, roles: user.roles });
  if (!ran) notFound();
  const { report, scope, scopes, filter, result } = ran;
  const choices = await dashboardChoices();
  const views = await listViews(user.id, key);
  // B07: opening a report with no filters uses your default view for it.
  const defaultView = Object.keys(raw).length === 0 ? views.find((view) => view.isDefault && Object.keys(view.query).length > 0) : undefined;
  if (defaultView) redirect(`/users/reports/${key}?${new URLSearchParams(defaultView.query).toString()}`);
  const people = scheduling ? (await listActiveUserOptions()).filter((person) => person.id !== user.id).map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` })) : [];
  const effective: Record<string, string> = { ...(query as Record<string, string>), scope: scope.kind, period: filter.period.key };
  if (filter.period.key === "custom") Object.assign(effective, { from: filter.period.from, to: filter.period.to });
  const download = (format: string) => `/api/reports/${key}?${new URLSearchParams({ ...effective, format }).toString()}`;

  return (
    <>
      <Breadcrumbs items={[{ href: "/users", label: "My work" }, { href: "/users/reports", label: "Reports" }, { label: report.name }]} />
      <PageHeader title={report.name} description={`${report.description} ${scope.label}${report.usesPeriod ? ` · ${filter.period.label} (${filter.period.from} to ${filter.period.to})` : " · right now"}.`}>
        {!exporting ? (
          <p className="text-caption text-ink-muted">Downloads are limited to people with the Can export permission.</p>
        ) : (
        <div className="flex flex-wrap gap-2">
          {(["xlsx", "csv", "pdf"] as const).map((format) => (
            <a key={format} href={download(format)} className="btn-secondary btn-compact inline-flex items-center gap-1.5" download>
              <Download aria-hidden="true" className="h-4 w-4" />
              {format === "xlsx" ? "Excel" : format.toUpperCase()}
            </a>
          ))}
        </div>
        )}
      </PageHeader>

      <form method="get" className="card mb-4 flex flex-wrap items-end gap-3 px-4 py-3" aria-label="Filters">
        {scopes.length > 1 && (
          <div>
            <label htmlFor="scope" className="field-label">
              Whose
            </label>
            <select id="scope" name="scope" defaultValue={scope.kind} className="field-input h-9 w-48">
              {scopes.map((item) => (
                <option key={item.kind} value={item.kind}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {report.usesPeriod && (
          <>
            <div>
              <label htmlFor="period" className="field-label">
                Period
              </label>
              <select id="period" name="period" defaultValue={filter.period.key} className="field-input h-9 w-48">
                {(Object.keys(PERIOD_LABEL) as PeriodKey[]).map((item) => (
                  <option key={item} value={item}>
                    {PERIOD_LABEL[item]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="from" className="field-label">
                From <span className="font-normal text-ink-faint">(custom)</span>
              </label>
              <input id="from" name="from" type="date" defaultValue={filter.period.from} className="field-input h-9" />
            </div>
            <div>
              <label htmlFor="to" className="field-label">
                To <span className="font-normal text-ink-faint">(custom)</span>
              </label>
              <input id="to" name="to" type="date" defaultValue={filter.period.to} className="field-input h-9" />
            </div>
          </>
        )}
        <div>
          <label htmlFor="type" className="field-label">
            Approval type
          </label>
          <select id="type" name="type" defaultValue={query.type ?? ""} className="field-input h-9 w-52">
            <option value="">All types</option>
            <option value="-1">Custom approvals</option>
            {choices.types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </div>
        {scope.kind === "ORGANISATION" && (
          <div>
            <label htmlFor="department" className="field-label">
              Raiser&apos;s department
            </label>
            <select id="department" name="department" defaultValue={query.department ?? ""} className="field-input h-9 w-52">
              <option value="">All departments</option>
              {choices.departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <button type="submit" className="btn-primary btn-compact">
          Apply
        </button>
      </form>

      <div className="mb-4 flex flex-wrap items-start gap-6">
        <SavedViews views={views.map((view) => ({ id: view.id, name: view.name, href: `/users/reports/${key}?${new URLSearchParams(view.query).toString()}`, mine: view.mine, shared: view.shared, isDefault: view.isDefault, ownerName: view.ownerName }))} />
        <SaveViewForm target={key} query={effective} />
        {scheduling && <ScheduleForm reportKey={key} query={effective} people={people} />}
        {exporting && <BackgroundExportForm reportKey={key} query={effective} truncated={result.truncated} />}
      </div>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <caption className="sr-only">{report.name}</caption>
          <thead>
            <tr>
              {result.columns.map((column) => (
                <th key={column.key} scope="col" className={column.kind === "text" || column.kind === "datetime" ? "" : "text-right"}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.slice(0, PREVIEW).map((row, index) => (
              <tr key={index}>
                {row.map((cell, cellIndex) => {
                  const column = result.columns[cellIndex]!;
                  return (
                    <td key={column.key} className={column.kind === "text" || column.kind === "datetime" ? "" : "text-right tabular-nums"}>
                      {show(cell, column)}
                    </td>
                  );
                })}
              </tr>
            ))}
            {result.rows.length === 0 && (
              <tr>
                <td colSpan={result.columns.length} className="text-ink-muted">
                  No rows for these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-caption text-ink-muted">
        {result.rows.length > PREVIEW ? `Showing the first ${PREVIEW} of ${result.rows.length} rows; downloads include all of them. ` : `${result.rows.length} row${result.rows.length === 1 ? "" : "s"}. `}
        {result.truncated ? "Downloads stop at 5,000 rows: narrow the filters for the rest. " : ""}As of {formatIndiaTime(new Date())}.
      </p>
    </>
  );
}
