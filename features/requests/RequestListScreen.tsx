import Link from "next/link";
import { X } from "lucide-react";
import { RequestStatusPill } from "@/features/requests/StatusPill";
import { PendingLink } from "@/features/ui/PendingLink";
import { SafeText } from "@/features/ui/SafeText";
import { SavedViews, SaveViewForm, type ViewChip } from "@/features/analytics/ReportForms";
import { ListToolbar } from "@/features/ui/ListToolbar";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import type { ListChoices, ListedRequest } from "@/lib/db/repositories/request-lists.repository";
import {
  activeCount,
  BASE_FEATURES,
  GROUP_LABEL,
  groupsFor,
  LIST_SIZES,
  LIST_STATUSES,
  listHref,
  listQuery,
  SORT_LABEL,
  STATUS_LABEL,
  tabsFor,
  VALIDITY,
  VALIDITY_LABEL,
  type ListBase,
  type ListFilters,
  type QuickTab,
} from "@/server/requests/list-filters";

// v1.7.2: the filtered list used by My requests and Collaborating; v1.8.0
// also My approved requests and Approved by me. Plain GET forms (every
// filter is in the address, so it can be bookmarked, saved as a view, and
// Back keeps it). Each list shows only the filters that apply to it.
const month = (value: Date) => new Date(value).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
const day = (value: Date) => new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

export const VIEW_TARGET: Record<ListBase, string> = { MINE: "my_requests", COLLAB: "collaborating", APPROVED_MINE: "my_approved", APPROVED_BY_ME: "approved_by_me" };

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
  const can = BASE_FEATURES[base];
  const collab = base === "COLLAB";
  const approvedMine = base === "APPROVED_MINE";
  const byMe = base === "APPROVED_BY_ME";
  const showRaiser = collab || byMe;
  const tabs = tabsFor(base);
  const currentTab = tabs.find((tab) => tab.key === filters.tab);
  const used = activeCount(filters, base);
  const href = (changes: Partial<ListFilters>) => listHref(path, filters, changes, base);
  const nameOf = (list: { id: number; name: string }[], id: number | null) => list.find((item) => item.id === id)?.name ?? "chosen";
  const closedLabel = approvedMine ? "Approved on" : "Closed";
  type Chip = { label: string; remove: Partial<ListFilters> };
  const candidates: (Chip | null)[] = [
    filters.q ? { label: `Search: ${filters.q}`, remove: { q: "" } } : null,
    filters.statuses.length ? { label: `Status: ${filters.statuses.map((status) => STATUS_LABEL[status]).join(", ")}`, remove: { statuses: [] } } : null,
    filters.typeId !== null ? { label: `Type: ${filters.typeId === -1 ? "Custom approvals" : nameOf(choices.types, filters.typeId)}`, remove: { typeId: null } } : null,
    filters.requesterId !== null ? { label: `Raised by: ${nameOf(choices.requesters, filters.requesterId)}`, remove: { requesterId: null } } : null,
    filters.departmentId !== null ? { label: `Department: ${nameOf(choices.departments, filters.departmentId)}`, remove: { departmentId: null } } : null,
    filters.addedById !== null ? { label: `Added by: ${nameOf(choices.addedBy, filters.addedById)}`, remove: { addedById: null } } : null,
    filters.approvedById !== null ? { label: `Approved by: ${nameOf(choices.approvedBy, filters.approvedById)}`, remove: { approvedById: null } } : null,
    filters.myStep ? { label: `I approved at: ${filters.myStep}`, remove: { myStep: null } } : null,
    filters.onBehalf !== null ? { label: filters.onBehalf ? "Approved for someone else" : "Approved as myself", remove: { onBehalf: null } } : null,
    filters.amended !== null ? { label: filters.amended ? "Amended" : "Not amended", remove: { amended: null } } : null,
    filters.step ? { label: `Waiting at: ${filters.step}`, remove: { step: null } } : null,
    filters.waitingWithId !== null ? { label: `Waiting with: ${nameOf(choices.waitingWith, filters.waitingWithId)}`, remove: { waitingWithId: null } } : null,
    filters.overdue && !currentTab?.overdue ? { label: "Overdue", remove: { overdue: false } } : null,
    filters.dueWithinDays !== null ? { label: `Due within ${filters.dueWithinDays} day${filters.dueWithinDays === 1 ? "" : "s"}`, remove: { dueWithinDays: null } } : null,
    filters.hasFiles !== null ? { label: filters.hasFiles ? "With files" : "Without files", remove: { hasFiles: null } } : null,
    filters.validity ? { label: VALIDITY_LABEL[filters.validity], remove: { validity: null } } : null,
    filters.raisedFrom || filters.raisedTo ? { label: `Raised ${filters.raisedFrom ?? "…"} to ${filters.raisedTo ?? "…"}`, remove: { raisedFrom: null, raisedTo: null } } : null,
    filters.addedFrom || filters.addedTo ? { label: `Added ${filters.addedFrom ?? "…"} to ${filters.addedTo ?? "…"}`, remove: { addedFrom: null, addedTo: null } } : null,
    filters.closedFrom || filters.closedTo ? { label: `${closedLabel} ${filters.closedFrom ?? "…"} to ${filters.closedTo ?? "…"}`, remove: { closedFrom: null, closedTo: null } } : null,
    filters.mineFrom || filters.mineTo ? { label: `I approved ${filters.mineFrom ?? "…"} to ${filters.mineTo ?? "…"}`, remove: { mineFrom: null, mineTo: null } } : null,
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
  const people = (id: string, name: string, label: string, value: number | null, list: { id: number; name: string }[], any = "Anyone") => (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <select id={id} name={name} defaultValue={value ?? ""} className={select}>
        <option value="">{any}</option>
        {list.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </div>
  );
  const yesNo = (id: string, name: string, label: string, value: boolean | null, yes: string, no: string) => (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <select id={id} name={name} defaultValue={value === null ? "" : value ? "yes" : "no"} className={select}>
        <option value="">Either</option>
        <option value="yes">{yes}</option>
        <option value="no">{no}</option>
      </select>
    </div>
  );

  // D-226: rows in groups (this page's rows), like the task table.
  const groupOf = (item: ListedRequest): [string, string] =>
    filters.group === "status"
      ? [item.status, item.status === "IN_PROGRESS" ? "Waiting for approvers" : (STATUS_LABEL[item.status as keyof typeof STATUS_LABEL] ?? item.status)]
      : filters.group === "type"
        ? [item.workflowName, item.workflowName]
        : filters.group === "month"
          ? [month(item.submittedAt), month(item.submittedAt)]
          : filters.group === "raiser"
            ? [item.requesterName, item.requesterName]
            : ["all", ""];
  const grouped: { key: string; label: string; items: ListedRequest[] }[] = [];
  for (const item of result.items) {
    const [key, label] = groupOf(item);
    const found = grouped.find((group) => group.key === key);
    if (found) found.items.push(item);
    else grouped.push({ key, label, items: [item] });
  }
  const columns = 5 + (showRaiser ? 1 : 0) + (collab ? 1 : 0);
  const sortChoices = can.sorts.map((value) => ({ label: SORT_LABEL[value], href: href({ sort: value, page: 1 }), active: filters.sort === value }));

  return (
    <>
      <nav aria-label="Quick filters" className="mb-3 flex flex-wrap gap-x-1 border-b border-line">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={href({ tab: tab.key, page: 1, overdue: tab.overdue ? true : currentTab?.overdue ? false : filters.overdue })}
            aria-current={filters.tab === tab.key ? "page" : undefined}
            className={`-mb-px border-b-2 px-2.5 py-1.5 text-label ${filters.tab === tab.key ? "border-primary-600 font-semibold text-primary-700" : "border-transparent text-ink-muted hover:text-ink"}`}
          >
            {tab.label} <span className="tabular-nums">({(counts[tab.key] ?? 0).toLocaleString("en-IN")})</span>
          </Link>
        ))}
      </nav>

      <ListToolbar
        id="request-filters"
        path={path}
        label="Filter requests"
        keep={{ tab: filters.tab !== "all" ? filters.tab : undefined, ...Object.fromEntries(Object.entries(listQuery({ sort: filters.sort, size: filters.size, group: filters.group }, {}, base))) }}
        search={{ name: "q", value: filters.q, placeholder: showRaiser ? "Number, title or who raised it" : "Number or title" }}
        filterCount={used - (filters.q ? 1 : 0)}
        clearHref={used > 0 || filters.tab !== "all" ? path : null}
        filters={
          <>
            {can.status && (
              <fieldset className="sm:col-span-2">
                <legend className="field-label">{byMe ? "Where the request is now" : "Status"}</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {LIST_STATUSES.map((status) => (
                    <label key={status} className="flex items-center gap-2">
                      <input type="checkbox" name="status" value={status} defaultChecked={filters.statuses.includes(status)} />
                      {STATUS_LABEL[status]}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
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
            {can.people && people("list-raisedby", "raisedBy", "Raised by", filters.requesterId, choices.requesters)}
            {can.people && people("list-dept", "dept", "Their department", filters.departmentId, choices.departments, "Any")}
            {can.collab && people("list-addedby", "addedBy", "Added me", filters.addedById, choices.addedBy)}
            {can.approvedBy && people("list-approvedby", "approvedBy", "Approved by", filters.approvedById, choices.approvedBy)}
            {can.mine && (
              <div>
                <label htmlFor="list-mystep" className="field-label">
                  Step I approved
                </label>
                <select id="list-mystep" name="myStep" defaultValue={filters.myStep ?? ""} className={select}>
                  <option value="">Any</option>
                  {choices.mySteps.map((step) => (
                    <option key={step} value={step}>
                      {step}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {can.mine && yesNo("list-behalf", "onBehalf", "Approved for", filters.onBehalf, "Someone I cover", "Myself")}
            {can.amended && yesNo("list-amended", "amended", "Amendments", filters.amended, "Amended", "Not amended")}
            {can.waiting && (
              <>
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
                {people("list-waiting", "waitingWith", "Waiting with", filters.waitingWithId, choices.waitingWith)}
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
              </>
            )}
            {yesNo("list-files", "files", "Files", filters.hasFiles, "With files", "Without files")}
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
            {can.waiting && (
              <label className="flex items-center gap-2 self-end pb-2">
                <input type="checkbox" name="overdue" value="1" defaultChecked={filters.overdue && !currentTab?.overdue} />
                Overdue only
              </label>
            )}
            {dates("raised", "Raised", filters.raisedFrom, filters.raisedTo)}
            {can.collab && dates("added", "Added me", filters.addedFrom, filters.addedTo)}
            {can.mine && dates("mine", "I approved", filters.mineFrom, filters.mineTo)}
            {dates("closed", closedLabel, filters.closedFrom, filters.closedTo)}
            {dates("activity", "Last activity", filters.activityFrom, filters.activityTo)}
          </>
        }
        sort={{ label: SORT_LABEL[filters.sort], changed: filters.sort !== can.sorts[0], choices: sortChoices }}
        group={{
          label: filters.group ? GROUP_LABEL[filters.group] : null,
          clearHref: href({ group: null, page: 1 }),
          choices: groupsFor(base).map((value) => ({ label: GROUP_LABEL[value], href: href({ group: value, page: 1 }), active: filters.group === value })),
        }}
        sizes={LIST_SIZES.map((size) => ({ label: `${size} per page`, href: href({ size, page: 1 }), active: filters.size === size }))}
        options={<SaveViewForm target={VIEW_TARGET[base]} query={listQuery({ ...filters, page: 1 }, {}, base)} />}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2 text-label">
        <p className="text-ink-muted" role="status">
          {result.total === 0 ? "No requests match." : `${result.total.toLocaleString("en-IN")} request${result.total === 1 ? "" : "s"}${result.pages > 1 ? ` · page ${result.page} of ${result.pages}` : ""}`}
        </p>
        {chips.map((chip) => (
          <Link
            key={chip.label}
            href={href({ ...chip.remove, page: 1 })}
            className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-0.5 text-caption font-medium hover:bg-surface-muted"
            aria-label={`Remove filter: ${chip.label}`}
          >
            {chip.label}
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        ))}
      </div>
      {views.length > 0 && (
        <div className="mb-4">
          <SavedViews views={views} />
        </div>
      )}

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
            {grouped.map((group) => [
              group.label ? (
                <li key={`group-${group.key}`} className="bg-surface-muted px-4 py-1.5 text-label font-semibold">
                  {group.label} <span className="font-normal text-ink-muted">{group.items.length}</span>
                </li>
              ) : null,
              ...group.items.map((item) => (
                <li key={item.id}>
                  <Link href={`/users/requests/${item.id}`} className="block px-4 py-3 active:bg-surface-muted">
                    <p className="font-medium text-primary-700">
                      <SafeText text={item.title} />
                    </p>
                    <p className="text-caption text-ink-muted">
                      {item.requestNo} · {item.workflowName}
                      {showRaiser ? ` · from ${item.requesterName}` : ""}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-caption">
                      <RequestStatusPill status={item.status} />
                      {byMe && item.myApprovedAt && <span className="text-ink-muted">You approved {day(item.myApprovedAt)}</span>}
                      {approvedMine && item.closedAt && <span className="text-ink-muted">Approved {day(item.closedAt)}</span>}
                      {item.pendingWith && <span className="text-ink-muted">With {item.pendingWith}</span>}
                      {item.overdue && <span className="font-semibold text-danger-600">Overdue</span>}
                    </div>
                  </Link>
                </li>
              )),
            ])}
          </ul>
          <div className="card hidden overflow-x-auto sm:block">
            <table className="data-table" data-testid="request-table">
              <caption className="sr-only">Requests</caption>
              <thead>
                <tr>
                  <th scope="col">Request</th>
                  <th scope="col">Status</th>
                  {approvedMine ? <th scope="col">Approved</th> : byMe ? <th scope="col">Your approval</th> : <th scope="col">Waiting</th>}
                  {showRaiser && <th scope="col">Raised by</th>}
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
              {grouped.map((group) => (
                <tbody key={group.key}>
                  {group.label && (
                    <tr className="bg-surface-muted">
                      <th scope="rowgroup" colSpan={columns} className="text-left text-label font-semibold">
                        {group.label} <span className="font-normal text-ink-muted">{group.items.length}</span>
                      </th>
                    </tr>
                  )}
                  {group.items.map((item) => (
                    <tr key={item.id}>
                      <td className="max-w-80">
                        <Link href={`/users/requests/${item.id}`} className="link font-medium">
                          <SafeText text={item.title} />
                        </Link>
                        <span className="block text-caption text-ink-muted">
                          {item.requestNo} · {item.workflowName}
                          {item.files ? ` · ${item.files} file${item.files === 1 ? "" : "s"}` : ""}
                          {item.amended ? " · amended" : ""}
                        </span>
                      </td>
                      <td>
                        <RequestStatusPill status={item.status} />
                        {item.validUntil && item.status === "APPROVED" && <span className="block text-caption text-ink-muted">valid until {day(item.validUntil)}</span>}
                      </td>
                      {approvedMine ? (
                        <td className="text-label">
                          {item.closedAt ? day(item.closedAt) : "—"}
                          {item.approvedBy && <span className="block text-caption text-ink-muted">by {item.approvedBy}</span>}
                        </td>
                      ) : byMe ? (
                        <td className="text-label">
                          {item.myApprovedAt ? formatIndiaTime(item.myApprovedAt) : "—"}
                          {item.myStep && <span className="block text-caption text-ink-muted">{item.myStep}</span>}
                          {item.myForName && <span className="block text-caption text-ink-muted">for {item.myForName}</span>}
                        </td>
                      ) : (
                        <td className="text-label">
                          {item.pendingStep ? (
                            <>
                              {item.pendingStep}
                              <span className="block text-caption text-ink-muted">{item.pendingWith}</span>
                              {item.nextDue && (
                                <span className={`block text-caption ${item.overdue ? "font-semibold text-danger-600" : "text-ink-muted"}`}>
                                  {item.overdue ? "Overdue since" : "Due"} {formatIndiaTime(item.nextDue)}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-ink-faint">—</span>
                          )}
                        </td>
                      )}
                      {showRaiser && <td>{item.requesterName}</td>}
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
              ))}
            </table>
          </div>
        </>
      )}
      {result.pages > 1 && (
        <nav aria-label="Pages" className="mt-4 flex items-center gap-3 text-label">
          {result.page > 1 && (
            <PendingLink href={href({ page: result.page - 1 })} className="btn-secondary btn-compact">
              ← Previous
            </PendingLink>
          )}
          <span className="text-ink-muted">
            Page {result.page} of {result.pages}
          </span>
          {result.page < result.pages && (
            <PendingLink href={href({ page: result.page + 1 })} className="btn-secondary btn-compact">
              Next →
            </PendingLink>
          )}
        </nav>
      )}
    </>
  );
}
