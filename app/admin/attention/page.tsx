import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { Badge, EmptyState } from "@/features/ui/Display";
import { SafeText } from "@/features/ui/SafeText";
import { ResendRequestMessages, SnoozeForm } from "@/features/admin/AttentionForms";
import { countByReason, findStuckRequests, STUCK_REASONS, type StuckReason } from "@/server/ops/stuck";
import { getNumberSetting } from "@/server/settings/values";
import { formatIndiaTime } from "@/server/notifications/security-messages";

export const dynamic = "force-dynamic";

// FN2 Needs attention: open requests that are stuck, why, since when and
// what to do. Read-only list; every fix is an existing audited action.
export default async function AttentionPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  await requireArea("admin");
  const idleDays = (await getNumberSetting("general.stuck_idle_days").catch(() => 7)) || 7;
  const all = await findStuckRequests({ idleDays });
  const counts = countByReason(all);
  const raw = (await searchParams).reason;
  const reason = raw && raw in STUCK_REASONS ? (raw as StuckReason) : null;
  const items = reason ? all.filter((item) => item.reason === reason) : all;
  const chip = (active: boolean) => `rounded-full border px-3 py-1 text-label ${active ? "border-primary-600 bg-primary-50 font-semibold text-primary-700" : "border-line text-ink-muted hover:bg-surface-muted"}`;

  return (
    <>
      <PageHeader title="Needs attention" description={`Open requests that can't move on their own: blocked steps, inactive approvers, unsent messages, and anything with no activity for ${idleDays} days or more.`} />
      <nav aria-label="Filter by reason" className="mb-4 flex flex-wrap gap-2">
        <Link href="/admin/attention" className={chip(!reason)} aria-current={!reason ? "page" : undefined}>
          All ({all.length})
        </Link>
        {(Object.keys(STUCK_REASONS) as StuckReason[]).map((key) => (
          <Link key={key} href={`/admin/attention?reason=${key}`} className={chip(reason === key)} aria-current={reason === key ? "page" : undefined}>
            {STUCK_REASONS[key].label} ({counts[key]})
          </Link>
        ))}
      </nav>
      {items.length === 0 ? (
        <EmptyState icon={<CheckCircle2 aria-hidden="true" className="h-6 w-6" />} title="Nothing needs attention" body="Every open request has someone who can act on it, and all messages have gone out." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <caption className="sr-only">Requests that need attention</caption>
            <thead>
              <tr>
                <th scope="col">Request</th>
                <th scope="col">Why</th>
                <th scope="col">Since</th>
                <th scope="col">What to do</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={`${item.requestId}-${item.reason}`}>
                  <td>
                    <Link href={`/users/requests/${item.requestId}`} className="link font-semibold">
                      {item.requestNo}
                    </Link>
                    <span className="block max-w-xs truncate text-caption text-ink-muted">
                      <SafeText text={item.title} />
                    </span>
                  </td>
                  <td>
                    <Badge tone={item.reason === "BLOCKED_STEP" || item.reason === "INACTIVE_APPROVER" ? "danger" : "warning"}>{STUCK_REASONS[item.reason].label}</Badge>
                    {item.detail && <span className="mt-1 block text-caption text-ink-muted">{item.detail}</span>}
                  </td>
                  <td className="whitespace-nowrap">
                    {formatIndiaTime(item.since)}
                    <span className="block text-caption text-ink-muted">{item.days === 0 ? "today" : `${item.days} day${item.days === 1 ? "" : "s"}`}</span>
                  </td>
                  <td className="space-y-2">
                    <p className="text-label">{STUCK_REASONS[item.reason].action}</p>
                    <div className="flex flex-wrap items-center gap-3">
                      {item.reason === "INACTIVE_APPROVER" && item.personId !== null && (
                        <Link href={`/admin/users/${item.personId}`} className="link text-label">
                          Open the person
                        </Link>
                      )}
                      {item.reason === "MESSAGES_UNSENT" && <ResendRequestMessages requestId={item.requestId} />}
                    </div>
                    <SnoozeForm requestId={item.requestId} reason={item.reason} requestNo={item.requestNo} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
