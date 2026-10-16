import type { Metadata } from "next";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { Badge, Breadcrumbs, Card, EmptyState } from "@/features/ui/Display";
import { CalendarConfigForm, CommandButton } from "@/features/integrations/CalendarForms";
import { calendarCommandAction } from "@/app/superadmin/integrations/google-calendar/actions";
import { calendarStats, listConflicts, listConnections, listJobs, loadSettingsRow } from "@/lib/db/repositories/gcal.repository";
import { listAuditForEntity } from "@/lib/db/repositories/audit.repository";
import { integrationStatus, redirectUri, SCOPES, STATUS_LABEL, WEBHOOK_PATH } from "@/server/calendar/config";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import { getEnv } from "@/config/environment";

export const metadata: Metadata = { title: "Google Calendar (Super Admin)" };
export const dynamic = "force-dynamic";

// v1.11.0 (D-152): Super Admin → Integrations → Google Calendar. Set-up,
// test, switch on/off, health, sync logs, failed syncs, connected people,
// conflicts and the audit history. Secrets are never shown.
const when = (date: Date | null) => (date ? formatIndiaTime(date) : "Never");
const TONE = { NOT_CONFIGURED: "warning", DISABLED: "neutral", ENABLED: "success", MAINTENANCE: "warning" } as const;
const CONNECTION_TONE = { ACTIVE: "success", NEEDS_REAUTH: "warning", DISCONNECTED: "neutral", REVOKED: "danger" } as const;

export default async function GoogleCalendarAdminPage() {
  await requireArea("superadmin");
  const settings = await loadSettingsRow();
  const status = integrationStatus({ enabled: settings.enabled, maintenance: settings.maintenance, clientId: settings.clientId, hasSecret: Boolean(settings.secretEnc), lastTestOk: settings.lastTestOk });
  const [stats, connections, failed, recent, conflicts, history] = await Promise.all([
    calendarStats(),
    listConnections(),
    listJobs({ statuses: ["FAILED", "DEAD"], limit: 50 }),
    listJobs({ limit: 20 }),
    listConflicts({ status: "OPEN", limit: 50 }),
    listAuditForEntity(["INTEGRATION"], "google_calendar", 25),
  ]);
  const base = getEnv().APP_BASE_URL;
  const redirect = redirectUri(base);
  const webhook = base ? new URL(WEBHOOK_PATH, base).toString() : null;

  return (
    <>
      <Breadcrumbs items={[{ href: "/superadmin", label: "Super Admin" }, { href: "/superadmin/integrations", label: "Integrations" }, { label: "Google Calendar" }]} />
      <PageHeader title="Google Calendar" description="Two-way sync between ARS and each person's own Google Calendar. You set it up here; each person connects their own account from their profile.">
        <Badge tone={TONE[status]}>{STATUS_LABEL[status]}</Badge>
      </PageHeader>

      <Card title="Status and actions" className="mb-6">
        <dl className="mb-4 grid gap-x-6 gap-y-2 text-label sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-ink-muted">Integration</dt>
            <dd className="font-semibold">{STATUS_LABEL[status]}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Last health check</dt>
            <dd>{settings.lastTestAt ? `${when(settings.lastTestAt)} · ${settings.lastTestOk ? "passed" : "failed"}` : "Not tested yet"}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Last configuration change</dt>
            <dd>
              {when(settings.updatedAt)}
              {settings.updatedByName ? ` · ${settings.updatedByName}` : ""} (version {settings.version})
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">Client secret</dt>
            <dd>{settings.secretEnc ? "Saved (encrypted, hidden)" : "Not set"}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap items-start gap-3">
          <CommandButton action={calendarCommandAction} fields={{ command: "test" }} label="Test configuration" />
          {settings.enabled ? (
            <CommandButton action={calendarCommandAction} fields={{ command: "disable" }} label="Disable integration" confirm="Syncing stops for everyone. Connections and events already in Google are kept." confirmLabel="Disable" danger />
          ) : (
            <CommandButton action={calendarCommandAction} fields={{ command: "enable" }} label="Enable integration" variant="primary" />
          )}
          {settings.maintenance ? (
            <CommandButton action={calendarCommandAction} fields={{ command: "maintenance-off" }} label="End maintenance mode" />
          ) : (
            <CommandButton action={calendarCommandAction} fields={{ command: "maintenance-on" }} label="Maintenance mode" confirm="Syncing pauses for everyone until you end maintenance mode." confirmLabel="Pause syncing" />
          )}
        </div>
        {settings.lastTest?.checks && (
          <ul className="mt-4 space-y-1 text-label" aria-label="Last check results" data-testid="gcal-checks">
            {settings.lastTest.checks.map((check) => (
              <li key={check.key} className={check.ok ? "text-success-600" : "text-danger-600"}>
                {check.ok ? "✓" : "✗"} {check.message}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Google Cloud set-up" className="mb-6">
        <ol className="list-decimal space-y-1 pl-5 text-label">
          <li>Google Cloud Console → APIs &amp; Services → Library → enable <strong>Google Calendar API</strong>.</li>
          <li>OAuth consent screen: add the scopes below. While the app is in &ldquo;Testing&rdquo;, only listed test users can connect and their access lapses after 7 days.</li>
          <li>Credentials → Create OAuth client ID → Web application. Authorised redirect URI, exactly:</li>
        </ol>
        <p className="mt-2 break-all rounded bg-surface-muted px-3 py-2 font-mono text-caption" data-testid="gcal-redirect">
          {redirect ?? "Set APP_BASE_URL on the server first."}
        </p>
        <p className="mt-3 text-label">Scopes requested from each person (the least needed):</p>
        <ul className="mt-1 list-disc pl-5 font-mono text-caption">
          {SCOPES.map((scope) => (
            <li key={scope} className="break-all">
              {scope}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-label">
          Change notifications arrive at <span className="break-all font-mono text-caption">{webhook ?? "(APP_BASE_URL not set)"}</span>. They need the public https address; the scheduled reconciliation
          covers anything missed.
        </p>
      </Card>

      <Card title="Configuration" className="mb-6">
        <CalendarConfigForm clientId={settings.clientId} hasSecret={Boolean(settings.secretEnc)} config={settings.config} />
      </Card>

      <Card title="Health (last 24 hours)" className="mb-6">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-label sm:grid-cols-3 lg:grid-cols-5" data-testid="gcal-health">
          {[
            ["Connected", stats.connections.ACTIVE],
            ["Need reauthorising", stats.connections.NEEDS_REAUTH],
            ["Disconnected / revoked", stats.connections.DISCONNECTED + stats.connections.REVOKED],
            ["Syncs done", stats.jobs24h.done],
            ["Syncs failed", stats.jobs24h.failed + stats.jobs24h.dead],
            ["Waiting to retry", stats.pendingRetries],
            ["API errors", stats.apiErrors24h],
            ["Connect failures", stats.oauthFailures24h],
            ["Channels expiring < 1 day", stats.channelsExpiringSoon],
            ["Conflicts to review", stats.openConflicts],
          ].map(([label, value]) => (
            <div key={label as string}>
              <dt className="text-ink-muted">{label}</dt>
              <dd className="text-card-title font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-caption text-ink-muted">
          Last successful sync: {when(stats.lastSuccessAt)} · Average time from queued to done: {stats.avgLatencySeconds === null ? "n/a" : `${stats.avgLatencySeconds} s`}
          {stats.lastErrorCategories.length > 0 && ` · Errors this week: ${stats.lastErrorCategories.map((item) => `${item.category} ${item.count}`).join(", ")}`}
        </p>
      </Card>

      <Card title={`Connected people (${connections.length})`} className="mb-6" bodyClassName="p-0">
        {connections.length === 0 ? (
          <div className="p-4">
            <EmptyState title="Nobody has connected yet" body="Once the integration is enabled, people connect from Profile → Calendar." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-label" aria-label="Connected people">
              <thead className="text-left text-caption text-ink-muted">
                <tr>
                  <th scope="col" className="px-4 py-2">Person</th>
                  <th scope="col" className="px-4 py-2">Google account · calendar</th>
                  <th scope="col" className="px-4 py-2">Status</th>
                  <th scope="col" className="px-4 py-2">Last sync</th>
                  <th scope="col" className="px-4 py-2">Waiting · conflicts</th>
                  <th scope="col" className="px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {connections.map((connection) => (
                  <tr key={connection.id}>
                    <td className="px-4 py-2">
                      {connection.userName} <span className="text-ink-muted">({connection.loginId})</span>
                    </td>
                    <td className="px-4 py-2 break-all">
                      {connection.googleEmail ?? "Unknown"} · {connection.calendarName ?? "No calendar"}
                    </td>
                    <td className="px-4 py-2">
                      <Badge tone={CONNECTION_TONE[connection.status]}>{connection.status.replace("_", " ").toLowerCase()}</Badge>
                      {connection.lastError && <span className="mt-1 block text-caption text-danger-600">{connection.lastError}</span>}
                    </td>
                    <td className="px-4 py-2">{when(connection.lastSyncAt)}</td>
                    <td className="px-4 py-2 tabular-nums">
                      {connection.pendingJobs} · {connection.openConflicts}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-2">
                        {connection.status === "ACTIVE" && <CommandButton action={calendarCommandAction} fields={{ command: "resync", connectionId: connection.id }} label="Full resync" />}
                        {(connection.status === "ACTIVE" || connection.status === "NEEDS_REAUTH") && (
                          <CommandButton
                            action={calendarCommandAction}
                            fields={{ command: "revoke", connectionId: connection.id }}
                            label="Revoke"
                            confirm={`End ${connection.userName}'s Google Calendar connection? Their tokens are deleted and syncing stops. ARS records aren't changed.`}
                            confirmLabel="Revoke connection"
                            danger
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={`Failed syncs (${failed.length})`} className="mb-6" actions={failed.length > 0 ? <CommandButton action={calendarCommandAction} fields={{ command: "retry-all" }} label="Retry all" /> : undefined}>
        {failed.length === 0 ? (
          <p className="text-label text-ink-muted">No failed syncs.</p>
        ) : (
          <ul className="divide-y divide-line text-label" data-testid="gcal-failed">
            {failed.map((job) => (
              <li key={job.id} className="flex flex-wrap items-start justify-between gap-3 py-2">
                <span className="min-w-0">
                  <strong>{job.userName}</strong> · {job.kind.replace("_", " ").toLowerCase()} · {job.status === "DEAD" ? "retries used up" : "failed"} after {job.attempts} attempt(s) · {when(job.finishedAt)}
                  <span className="block text-caption text-danger-600">
                    {job.errorCategory}: {job.errorDetail}
                  </span>
                </span>
                <CommandButton action={calendarCommandAction} fields={{ command: "retry", jobId: job.id }} label="Retry" />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Conflicts awaiting review" className="mb-6">
        {conflicts.length === 0 ? (
          <p className="text-label text-ink-muted">None. People usually resolve their own from Profile → Calendar.</p>
        ) : (
          <ul className="divide-y divide-line text-label">
            {conflicts.map((conflict) => (
              <li key={conflict.id} className="py-2">
                <strong>{conflict.userName}</strong>: personal entry #{conflict.entityId} · {conflict.conflictType === "BOTH_CHANGED" ? "changed in both places" : "deleted in Google, changed in ARS"} · {when(conflict.createdAt)}
                <div className="mt-2 flex flex-wrap gap-2">
                  <CommandButton action={calendarCommandAction} fields={{ command: "resolve", conflictId: conflict.id, resolution: "KEEP_ARS" }} label="Keep ARS version" />
                  <CommandButton action={calendarCommandAction} fields={{ command: "resolve", conflictId: conflict.id, resolution: "KEEP_GOOGLE" }} label="Keep Google version" />
                  <CommandButton action={calendarCommandAction} fields={{ command: "resolve", conflictId: conflict.id, resolution: "DISMISSED" }} label="Dismiss" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Recent sync log" className="mb-6" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-label" aria-label="Recent syncs">
            <thead className="text-left text-caption text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-2">Queued</th>
                <th scope="col" className="px-4 py-2">Person</th>
                <th scope="col" className="px-4 py-2">Kind · reason</th>
                <th scope="col" className="px-4 py-2">Status</th>
                <th scope="col" className="px-4 py-2">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {recent.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-ink-muted">
                    No syncs yet.
                  </td>
                </tr>
              )}
              {recent.map((job) => (
                <tr key={job.id}>
                  <td className="px-4 py-2 whitespace-nowrap">{when(job.createdAt)}</td>
                  <td className="px-4 py-2">{job.userName}</td>
                  <td className="px-4 py-2">
                    {job.kind.replace("_", " ").toLowerCase()} · {job.reason.toLowerCase().replace(/_/g, " ")}
                  </td>
                  <td className="px-4 py-2">{job.status.toLowerCase()}</td>
                  <td className="px-4 py-2 text-caption text-ink-muted">
                    {job.result
                      ? Object.entries(job.result)
                          .filter(([, value]) => value)
                          .map(([key, value]) => `${key} ${value}`)
                          .join(", ") || "no changes"
                      : (job.errorDetail ?? "")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Configuration history (audit)">
        {history.length === 0 ? (
          <p className="text-label text-ink-muted">No changes yet.</p>
        ) : (
          <ul className="divide-y divide-line text-label" data-testid="gcal-history">
            {history.map((entry) => (
              <li key={entry.id} className="py-2">
                {when(entry.occurredAt)} · {entry.actorName ?? "System"} · {entry.action.replace(/^GCAL_/, "").replace(/_/g, " ").toLowerCase()}
                {entry.result === "FAILURE" ? " (failed)" : ""}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
