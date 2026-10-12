import Link from "next/link";
import { X } from "lucide-react";
import { RequestStatusPill } from "@/features/requests/StatusPill";
import { PendingLink } from "@/features/ui/PendingLink";
import { SafeText } from "@/features/ui/SafeText";
import { SavedViews, SaveViewForm, type ViewChip } from "@/features/analytics/ReportForms";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import type { ListChoices, ListedRequest } from "@/lib/db/repositories/request-lists.repository";
import { activeCount, LIST_SIZES, LIST_SORTS, LIST_STATUSES, listHref, listQuery, QUICK_TABS, SORT_LABEL, STATUS_LABEL, VALIDITY, VALIDITY_LABEL, type ListBase, type ListFilters, type QuickTab } from "@/server/requests/list-filters";

// v1.7.2: the filtered list used by My requests and Collaborating. Plain GET
// forms (every filter is in the address, so it can be bookmarked, shared
// with yourself as a saved view, and Back keeps it).
const day = (value: Date) => new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

export function RequestListScreen({
  base,
  path,
  filters,
  result,
  counts,
  choices,
  views,
  empty,
}: {
  base: ListBase;
  path: string;
  filters: ListFilters;
  result: { items: ListedRequest[]; total: number; page: number; pages: number };
  counts: Record<QuickTab, number>;
  choices: ListChoices;
  views: ViewChip[];
  empty: string;
}) {
  const collab = base === "COLLAB";
  const used = activeCount(filters);
  const nameOf = (list: { id: number; name: string }[], id: number | null) => list.find((item) => item.id === id)?.name ?? "chosen";
  type Chip = { label: string; remove: Partial<ListFilters> };
  const candidates: (Chip | null)[] = [
    filters.q ? { label: `Search: ${filters.q}`, remove: { q: "" } } : null,
    filters.statuses.length ? { label: `Status: ${filters.statuses.map((status) => STATUS_LABEL[status]).join(", ")}`, remove: { statuses: [] } } : null,
    filters.typeId !== null ? { label: `Type: ${filters.typeId === -1 ? "Custom approvals" : nameOf(choices.types, filters.typeId)}`, remove: { typeId: null } } : null,
    filters.requesterId !== null ? { label: `Raised by: ${nameOf(choices.requesters, filters.requesterId)}`, remove: { requesterId: null } } : null,
    filters.departmentId !== null ? { label: `Department: ${nameOf(choices.departments, filters.departmentId)}`, remove: { departmentId: null } } : null,
    filters.addedById !== null ? { label: `Added by: ${nameOf(choices.addedBy, filters.addedById)}`, remove: { addedById: null } } : null,
    filters.step ? { label: `Waiting at: ${filters.step}`, remove: { step: null } } : null,
    filters.waitingWithId !== null ? { label: `Waiting with: ${nameOf(choices.waitingWith, filters.waitingWithId)}`, remove: { waitingWithId: null } } : null,
    filters.overdue && filters.tab !== "overdue" ? { label: "Overdue", remove: { overdue: false } } : null,
    filters.dueWithinDays !== null ? { label: `Due within ${filters.dueWithinDays} day${filters.dueWithinDays === 1 ? "" : "s"}`, remove: { dueWithinDays: null } } : null,
    filters.hasFiles !== null ? { label: filters.hasFiles ? "With files" : "Without files", remove: { hasFiles: null } } : null,
    filters.validity ? { label: VALIDITY_LABEL[filters.validity], remove: { validity: null } } : null,
    filters.raisedFrom || filters.raisedTo ? { label: `Raised ${filters.raisedFrom ?? "…"} to ${filters.raisedTo ?? "…"}`, remove: { raisedFrom: null, raisedTo: null } } : null,
    filters.addedFrom || filters.addedTo ? { label: `Added ${filters.addedFrom ?? "…"} to ${filters.addedTo ?? "…"}`, remove: { addedFrom: null, addedTo: null } } : null,
    filters.closedFrom || filters.closedTo ? { label: `Closed ${filters.closedFrom ?? "…"} to ${filters.closedTo ?? "…"}`, remove: { closedFrom: null, closedTo: null } } : null,
    filters.activityFrom || filters.activityTo ? { label: `Activity ${filters.activityFrom ?? "…"} to ${filters.activityTo ?? "…"}`, remove: { activityFrom: null, activityTo: null } } : null,
  ];
  const chips = candidates.filter((chip): chip is Chip => chip !== null);
  const select = "field-input h-10";
  const dates = (name: string, label: string, from: string | null, to: string | null) => (
    <fieldset className="min-w-0">
      <legend className="field-label">{label}</legend>
      <div className="flex items-center gap-1.5">
        <input type="date" name={`${name}From`} defaultValue={from ?? ""} aria-label={`${label} from`} className={`${select} min-w-0`} />
        <span className="text-caption text-ink-muted">to</span>
        <input type="date" name={`${name}To`} defaultValue={to ?? ""} aria-label={`${label} to`} className={`${select} min-w-0`} />
      </div>
    </fieldset>
  );

  return (
    <>
      <nav aria-label="Quick filters" className="mb-3 flex flex-wrap gap-2">
        {QUICK_TABS.map((tab) => (
          <Link
            key={tab.key}
            href={listHref(path, filters, { tab: tab.key, page: 1, overdue: tab.key === "overdue" ? true : filters.tab === "overdue" ? false : filters.overdue })}
            aria-current={filters.tab === tab.key ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-label ${filters.tab === tab.key ? "border-primary-600 bg-primary-50 font-semibold text-primary-700" : "border-line text-ink-muted hover:bg-surface-muted"}`}
          >
            {tab.label} <span className="tabular-nums">({counts[tab.key].toLocaleString("en-IN")})</span>
          </Link>
        ))}
      </nav>

      <form method="get" action={path} className="card mb-3 space-y-3 px-4 py-3" role="search" aria-label="Filter requests">
        {filters.tab !== "all" && <input type="hidden" name="tab" value={filters.tab} />}
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-64">
            <label htmlFor="list-q" className="field-label">
              Search
            </label>
            <input id="list-q" name="q" defaultValue={filters.q} placeholder={collab ? "Request number, title or who raised it" : "Request number or title"} className="field-input" />
          </div>
          <div>
            <label htmlFor="list-sort" className="field-label">
              Order
            </label>
            <select id="list-sort" name="sort" defaultValue={filters.sort} className={select}>
              {LIST_SORTS.filter((sort) => collab || sort !== "added").map((sort) => (
                <option key={sort} value={sort}>
                  {SORT_LABEL[sort]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="list-size" className="field-label">
              Per page
            </label>
            <select id="list-size" name="size" defaultValue={filters.size} className={`${select} w-24`}>
              {LIST_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary btn-compact h-10">
            Apply
          </button>
          {(used > 0 || filters.tab !== "all") && (
            <Link href={path} className="link text-label">
              Clear all
            </Link>
          )}
        </div>
        <details open={used > (filters.q ? 1 : 0)} className="text-label">
          <summary className="cursor-pointer font-semibold text-primary-600">More filters{used ? ` (${used} in use)` : ""}</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <fieldset className="sm:col-span-2 lg:col-span-3">
              <legend className="field-label">Status</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {LIST_STATUSES.map((status) => (
                  <label key={status} className="flex items-center gap-2">
                    <input type="checkbox" name="status" value={status} defaultChecked={filters.statuses.includes(status)} />
                    {STATUS_LABEL[status]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor="list-type" className="field-label">
                Approval type
              </label>
              <select id="list-type" name="type" defaultValue={filters.typeId ?? ""} className={select}>
                <option value="">Any</option>
                {choices.hasCustom && <option value="-1">Custom approvals</option>}
                {choices.types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </div>
            {collab && (
              <>
                <div>
                  <label htmlFor="list-raisedby" className="field-label">
                    Raised by
                  </label>
                  <select id="list-raisedby" name="raisedBy" defaultValue={filters.requesterId ?? ""} className={select}>
                    <option value="">Anyone</option>
                    {choices.requesters.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="list-dept" className="field-label">
                    Their department
                  </label>
                  <select id="list-dept" name="dept" defaultValue={filters.departmentId ?? ""} className={select}>
                    <option value="">Any</option>
                    {choices.departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="list-addedby" className="field-label">
                    Added me
                  </label>
                  <select id="list-addedby" name="addedBy" defaultValue={filters.addedById ?? ""} className={select}>
                    <option value="">Anyone</option>
                    {choices.addedBy.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
            <div>
              <label htmlFor="list-step" className="field-label">
                Waiting at step
              </label>
              <select id="list-step" name="step" defaultValue={filters.step ?? ""} className={select}>
                <option value="">Any</option>
                {choices.steps.map((step) => (
                  <option key={step} value={step}>
                    {step}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="list-waiting" className="field-label">
                Waiting with
              </label>
              <select id="list-waiting" name="waitingWith" defaultValue={filters.waitingWithId ?? ""} className={select}>
                <option value="">Anyone</option>
                {choices.waitingWith.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="list-due" className="field-label">
                Due within
              </label>
              <select id="list-due" name="due" defaultValue={filters.dueWithinDays ?? ""} className={select}>
                <option value="">Any time</option>
                {[1, 2, 3, 7, 14, 30].map((days) => (
                  <option key={days} value={days}>
                    {days} day{days === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="list-files" className="field-label">
                Files
              </label>
              <select id="list-files" name="files" defaultValue={filters.hasFiles === null ? "" : filters.hasFiles ? "yes" : "no"} className={select}>
                <option value="">Either</option>
                <option value="yes">With files</option>
                <option value="no">Without files</option>
              </select>
            </div>
            <div>
              <label htmlFor="list-validity" className="field-label">
                Approval validity
              </label>
              <select id="list-validity" name="validity" defaultValue={filters.validity ?? ""} className={select}>
                <option value="">Any</option>
                {VALIDITY.map((value) => (
                  <option key={value} value={value}>
                    {VALIDITY_LABEL[value]}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 self-end pb-2">
              <input type="checkbox" name="overdue" value="1" defaultChecked={filters.overdue && filters.tab !== "overdue"} />
              Overdue only
            </label>
            {dates("raised", "Raised", filters.raisedFrom, filters.raisedTo)}
            {collab && dates("added", "Added me", filters.addedFrom, filters.addedTo)}
            {dates("closed", "Closed", filters.closedFrom, filters.closedTo)}
            {dates("activity", "Last activity", filters.activityFrom, filters.activityTo)}
          </div>
        </details>
      </form>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-label">
        <p className="text-ink-muted" role="status">
          {result.total === 0 ? "No requests match." : `${result.total.toLocaleString("en-IN")} request${result.total === 1 ? "" : "s"}${result.pages > 1 ? ` · page ${result.page} of ${result.pages}` : ""}`}
        </p>
        {chips.map((chip) => (
          <Link key={chip.label} href={listHref(path, filters, { ...chip.remove, page: 1 })} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-0.5 text-caption font-medium hover:bg-surface-muted" aria-label={`Remove filter: ${chip.label}`}>
            {chip.label}
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-start gap-6">
        <SavedViews views={views} />
        <SaveViewForm target={collab ? "collaborating" : "my_requests"} query={listQuery({ ...filters, page: 1 })} />
      </div>

      {result.items.length === 0 ? (
        <p className="card px-5 py-6 text-label text-ink-muted">
          {used || filters.tab !== "all" ? (
            <>
              Nothing matches these filters.{" "}
              <Link href={path} className="link">
                Show everything
              </Link>
            </>
          ) : (
            empty
          )}
        </p>
      ) : (
        <>
          <ul className="card divide-y divide-line sm:hidden" data-testid="request-cards">
            {result.items.map((item) => (
              <li key={item.id}>
                <Link href={`/users/requests/${item.id}`} className="block px-4 py-3 active:bg-surface-muted">
                  <p className="font-medium text-primary-700">
                    <SafeText text={item.title} />
                  </p>
                  <p className="text-caption text-ink-muted">
                    {item.requestNo} · {item.workflowName}
                    {collab ? ` · from ${item.requesterName}` : ""}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-caption">
                    <RequestStatusPill status={item.status} />
                    {item.pendingWith && <span className="text-ink-muted">With {item.pendingWith}</span>}
                    {item.overdue && <span className="font-semibold text-danger-600">Overdue</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="card hidden overflow-x-auto sm:block">
            <table className="data-table" data-testid="request-table">
              <caption className="sr-only">Requests</caption>
              <thead>
                <tr>
                  <th scope="col">Request</th>
                  <th scope="col">Status</th>
                  <th scope="col">Waiting</th>
                  {collab && <th scope="col">Raised by</th>}
                  <th scope="col">Raised</th>
                  <th scope="col" className="hidden lg:table-cell">
                    Last activity
                  </th>
                  {collab && (
                    <th scope="col" className="hidden xl:table-cell">
                      Added
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {result.items.map((item) => (
                  <tr key={item.id}>
                    <td className="max-w-80">
                      <Link href={`/users/requests/${item.id}`} className="link font-medium">
                        <SafeText text={item.title} />
                      </Link>
                      <span className="block text-caption text-ink-muted">
                        {item.requestNo} · {item.workflowName}
                        {item.files ? ` · ${item.files} file${item.files === 1 ? "" : "s"}` : ""}
                      </span>
                    </td>
                    <td>
                      <RequestStatusPill status={item.status} />
                      {item.validUntil && item.status === "APPROVED" && <span className="block text-caption text-ink-muted">valid until {day(item.validUntil)}</span>}
                    </td>
                    <td className="text-label">
                      {item.pendingStep ? (
                        <>
                          {item.pendingStep}
                          <span className="block text-caption text-ink-muted">{item.pendingWith}</span>
                          {item.nextDue && <span className={`block text-caption ${item.overdue ? "font-semibold text-danger-600" : "text-ink-muted"}`}>{item.overdue ? "Overdue since" : "Due"} {formatIndiaTime(item.nextDue)}</span>}
                        </>
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
                    </td>
                    {collab && <td>{item.requesterName}</td>}
                    <td className="whitespace-nowrap">{day(item.submittedAt)}</td>
                    <td className="hidden whitespace-nowrap lg:table-cell">{formatIndiaTime(item.updatedAt)}</td>
                    {collab && (
                      <td className="hidden whitespace-nowrap xl:table-cell">
                        {item.addedAt ? day(item.addedAt) : "—"}
                        <span className="block text-caption text-ink-muted">by {item.addedByName}</span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {result.pages > 1 && (
        <nav aria-label="Pages" className="mt-4 flex items-center gap-3 text-label">
          {result.page > 1 && (
            <PendingLink href={listHref(path, filters, { page: result.page - 1 })} className="btn-secondary btn-compact">
              ← Previous
            </PendingLink>
          )}
          <span className="text-ink-muted">
            Page {result.page} of {result.pages}
          </span>
          {result.page < result.pages && (
            <PendingLink href={listHref(path, filters, { page: result.page + 1 })} className="btn-secondary btn-compact">
              Next →
            </PendingLink>
          )}
        </nav>
      )}
    </>
  );
}
