import Link from "next/link";
import { X } from "lucide-react";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { QueueTable } from "@/features/requests/lists";
import { PendingLink } from "@/features/ui/PendingLink";
import { BulkApprove } from "@/features/requests/BulkApprove";
import { QueueKeyboard } from "@/features/requests/QueueKeyboard";
import { countPendingTasksFor, listPendingTasksFor, queueTypesFor } from "@/lib/db/repositories/approvals.repository";
import { QUEUE_SHOW_LABEL, QUEUE_SHOWS, QUEUE_SORT_LABEL, QUEUE_SORTS, parseQueueFilter, queueHref } from "@/server/approvals/queue-filters";

const PAGE_SIZE = 25;

// Waiting for me (WS-01): filters and order are plain address-bar values,
// so a filtered view can be bookmarked and Back keeps it.
export default async function QueuePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { user } = await requireArea("users");
  const params = await searchParams;
  const filter = parseQueueFilter(params);
  const [total, everything, types] = await Promise.all([countPendingTasksFor(user.id, filter), countPendingTasksFor(user.id), queueTypesFor(user.id)]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(params.page) || 1), pages);
  const queue = await listPendingTasksFor(user.id, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }, undefined, filter);
  const filtered = filter.show !== "all" || filter.typeId !== null;
  const typeName = types.find((type) => type.id === filter.typeId)?.name;
  const chips = [
    filter.show !== "all" ? { label: QUEUE_SHOW_LABEL[filter.show], href: queueHref({ ...filter, show: "all" }) } : null,
    filter.typeId !== null ? { label: typeName ?? "Approval type", href: queueHref({ ...filter, typeId: null }) } : null,
  ].filter((chip): chip is { label: string; href: string } => chip !== null);
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
