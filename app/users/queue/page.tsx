import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { QueueTable } from "@/features/requests/lists";
import { PendingLink } from "@/features/ui/PendingLink";
import { BulkApprove } from "@/features/requests/BulkApprove";
import { countPendingTasksFor, listPendingTasksFor } from "@/lib/db/repositories/approvals.repository";

const PAGE_SIZE = 25;

export default async function QueuePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { user } = await requireArea("users");
  const total = await countPendingTasksFor(user.id);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number((await searchParams).page) || 1), pages);
  const queue = await listPendingTasksFor(user.id, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const link = (to: number) => (to > 1 ? `/users/queue?page=${to}` : "/users/queue");
  return (
    <>
      <PageHeader title="Waiting for me" description="Every request that needs your decision, and work given to you, oldest first." />
      {total > 0 && (
        <p className="mb-2 text-caption text-ink-muted" role="status">
          {`${total.toLocaleString("en-IN")} waiting${pages > 1 ? ` · page ${page} of ${pages}` : ""}`}
        </p>
      )}
      <BulkApprove items={queue} />
      <QueueTable items={queue} />
      {pages > 1 && (
        <nav aria-label="Pages" className="mt-4 flex items-center gap-3 text-label">
          {page > 1 ? (
            <PendingLink href={link(page - 1)} className="btn-secondary btn-compact">
              ← Earlier
            </PendingLink>
          ) : null}
          {page < pages ? (
            <PendingLink href={link(page + 1)} className="btn-secondary btn-compact">
              Later →
            </PendingLink>
          ) : null}
        </nav>
      )}
    </>
  );
}
