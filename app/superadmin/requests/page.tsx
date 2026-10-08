import Link from "next/link";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { RequestStatusPill } from "@/features/requests/StatusPill";
import { DeleteRequestButton } from "@/features/superadmin/DeleteRequestButton";
import { listAllRequests } from "@/lib/db/repositories/request-admin.repository";
import { formatIndiaTime } from "@/server/notifications/security-messages";

const STATUS_OPTIONS = [
  ["", "Any status"],
  ["IN_PROGRESS", "In progress"],
  ["ON_HOLD", "On hold"],
  ["CHANGES_REQUIRED", "Changes required"],
  ["APPROVED", "Approved"],
  ["REJECTED", "Rejected"],
  ["CANCELLED", "Withdrawn"],
] as const;

// Super Admin → Requests (S11-10, D-086, F-73): every request, searchable,
// with Delete; the Deleted tab lists what was deleted, by whom and why.
export default async function SuperAdminRequestsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string; tab?: string }> }) {
  await requireArea("superadmin");
  const params = await searchParams;
  const deleted = params.tab === "deleted";
  const q = (params.q ?? "").slice(0, 100);
  const status = params.status ?? "";
  const result = await listAllRequests({ q, status, deleted, page: Number(params.page) || 1 });
  const link = (changes: { page?: number; tab?: string }) => {
    const query = new URLSearchParams();
    const tab = changes.tab ?? (deleted ? "deleted" : "");
    if (tab) query.set("tab", tab);
    if (q && changes.tab === undefined) query.set("q", q);
    if (status && changes.tab === undefined) query.set("status", status);
    if (changes.page && changes.page > 1) query.set("page", String(changes.page));
    const text = query.toString();
    return `/superadmin/requests${text ? `?${text}` : ""}`;
  };
  const tabClass = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-label ${active ? "bg-primary-50 font-semibold text-primary-700" : "text-ink-muted hover:bg-surface-muted"}`;

  return (
    <>
      <PageHeader title="Requests" description="Every request raised in the app. Delete removes a request from every screen, queue and dashboard; the record stays in the audit log." />
      <nav aria-label="Requests" className="mb-4 flex gap-2">
        <Link href={link({ tab: "" })} className={tabClass(!deleted)} aria-current={!deleted ? "page" : undefined}>
          All requests
        </Link>
        <Link href={link({ tab: "deleted" })} className={tabClass(deleted)} aria-current={deleted ? "page" : undefined}>
          Deleted
        </Link>
      </nav>
      <form method="get" className="card mb-4 flex flex-wrap items-end gap-3 px-4 py-3" role="search">
        {deleted && <input type="hidden" name="tab" value="deleted" />}
        <div className="min-w-0 flex-1">
          <label htmlFor="q" className="field-label">
            Search
          </label>
          <input id="q" name="q" defaultValue={q} placeholder="Request number, title or raised by" className="field-input" />
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
      </form>
      <p className="mb-2 text-caption text-ink-muted" role="status">
        {result.total === 0 ? "No requests match." : `${result.total.toLocaleString("en-IN")} request${result.total === 1 ? "" : "s"}${result.pages > 1 ? ` · page ${result.page} of ${result.pages}` : ""}`}
      </p>
      {result.items.length > 0 && (
        <section className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Raised by</th>
                <th>Approval type</th>
                <th>Status</th>
                <th>{deleted ? "Deleted" : "Raised"}</th>
                <th className="text-right">{deleted ? "Reason" : <span className="sr-only">Action</span>}</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    {deleted ? (
                      <span className="font-mono text-label">{item.requestNo}</span>
                    ) : (
                      <Link href={`/users/requests/${item.id}`} className="link font-mono text-label">
                        {item.requestNo}
                      </Link>
                    )}
                    <p className="max-w-xs truncate text-caption text-ink-muted">{item.title}</p>
                  </td>
                  <td>
                    {item.requesterName}
                    {item.departmentName && <p className="text-caption text-ink-muted">{item.departmentName}</p>}
                  </td>
                  <td>{item.workflowName}</td>
                  <td>
                    <RequestStatusPill status={item.status} />
                  </td>
                  <td className="whitespace-nowrap text-label text-ink-muted">
                    {deleted && item.deletedAt ? (
                      <>
                        {formatIndiaTime(item.deletedAt)}
                        <p className="text-caption">by {item.deletedByName ?? "—"}</p>
                      </>
                    ) : (
                      formatIndiaTime(item.submittedAt)
                    )}
                  </td>
                  <td className="text-right">
                    {deleted ? <span className="text-label">{item.deleteReason}</span> : <DeleteRequestButton requestId={item.id} requestNo={item.requestNo} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {result.pages > 1 && (
        <nav aria-label="Pages" className="mt-4 flex items-center gap-3 text-label">
          {result.page > 1 ? (
            <Link href={link({ page: result.page - 1 })} className="btn-secondary btn-compact">
              ← Newer
            </Link>
          ) : null}
          {result.page < result.pages ? (
            <Link href={link({ page: result.page + 1 })} className="btn-secondary btn-compact">
              Older →
            </Link>
          ) : null}
        </nav>
      )}
    </>
  );
}
