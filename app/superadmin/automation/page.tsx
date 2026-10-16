import type { Metadata } from "next";
import Link from "next/link";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { Badge } from "@/features/ui/Display";
import { ResendOutbox, RunJobsNow } from "@/features/admin/AttentionForms";
import { AUTOMATIONS, loadAutomationBoard, type AutomationHealth } from "@/server/ops/automation";
import { listJobRuns } from "@/lib/db/repositories/job-runs.repository";
import { listUnsentOutbox } from "@/lib/db/repositories/outbox.repository";
import { getRunnerHeartbeat } from "@/lib/db/repositories/jobs.repository";
import { formatIndiaTime } from "@/server/notifications/security-messages";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Automation & jobs" };

export const dynamic = "force-dynamic";

const HEALTH: Record<AutomationHealth, { tone: "success" | "warning" | "danger" | "neutral"; label: string }> = {
  OK: { tone: "success", label: "Running" },
  LATE: { tone: "warning", label: "Late: missed runs" },
  FAILING: { tone: "danger", label: "Last run failed" },
  NEVER: { tone: "neutral", label: "Never run" },
};

const describeCounts = (counts: Record<string, number | string>) =>
  Object.entries(counts)
    .filter(([, value]) => value !== 0 && value !== "")
    .map(([key, value]) => `${key} ${value}`)
    .join(" · ") || "nothing to do";

// FN11 / Addendum B: every automation, whether it's running, its history,
// and recovery (run now, resend). Super Admin only.
export default async function AutomationPage({ searchParams }: { searchParams: Promise<{ job?: string }> }) {
  await requireArea("superadmin");
  const raw = (await searchParams).job;
  const job = raw && AUTOMATIONS.some((automation) => automation.key === raw) ? raw : undefined;
  const [board, runs, unsent, heartbeat] = await Promise.all([loadAutomationBoard(), listJobRuns({ jobKey: job, limit: 50 }), listUnsentOutbox(100), getRunnerHeartbeat()]);
  const runnerLate = !heartbeat || heartbeat.minutesAgo > 15;
  const nameOf = new Map(AUTOMATIONS.map((automation) => [automation.key, automation.name]));

  return (
    <>
      <PageHeader title="Automation" description="Background jobs: what each does, whether it is running, its recent runs, and how to recover when something fails.">
        <RunJobsNow label="Run all jobs now" />
      </PageHeader>

      <p role={runnerLate ? "alert" : "status"} className={`mb-4 rounded-md px-3 py-2 text-label ${runnerLate ? "bg-danger-50 text-danger-600" : "bg-success-50 text-success-600"}`}>
        {heartbeat
          ? runnerLate
            ? `The job runner last finished ${heartbeat.minutesAgo} minutes ago. It should run every 5 minutes: check the cPanel cron job and its secret.`
            : `The job runner last finished ${heartbeat.minutesAgo} minute${heartbeat.minutesAgo === 1 ? "" : "s"} ago.`
          : "The job runner has never run. Set up the cPanel cron job (DEPLOYMENT Part I)."}
      </p>

      <section aria-labelledby="inventory" className="card mb-6 overflow-x-auto">
        <h2 id="inventory" className="border-b border-line px-5 py-3 font-semibold">
          Inventory
        </h2>
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Automation</th>
              <th scope="col">Status</th>
              <th scope="col">Last run</th>
              <th scope="col">Retries and safety</th>
              <th scope="col">If it fails</th>
            </tr>
          </thead>
          <tbody>
            {board.map(({ automation, summary, health }) => (
              <tr key={automation.key}>
                <td className="min-w-56">
                  <span className="font-semibold">{automation.name}</span>
                  <span className="block text-caption text-ink-muted">{automation.what}</span>
                  <span className="block text-caption text-ink-muted">{automation.trigger}</span>
                </td>
                <td className="whitespace-nowrap">
                  <Badge tone={HEALTH[health].tone}>{HEALTH[health].label}</Badge>
                  {summary && summary.runs24h > 0 && (
                    <span className="mt-1 block text-caption text-ink-muted">
                      {summary.runs24h} runs, {summary.failures24h} failed (24 h)
                    </span>
                  )}
                </td>
                <td className="min-w-48 text-label">
                  {summary?.lastRun ? (
                    <>
                      {formatIndiaTime(summary.lastRun.startedAt)}
                      <span className="block text-caption text-ink-muted">{summary.lastRun.status === "FAILED" ? (summary.lastRun.errorCode ?? "Failed") : describeCounts(summary.lastRun.counts)}</span>
                      {summary.lastOkAt && summary.lastRun.status !== "OK" && <span className="block text-caption text-ink-muted">Last good run {formatIndiaTime(summary.lastOkAt)}</span>}
                    </>
                  ) : (
                    <span className="text-ink-faint">—</span>
                  )}
                  <Link href={`/superadmin/automation?job=${automation.key}#runs`} className="link mt-1 block text-caption">
                    History
                  </Link>
                </td>
                <td className="min-w-56 text-caption">
                  <span className="block">{automation.retry}</span>
                  <span className="block text-ink-muted">{automation.idempotency}</span>
                </td>
                <td className="min-w-56 space-y-2 text-caption">
                  <span className="block">{automation.onFailure}</span>
                  <span className="block text-ink-muted">Recover: {automation.recovery}</span>
                  <span className="block text-ink-muted">Owner: {automation.owner}</span>
                  <RunJobsNow job={automation.key} label="Run now" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="unsent" className="card mb-6 overflow-x-auto">
        <h2 id="unsent" className="border-b border-line px-5 py-3 font-semibold">
          Messages not sent ({unsent.length})
        </h2>
        {unsent.length === 0 ? (
          <p className="px-5 py-4 text-label text-ink-muted">Every queued message has been sent.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Message</th>
                <th scope="col">Request</th>
                <th scope="col">Queued</th>
                <th scope="col">Tries</th>
                <th scope="col">
                  <span className="sr-only">Resend</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {unsent.map((row) => (
                <tr key={row.id}>
                  <td className="font-mono text-caption">{row.eventType}</td>
                  <td>
                    {row.requestId && row.requestNo ? (
                      <Link href={`/users/requests/${row.requestId}`} className="link">
                        {row.requestNo}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="whitespace-nowrap">{formatIndiaTime(row.createdAt)}</td>
                  <td>{row.gaveUp ? <Badge tone="danger">{row.attempts} · gave up</Badge> : row.attempts}</td>
                  <td>
                    <ResendOutbox outboxId={row.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-labelledby="runs-title" id="runs" className="card overflow-x-auto">
        <h2 className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3 font-semibold">
          <span id="runs-title">Recent runs{job ? `: ${nameOf.get(job)}` : ""}</span>
          {job && (
            <Link href="/superadmin/automation#runs" className="link text-label font-normal">
              Show all
            </Link>
          )}
        </h2>
        {runs.length === 0 ? (
          <p className="px-5 py-4 text-label text-ink-muted">No runs recorded yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Started</th>
                <th scope="col">Automation</th>
                <th scope="col">How</th>
                <th scope="col">Result</th>
                <th scope="col">Reference</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td className="whitespace-nowrap">{formatIndiaTime(run.startedAt)}</td>
                  <td>{nameOf.get(run.jobKey) ?? run.jobKey}</td>
                  <td>{run.trigger === "MANUAL" ? "Run now" : "Scheduled"}</td>
                  <td className="text-label">
                    <Badge tone={run.status === "OK" ? "success" : run.status === "FAILED" ? "danger" : "neutral"}>{run.status === "OK" ? "OK" : run.status === "FAILED" ? "Failed" : "Running"}</Badge>
                    <span className="mt-1 block text-caption text-ink-muted">{run.status === "FAILED" ? run.errorCode : describeCounts(run.counts)}</span>
                  </td>
                  <td className="font-mono text-caption text-ink-muted">{run.runRef.slice(0, 12)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
