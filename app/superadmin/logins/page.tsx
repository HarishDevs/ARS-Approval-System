import type { Metadata } from "next";
import { PagedRows } from "@/features/ui/PagedRows";
import { PageHeader, EmptyState } from "@/features/shell/PageHeader";
import { NoResults } from "@/features/ui/Display";
import { ListToolbar } from "@/features/ui/ListToolbar";
import { PendingLink } from "@/features/ui/PendingLink";
import { requireArea } from "@/server/authorization/guards";
import { listLoginHistory } from "@/lib/db/repositories/audit.repository";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import { SafeText } from "@/features/ui/SafeText";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Sign-in history" };

const PAGE_SIZE = 100;
const METHOD = { GOOGLE: "Google", PASSWORD_OTP: "Password + WhatsApp code" } as const;

// S8-02 login history (P1-57): every sign-in attempt, who, how, from where,
// and why it failed. Read-only.
export default async function LoginHistoryPage({ searchParams }: { searchParams: Promise<{ outcome?: string; before?: string }> }) {
  await requireArea("superadmin");
  const params = await searchParams;
  const outcome = params.outcome === "SUCCESS" || params.outcome === "FAILURE" ? params.outcome : undefined;
  const beforeId = params.before && /^\d+$/.test(params.before) ? Number(params.before) : undefined;
  const items = await listLoginHistory({ outcome, beforeId }, PAGE_SIZE);
  const last = items.at(-1);
  return (
    <>
      <PageHeader title="Sign-in history" description="Every sign-in attempt: who, how, from where, and why it failed. Newest first." />
      {/* v1.51.1 (owner): toolbar filters instead of a filter form. */}
      <ListToolbar
        id="login-filters"
        path="/superadmin/logins"
        label="Filter sign-ins"
        keep={{}}
        filterCount={outcome ? 1 : 0}
        clearHref={outcome ? "/superadmin/logins" : null}
        filters={
          <div>
            <label htmlFor="outcome" className="field-label">
              Outcome
            </label>
            <select id="outcome" name="outcome" defaultValue={outcome ?? ""} className="field-input h-10">
              <option value="">All</option>
              <option value="SUCCESS">Signed in</option>
              <option value="FAILURE">Failed</option>
            </select>
          </div>
        }
      />
      {items.length === 0 ? (
        outcome ? (
          <NoResults what="sign-ins" resetHref="/superadmin/logins" hint={`No ${outcome === "SUCCESS" ? "successful" : "failed"} sign-ins${beforeId ? " before this point" : ""}.`} />
        ) : (
          <EmptyState title="No sign-ins" body={beforeId ? "Nothing older than this." : "Nobody has signed in yet."} />
        )
      ) : (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>How</th>
                <th>Outcome</th>
                <th>From</th>
              </tr>
            </thead>
            <PagedRows colSpan={5}>
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="whitespace-nowrap">{formatIndiaTime(item.occurredAt)}</td>
                  <td>
                    {item.userName ? <SafeText text={item.userName} /> : <span className="text-ink-faint">Unknown User ID</span>}
                    {item.loginId && <p className="text-caption text-ink-muted">{item.loginId}</p>}
                  </td>
                  <td>
                    {METHOD[item.method]}
                    {item.step !== "GOOGLE" && <p className="text-caption text-ink-muted">step: {item.step === "OTP" ? "code" : "password"}</p>}
                  </td>
                  <td>
                    <span className={`badge ${item.success ? "bg-success-50 text-success-600" : "bg-danger-50 text-danger-600"}`}>{item.success ? "Signed in" : "Failed"}</span>
                    {item.failureReason && <p className="text-caption text-ink-muted">{item.failureReason}</p>}
                    {item.newDevice && <p className="text-caption text-warning-600">new device</p>}
                  </td>
                  <td className="max-w-xs break-words text-caption text-ink-muted">
                    {item.ipAddress ?? "—"}
                    {item.userAgent && <p className="truncate" title={item.userAgent}>{item.userAgent}</p>}
                  </td>
                </tr>
              ))}
            </PagedRows>
          </table>
        </div>
      )}
      {items.length === PAGE_SIZE && last && (
        <div className="mt-4">
          <PendingLink className="btn-secondary btn-compact" href={`/superadmin/logins?${new URLSearchParams({ ...(outcome ? { outcome } : {}), before: String(last.id) })}`}>
            Older →
          </PendingLink>
        </div>
      )}
    </>
  );
}
