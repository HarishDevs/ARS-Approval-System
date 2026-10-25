import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { canExport, featureOn } from "@/server/settings/features";
import { BoardPicker, CenterScreen } from "@/features/analytics/CenterScreen";
import { parseBoard } from "@/server/analytics/center";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { Hint } from "@/features/ui/Hint";
import { BarList, Heatmap, KpiCard, LineChart, StackedBar, hoursText } from "@/features/analytics/Charts";
import { resolveScope } from "@/server/analytics/scope";
import { bucketLabel, comparisonPeriod, indiaToday, PERIOD_LABEL, resolvePeriod, type PeriodKey } from "@/server/analytics/periods";
import { AGING_BUCKETS, SLA_LABEL, share } from "@/server/analytics/semantics";
import { loadAging, loadApproverLoad, loadBreakdown, loadKpis, loadNow, loadSla, loadSteps, loadTrend } from "@/lib/db/repositories/analytics.repository";
import { loadDueSoon, loadFilterChoices, loadHeatmap, loadHistory, loadQuality, loadStatusMix, type DrillKind } from "@/lib/db/repositories/analytics-more.repository";
import { dashboardChoices } from "@/lib/db/repositories/dashboards.repository";
import { findStuckRequests } from "@/server/ops/stuck";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import { listViews } from "@/lib/db/repositories/analytics-views.repository";
import { SavedViews, SaveViewForm } from "@/features/analytics/ReportForms";
import { readFilter, SLA_FILTER_LABEL, STATUS_FILTER_LABEL, withParams } from "@/server/analytics/query";
import { guardAnalyticsRate } from "@/server/analytics/rate";
// v1.7.1: the same screens in My approvals (/users/analytics) and in the
// Admin space (/admin/analytics), so opening Analytics never changes space.
export type AnalyticsBase = "/users/analytics" | "/admin/analytics";


// Role analytics (Addendum A, D-122; v1.7.0 list B). The scopes offered, and
// every query, depend on who is looking (server/analytics/scope.ts). Numbers
// follow the metric dictionary; "How these are worked out" opens it. Every
// number with a list behind it opens that list with the same filters.
export async function AnalyticsScreen({ searchParams, base }: { searchParams: Record<string, string | undefined>; base: AnalyticsBase }) {
  const { user } = await requireArea("users");
  if (!(await featureOn("analytics", user))) notFound();
  const viewer = { id: user.id, roles: user.roles };
  const isAdmin = user.roles.includes("IT_ADMIN") || user.roles.includes("SUPER_ADMIN");
  const query = searchParams;
  const views = await listViews(user.id, "DASHBOARD");
  // B07: no filters in the address → your default view, if you have one.
  const defaultView = Object.keys(query).length === 0 ? views.find((view) => view.isDefault && Object.keys(view.query).length > 0) : undefined;
  if (defaultView) redirect(`${base}?${new URLSearchParams(defaultView.query).toString()}`);
  // C04: analytics is query-heavy; a burst of reloads is slowed down.
  const limited = await guardAnalyticsRate(user.id);
  const { scope, scopes } = await resolveScope(query.scope ?? (base === "/admin/analytics" ? "ORGANISATION" : undefined), viewer);
  // v1.12.0 (D-156): the Analytics Center. Dashboards are tabs of this page.
  // An older link or saved view with approval filters opens Approval analytics.
  const APPROVAL_FILTERS = ["type", "department", "status", "approver", "step", "sla", "aging"];
  const board = query.board ? parseBoard(query.board) : APPROVAL_FILTERS.some((key) => query[key]) ? "approvals" : "overview";
  if (board !== "approvals" && !limited) return <CenterScreen base={base} board={board} query={query} scope={scope} scopes={scopes} viewer={viewer} canExport={await canExport(user)} />;
  const now = new Date();
  const period = resolvePeriod({ key: query.period, from: query.from, to: query.to }, indiaToday(now));
  const choices = await dashboardChoices();
  const { filter, compare, carried } = readFilter(query, { scope, period, typeIds: choices.types.map((type) => type.id), departmentIds: choices.departments.map((department) => department.id) });
  carried.board = "approvals";
  const previous = comparisonPeriod(period, compare);
  const compareLabel = compare === "LAST_YEAR" ? "same period last year" : period.key === "this_month" || period.key === "last_month" ? "previous month" : "previous period";
  if (limited) {
    return (
      <>
        <PageHeader title="Analytics" meta={scope.label} />
        <p role="alert" className="card px-4 py-3 text-label text-warning-600">
          Analytics was opened many times in the last minute. Wait a minute, then reload the page.
        </p>
      </>
    );
  }
  const benchmarked = scope.kind === "TEAM" || scope.kind === "DEPARTMENT";
  const organisation = { kind: "ORGANISATION" as const, label: "Whole organisation" };
  const orgFilter = { period, workflowId: filter.workflowId, departmentId: null };
  const [kpis, before, current, trend, aging, sla, byType, byDepartment, steps, approvers, stuck, due, quality, qualityBefore, statusMix, history, heatmap, filterChoices, orgKpis, orgQuality] = await Promise.all([
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
    loadDueSoon(scope, viewer, filter),
    loadQuality(scope, viewer, filter),
    loadQuality(scope, viewer, filter, previous),
    loadStatusMix(scope, viewer, filter),
    loadHistory(scope, viewer, filter),
    scope.kind === "MINE" ? Promise.resolve(null) : loadHeatmap(scope, viewer, filter),
    loadFilterChoices(scope, viewer, filter),
    // B04: organisation figures for comparison (rates and times only, never records).
    benchmarked ? loadKpis(organisation, viewer, orgFilter) : Promise.resolve(null),
    benchmarked ? loadQuality(organisation, viewer, orgFilter) : Promise.resolve(null),
  ]);
  const drill = (kind: DrillKind, changes: Record<string, string | null> = {}) => withParams(`${base}/list`, carried, { kind, ...changes });
  const here = (changes: Record<string, string | null>) => withParams(base, carried, changes);
  const approvals = scope.kind === "APPROVALS";
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const onTime = share(kpis.onTimeDecisions, kpis.timedDecisions);
  const onTimeBefore = share(before.onTimeDecisions, before.timedDecisions);
  const departmentId = (name: string) => choices.departments.find((department) => department.name === name)?.id ?? null;
  const historyLabels = history.points.map((point) => bucketLabel(point.key, history.grain));
  const narrowed = ["status", "approver", "step", "sla", "aging"].some((key) => carried[key]);

  return (
    <>
      <PageHeader title="Analytics" meta={`${scope.label} · ${period.label}: ${day(period.from)} – ${day(period.to)} (India time), compared with ${day(previous.from)} – ${day(previous.to)}`}>
        <Link href={`${base}/metrics`} className="link text-label">
          How these are worked out
        </Link>
      </PageHeader>
      <BoardPicker base={base} board="approvals" query={{ ...query, period: period.key }} scopes={scopes} scope={scope} />

      <form method="get" className="card mb-6 space-y-3 px-4 py-3" aria-label="Filters">
        <input type="hidden" name="scope" value={scope.kind} />
        <input type="hidden" name="board" value="approvals" />
        <div className="flex flex-wrap items-end gap-3">
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
            <label htmlFor="compare" className="field-label">
              Compare with
            </label>
            <select id="compare" name="compare" defaultValue={compare} className="field-input h-9 w-52">
              <option value="PREVIOUS">{period.key === "this_month" || period.key === "last_month" ? "Previous month" : "Previous period"}</option>
              <option value="LAST_YEAR">Same period last year</option>
            </select>
          </div>
          <div>
            <label htmlFor="type" className="field-label">
              Approval type
            </label>
            <select id="type" name="type" defaultValue={carried.type ?? ""} className="field-input h-9 w-56">
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
              <select id="department" name="department" defaultValue={carried.department ?? ""} className="field-input h-9 w-56">
                <option value="">All departments</option>
                {choices.departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <details open={narrowed} className="text-label">
          <summary className="cursor-pointer font-semibold text-primary-600">More filters{narrowed ? " (in use)" : ""}</summary>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="status" className="field-label">
                Status now
              </label>
              <select id="status" name="status" defaultValue={carried.status ?? ""} className="field-input h-9 w-44">
                <option value="">Any</option>
                {Object.entries(STATUS_FILTER_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="approver" className="field-label">
                Approver
              </label>
              <select id="approver" name="approver" defaultValue={carried.approver ?? ""} className="field-input h-9 w-52">
                <option value="">Anyone</option>
                {filterChoices.approvers.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="step" className="field-label">
                Step
              </label>
              <select id="step" name="step" defaultValue={carried.step ?? ""} className="field-input h-9 w-52">
                <option value="">Any</option>
                {filterChoices.steps.map((step) => (
                  <option key={step} value={step}>
                    {step}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="sla" className="field-label">
                Response time
              </label>
              <select id="sla" name="sla" defaultValue={carried.sla ?? ""} className="field-input h-9 w-64">
                <option value="">Any</option>
                {Object.entries(SLA_FILTER_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="aging" className="field-label">
                Open for
              </label>
              <select id="aging" name="aging" defaultValue={carried.aging ?? ""} className="field-input h-9 w-40">
                <option value="">Any age</option>
                {AGING_BUCKETS.map((bucket) => (
                  <option key={bucket.key} value={bucket.key}>
                    {bucket.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </details>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn-primary btn-compact">
            Apply
          </button>
          <Link href={`${base}?board=approvals&scope=${scope.kind}`} className="link text-label">
            Reset
          </Link>
        </div>
      </form>

      <div className="mb-6 flex flex-wrap items-start gap-6">
        <SavedViews views={views.map((view) => ({ id: view.id, name: view.name, href: `${base}?${new URLSearchParams(view.query).toString()}`, mine: view.mine, shared: view.shared, isDefault: view.isDefault, ownerName: view.ownerName }))} />
        <SaveViewForm target="DASHBOARD" query={carried} />
        {isAdmin && (
          <Link href="/admin/reports" className="link text-label">
            Reports and alerts
          </Link>
        )}
      </div>

      <h2 className="mb-2 text-label font-semibold uppercase tracking-wide text-ink-muted">Right now</h2>
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {approvals ? (
          <>
            <KpiCard metric="pending_tasks" value={current.pendingTasks} href="/users/queue" note="Waiting for you" />
            <KpiCard metric="overdue_tasks" value={current.overdueTasks} href="/users/queue?filter=overdue" />
            <KpiCard metric="pending_requests" value={current.pendingRequests} href={drill("pending")} />
            <KpiCard metric="paused" value={current.paused} href={drill("paused")} />
          </>
        ) : (
          <>
            <KpiCard metric="open_requests" value={current.openRequests} href={drill("open")} />
            <KpiCard metric="pending_requests" value={current.pendingRequests} href={drill("pending")} note={`${current.pendingTasks.toLocaleString("en-IN")} outstanding approval task${current.pendingTasks === 1 ? "" : "s"}`} />
            <KpiCard metric="overdue_requests" value={current.overdueRequests} href={drill("overdue")} note={`${current.overdueTasks.toLocaleString("en-IN")} overdue task${current.overdueTasks === 1 ? "" : "s"}`} />
            <KpiCard metric="awaiting_requester" value={current.awaitingRequester} href={drill("awaiting")} note={`${current.paused} on hold · ${current.blocked} blocked`} />
          </>
        )}
        <KpiCard metric="due_today" value={due.dueToday} href={drill("due_today")} />
        <KpiCard metric="due_week" value={due.dueWeek} href={drill("due_week")} />
        {stuck && <KpiCard metric="stuck" value={stuck.length} href="/admin/attention" />}
      </div>

      <h2 className="mb-2 text-label font-semibold uppercase tracking-wide text-ink-muted">{period.label}</h2>
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {approvals ? (
          <>
            <KpiCard metric="decisions" value={kpis.decisions} previous={before.decisions} compareLabel={compareLabel} />
            <KpiCard metric="avg_decision_hours" value={kpis.avgDecisionHours} previous={before.avgDecisionHours} lowerIsBetter compareLabel={compareLabel} />
            <KpiCard metric="on_time_rate" value={onTime} previous={onTimeBefore} compareLabel={compareLabel} note={kpis.timedDecisions ? `${kpis.onTimeDecisions} of ${kpis.timedDecisions} with a response time` : "No steps with a response time"} />
            <KpiCard metric="sent_back" value={kpis.sentBack} previous={before.sentBack} href={drill("sent_back")} compareLabel={compareLabel} />
          </>
        ) : (
          <>
            <KpiCard metric="raised" value={kpis.raised} previous={before.raised} href={drill("raised")} compareLabel={compareLabel} />
            <KpiCard metric="approved" value={kpis.approved} previous={before.approved} href={drill("approved")} compareLabel={compareLabel} note={`${kpis.rejected} rejected · ${kpis.withdrawn} withdrawn`} />
            <KpiCard metric="approval_rate" value={kpis.approvalRate} previous={before.approvalRate} compareLabel={compareLabel} />
            <KpiCard metric="avg_cycle_hours" value={kpis.avgCycleHours} previous={before.avgCycleHours} lowerIsBetter compareLabel={compareLabel} />
            <KpiCard metric="on_time_rate" value={onTime} previous={onTimeBefore} compareLabel={compareLabel} />
            <KpiCard metric="sent_back" value={kpis.sentBack} previous={before.sentBack} href={drill("sent_back")} compareLabel={compareLabel} />
            <KpiCard metric="amendments" value={kpis.amendments} previous={before.amendments} compareLabel={compareLabel} />
            <KpiCard metric="budget_warnings" value={kpis.budgetWarnings} previous={before.budgetWarnings} compareLabel={compareLabel} note={`${kpis.duplicateOverrides} possible duplicate${kpis.duplicateOverrides === 1 ? "" : "s"} submitted anyway`} />
          </>
        )}
        <KpiCard metric="median_cycle_hours" value={quality.medianCycleHours} previous={qualityBefore.medianCycleHours} lowerIsBetter compareLabel={compareLabel} />
        <KpiCard metric="first_pass_rate" value={quality.firstPassRate} previous={qualityBefore.firstPassRate} compareLabel={compareLabel} />
        <KpiCard metric="rework_rate" value={quality.reworkRate} previous={qualityBefore.reworkRate} lowerIsBetter compareLabel={compareLabel} />
        <KpiCard metric="withdrawal_rate" value={quality.withdrawalRate} previous={qualityBefore.withdrawalRate} lowerIsBetter compareLabel={compareLabel} href={drill("withdrawn")} />
      </div>

      {orgKpis && orgQuality && (
        <section aria-labelledby="benchmark" className="card mb-6 overflow-x-auto px-4 py-3">
          <h2 id="benchmark" className="flex items-center gap-1.5 font-semibold">
            {scope.label} compared with the whole organisation
            <Hint text="Rates and times only, for the same period and approval type." align="start" />
          </h2>
          <table className="data-table mt-2">
            <thead>
              <tr>
                <th scope="col">Measure</th>
                <th scope="col" className="text-right">
                  {scope.label}
                </th>
                <th scope="col" className="text-right">
                  Whole organisation
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Approval rate", kpis.approvalRate === null ? "—" : `${kpis.approvalRate}%`, orgKpis.approvalRate === null ? "—" : `${orgKpis.approvalRate}%`],
                ["Decided in time", onTime === null ? "—" : `${onTime}%`, share(orgKpis.onTimeDecisions, orgKpis.timedDecisions) === null ? "—" : `${share(orgKpis.onTimeDecisions, orgKpis.timedDecisions)}%`],
                ["Average time to decide a request", hoursText(kpis.avgCycleHours), hoursText(orgKpis.avgCycleHours)],
                ["Typical time (median)", hoursText(quality.medianCycleHours), hoursText(orgQuality.medianCycleHours)],
                ["Approved first time", quality.firstPassRate === null ? "—" : `${quality.firstPassRate}%`, orgQuality.firstPassRate === null ? "—" : `${orgQuality.firstPassRate}%`],
              ].map(([label, mine, org]) => (
                <tr key={label}>
                  <th scope="row" className="font-normal">
                    {label}
                  </th>
                  <td className="text-right tabular-nums">{mine}</td>
                  <td className="text-right tabular-nums">{org}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

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

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <LineChart
          title="Backlog and overdue"
          help="Open requests, and approval tasks past their due time, at the end of each day, week or month."
          empty="Nothing open in this period."
          labels={historyLabels}
          series={[
            { key: "backlog", label: "Backlog (open)", colorVar: "--color-primary-600", marker: "circle" },
            { key: "overdue", label: "Overdue tasks", colorVar: "--color-error-600", dash: "6 4", marker: "diamond" },
          ]}
          values={{ backlog: history.points.map((point) => point.backlog), overdue: history.points.map((point) => point.overdue) }}
        />
        <LineChart
          title="Decisions and response times passed"
          help="Approval decisions made, and tasks whose response time passed before a decision, in each day, week or month."
          empty="No decisions or passed response times in this period."
          labels={historyLabels}
          series={[
            { key: "approved", label: "Approved", colorVar: "--color-success-600", marker: "square" },
            { key: "rejected", label: "Rejected", colorVar: "--color-error-600", dash: "2 4", marker: "diamond" },
            { key: "sentBack", label: "Sent back", colorVar: "--color-warning-600", dash: "6 4", marker: "circle" },
            { key: "breaches", label: "Response time passed", colorVar: "--color-text-secondary", dash: "1 3", marker: "circle" },
          ]}
          values={{
            approved: history.points.map((point) => point.approved),
            rejected: history.points.map((point) => point.rejected),
            sentBack: history.points.map((point) => point.sentBack),
            breaches: history.points.map((point) => point.breaches),
          }}
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <StackedBar
          title="What became of the requests raised"
          help="Status now of the requests raised in the period."
          parts={[
            { key: "IN_PROGRESS", label: "In progress", value: statusMix.IN_PROGRESS ?? 0, colorVar: "--color-primary-600", href: drill("raised", { status: "IN_PROGRESS" }) },
            { key: "ON_HOLD", label: "On hold", value: statusMix.ON_HOLD ?? 0, colorVar: "--color-warning-600", pattern: true, href: drill("raised", { status: "ON_HOLD" }) },
            { key: "CHANGES_REQUIRED", label: "Changes required", value: statusMix.CHANGES_REQUIRED ?? 0, colorVar: "--color-warning-600", href: drill("raised", { status: "CHANGES_REQUIRED" }) },
            { key: "APPROVED", label: "Approved", value: statusMix.APPROVED ?? 0, colorVar: "--color-success-600", href: drill("raised", { status: "APPROVED" }) },
            { key: "REJECTED", label: "Rejected", value: statusMix.REJECTED ?? 0, colorVar: "--color-error-600", href: drill("raised", { status: "REJECTED" }) },
            { key: "CANCELLED", label: "Withdrawn", value: statusMix.CANCELLED ?? 0, colorVar: "--color-border-strong", href: drill("raised", { status: "CANCELLED" }) },
          ]}
        />
        <StackedBar
          title="Response-time status"
          help="Outstanding tasks now, and tasks decided in the period."
          parts={[
            { key: "WITHIN", label: SLA_LABEL.WITHIN, value: sla.WITHIN, colorVar: "--color-success-600", href: drill("pending", { sla: "WITHIN" }) },
            { key: "APPROACHING", label: SLA_LABEL.APPROACHING, value: sla.APPROACHING, colorVar: "--color-warning-600", href: drill("pending", { sla: "APPROACHING" }) },
            { key: "BREACHED", label: SLA_LABEL.BREACHED, value: sla.BREACHED, colorVar: "--color-error-600", href: drill("pending", { sla: "BREACHED" }) },
            { key: "PAUSED", label: SLA_LABEL.PAUSED, value: sla.PAUSED, colorVar: "--color-text-secondary", pattern: true, href: drill("paused", { sla: "PAUSED" }) },
            { key: "COMPLETED_WITHIN", label: SLA_LABEL.COMPLETED_WITHIN, value: sla.COMPLETED_WITHIN, colorVar: "--color-success-600", pattern: true },
            { key: "COMPLETED_AFTER", label: SLA_LABEL.COMPLETED_AFTER, value: sla.COMPLETED_AFTER, colorVar: "--color-error-600", pattern: true },
            { key: "NOT_CONFIGURED", label: SLA_LABEL.NOT_CONFIGURED, value: sla.NOT_CONFIGURED, colorVar: "--color-border-strong" },
          ]}
        />
        <BarList title="Open requests by age since raised" rows={AGING_BUCKETS.map((bucket) => ({ label: bucket.label, value: aging.sinceSubmission[bucket.key], href: aging.sinceSubmission[bucket.key] ? drill("open", { aging: bucket.key }) : undefined }))} empty="No open requests." />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BarList title="Outstanding tasks by time at the current step" rows={AGING_BUCKETS.map((bucket) => ({ label: bucket.label, value: aging.atCurrentStep[bucket.key] }))} empty="No outstanding tasks." />
        <BarList title="Raised by approval type" rows={byType.map((row) => ({ label: row.name, value: row.raised, href: row.id ? drill("raised", { type: String(row.id) }) : undefined, note: `${row.approved} approved · ${row.rejected} rejected · ${row.open} open · ${hoursText(row.avgCycleHours)} average` }))} />
        {scope.kind === "ORGANISATION" && <BarList title="Raised by department" rows={byDepartment.map((row) => ({ label: row.name, value: row.raised, href: row.id ? drill("raised", { department: String(row.id) }) : undefined, note: `${row.approved} approved · ${row.open} open · ${hoursText(row.avgCycleHours)} average` }))} />}
        {steps.length > 0 && (
          <BarList
            title="Where requests wait (outstanding tasks by step)"
            rows={steps.map((row) => ({ label: `${row.workflow} · ${row.step}`, value: row.pending, href: row.pending ? drill("pending", { step: row.step }) : undefined, note: `${row.decisions} decided · ${hoursText(row.avgDecisionHours)} average · ${row.onTimePercent === null ? "no response time" : `${row.onTimePercent}% in time`}` }))}
          />
        )}
        {approvers.length > 0 && (
          <BarList title="Approver workload (outstanding tasks)" rows={approvers.map((row) => ({ label: row.name, value: row.pending, href: row.pending ? drill("pending", { approver: String(row.id) }) : undefined, note: `${row.overdue} overdue · ${row.decided} decided · ${hoursText(row.avgDecisionHours)} average` }))} />
        )}
      </div>

      {heatmap && (
        <div className="mb-6">
          <Heatmap
            title="Where tasks wait, by department and step"
            help="Outstanding tasks now, by the raiser's department and the step. Darker means more; every cell shows its number."
            rows={heatmap.departments}
            columns={heatmap.steps}
            cells={heatmap.cells}
            cellHref={(department, step) => {
              const id = departmentId(department);
              return drill("pending", { step, ...(scope.kind === "ORGANISATION" && id ? { department: String(id) } : {}) });
            }}
          />
        </div>
      )}

      <p className="flex flex-wrap items-center gap-1.5 text-caption text-ink-muted">
        As of {formatIndiaTime(now)}.
        <Link href={here({})} className="link">
          Refresh
        </Link>
        <Hint text="Live figures; deleted requests are never counted." align="start" />
      </p>
    </>
  );
}
