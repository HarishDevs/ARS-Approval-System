import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, EmptyState } from "@/features/shell/PageHeader";
import { NoResults } from "@/features/ui/Display";
import { requireArea } from "@/server/authorization/guards";
import { listAuditActions, listAuditEntries } from "@/lib/db/repositories/audit.repository";
import { SafeText } from "@/features/ui/SafeText";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import { indiaToday } from "@/lib/db/repositories/collab.repository";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Audit log" };

const PAGE_SIZE = 100;

// P1-57 audit viewer. Read-only: the log is append-only (D-012) and there is
// no code path that edits it.
export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; before?: string }> }) {
  await requireArea("superadmin");
  const params = await searchParams;
  const actions = await listAuditActions();
  const action = params.action && actions.includes(params.action) ? params.action : undefined;
  const beforeId = params.before && /^\d+$/.test(params.before) ? Number(params.before) : undefined;
  const entries = await listAuditEntries({ action, beforeId }, PAGE_SIZE);
  const last = entries.at(-1);
  const today = await indiaToday();
  const monthAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);

  return (
    <>
      <PageHeader title="Audit log" description="Every sign-in, access denial and admin change. Entries can't be edited or deleted by anyone." />
      <form className="mb-4 flex flex-wrap items-end gap-3" method="get">
        <div>
          <label htmlFor="action" className="field-label">
            Action
          </label>
          <select id="action" name="action" defaultValue={action ?? ""} className="field-input w-72">
            <option value="">All actions</option>
            {actions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary btn-compact h-11">
          Filter
        </button>
      </form>
      <form className="mb-6 flex flex-wrap items-end gap-3 rounded-md border border-line bg-surface p-3" method="get" action="/api/superadmin/audit">
        <p className="w-full text-label font-semibold">Download as CSV (up to 50,000 entries)</p>
        <div>
          <label htmlFor="export-from" className="field-label">
            From
          </label>
          <input id="export-from" type="date" name="from" defaultValue={monthAgo} className="field-input" />
        </div>
        <div>
          <label htmlFor="export-to" className="field-label">
            To
          </label>
          <input id="export-to" type="date" name="to" defaultValue={today} className="field-input" />
        </div>
        {action && <input type="hidden" name="action" value={action} />}
        <button type="submit" className="btn-secondary btn-compact h-11">
          Download CSV{action ? ` (${action})` : ""}
        </button>
      </form>
      {entries.length === 0 ? (
        action ? (
          <NoResults what="entries" resetHref="/superadmin/audit" hint={`Nothing recorded for ${action}${beforeId ? " before this point" : ""}.`} />
        ) : (
          <EmptyState title="No entries" body={beforeId ? "Nothing older than this." : "Nothing has been recorded yet."} />
        )
      ) : (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Action</th>
                <th>On</th>
                <th>Result</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="whitespace-nowrap">{formatIndiaTime(entry.occurredAt)}</td>
                  <td>{entry.actorName ?? "System"}</td>
                  <td className="font-medium">{entry.action}</td>
                  <td className="text-ink-muted">
                    {entry.entityType}
                    {entry.entityId ? ` ${entry.entityId}` : ""}
                  </td>
                  <td>
                    <span className={`badge ${entry.result === "SUCCESS" ? "bg-success-50 text-success-600" : "bg-danger-50 text-danger-600"}`}>{entry.result}</span>
                  </td>
                  <td className="max-w-md break-words font-mono text-caption text-ink-muted">{entry.metadata ? <SafeText text={JSON.stringify(entry.metadata)} /> : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {entries.length === PAGE_SIZE && last && (
        <div className="mt-4">
          <Link className="link" href={`/superadmin/audit?${new URLSearchParams({ ...(action ? { action } : {}), before: String(last.id) })}`}>
            Older entries →
          </Link>
        </div>
      )}
    </>
  );
}
