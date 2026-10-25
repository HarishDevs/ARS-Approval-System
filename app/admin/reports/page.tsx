import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { featureOn } from "@/server/settings/features";
import { FileBarChart } from "lucide-react";
import { requireArea } from "@/server/authorization/guards";
import { canUseReports } from "@/server/settings/features";
import { PageHeader } from "@/features/shell/PageHeader";
import { Badge } from "@/features/ui/Display";
import { Hint } from "@/features/ui/Hint";
import { AlertForm, ScheduleForm, ToggleForm } from "@/features/analytics/ReportForms";
import { listActiveUserOptions } from "@/lib/db/repositories/admin-users.repository";
import { canExport } from "@/server/settings/features";
import { availableScopes } from "@/server/analytics/scope";
import { REPORT, reportsFor } from "@/server/reports/catalogue";
import { ALERT_METRICS, SEVERITY_LABEL, listAlertRules, listRuns, listSchedules } from "@/server/reports/schedules";
import { describeSchedule } from "@/server/reports/schedule-time";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import { listExports } from "@/server/reports/background";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Reports" };

export const dynamic = "force-dynamic";

// Reports catalogue, my schedules and my alerts (Addendum A §10, §15).
export default async function ReportsPage() {
  const { user } = await requireArea("admin");
  if (!(await canUseReports(user))) notFound();
  const scheduling = (await canExport(user)) && (await featureOn("scheduled_reports", user));
  const viewer = { id: user.id, roles: user.roles };
  const scopes = await availableScopes(viewer);
  const reports = reportsFor(scopes.map((scope) => scope.kind));
  const [schedules, runs, alerts, exports] = await Promise.all([listSchedules(user.id), listRuns(user.id, 10), listAlertRules(user.id), listExports(user.id, 10)]);
  // B06: people who can be added to a schedule (each gets their own numbers).
  const people = scheduling && schedules.length ? (await listActiveUserOptions()).filter((person) => person.id !== user.id).map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` })) : [];
  const nameOf = new Map(people.map((person) => [person.id, person.label]));
  const hourText = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
  const metrics = Object.entries(ALERT_METRICS)
    .filter(([, metric]) => metric.scopes.some((kind) => scopes.some((scope) => scope.kind === kind)))
    .map(([key, metric]) => ({ key, label: metric.label, scopes: [...metric.scopes], needsDays: metric.needsDays }));

  return (
    <>
      <PageHeader title="Reports" description="Ready-made reports for the requests and approvals you can see. Download them as Excel, CSV or PDF, or have them emailed to you." />
      <ul className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {reports.map((report) => (
          <li key={report.key}>
            <Link href={`/admin/reports/${report.key}`} className="card block h-full px-4 py-3 hover:border-primary-600">
              <span className="flex items-center gap-2 font-semibold">
                <FileBarChart aria-hidden="true" className="h-4 w-4 text-primary-600" />
                {report.name}
              </span>
              <span className="mt-1 block text-label text-ink-muted">{report.description}</span>
            </Link>
          </li>
        ))}
      </ul>

      {exports.length > 0 && (
        <section aria-labelledby="exports-title" id="exports" className="card mb-6 px-5 py-4">
          <h2 id="exports-title" className="mb-2 font-semibold">
            My exports
          </h2>
          <ul className="divide-y divide-line" data-testid="exports">
            {exports.map((job) => (
              <li key={job.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-label">
                <span>
                  <span className="font-semibold">{REPORT[job.reportKey]?.name ?? job.reportKey}</span> · {job.format.toUpperCase()}
                  <span className="block text-caption text-ink-muted">
                    Asked {formatIndiaTime(job.createdAt)}
                    {job.rows !== null ? ` · ${job.rows.toLocaleString("en-IN")} rows` : ""}
                    {job.message ? ` · ${job.message}` : ""}
                    {job.status === "DONE" && job.expiresAt ? ` · kept until ${formatIndiaTime(job.expiresAt)}` : ""}
                  </span>
                </span>
                {job.status === "DONE" ? (
                  <a href={`/api/exports/${job.id}`} className="btn-secondary btn-compact" download>
                    Download
                  </a>
                ) : (
                  <Badge tone={job.status === "FAILED" ? "danger" : "neutral"}>{job.status === "QUEUED" || job.status === "RUNNING" ? "being made" : job.status === "EXPIRED" ? "no longer kept" : "failed"}</Badge>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="schedules" className="card mb-6 px-5 py-4">
        <h2 id="schedules" className="mb-2 font-semibold">
          My scheduled reports
        </h2>
        {schedules.length === 0 ? (
          <p className="text-label text-ink-muted">None yet. Open a report and choose &ldquo;Email this to me regularly&rdquo;.</p>
        ) : (
          <ul className="divide-y divide-line">
            {schedules.map((schedule) => (
              <li key={schedule.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-label">
                <span>
                  <Link href={`/admin/reports/${schedule.reportKey}?${new URLSearchParams(schedule.query).toString()}`} className="link font-semibold">
                    {REPORT[schedule.reportKey]?.name ?? schedule.reportKey}
                  </Link>{" "}
                  · {describeSchedule(schedule)} (India time) · {schedule.format.toUpperCase()}
                  <span className="block text-caption text-ink-muted">
                    {schedule.active ? `Next: ${formatIndiaTime(schedule.nextRunAt)}` : "Switched off"}
                    {schedule.lastStatus ? ` · last: ${schedule.lastStatus.toLowerCase()}` : ""}
                    {schedule.failures ? ` · ${schedule.failures} failure${schedule.failures === 1 ? "" : "s"} in a row` : ""}
                    {schedule.recipients.length ? ` · also to ${schedule.recipients.map((personId) => nameOf.get(personId)?.replace(/ \(.*\)$/, "") ?? `#${personId}`).join(", ")}` : ""}
                  </span>
                  {scheduling && (
                    <ScheduleForm
                      people={people}
                      existing={{ id: schedule.id, frequency: schedule.frequency, weekday: schedule.weekday, monthDay: schedule.monthDay, hourIst: schedule.hourIst, format: schedule.format, recipients: schedule.recipients }}
                    />
                  )}
                </span>
                <ToggleForm kind="schedule" id={schedule.id} active={schedule.active} label={REPORT[schedule.reportKey]?.name ?? "schedule"} />
              </li>
            ))}
          </ul>
        )}
        {runs.length > 0 && (
          <details className="mt-3 text-label">
            <summary className="cursor-pointer text-primary-600">Recent deliveries</summary>
            <ul className="mt-2 space-y-1">
              {runs.map((run) => (
                <li key={`${run.scheduleId}-${run.dueAt.toISOString()}`}>
                  {formatIndiaTime(run.dueAt)} · {REPORT[run.reportKey]?.name ?? run.reportKey} · <Badge tone={run.status === "SENT" ? "success" : run.status === "FAILED" ? "danger" : "neutral"}>{run.status.toLowerCase()}</Badge> {run.message}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section aria-labelledby="alerts-title" id="alerts" className="card px-5 py-4">
        <div className="mb-3 flex items-center gap-1.5">
          <h2 id="alerts-title" className="font-semibold">
            My alerts
          </h2>
          <Hint text="Checked every few minutes. You're told in the app (and by email if you choose) when a number reaches your line, at most once a day while it stays there. Quiet hours hold a warning until they end; a critical alert is sent at once." align="start" />
        </div>
        {alerts.length > 0 && (
          <ul className="mb-4 divide-y divide-line">
            {alerts.map((rule) => {
              const metric = ALERT_METRICS[rule.metric];
              return (
                <li key={rule.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-label">
                  <span>
                    <span className="font-semibold">{metric ? (metric.needsDays ? metric.label.replace("N", String(rule.param ?? 3)) : metric.label) : rule.metric}</span> · {scopes.find((scope) => scope.kind === rule.scopeKind)?.label ?? rule.scopeKind} · line {rule.threshold}
                    <span className="block text-caption text-ink-muted">
                      {SEVERITY_LABEL[rule.severity]} · {rule.channels === "INBOX" ? "app inbox" : "inbox and email"}
                      {rule.quietStart !== null && rule.quietEnd !== null ? ` · quiet ${hourText(rule.quietStart)}–${hourText(rule.quietEnd)}${rule.severity === "CRITICAL" ? " (critical ignores it)" : ""}` : ""}
                      {" · "}
                      {rule.active ? (rule.firing ? "Over the line now" : "Watching") : "Switched off"}
                      {rule.lastValue !== null ? ` · last value ${rule.lastValue}` : ""}
                      {rule.lastFiredAt ? ` · last told ${formatIndiaTime(rule.lastFiredAt)}` : ""}
                    </span>
                  </span>
                  <ToggleForm kind="alert" id={rule.id} active={rule.active} label={`alert #${rule.id}`} />
                </li>
              );
            })}
          </ul>
        )}
        {!scheduling ? <p className="text-label text-ink-muted">Scheduled reports and alerts are switched off at the moment.</p> : metrics.length ? <AlertForm scopes={scopes.map((scope) => ({ kind: scope.kind, label: scope.label }))} metrics={metrics} /> : <p className="text-label text-ink-muted">No alerts are available for your role yet.</p>}
      </section>
    </>
  );
}
