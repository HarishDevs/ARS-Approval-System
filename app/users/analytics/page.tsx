import Link from "next/link";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { BarList, KpiCard, LineChart, StackedBar, hoursText } from "@/features/analytics/Charts";
import { resolveScope } from "@/server/analytics/scope";
import { bucketLabel, indiaToday, PERIOD_LABEL, previousPeriod, resolvePeriod, type PeriodKey } from "@/server/analytics/periods";
import { AGING_BUCKETS, SLA_LABEL, share } from "@/server/analytics/semantics";
import { loadAging, loadApproverLoad, loadBreakdown, loadKpis, loadNow, loadSla, loadSteps, loadTrend, type AnalyticsFilter } from "@/lib/db/repositories/analytics.repository";
import { dashboardChoices } from "@/lib/db/repositories/dashboards.repository";
import { findStuckRequests } from "@/server/ops/stuck";
import { formatIndiaTime } from "@/server/notifications/security-messages";

export const dynamic = "force-dynamic";

// Role analytics (Addendum A, D-122). The scopes offered, and every query,
// depend on who is looking (server/analytics/scope.ts). Numbers follow the
// metric dictionary; "How these are worked out" opens it.
export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { user } = await requireArea("users");
  const viewer = { id: user.id, roles: user.roles };
  const query = await searchParams;
  const { scope, scopes } = await resolveScope(query.scope, viewer);
  const now = new Date();
  const period = resolvePeriod({ key: query.period, from: query.from, to: query.to }, indiaToday(now));
  const choices = await dashboardChoices();
  const workflowId = query.type === "-1" ? -1 : choices.types.some((type) => String(type.id) === query.type) ? Number(query.type) : null;
  const departmentId = scope.kind === "ORGANISATION" && choices.departments.some((department) => String(department.id) === query.department) ? Number(query.department) : null;
  const filter: AnalyticsFilter = { period, workflowId, departmentId };
  const previous = previousPeriod(period);
  const [kpis, before, current, trend, aging, sla, byType, byDepartment, steps, approvers, stuck] = await Promise.all([
    loadKpis(scope, viewer, filter),
    loadKpis(scope, viewer, filter, previous),
    loadNow(scope, viewer, filter),
    loadTrend(scope, viewer, filter),
    loadAging(scope, viewer, filter),
    loadSla(scope, viewer, filter),
    loadBreakdown("type", scope, viewer, filter),
    scope.kind === "ORGANISATION" ? loadBreakdown("department", scope, viewer, filter) : Promise.resolve([]),
    scope.kind === "MINE" ? Promise.resolve([]) : loadSteps(scope, viewer, filter),
    loadApproverLoad(scope, viewer, filter),
    scope.kind === "ORGANISATION" ? findStuckRequests().catch(() => null) : Promise.resolve(null),
  ]);
  const link = (changes: Record<string, string | null>) => {
    const params = new URLSearchParams();
    const merged: Record<string, string | null | undefined> = { scope: scope.kind, period: period.key, from: period.key === "custom" ? period.from : null, to: period.key === "custom" ? period.to : null, type: query.type ?? null, department: query.department ?? null, ...changes };
    for (const [key, value] of Object.entries(merged)) if (value) params.set(key, value);
    return `/users/analytics?${params.toString()}`;
  };
  const chip = (active: boolean) => `rounded-full border px-3 py-1 text-label ${active ? "border-primary-600 bg-primary-50 font-semibold text-primary-700" : "border-line text-ink-muted hover:bg-surface-muted"}`;
  const approvals = scope.kind === "APPROVALS";
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const onTime = share(kpis.onTimeDecisions, kpis.timedDecisions);
  const onTimeBefore = share(before.onTimeDecisions, before.timedDecisions);

  return (
    <>
      <PageHeader title="Analytics" description={`${scope.label} · ${period.label}: ${day(period.from)} – ${day(period.to)} (India time), compared with ${day(previous.from)} – ${day(previous.to)}`}>
        <Link href="/users/analytics/metrics" className="link text-label">
          How these are worked out
        </Link>
      </PageHeader>

      <nav aria-label="Whose numbers" className="mb-3 flex flex-wrap gap-2">
        {scopes.map((item) => (
          <Link key={item.kind} href={link({ scope: item.kind, department: null })} className={chip(item.kind === scope.kind)} aria-current={item.kind === scope.kind ? "page" : undefined}>
            {item.label}
          </Link>
        ))}
      </nav>

      <form method="get" className="card mb-6 flex flex-wrap items-end gap-3 px-4 py-3" aria-label="Filters">
        <input type="hidden" name="scope" value={scope.kind} />
        <div>
          <label htmlFor="period" className="field-label">
            Period
          </label>
          <select id="period" name="period" defaultValue={period.key} className="field-input h-9 w-48">
            {(Object.keys(PERIOD_LABEL) as PeriodKey[]).map((key) => (
              <option key={key} value={key}>
                {PERIOD_LABEL[key]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="from" className="field-label">
            From <span className="font-normal text-ink-faint">(custom)</span>
          </label>
          <input id="from" name="from" type="date" defaultValue={period.from} className="field-input h-9" />
        </div>
        <div>
          <label htmlFor="to" className="field-label">
            To <span className="font-normal text-ink-faint">(custom)</span>
          </label>
          <input id="to" name="to" type="date" defaultValue={period.to} className="field-input h-9" />
        </div>
        <div>
          <label htmlFor="type" className="field-label">
            Approval type
          </label>
          <select id="type" name="type" defaultValue={query.type ?? ""} className="field-input h-9 w-56">
            <option value="">All types</option>
            <option value="-1">Custom approvals</option>
            {choices.types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </div>
        {scope.kind === "ORGANISATION" && (
          <div>
            <label htmlFor="department" className="field-label">
              Raiser&apos;s department
            </label>
            <select id="department" name="department" defaultValue={query.department ?? ""} className="field-input h-9 w-56">
              <option value="">All departments</option>
              {choices.departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <button type="submit" className="btn-primary btn-compact">
          Apply
        </button>
        <Link href={`/users/analytics?scope=${scope.kind}`} className="link text-label">
          Reset
        </Link>
      </form>

      <h2 className="mb-2 text-label font-semibold uppercase tracking-wide text-ink-muted">Right now</h2>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {approvals ? (
          <>
            <KpiCard metric="pending_tasks" value={current.pendingTasks} href="/users/queue" note="Waiting for you" />
            <KpiCard metric="overdue_tasks" value={current.overdueTasks} href="/users/queue?filter=overdue" />
            <KpiCard metric="pending_requests" value={current.pendingRequests} />
            <KpiCard metric="paused" value={current.paused} />
          </>
        ) : (
          <>
            <KpiCard metric="open_requests" value={current.openRequests} />
            <KpiCard metric="pending_requests" value={current.pendingRequests} note={`${current.pendingTasks.toLocaleString("en-IN")} outstanding approval task${current.pendingTasks === 1 ? "" : "s"}`} />
            <KpiCard metric="overdue_requests" value={current.overdueRequests} note={`${current.overdueTasks.toLocaleString("en-IN")} overdue task${current.overdueTasks === 1 ? "" : "s"}`} />
            <KpiCard metric="awaiting_requester" value={current.awaitingRequester} note={`${current.paused} on hold · ${current.blocked} blocked`} />
          </>
        )}
        {stuck && <KpiCard metric="stuck" value={stuck.length} href="/admin/attention" />}
      </div>

      <h2 className="mb-2 text-label font-semibold uppercase tracking-wide text-ink-muted">{period.label}</h2>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {approvals ? (
          <>
            <KpiCard metric="decisions" value={kpis.decisions} previous={before.decisions} />
            <KpiCard metric="avg_decision_hours" value={kpis.avgDecisionHours} previous={before.avgDecisionHours} lowerIsBetter />
            <KpiCard metric="on_time_rate" value={onTime} previous={onTimeBefore} note={kpis.timedDecisions ? `${kpis.onTimeDecisions} of ${kpis.timedDecisions} with a response time` : "No steps with a response time"} />
            <KpiCard metric="sent_back" value={kpis.sentBack} previous={before.sentBack} />
          </>
        ) : (
          <>
            <KpiCard metric="raised" value={kpis.raised} previous={before.raised} />
            <KpiCard metric="approved" value={kpis.approved} previous={before.approved} note={`${kpis.rejected} rejected · ${kpis.withdrawn} withdrawn`} />
            <KpiCard metric="approval_rate" value={kpis.approvalRate} previous={before.approvalRate} />
            <KpiCard metric="avg_cycle_hours" value={kpis.avgCycleHours} previous={before.avgCycleHours} lowerIsBetter />
            <KpiCard metric="on_time_rate" value={onTime} previous={onTimeBefore} />
            <KpiCard metric="sent_back" value={kpis.sentBack} previous={before.sentBack} />
            <KpiCard metric="amendments" value={kpis.amendments} previous={before.amendments} />
            <KpiCard metric="budget_warnings" value={kpis.budgetWarnings} previous={before.budgetWarnings} note={`${kpis.duplicateOverrides} possible duplicate${kpis.duplicateOverrides === 1 ? "" : "s"} submitted anyway`} />
          </>
        )}
      </div>

      <div className="mb-6">
        <LineChart
          title="Raised and decided over time"
          labels={trend.points.map((point) => bucketLabel(point.key, trend.grain))}
          series={[
            { key: "raised", label: "Raised", colorVar: "--color-primary-600", marker: "circle" },
            { key: "approved", label: "Approved", colorVar: "--color-success-600", dash: "6 4", marker: "square" },
            { key: "rejected", label: "Rejected", colorVar: "--color-error-600", dash: "2 4", marker: "diamond" },
          ]}
          values={{ raised: trend.points.map((point) => point.raised), approved: trend.points.map((point) => point.approved), rejected: trend.points.map((point) => point.rejected) }}
        />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <StackedBar
          title="Response-time status"
          help="Outstanding tasks now, and tasks decided in the period."
          parts={[
            { key: "WITHIN", label: SLA_LABEL.WITHIN, value: sla.WITHIN, colorVar: "--color-success-600" },
            { key: "APPROACHING", label: SLA_LABEL.APPROACHING, value: sla.APPROACHING, colorVar: "--color-warning-600" },
            { key: "BREACHED", label: SLA_LABEL.BREACHED, value: sla.BREACHED, colorVar: "--color-error-600" },
            { key: "PAUSED", label: SLA_LABEL.PAUSED, value: sla.PAUSED, colorVar: "--color-text-secondary", pattern: true },
            { key: "COMPLETED_WITHIN", label: SLA_LABEL.COMPLETED_WITHIN, value: sla.COMPLETED_WITHIN, colorVar: "--color-success-600", pattern: true },
            { key: "COMPLETED_AFTER", label: SLA_LABEL.COMPLETED_AFTER, value: sla.COMPLETED_AFTER, colorVar: "--color-error-600", pattern: true },
            { key: "NOT_CONFIGURED", label: SLA_LABEL.NOT_CONFIGURED, value: sla.NOT_CONFIGURED, colorVar: "--color-border-strong" },
          ]}
        />
        <BarList title="Open requests by age since raised" rows={AGING_BUCKETS.map((bucket) => ({ label: bucket.label, value: aging.sinceSubmission[bucket.key] }))} empty="No open requests." />
        <BarList title="Outstanding tasks by time at the current step" rows={AGING_BUCKETS.map((bucket) => ({ label: bucket.label, value: aging.atCurrentStep[bucket.key] }))} empty="No outstanding tasks." />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <BarList title="Raised by approval type" rows={byType.map((row) => ({ label: row.name, value: row.raised, note: `${row.approved} approved · ${row.rejected} rejected · ${row.open} open · ${hoursText(row.avgCycleHours)} average` }))} />
        {scope.kind === "ORGANISATION" && <BarList title="Raised by department" rows={byDepartment.map((row) => ({ label: row.name, value: row.raised, note: `${row.approved} approved · ${row.open} open · ${hoursText(row.avgCycleHours)} average` }))} />}
        {steps.length > 0 && (
          <BarList
            title="Where requests wait (outstanding tasks by step)"
            rows={steps.map((row) => ({ label: `${row.workflow} · ${row.step}`, value: row.pending, note: `${row.decisions} decided · ${hoursText(row.avgDecisionHours)} average · ${row.onTimePercent === null ? "no response time" : `${row.onTimePercent}% in time`}` }))}
          />
        )}
        {approvers.length > 0 && (
          <BarList title="Approver workload (outstanding tasks)" rows={approvers.map((row) => ({ label: row.name, value: row.pending, note: `${row.overdue} overdue · ${row.decided} decided · ${hoursText(row.avgDecisionHours)} average` }))} />
        )}
      </div>

      <p className="text-caption text-ink-muted">As of {formatIndiaTime(now)}. Live figures; deleted requests are never counted.</p>
    </>
  );
}
