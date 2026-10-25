import Link from "next/link";
import { Download } from "lucide-react";
import { PageHeader } from "@/features/shell/PageHeader";
import { EmptyState } from "@/features/ui/Display";
import { requireArea } from "@/server/authorization/guards";
import { canExport } from "@/server/settings/features";
import { listRecords, recordChoices, RECORDS_EXPORT_MAX, RECORDS_PAGE_SIZE } from "@/lib/db/repositories/records.repository";
import { INFO_PRIORITIES, INFO_STATUSES, readRecordFilter, recordQuery, REQUEST_STATUSES, TASK_PRIORITIES, TASK_STATUSES, type RecordFilter, type RecordKind } from "@/server/records/filters";
import { columnsFor, PRIORITY_LABEL, RECORD_HREF, RECORD_TITLE, STATUS_LABEL, type RecordColumn } from "@/server/records/columns";

// D-191 (owner): Admin → Records. Every approval request, task and
// information item, whoever raised it, in a spreadsheet-like table with
// filters, sorting and a CSV download (opens in Excel). IT Admin and Super
// Admin only (the Admin area); read-only.
const BASE: Record<RecordKind, string> = { requests: "/admin/records/requests", tasks: "/admin/records/tasks", information: "/admin/records/information" };
const PERSON_LABEL: Record<RecordKind, string> = { requests: "Raised by", tasks: "Assignee", information: "Created by" };
const DATE_LABEL: Record<RecordKind, string> = { requests: "Submitted", tasks: "Created", information: "Created" };

export async function RecordsRegister({ kind, searchParams }: { kind: RecordKind; searchParams: Record<string, string | undefined> }) {
  const { user } = await requireArea("admin");
  const filter = readRecordFilter(kind, searchParams);
  const [result, choices, mayExport] = await Promise.all([listRecords(kind, filter), recordChoices(kind), canExport(user)]);
  const columns = columnsFor(kind) as RecordColumn<(typeof result.rows)[number]>[];
  const statuses = kind === "requests" ? REQUEST_STATUSES : kind === "tasks" ? TASK_STATUSES : INFO_STATUSES;
  const priorities = kind === "tasks" ? TASK_PRIORITIES : kind === "information" ? INFO_PRIORITIES : [];
  const base = BASE[kind];
  const shown = result.rows.length;
  const firstRow = shown ? (result.page - 1) * RECORDS_PAGE_SIZE + 1 : 0;
  const filtered = Boolean(filter.q || filter.status || filter.type || filter.department || filter.person || filter.waitingOn || filter.priority || filter.overdue || filter.from || filter.to);

  return (
    <>
      <PageHeader
        title={RECORD_TITLE[kind]}
        description={`Every ${RECORD_TITLE[kind].toLowerCase()} record in the app, whoever raised it. Click a column title to sort; the download has every matching row (up to ${RECORDS_EXPORT_MAX.toLocaleString("en-IN")}) and opens in Excel.`}
        meta={`${result.total.toLocaleString("en-IN")} ${result.total === 1 ? "record" : "records"}${filtered ? " match the filters" : ""}`}
      >
        {mayExport && (
          <a href={`/api/admin/records/${kind}${recordQuery(filter, { page: null })}`} className="btn-secondary btn-compact" download>
            <Download aria-hidden="true" className="h-4 w-4" /> Download CSV
          </a>
        )}
      </PageHeader>

      <nav aria-label="Records" className="mb-4 flex flex-wrap gap-2" data-testid="records-tabs">
        {(Object.keys(BASE) as RecordKind[]).map((tab) => (
          <Link key={tab} href={BASE[tab]} aria-current={tab === kind ? "page" : undefined} className={`rounded-md px-3 py-1.5 text-label ${tab === kind ? "bg-primary-50 font-semibold text-primary-700" : "text-ink-muted hover:bg-surface-muted"}`}>
            {RECORD_TITLE[tab]}
          </Link>
        ))}
      </nav>

      <form method="get" action={base} role="search" className="card mb-4 grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-3 lg:grid-cols-6" data-testid="records-filters">
        {filter.sort !== "no" && <input type="hidden" name="sort" value={filter.sort} />}
        {filter.dir !== "desc" && <input type="hidden" name="dir" value={filter.dir} />}
        <div className="col-span-2">
          <label htmlFor="rq" className="field-label">
            Search
          </label>
          <input id="rq" name="q" defaultValue={filter.q} placeholder="Number, title or person" className="field-input h-10" />
        </div>
        <Choice name="status" label="Status" value={filter.status} options={statuses.map((status) => [status, kind === "tasks" && status === "CANCELLED" ? "Cancelled" : STATUS_LABEL[status] ?? status])} />
        <Choice name="type" label="Type" value={filter.type ?? ""} options={choices.types.map((type) => [String(type.id), type.name])} />
        <Choice name="department" label="Department" value={filter.department ?? ""} options={choices.departments.map((department) => [String(department.id), department.name])} />
        <Choice name="person" label={PERSON_LABEL[kind]} value={filter.person ?? ""} options={choices.people.map((person) => [String(person.id), person.name])} />
        {kind === "requests" && <Choice name="waiting" label="Waiting on" value={filter.waitingOn ?? ""} options={choices.people.map((person) => [String(person.id), person.name])} />}
        {priorities.length > 0 && <Choice name="priority" label="Priority" value={filter.priority} options={priorities.map((priority) => [priority, PRIORITY_LABEL[priority] ?? priority])} />}
        <div>
          <label htmlFor="rfrom" className="field-label">
            {DATE_LABEL[kind]} from
          </label>
          <input id="rfrom" type="date" name="from" defaultValue={filter.from ?? ""} className="field-input h-10" />
        </div>
        <div>
          <label htmlFor="rto" className="field-label">
            {DATE_LABEL[kind]} to
          </label>
          <input id="rto" type="date" name="to" defaultValue={filter.to ?? ""} className="field-input h-10" />
        </div>
        {kind === "tasks" && (
          <label className="flex items-end gap-2 pb-2.5 text-label">
            <input type="checkbox" name="overdue" value="1" defaultChecked={filter.overdue} className="h-4 w-4 accent-[var(--color-primary-solid)]" /> Overdue only
          </label>
        )}
        <div className="col-span-2 flex items-end gap-2 sm:col-span-1">
          <button type="submit" className="btn-primary btn-compact w-auto">
            Apply
          </button>
          {filtered && (
            <Link href={base} className="btn-secondary btn-compact">
              Clear
            </Link>
          )}
        </div>
      </form>

      {shown === 0 ? (
        <EmptyState title="No records" body={filtered ? "Nothing matches these filters." : `No ${RECORD_TITLE[kind].toLowerCase()} yet.`} />
      ) : (
        <div className="card overflow-hidden">
          <div className="max-h-[70vh] overflow-auto" data-testid="records-table">
            <table className="w-max min-w-full border-collapse text-label">
              <caption className="sr-only">{RECORD_TITLE[kind]}</caption>
              <thead className="sticky top-0 z-10 bg-surface-muted">
                <tr>
                  <th scope="col" className="sticky left-0 z-20 w-12 border-b border-r border-line bg-surface-muted px-2 py-2 text-right font-medium text-ink-faint">
                    #
                  </th>
                  {columns.map((column) => (
                    <th key={column.key} scope="col" aria-sort={column.sort && filter.sort === column.sort ? (filter.dir === "asc" ? "ascending" : "descending") : undefined} className="whitespace-nowrap border-b border-r border-line px-3 py-2 text-left font-medium text-ink-muted">
                      {column.sort ? <SortLink filter={filter} base={base} column={column.sort} label={column.label} /> : column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, index) => (
                  <tr key={row.id} className="odd:bg-surface even:bg-page hover:bg-primary-50/60">
                    <td className="sticky left-0 border-b border-r border-line bg-inherit px-2 py-1.5 text-right tabular-nums text-ink-faint">{firstRow + index}</td>
                    {columns.map((column) => (
                      <td key={column.key} className={`border-b border-r border-line px-3 py-1.5 align-top ${column.wide ? "min-w-[14rem] max-w-[22rem]" : "whitespace-nowrap"}`}>
                        {column.key === "no" ? (
                          <Link href={RECORD_HREF[kind](row.id)} className="link font-medium">
                            {column.value(row)}
                          </Link>
                        ) : column.key === "overdue" && column.value(row) ? (
                          <span className="font-medium text-danger-600">{column.value(row)}</span>
                        ) : (
                          column.value(row)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2 text-label text-ink-muted">
            <span>
              Rows {firstRow.toLocaleString("en-IN")}–{(firstRow + shown - 1).toLocaleString("en-IN")} of {result.total.toLocaleString("en-IN")}
            </span>
            <span className="flex gap-2">
              {result.page > 1 && (
                <Link href={`${base}${recordQuery(filter, { page: result.page - 1 })}`} className="btn-secondary btn-compact" rel="prev">
                  Previous
                </Link>
              )}
              {result.page < result.pages && (
                <Link href={`${base}${recordQuery(filter, { page: result.page + 1 })}`} className="btn-secondary btn-compact" rel="next">
                  Next
                </Link>
              )}
            </span>
          </div>
        </div>
      )}
    </>
  );
}

function Choice({ name, label, value, options }: { name: string; label: string; value: string | number; options: (readonly [string, string])[] }) {
  return (
    <div>
      <label htmlFor={`r-${name}`} className="field-label">
        {label}
      </label>
      <select id={`r-${name}`} name={name} defaultValue={String(value)} className="field-input h-10">
        <option value="">All</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </div>
  );
}

function SortLink({ filter, base, column, label }: { filter: RecordFilter; base: string; column: string; label: string }) {
  const active = filter.sort === column;
  const dir = active && filter.dir === "desc" ? "asc" : "desc";
  return (
    <Link href={`${base}${recordQuery(filter, { sort: column === "no" ? null : column, dir: dir === "desc" ? null : dir, page: null })}`} className="inline-flex items-center gap-1 hover:text-ink">
      {label}
      <span aria-hidden="true" className={active ? "text-ink" : "text-ink-faint"}>
        {active ? (filter.dir === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </Link>
  );
}
