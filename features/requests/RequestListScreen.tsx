import Link from "next/link";
import { AlarmClock, Ban, CheckCircle2, ClipboardList, FileText, FolderOpen, Hourglass, Layers, PauseCircle, ShieldCheck, Undo2, UserCheck, X, XCircle, type LucideIcon } from "lucide-react";
import { RoadMini } from "@/features/requests/RoadMini";
import { RequestRowMenu, type RowAction } from "@/features/requests/RequestRowMenu";
import { ColumnPicker } from "@/features/requests/ColumnPicker";
import { COLUMN_LABEL, type ListColumn } from "@/server/requests/list-columns";
import type { MiniRoad } from "@/server/approvals/road";
import { RequestStatusPill } from "@/features/requests/StatusPill";
import { PendingLink } from "@/features/ui/PendingLink";
import { SafeText } from "@/features/ui/SafeText";
import { SavedViews, SaveViewForm, type ViewChip } from "@/features/analytics/ReportForms";
import { ListToolbar } from "@/features/ui/ListToolbar";
import { EmptyState, NoResults } from "@/features/ui/Display";
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

// D-256: the columns each list can show (the request itself always shows).
export function columnsFor(base: ListBase): ListColumn[] {
  const showRaiser = base === "COLLAB" || base === "APPROVED_BY_ME";
  return ["status", "waiting", ...(showRaiser ? (["raiser"] as const) : []), "raised", "activity", "progress", ...(base === "COLLAB" ? (["added"] as const) : []), "actions"];
}

// D-256 (owner's My Requests design): each quick filter as a status card.
const CARD_ICON: Record<string, LucideIcon> = {
  all: Layers,
  open: FolderOpen,
  waiting: Hourglass,
  sentback: Undo2,
  hold: PauseCircle,
  approved: CheckCircle2,
  rejected: XCircle,
  withdrawn: Ban,
  overdue: AlarmClock,
  valid: ShieldCheck,
  expiring: AlarmClock,
  expired: XCircle,
  noexpiry: CheckCircle2,
  amended: FileText,
  behalf: UserCheck,
};
const CARD_TONE: Record<string, string> = {
  waiting: "text-warning-600",
  sentback: "text-warning-600",
  hold: "text-primary-700",
  approved: "text-success-600",
  rejected: "text-danger-600",
  overdue: "text-danger-600",
  expired: "text-danger-600",
  expiring: "text-warning-600",
};

// The row's actions: only what this request allows this person (the same
// rules as the request page, which checks again and asks before any change).
function rowActions(item: ListedRequest, userId: number): RowAction[] {
  const mine = item.requesterId === userId;
  const open = ["IN_PROGRESS", "ON_HOLD", "CHANGES_REQUIRED"].includes(item.status);
  const page = `/users/requests/${item.id}`;
  return [
    { label: "View details", href: page },
    { label: "View approval progress", href: `${page}#levels` },
    { label: "View history", href: `${page}#history` },
    ...(mine && item.status === "CHANGES_REQUIRED" ? [{ label: "Update and resubmit", href: `${page}#resubmit` }] : []),
    ...(mine && item.isCustom && !open ? [{ label: "Raise again like this", href: `/users/custom?from=${item.id}` }] : []),
    { label: "Download summary (PDF)", href: `/api/requests/${item.id}/summary.pdf`, download: true },
    ...(mine && open ? [{ label: "Withdraw…", href: `${page}#request-actions`, tone: "danger" as const }] : []),
  ];
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

// Page numbers with gaps: 1 … 4 5 6 … 12.
function pageList(page: number, pages: number): (number | "gap")[] {
  const wanted = new Set([1, pages, page - 1, page, page + 1].filter((value) => value >= 1 && value <= pages));
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((value, index) => {
    if (index > 0 && value - sorted[index - 1]! > 1) out.push("gap");
    out.push(value);
  });
  return out;
}

export function RequestListScreen({
  base,
  path,
  filters,
  result,
  counts,
  choices,
  views,
  empty,
  progress = {},
  columns,
  userId,
}: {
  base: ListBase;
  path: string;
  filters: ListFilters;
  result: { items: ListedRequest[]; total: number; page: number; pages: number };
  counts: Record<QuickTab, number>;
  choices: ListChoices;
  views: ViewChip[];
  empty: string;
  progress?: Record<number, MiniRoad>; // D-256: the small road per row
  columns?: ListColumn[]; // D-256: the person's chosen columns
  userId: number;
}) {
  const can = BASE_FEATURES[base];
  const collab = base === "COLLAB";
  const approvedMine = base === "APPROVED_MINE";
  const byMe = base === "APPROVED_BY_ME";
  const available = columnsFor(base);
  const shown = new Set(columns ?? available);
  const show = (column: ListColumn) => shown.has(column) && available.includes(column);
  const showRaiser = (collab || byMe) && show("raiser");
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
  const columnCount = 1 + available.filter((column) => show(column)).length;
  const sortChoices = can.sorts.map((value) => ({ label: SORT_LABEL[value], href: href({ sort: value, page: 1 }), active: filters.sort === value }));

  return (
    <>
      <nav aria-label="Quick filters" className="status-cards scroll-hint -mx-4 mb-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" data-testid="status-cards">
        <ul className="flex min-w-max gap-2 xl:grid xl:min-w-0 xl:grid-flow-col xl:auto-cols-fr">
          {tabs.map((tab) => {
            const Icon = CARD_ICON[tab.key] ?? ClipboardList;
            const active = filters.tab === tab.key;
            return (
              <li key={tab.key}>
                <Link
                  href={href({ tab: tab.key, page: 1, overdue: tab.overdue ? true : currentTab?.overdue ? false : filters.overdue })}
                  aria-current={active ? "page" : undefined}
                  className={`status-card flex h-full min-w-[7.5rem] flex-col gap-1.5 rounded-lg border px-3 py-2.5 transition-colors ${active ? "border-primary-600 bg-primary-solid text-on-solid shadow-button" : "border-line bg-surface hover:border-line-strong hover:bg-surface-muted"}`}
                  title={tab.key === "overdue" ? "Requests with a step past its response time. They are also counted under Waiting for approvers." : undefined}
                >
                  {/* Read as one name, e.g. "Waiting for approvers (3)"; the visible parts are hidden from screen readers. */}
                  <span className="sr-only">{`${tab.label} (${(counts[tab.key] ?? 0).toLocaleString("en-IN")})`}</span>
                  <span className="flex items-center gap-2 text-label" aria-hidden="true">
                    <Icon className={`h-4 w-4 shrink-0 ${active ? "" : (CARD_TONE[tab.key] ?? "text-ink-muted")}`} aria-hidden="true" />
                    <span className="leading-tight">{tab.label}</span>
                  </span>
                  <span className="text-title font-semibold tabular-nums" aria-hidden="true">
                    {(counts[tab.key] ?? 0).toLocaleString("en-IN")}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
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
        <div className="order-last ml-auto">
          <ColumnPicker list={VIEW_TARGET[base]} available={available.map((column) => ({ key: column, label: COLUMN_LABEL[column] }))} shown={available.filter((column) => show(column))} />
        </div>
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
        // D-233: "nothing matches" (with the way back) is not "nothing yet".
        used || filters.tab !== "all" ? (
          <NoResults what="requests" query={filters.q} clearSearchHref={href({ q: "", page: 1 })} resetHref={path} />
        ) : (
          <EmptyState title="Nothing here yet" body={empty} />
        )
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
                <li key={item.id} className="relative">
                  {show("actions") && (
                    <div className="absolute right-2 top-2 z-[1]">
                      <RequestRowMenu title={item.title} actions={rowActions(item, userId)} />
                    </div>
                  )}
                  <Link href={`/users/requests/${item.id}`} className="block px-4 py-3 pr-12 active:bg-surface-muted">
                    <p className="font-medium text-primary-700">
                      <SafeText text={item.title} />
                    </p>
                    <p className="text-caption text-ink-muted">
                      {item.requestNo} · {item.workflowName}
                      {showRaiser ? ` · from ${item.requesterName}` : ""}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-caption">
                      <RequestStatusPill status={item.status} validUntil={item.validUntil} />
                      {byMe && item.myApprovedAt && <span className="text-ink-muted">You approved {day(item.myApprovedAt)}</span>}
                      {approvedMine && item.closedAt && <span className="text-ink-muted">Approved {day(item.closedAt)}</span>}
                      {item.pendingWith && <span className="text-ink-muted">With {item.pendingWith}</span>}
                      {item.overdue && <span className="font-semibold text-danger-600">Overdue</span>}
                      <span className="text-ink-muted">· {day(item.updatedAt)}</span>
                    </div>
                  </Link>
                  {show("progress") && progress[item.id] && (
                    <div className="px-4 pb-3">
                      <RoadMini road={progress[item.id]!} href={`/users/requests/${item.id}#levels`} />
                    </div>
                  )}
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
                  {show("status") && <th scope="col">Status</th>}
                  {show("waiting") && (approvedMine ? <th scope="col">Approved</th> : byMe ? <th scope="col">Your approval</th> : <th scope="col">Waiting on</th>)}
                  {showRaiser && <th scope="col">Raised by</th>}
                  {show("raised") && <th scope="col">Raised</th>}
                  {show("activity") && (
                    <th scope="col" className="hidden lg:table-cell">
                      Last activity
                    </th>
                  )}
                  {show("progress") && <th scope="col">Progress</th>}
                  {collab && show("added") && (
                    <th scope="col" className="hidden xl:table-cell">
                      Added
                    </th>
                  )}
                  {show("actions") && (
                    <th scope="col" className="w-12">
                      <span className="sr-only">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              {grouped.map((group) => (
                <tbody key={group.key}>
                  {group.label && (
                    <tr className="bg-surface-muted">
                      <th scope="rowgroup" colSpan={columnCount} className="text-left text-label font-semibold">
                        {group.label} <span className="font-normal text-ink-muted">{group.items.length}</span>
                      </th>
                    </tr>
                  )}
                  {group.items.map((item) => (
                    <tr key={item.id}>
                      <td className="max-w-96">
                        <div className="flex items-start gap-3">
                          <span className="row-icon mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-50 text-primary-700" aria-hidden="true">
                            <FileText className="h-4 w-4" />
                          </span>
                          <span className="min-w-0">
                            <Link href={`/users/requests/${item.id}`} className="link font-medium">
                              <SafeText text={item.title} />
                            </Link>
                            <span className="block text-caption text-ink-muted">
                              {item.requestNo} · {item.workflowName}
                              {item.files ? ` · ${item.files} file${item.files === 1 ? "" : "s"}` : ""}
                              {item.amended ? " · amended" : ""}
                            </span>
                          </span>
                        </div>
                      </td>
                      {show("status") && (
                        <td>
                          <RequestStatusPill status={item.status} validUntil={item.validUntil} />
                          {item.overdue && <span className="mt-1 block text-caption font-semibold text-danger-600">Overdue</span>}
                          {item.validUntil && item.status === "APPROVED" && <span className="block text-caption text-ink-muted">valid until {day(item.validUntil)}</span>}
                        </td>
                      )}
                      {!show("waiting") ? null : approvedMine ? (
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
                              {item.pendingWith && (
                                <span className="mb-1 flex -space-x-1.5" aria-hidden="true">
                                  {item.pendingWith
                                    .split(", ")
                                    .slice(0, 3)
                                    .map((name) => (
                                      <span key={name} className="grid h-6 w-6 place-items-center rounded-full bg-primary-solid text-[10px] font-semibold text-on-solid ring-2 ring-surface">
                                        {initialsOf(name)}
                                      </span>
                                    ))}
                                </span>
                              )}
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
                      {show("raised") && (
                        <td className="whitespace-nowrap" title={formatIndiaTime(item.submittedAt)}>
                          {day(item.submittedAt)}
                        </td>
                      )}
                      {show("activity") && <td className="hidden whitespace-nowrap lg:table-cell">{formatIndiaTime(item.updatedAt)}</td>}
                      {show("progress") && <td>{progress[item.id] ? <RoadMini road={progress[item.id]!} href={`/users/requests/${item.id}#levels`} /> : <span className="text-ink-faint">—</span>}</td>}
                      {collab && show("added") && (
                        <td className="hidden whitespace-nowrap xl:table-cell">
                          {item.addedAt ? day(item.addedAt) : "—"}
                          <span className="block text-caption text-ink-muted">by {item.addedByName}</span>
                        </td>
                      )}
                      {show("actions") && (
                        <td className="text-right">
                          <RequestRowMenu title={item.title} actions={rowActions(item, userId)} />
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
        <nav aria-label="Pages" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-label" data-testid="list-pages">
          <span className="text-ink-muted">
            Showing {((result.page - 1) * filters.size + 1).toLocaleString("en-IN")}–{Math.min(result.page * filters.size, result.total).toLocaleString("en-IN")} of {result.total.toLocaleString("en-IN")} requests
          </span>
          {result.pages > 1 && (
            <span className="flex items-center gap-1">
              {result.page > 1 && (
                <PendingLink href={href({ page: result.page - 1 })} className="btn-secondary btn-compact" aria-label="Previous page">
                  ←
                </PendingLink>
              )}
              {pageList(result.page, result.pages).map((value, index) =>
                value === "gap" ? (
                  <span key={`gap-${index}`} className="px-1 text-ink-muted">
                    …
                  </span>
                ) : value === result.page ? (
                  <span key={value} aria-current="page" className="grid h-8 min-w-8 place-items-center rounded-md bg-primary-solid px-2 font-semibold text-on-solid">
                    {value}
                  </span>
                ) : (
                  <PendingLink key={value} href={href({ page: value })} className="grid h-8 min-w-8 place-items-center rounded-md px-2 hover:bg-surface-muted">
                    {value}
                  </PendingLink>
                ),
              )}
              {result.page < result.pages && (
                <PendingLink href={href({ page: result.page + 1 })} className="btn-secondary btn-compact" aria-label="Next page">
                  →
                </PendingLink>
              )}
            </span>
          )}
        </nav>
      )}
    </>
  );
}
