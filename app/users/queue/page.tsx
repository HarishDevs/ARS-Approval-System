import Link from "next/link";
import { X } from "lucide-react";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { QueueTable } from "@/features/requests/lists";
import { PendingLink } from "@/features/ui/PendingLink";
import { BulkApprove } from "@/features/requests/BulkApprove";
import { QueueKeyboard } from "@/features/requests/QueueKeyboard";
import { countPendingTasksFor, listPendingTasksFor, queueChoicesFor, queueTypesFor } from "@/lib/db/repositories/approvals.repository";
import { listViews } from "@/lib/db/repositories/analytics-views.repository";
import { SavedViews, SaveViewForm } from "@/features/analytics/ReportForms";
import { QUEUE_SHOW_LABEL, QUEUE_SHOWS, QUEUE_SIZES, QUEUE_SORT_LABEL, QUEUE_SORTS, parseQueueFilter, queueFiltered, queueHref, type QueueFilter } from "@/server/approvals/queue-filters";

// Waiting for me (WS-01): filters and order are plain address-bar values,
// so a filtered view can be bookmarked and Back keeps it.
export default async function QueuePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { user } = await requireArea("users");
  const params = await searchParams;
  const filter = parseQueueFilter(params);
  const PAGE_SIZE = filter.size ?? 25;
  const [total, everything, types, choices, views] = await Promise.all([countPendingTasksFor(user.id, filter), countPendingTasksFor(user.id), queueTypesFor(user.id), queueChoicesFor(user.id), listViews(user.id, "queue")]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(params.page) || 1), pages);
  const queue = await listPendingTasksFor(user.id, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }, undefined, filter);
  const filtered = queueFiltered(filter);
  const typeName = types.find((type) => type.id === filter.typeId)?.name;
  const nameOf = (list: { id: number; name: string }[], id: number | null | undefined) => list.find((item) => item.id === id)?.name ?? "chosen";
  const without = (changes: Partial<QueueFilter>) => queueHref({ ...filter, ...changes });
  const chips = [
    filter.show !== "all" ? { label: QUEUE_SHOW_LABEL[filter.show], href: without({ show: "all" }) } : null,
    filter.typeId !== null ? { label: typeName ?? "Approval type", href: without({ typeId: null }) } : null,
    filter.q ? { label: `Search: ${filter.q}`, href: without({ q: "" }) } : null,
    filter.requesterId ? { label: `Raised by: ${nameOf(choices.requesters, filter.requesterId)}`, href: without({ requesterId: null }) } : null,
    filter.departmentId ? { label: `Department: ${nameOf(choices.departments, filter.departmentId)}`, href: without({ departmentId: null }) } : null,
    filter.step ? { label: `Step: ${filter.step}`, href: without({ step: null }) } : null,
    filter.forWhom ? { label: filter.forWhom === "me" ? "Mine only" : "Covering for others", href: without({ forWhom: null }) } : null,
    filter.dueWithinDays ? { label: `Due within ${filter.dueWithinDays} day${filter.dueWithinDays === 1 ? "" : "s"}`, href: without({ dueWithinDays: null }) } : null,
    filter.hasFiles === true || filter.hasFiles === false ? { label: filter.hasFiles ? "With files" : "Without files", href: without({ hasFiles: null }) } : null,
    filter.raisedFrom || filter.raisedTo ? { label: `Raised ${filter.raisedFrom ?? "…"} to ${filter.raisedTo ?? "…"}`, href: without({ raisedFrom: null, raisedTo: null }) } : null,
    filter.waitingFrom || filter.waitingTo ? { label: `Waiting since ${filter.waitingFrom ?? "…"} to ${filter.waitingTo ?? "…"}`, href: without({ waitingFrom: null, waitingTo: null }) } : null,
  ].filter((chip): chip is { label: string; href: string } => chip !== null);
  const more = chips.length - (filter.show !== "all" ? 1 : 0) - (filter.typeId !== null ? 1 : 0);
  const select = "field-input";
  return (
    <>
      <PageHeader title="Waiting for me" description="Every request that needs your decision, and work given to you. Keys: J/K to move, Enter to open, ? for all shortcuts." />
      {everything > 0 && (
        <form method="get" className="card mb-4 grid gap-3 px-4 py-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <div>
            <label htmlFor="q-show" className="field-label">
              Show
            </label>
            <select id="q-show" name="show" defaultValue={filter.show} className="field-input">
              {QUEUE_SHOWS.map((show) => (
                <option key={show} value={show}>
                  {QUEUE_SHOW_LABEL[show]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="q-type" className="field-label">
              Approval type
            </label>
            <select id="q-type" name="type" defaultValue={filter.typeId ?? ""} className="field-input">
              <option value="">All types</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name} ({type.count})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="q-sort" className="field-label">
              Order
            </label>
            <select id="q-sort" name="sort" defaultValue={filter.sort} className="field-input">
              {QUEUE_SORTS.map((sort) => (
                <option key={sort} value={sort}>
                  {QUEUE_SORT_LABEL[sort]}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-secondary btn-compact h-11">
            Apply
          </button>
          <details open={more > 0} className="text-label sm:col-span-4">
            <summary className="cursor-pointer font-semibold text-primary-600">More filters{more > 0 ? ` (${more} in use)` : ""}</summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="sm:col-span-2 lg:col-span-1">
                <label htmlFor="q-q" className="field-label">
                  Search
                </label>
                <input id="q-q" name="q" defaultValue={filter.q ?? ""} placeholder="Request number, title or who raised it" className={select} />
              </div>
              <div>
                <label htmlFor="q-raisedby" className="field-label">
                  Raised by
                </label>
                <select id="q-raisedby" name="raisedBy" defaultValue={filter.requesterId ?? ""} className={select}>
                  <option value="">Anyone</option>
                  {choices.requesters.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="q-dept" className="field-label">
                  Their department
                </label>
                <select id="q-dept" name="dept" defaultValue={filter.departmentId ?? ""} className={select}>
                  <option value="">Any</option>
                  {choices.departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="q-step" className="field-label">
                  Step
                </label>
                <select id="q-step" name="step" defaultValue={filter.step ?? ""} className={select}>
                  <option value="">Any</option>
                  {choices.steps.map((step) => (
                    <option key={step} value={step}>
                      {step}
                    </option>
                  ))}
                </select>
              </div>
              {choices.covering && (
                <div>
                  <label htmlFor="q-for" className="field-label">
                    Whose
                  </label>
                  <select id="q-for" name="for" defaultValue={filter.forWhom ?? ""} className={select}>
                    <option value="">Mine and those I cover</option>
                    <option value="me">Mine only</option>
                    <option value="covering">Only those I cover for others</option>
                  </select>
                </div>
              )}
              <div>
                <label htmlFor="q-due" className="field-label">
                  Due within
                </label>
                <select id="q-due" name="due" defaultValue={filter.dueWithinDays ?? ""} className={select}>
                  <option value="">Any time</option>
                  {[1, 2, 3, 7, 14, 30].map((days) => (
                    <option key={days} value={days}>
                      {days} day{days === 1 ? "" : "s"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="q-files" className="field-label">
                  Files
                </label>
                <select id="q-files" name="files" defaultValue={filter.hasFiles === true ? "yes" : filter.hasFiles === false ? "no" : ""} className={select}>
                  <option value="">Either</option>
                  <option value="yes">With files</option>
                  <option value="no">Without files</option>
                </select>
              </div>
              <div>
                <label htmlFor="q-size" className="field-label">
                  Per page
                </label>
                <select id="q-size" name="size" defaultValue={filter.size ?? 25} className={select}>
                  {QUEUE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>
              {(
                [
                  ["raised", "Raised", filter.raisedFrom, filter.raisedTo],
                  ["waiting", "Waiting since", filter.waitingFrom, filter.waitingTo],
                ] as const
              ).map(([name, label, from, to]) => (
                <fieldset key={name} className="min-w-0">
                  <legend className="field-label">{label}</legend>
                  <div className="flex items-center gap-1.5">
                    <input type="date" name={`${name}From`} defaultValue={from ?? ""} aria-label={`${label} from`} className={`${select} min-w-0`} />
                    <span className="text-caption text-ink-muted">to</span>
                    <input type="date" name={`${name}To`} defaultValue={to ?? ""} aria-label={`${label} to`} className={`${select} min-w-0`} />
                  </div>
                </fieldset>
              ))}
            </div>
          </details>
        </form>
      )}
      {(total > 0 || filtered) && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-label">
          <p className="text-ink-muted" role="status">
            {filtered ? `${total.toLocaleString("en-IN")} of ${everything.toLocaleString("en-IN")} waiting` : `${total.toLocaleString("en-IN")} waiting`}
            {pages > 1 ? ` · page ${page} of ${pages}` : ""}
          </p>
          {chips.map((chip) => (
            <Link key={chip.label} href={chip.href} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-0.5 text-caption font-medium hover:bg-surface-muted" aria-label={`Remove filter: ${chip.label}`}>
              {chip.label}
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          ))}
          {chips.length > 1 && (
            <Link href={queueHref({ sort: filter.sort })} className="link text-caption">
              Clear all
            </Link>
          )}
        </div>
      )}
      {everything > 0 && (
        <div className="mb-4 flex flex-wrap items-start gap-6">
          <SavedViews views={views.map((view) => ({ id: view.id, name: view.name, href: `/users/queue?${new URLSearchParams(view.query).toString()}`, mine: view.mine, shared: view.shared, isDefault: view.isDefault, ownerName: view.ownerName }))} />
          <SaveViewForm target="queue" query={Object.fromEntries(new URLSearchParams(queueHref(filter).split("?")[1] ?? ""))} />
        </div>
      )}
      {!filtered && <BulkApprove items={queue} />}
      {filtered && queue.length === 0 ? (
        <p className="card px-5 py-5 text-label text-ink-muted">
          Nothing matches these filters.{" "}
          <Link href="/users/queue" className="link">
            Show everything
          </Link>
        </p>
      ) : (
        <QueueKeyboard>
          <QueueTable items={queue} />
        </QueueKeyboard>
      )}
      {pages > 1 && (
        <nav aria-label="Pages" className="mt-4 flex items-center gap-3 text-label">
          {page > 1 ? (
            <PendingLink href={queueHref(filter, page - 1)} className="btn-secondary btn-compact">
              ← Earlier
            </PendingLink>
          ) : null}
          {page < pages ? (
            <PendingLink href={queueHref(filter, page + 1)} className="btn-secondary btn-compact">
              Later →
            </PendingLink>
          ) : null}
        </nav>
      )}
    </>
  );
}
