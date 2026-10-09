import { PageHeader, EmptyState } from "@/features/shell/PageHeader";
import { requireArea } from "@/server/authorization/guards";
import { listRecentDeliveries } from "@/lib/db/repositories/notifications.repository";
import { RetryButton } from "@/features/superadmin/RetryButton";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import { getRunnerHeartbeat, type RunnerHeartbeat } from "@/lib/db/repositories/jobs.repository";

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
export default async function DeliveriesPage() {
  await requireArea("superadmin");
  const [deliveries, heartbeat] = await Promise.all([listRecentDeliveries(200), getRunnerHeartbeat()]);
  return (
    <>
      <PageHeader title="Message deliveries" description="The latest 200 email and WhatsApp sends. Failed sends are retried automatically every few minutes by the job runner. SKIPPED with TEMPLATE_NOT_CONFIGURED means the WhatsApp template for that event isn't set up yet." />
      <RunnerStatus heartbeat={heartbeat} />
      {deliveries.length === 0 ? (
        <EmptyState title="Nothing sent yet" body="Sign-in codes, alerts and test sends will appear here." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Event</th>
                <th>To</th>
                <th>Channel</th>
                <th>Status</th>
                <th>Reason</th>
                <th>Tries</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((delivery) => (
                <tr key={delivery.id}>
                  <td className="whitespace-nowrap">{formatIndiaTime(delivery.createdAt)}</td>
                  <td>{delivery.eventType}</td>
                  <td>{delivery.recipientName}</td>
                  <td>{delivery.channel === "EMAIL" ? "Email" : "WhatsApp"}</td>
                  <td>
                    <span className={`badge ${STATUS_STYLE[delivery.status] ?? ""}`}>{delivery.status}</span>
                  </td>
                  <td className="text-ink-muted">
                    {delivery.failureCode ?? ""}
                    {delivery.nextRetryAt && <p className="text-caption">Next try {formatIndiaTime(delivery.nextRetryAt)}</p>}
                  </td>
                  <td>{delivery.attemptCount}</td>
                  <td>{delivery.canRetry && <RetryButton deliveryId={delivery.id} />}</td>
                </tr>
              ))}
            </tbody>
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
