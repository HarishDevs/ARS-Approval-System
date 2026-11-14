import type { Metadata } from "next";
import { PagedRows } from "@/features/ui/PagedRows";
import { PageHeader, EmptyState } from "@/features/shell/PageHeader";
import { requireArea } from "@/server/authorization/guards";
import { deliverySummary, listRecentDeliveries, parseDeliveryFilter } from "@/lib/db/repositories/notifications.repository";
import { DeliveryDashboard } from "@/features/superadmin/DeliveryDashboard";
import { RetryButton } from "@/features/superadmin/RetryButton";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import { getRunnerHeartbeat, type RunnerHeartbeat } from "@/lib/db/repositories/jobs.repository";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Message deliveries" };

const STATUS_STYLE: Record<string, string> = {
  SENT: "bg-success-50 text-success-600",
  DELIVERED: "bg-success-50 text-success-600",
  READ: "bg-success-50 text-success-600",
  FAILED: "bg-danger-50 text-danger-600",
  SKIPPED: "bg-warning-50 text-warning-600",
  QUEUED: "bg-surface-muted text-ink-muted",
};

// P1-45 delivery log: every email and WhatsApp attempt, with the failure
// code. Message bodies and payloads are never shown.
export const dynamic = "force-dynamic";

export default async function DeliveriesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireArea("superadmin");
  // v1.54.16 (owner): a dashboard over the period, and the list filtered the same way.
  const filter = parseDeliveryFilter(await searchParams);
  const [deliveries, heartbeat, summary] = await Promise.all([listRecentDeliveries(200, filter), getRunnerHeartbeat(), deliverySummary(filter)]);
  return (
    <>
      <PageHeader title="Message deliveries" description="How many email and WhatsApp messages went out, by channel, provider and status, and the latest 200 of them for the filters chosen. Failed sends are retried automatically every few minutes by the job runner. SKIPPED with TEMPLATE_NOT_CONFIGURED means the WhatsApp template for that event isn't set up yet." />
      <RunnerStatus heartbeat={heartbeat} />
      <DeliveryDashboard summary={summary} filter={filter} path="/superadmin/deliveries" />
      {deliveries.length === 0 ? (
        <EmptyState title="Nothing here" body="No messages match the period and filters chosen. Sign-in alerts, notifications and test sends appear here." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Event</th>
                <th>To</th>
                <th>Channel</th>
                <th>Provider</th>
                <th>Status</th>
                <th>Reason</th>
                <th>Tries</th>
                <th></th>
              </tr>
            </thead>
            <PagedRows colSpan={9}>
              {deliveries.map((delivery) => (
                <tr key={delivery.id}>
                  <td className="whitespace-nowrap">{formatIndiaTime(delivery.createdAt)}</td>
                  <td>{delivery.eventType}</td>
                  <td>{delivery.recipientName}</td>
                  <td>{delivery.channel === "EMAIL" ? "Email" : "WhatsApp"}</td>
                  <td className="text-ink-muted">
                    {delivery.provider}
                    {delivery.providerReference && <p className="max-w-[16rem] truncate text-caption" title={delivery.providerReference}>{delivery.providerReference}</p>}
                  </td>
                  <td>
                    {/* v1.54.14: an email marked SENT was accepted by the mail server; delivery to the inbox can't be seen from here. */}
                    <span className={`badge ${STATUS_STYLE[delivery.status] ?? ""}`} title={delivery.channel === "EMAIL" && delivery.status === "SENT" ? "Accepted by the mail server. Whether it reached the inbox can't be seen from here." : undefined}>
                      {delivery.channel === "EMAIL" && delivery.status === "SENT" ? "ACCEPTED" : delivery.status}
                    </span>
                  </td>
                  <td className="text-ink-muted">
                    {delivery.failureCode ?? ""}
                    {delivery.nextRetryAt && <p className="text-caption">Next try {formatIndiaTime(delivery.nextRetryAt)}</p>}
                  </td>
                  <td>{delivery.attemptCount}</td>
                  <td>{delivery.canRetry && <RetryButton deliveryId={delivery.id} />}</td>
                </tr>
              ))}
            </PagedRows>
          </table>
        </div>
      )}
    </>
  );
}

// The cron job calls the runner every 5 minutes; more than 15 minutes of
// silence means it isn't set up or is failing (DEPLOYMENT Part I).
function RunnerStatus({ heartbeat }: { heartbeat: RunnerHeartbeat | null }) {
  const healthy = heartbeat !== null && heartbeat.minutesAgo <= 15;
  const when = heartbeat === null ? "" : heartbeat.minutesAgo < 1 ? "less than a minute ago" : `${heartbeat.minutesAgo} min ago`;
  return (
    <p role="status" className={`mb-4 rounded-md px-3 py-2 text-label ${healthy ? "bg-success-50 text-success-600" : "bg-warning-50 text-warning-600"}`}>
      {heartbeat === null
        ? "Job runner: has never run. Failed sends won't be retried until the cron job is set up (Deployment guide, Part I)."
        : healthy
          ? `Job runner: last ran ${when}.`
          : `Job runner: last ran ${when}. It should run every 5 minutes, so check the cron job (Deployment guide, Part I).`}
    </p>
  );
}
