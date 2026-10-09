import Link from "next/link";
import { PendingLink } from "@/features/ui/PendingLink";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { MyRequestsTable } from "@/features/requests/lists";
import { searchMyRequests } from "@/lib/db/repositories/approvals.repository";
import { REQUEST_STATUS_OPTIONS } from "@/features/ui/labels";

const STATUS_OPTIONS = REQUEST_STATUS_OPTIONS;

// My requests (F-14) with search, status filter and paging (D-QA-11).
export default async function MyRequestsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const { user } = await requireArea("users");
  const params = await searchParams;
  const q = (params.q ?? "").slice(0, 100);
  const status = params.status ?? "";
  const result = await searchMyRequests(user.id, { q, status, page: Number(params.page) || 1 });
  const link = (page: number) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (status) query.set("status", status);
    if (page > 1) query.set("page", String(page));
    const text = query.toString();
    return `/users/requests${text ? `?${text}` : ""}`;
  };
  return (
    <>
      <PageHeader title="My requests" description="Everything you've raised, with where it is now." />
      {/* One action bar: search, filter and the primary action together (S9-12). */}
      <form method="get" className="card mb-4 flex flex-wrap items-end gap-3 px-4 py-3" role="search">
        <div className="min-w-0 flex-1">
          <label htmlFor="q" className="field-label">
            Search
          </label>
          <input id="q" name="q" defaultValue={q} placeholder="Request number or title" className="field-input" />
        </div>
        <div>
          <label htmlFor="status" className="field-label">
            Status
          </label>
          <select id="status" name="status" defaultValue={status} className="field-input">
            {STATUS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary btn-compact h-11">
          Search
        </button>
        {(q || status) && (
          <Link href="/users/requests" className="link text-label">
            Clear
          </Link>
        )}
        <Link href="/users/new" className="btn-primary btn-compact h-11 sm:ml-auto">
          New request
        </Link>
      </form>
      <p className="mb-2 text-caption text-ink-muted" role="status">
        {result.total === 0 ? "No requests match." : `${result.total.toLocaleString("en-IN")} request${result.total === 1 ? "" : "s"}${result.pages > 1 ? ` · page ${result.page} of ${result.pages}` : ""}`}
      </p>
      <MyRequestsTable items={result.items} />
      {result.pages > 1 && (
        <nav aria-label="Pages" className="mt-4 flex items-center gap-3 text-label">
          {result.page > 1 ? (
            <PendingLink href={link(result.page - 1)} className="btn-secondary btn-compact">
              ← Newer
            </PendingLink>
          ) : null}
          {result.page < result.pages ? (
            <PendingLink href={link(result.page + 1)} className="btn-secondary btn-compact">
              Older →
            </PendingLink>
          ) : null}
        </nav>
      )}
    </>
  );
}
