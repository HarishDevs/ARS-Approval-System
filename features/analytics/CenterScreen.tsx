import Link from "next/link";
import { PageHeader } from "@/features/shell/PageHeader";
import { BarList, KpiCard, LineChart, hoursText } from "@/features/analytics/Charts";
import { BOARDS, departmentAlerts, forecastNext, moduleAlerts, monthLabel, agingBuckets, type Alert, type BoardKey } from "@/server/analytics/center";
import { comparisonPeriod, indiaToday, PERIOD_LABEL, resolvePeriod, type CompareMode, type PeriodKey } from "@/server/analytics/periods";
import type { Scope, Viewer } from "@/server/analytics/scope";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import { getSettingValue } from "@/server/settings/values";
import {
  activeContributors,
  approvalSummary,
  departmentRows,
  EMPLOYEE_SORTS,
  employeeRows,
  infoBoard,
  infoSummary,
  monthlyActivity,
  qualityChecks,
  slaBoard,
  taskBoard,
  taskSummary,
  taskTrend,
  type EmployeeSort,
} from "@/lib/db/repositories/analytics-center.repository";

// v1.12.0 (D-156): the Analytics Center's boards other than Approval
// analytics (which keeps its own screen). Everything is aggregated on the
// server for the viewer's scope; nothing here loads raw records into the
// browser. Each number is defined in the metric dictionary.
type Base = "/users/analytics" | "/admin/analytics";
type Query = Record<string, string | undefined>;

export function boardHref(base: Base, query: Query, changes: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...query, ...changes })) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `${base}?${text}` : base;
}

export function BoardTabs({ base, board, query }: { base: Base; board: BoardKey; query: Query }) {
  // Filters carry over between boards (scope, period, comparison).
  const carry = { scope: query.scope, period: query.period, from: query.from, to: query.to, compare: query.compare };
  return (
    <nav aria-label="Dashboards" className="-mx-4 mb-4 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {BOARDS.map((item) => (
          <li key={item.key}>
            <Link
              href={boardHref(base, carry, { board: item.key })}
              aria-current={item.key === board ? "page" : undefined}
              title={item.what}
              className={`-mb-px block whitespace-nowrap border-b-2 px-3 py-2.5 text-label ${item.key === board ? "border-primary-600 font-semibold text-primary-700" : "border-transparent text-ink-muted hover:border-line hover:text-ink"}`}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const pct = (value: number | null) => (value === null ? "—" : `${value}%`);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function Section({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section aria-label={title} className="mb-8">
      <h2 className="mb-1 text-body font-semibold">{title}</h2>
      {note && <p className="mb-3 text-caption text-ink-muted">{note}</p>}
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}

function Unavailable({ title, why }: { title: string; why: string }) {
  return (
    <p className="rounded-md border border-line bg-surface-muted px-3 py-2 text-label" role="note">
      <strong>{title}: not available.</strong> <span className="text-ink-muted">{why}</span>
    </p>
  );
}

function Alerts({ alerts }: { alerts: Alert[] }) {
  if (!alerts.length) return <p className="text-label text-ink-muted">No alerts for this period.</p>;
  return (
    <ul className="space-y-2" data-testid="center-alerts">
      {alerts.map((alert) => (
        <li key={alert.key} className={`rounded-md border px-3 py-2 text-label ${alert.tone === "danger" ? "border-danger-200 bg-danger-50 text-danger-600" : "border-warning-600/40 bg-warning-50 text-warning-600"}`}>
          {alert.text}
          <span className="block text-caption text-ink-muted">Rule: {alert.rule}</span>
        </li>
      ))}
    </ul>
  );
}

function Table({ caption, head, rows, testid }: { caption: string; head: string[]; rows: React.ReactNode[][]; testid?: string }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[640px] text-label" data-testid={testid}>
        <caption className="sr-only">{caption}</caption>
        <thead className="text-left text-caption text-ink-muted">
          <tr>
            {head.map((cell, index) => (
              <th key={cell} scope="col" className={`px-3 py-2 ${index > 0 ? "text-right" : ""}`}>
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={head.length} className="px-3 py-3 text-ink-muted">
                Nothing for this selection.
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, column) =>
                  column === 0 ? (
                    <th key={column} scope="row" className="px-3 py-2 text-left font-normal">
                      {cell}
                    </th>
                  ) : (
                    <td key={column} className="px-3 py-2 text-right tabular-nums">
                      {cell}
                    </td>
                  ),
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export async function CenterScreen({ base, board, query, scope, scopes, viewer, canExport }: { base: Base; board: Exclude<BoardKey, "approvals">; query: Query; scope: Scope; scopes: Scope[]; viewer: Viewer; canExport: boolean }) {
  const now = new Date();
  const today = indiaToday(now);
  const period = resolvePeriod({ key: query.period, from: query.from, to: query.to }, today);
  const compare: CompareMode = query.compare === "LAST_YEAR" ? "LAST_YEAR" : "PREVIOUS";
  const previous = comparisonPeriod(period, compare);
  const compareLabel = compare === "LAST_YEAR" ? "same period last year" : "previous period";
  const buckets = agingBuckets(await getSettingValue("analytics.aging_days").catch(() => null));
  const carry: Query = { board, scope: scope.kind, period: period.key, from: query.from, to: query.to, compare: query.compare };
  const meta = BOARDS.find((item) => item.key === board)!;
  const chip = (active: boolean) => `rounded-full border px-3 py-1 text-label ${active ? "border-primary-600 bg-primary-50 font-semibold text-primary-700" : "border-line text-ink-muted hover:bg-surface-muted"}`;
  const exportHref = (kind: string) => `/api/analytics/export?${new URLSearchParams(Object.entries({ ...carry, kind, base: base === "/admin/analytics" ? "admin" : "users", q: query.q, sort: query.sort }).filter((entry): entry is [string, string] => Boolean(entry[1]))).toString()}`;

  return (
    <>
      <PageHeader title="Analytics" description={`${scope.label} · ${period.label}: ${day(period.from)} – ${day(period.to)}, compared with ${day(previous.from)} – ${day(previous.to)}. India time (UTC+5:30).`}>
        <Link href={`${base}/metrics`} className="link text-label">
          How these are worked out
        </Link>
      </PageHeader>
      <BoardTabs base={base} board={board} query={query} />
      <p className="mb-3 text-label text-ink-muted">{meta.what}</p>

      <nav aria-label="Whose numbers" className="mb-3 flex flex-wrap gap-2">
        {scopes.map((item) => (
          <Link key={item.kind} href={boardHref(base, carry, { scope: item.kind })} className={chip(item.kind === scope.kind)} aria-current={item.kind === scope.kind ? "page" : undefined}>
            {item.label}
          </Link>
        ))}
      </nav>

      <form method="get" className="card mb-6 flex flex-wrap items-end gap-3 px-4 py-3" aria-label="Filters">
        <input type="hidden" name="board" value={board} />
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
          <label htmlFor="compare" className="field-label">
            Compare with
          </label>
          <select id="compare" name="compare" defaultValue={compare} className="field-input h-9 w-48">
            <option value="PREVIOUS">Previous period</option>
            <option value="LAST_YEAR">Same period last year</option>
          </select>
        </div>
        {board === "employees" && (
          <>
            <div>
              <label htmlFor="q" className="field-label">
                Person
              </label>
              <input id="q" name="q" type="search" defaultValue={query.q ?? ""} maxLength={60} placeholder="Name or User ID" className="field-input h-9 w-44" />
            </div>
            <div>
              <label htmlFor="sort" className="field-label">
                Sort by
              </label>
              <select id="sort" name="sort" defaultValue={query.sort ?? "name"} className="field-input h-9 w-48">
                <option value="name">Name</option>
                <option value="pending">Approvals waiting</option>
                <option value="overdue">Approvals overdue</option>
                <option value="tasks_open">Open tasks</option>
                <option value="tasks_overdue">Overdue tasks</option>
                <option value="acks_pending">Acknowledgements pending</option>
              </select>
            </div>
          </>
        )}
        <button type="submit" className="btn-primary btn-compact">
          Apply
        </button>
        <Link href={boardHref(base, { board, scope: scope.kind }, {})} className="link text-label">
          Clear filters
        </Link>
      </form>

      {board === "overview" && <Overview scope={scope} viewer={viewer} period={period} previous={previous} compareLabel={compareLabel} today={today} />}
      {board === "tasks" && <Tasks scope={scope} viewer={viewer} period={period} previous={previous} compareLabel={compareLabel} buckets={buckets} />}
      {board === "information" && <Information scope={scope} viewer={viewer} period={period} previous={previous} compareLabel={compareLabel} buckets={buckets} today={today} />}
      {board === "employees" && <Employees base={base} carry={carry} query={query} scope={scope} viewer={viewer} period={period} exportHref={canExport ? exportHref("employees") : null} />}
      {board === "departments" && <Departments scope={scope} period={period} exportHref={canExport ? exportHref("departments") : null} />}
      {board === "sla" && <Sla base={base} carry={carry} scope={scope} viewer={viewer} period={period} />}
      {board === "trends" && <Trends scope={scope} viewer={viewer} period={period} previous={previous} compareLabel={compareLabel} today={today} exportHref={canExport ? exportHref("monthly") : null} />}
      {board === "quality" && <Quality base={base} carry={carry} scope={scope} viewer={viewer} today={today} />}

      <p className="mt-8 text-caption text-ink-muted" data-testid="center-refreshed">
        As of {formatIndiaTime(now)}. Figures are worked out when the page opens. Period figures use each record&apos;s own date (raised, created, completed, decided, published or acknowledged); &ldquo;now&rdquo; figures ignore the period.
      </p>
    </>
  );
}

type Common = { scope: Scope; viewer: Viewer; period: ReturnType<typeof resolvePeriod>; previous: ReturnType<typeof resolvePeriod>; compareLabel: string };

async function Overview({ scope, viewer, period, previous, compareLabel, today }: Common & { today: string }) {
  const [approvals, approvalsBefore, tasks, tasksBefore, info, infoBefore, active, activeBefore, monthly, departments] = await Promise.all([
    approvalSummary(scope, viewer, period),
    approvalSummary(scope, viewer, previous),
    taskSummary(scope, viewer, period),
    taskSummary(scope, viewer, previous),
    infoSummary(scope, viewer, period),
    infoSummary(scope, viewer, previous),
    activeContributors(scope, viewer, period),
    activeContributors(scope, viewer, previous),
    monthlyActivity(scope, viewer, today, 12),
    departmentRows(scope, period),
  ]);
  const alerts = [
    ...moduleAlerts({ module: "Approvals", completionRate: approvals.completionRate, previousCompletionRate: approvalsBefore.completionRate, lateCount: approvals.late, previousLateCount: approvalsBefore.late }),
    ...moduleAlerts({ module: "Tasks", completionRate: tasks.completionRate, previousCompletionRate: tasksBefore.completionRate, lateCount: tasks.late, previousLateCount: tasksBefore.late }),
    ...(departments ? departmentAlerts(departments.map((row) => ({ name: row.name, open: row.requestsOpen + row.tasksOpen }))) : []),
    ...(info.ackRate !== null && info.ackRate < 50 && info.recipients >= 10 ? [{ key: "ack-low", tone: "warning" as const, text: `Information: only ${info.ackRate}% of recipients acknowledged what was published in this period.`, rule: "Under 50%, with 10 or more recipients." }] : []),
  ];
  return (
    <>
      <Section title="Approvals">
        <Grid>
          <KpiCard metric="raised" value={approvals.created} previous={approvalsBefore.created} compareLabel={compareLabel} />
          <KpiCard metric="open_requests" value={approvals.open} />
          <KpiCard metric="x_approvals_completed" value={approvals.completed} previous={approvalsBefore.completed} compareLabel={compareLabel} />
          <KpiCard metric="x_approval_completion" value={approvals.completionRate} previous={approvalsBefore.completionRate} compareLabel={compareLabel} />
          <KpiCard metric="x_approval_turnaround" value={approvals.avgHours} previous={approvalsBefore.avgHours} lowerIsBetter compareLabel={compareLabel} />
          <KpiCard metric="overdue_requests" value={approvals.overdue} lowerIsBetter />
        </Grid>
      </Section>
      <Section title="Tasks">
        <Grid>
          <KpiCard metric="x_tasks_created" value={tasks.created} previous={tasksBefore.created} compareLabel={compareLabel} />
          <KpiCard metric="x_tasks_open" value={tasks.open} />
          <KpiCard metric="x_tasks_completed" value={tasks.completed} previous={tasksBefore.completed} compareLabel={compareLabel} />
          <KpiCard metric="x_task_completion" value={tasks.completionRate} previous={tasksBefore.completionRate} compareLabel={compareLabel} />
          <KpiCard metric="x_tasks_overdue" value={tasks.overdue} lowerIsBetter />
        </Grid>
      </Section>
      <Section title="Information">
        <Grid>
          <KpiCard metric="x_info_published" value={info.published} previous={infoBefore.published} compareLabel={compareLabel} />
          <KpiCard metric="x_info_awaiting" value={info.awaitingAck} lowerIsBetter />
          <KpiCard metric="x_ack_rate" value={info.ackRate} previous={infoBefore.ackRate} compareLabel={compareLabel} note={`${info.acknowledged} of ${info.recipients} recipients`} />
          <KpiCard metric="i_read_rate" value={info.readRate} previous={infoBefore.readRate} compareLabel={compareLabel} />
        </Grid>
        <div className="mt-3">
          <Unavailable title="Overdue acknowledgements" why="Information has no acknowledgement deadline field (only reminder days). Pending acknowledgements by age are on the Information board." />
        </div>
      </Section>
      <Section title="People">
        <Grid>
          <KpiCard metric="x_active_users" value={active} previous={activeBefore} compareLabel={compareLabel} />
        </Grid>
      </Section>
      <Section title="Alerts" note="Fixed, explainable rules on the numbers above; no predictions.">
        <Alerts alerts={alerts} />
      </Section>
      <Section title="Activity by month">
        <LineChart
          title="Monthly activity by module"
          labels={monthly.map((row) => monthLabel(row.month))}
          series={[
            { key: "raised", label: "Requests raised", colorVar: "--color-primary-600", marker: "circle" },
            { key: "tasks", label: "Tasks created", colorVar: "--color-warning-600", marker: "square", dash: "6 3" },
            { key: "info", label: "Information published", colorVar: "--color-success-600", marker: "diamond", dash: "2 3" },
          ]}
          values={{ raised: monthly.map((row) => row.requestsRaised), tasks: monthly.map((row) => row.tasksCreated), info: monthly.map((row) => row.infoPublished) }}
          empty="No activity in the last 12 months."
        />
      </Section>
      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BarList title="Open work now, by module" rows={[{ label: "Requests open", value: approvals.open }, { label: "Tasks open", value: tasks.open }, { label: "Information awaiting acknowledgement", value: info.awaitingAck }]} />
        <BarList title="Overdue now, by module" rows={[{ label: "Requests with an overdue approval", value: approvals.overdue }, { label: "Overdue tasks", value: tasks.overdue }]} empty="Nothing overdue." />
      </div>
      {departments && (
        <Section title="Departments: open work" note="Requests by raiser's department; tasks by assignee's department. Kept in separate columns, never added together.">
          <Table
            caption="Open work by department"
            head={["Department", "Requests open", "Requests overdue", "Tasks open", "Tasks overdue", "Acknowledgements pending"]}
            rows={[...departments]
              .sort((a, b) => b.requestsOpen + b.tasksOpen - (a.requestsOpen + a.tasksOpen))
              .slice(0, 12)
              .map((row) => [row.name, row.requestsOpen, row.requestsOverdue, row.tasksOpen, row.tasksOverdue, row.acksPending])}
          />
        </Section>
      )}
    </>
  );
}

async function Tasks({ scope, viewer, period, previous, compareLabel, buckets }: Common & { buckets: ReturnType<typeof agingBuckets> }) {
  const [data, before, trend] = await Promise.all([taskBoard(scope, viewer, period, buckets), taskBoard(scope, viewer, previous, buckets), taskTrend(scope, viewer, period)]);
  return (
    <>
      <Section title="Volume and status">
        <Grid>
          <KpiCard metric="x_tasks_created" value={data.createdInPeriod} previous={before.createdInPeriod} compareLabel={compareLabel} />
          <KpiCard metric="x_tasks_completed" value={data.completedInPeriod} previous={before.completedInPeriod} compareLabel={compareLabel} />
          <KpiCard metric="x_task_completion" value={data.completionRate} previous={before.completionRate} compareLabel={compareLabel} />
          <KpiCard metric="t_cancel_rate" value={data.cancellationRate} previous={before.cancellationRate} lowerIsBetter compareLabel={compareLabel} />
          <KpiCard metric="x_tasks_overdue" value={data.overdue} lowerIsBetter />
          <KpiCard metric="t_due_today" value={data.dueToday} />
          <KpiCard metric="t_due_week" value={data.dueWeek} />
          <KpiCard metric="t_no_due" value={data.noDueDate} lowerIsBetter />
          <KpiCard metric="t_reopened" value={data.reopened} previous={before.reopened} lowerIsBetter compareLabel={compareLabel} />
          <KpiCard metric="t_postponed" value={data.postponed} previous={before.postponed} lowerIsBetter compareLabel={compareLabel} />
          <KpiCard metric="t_reassigned" value={data.reassigned} previous={before.reassigned} compareLabel={compareLabel} />
          <KpiCard metric="t_blocked" value={data.blocked.count} note={data.blocked.avgHours === null ? undefined : `Blocked for ${hoursText(data.blocked.avgHours)} on average`} lowerIsBetter />
        </Grid>
        <p className="mt-2 text-caption text-ink-muted">Every task has an assignee (it can&apos;t be saved without one), so &ldquo;tasks without an assignee&rdquo; is always 0. Tasks don&apos;t repeat and have no subtasks.</p>
      </Section>
      <Section title="Delivery against due dates" note="Only tasks with a due date count; the due date is the one the task has now.">
        <Grid>
          <KpiCard metric="t_on_time" value={data.delivery.onTimeRate} previous={before.delivery.onTimeRate} compareLabel={compareLabel} note={`${data.delivery.onTime} on time, ${data.delivery.late} late; ${data.delivery.untimed} had no due date`} />
          <KpiCard metric="t_days_late" value={data.delivery.avgDaysLate} lowerIsBetter />
          <KpiCard metric="t_duration" value={data.duration.median} lowerIsBetter note={`Average ${hoursText(data.duration.avg)} · 90th percentile ${data.duration.p90 === null ? "needs 10+ tasks" : hoursText(data.duration.p90)} · ${data.duration.count} completed`} />
        </Grid>
      </Section>
      <Section title="Created and completed">
        <LineChart
          title="Tasks created and completed"
          labels={trend.labels.map((label) => (label.length === 7 ? monthLabel(label) : new Date(`${label}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" })))}
          series={[
            { key: "created", label: "Created", colorVar: "--color-primary-600", marker: "circle" },
            { key: "completed", label: "Completed", colorVar: "--color-success-600", marker: "square", dash: "6 3" },
          ]}
          values={{ created: trend.created, completed: trend.completed }}
          empty="No tasks created or completed in this period."
        />
      </Section>
      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BarList title="Open now, by status" rows={[{ label: "Not started", value: data.status.OPEN ?? 0 }, { label: "In progress", value: data.status.IN_PROGRESS ?? 0 }, { label: "Blocked", value: data.status.BLOCKED ?? 0 }]} empty="No open tasks." />
        <BarList title="Open tasks by age" rows={buckets.map((bucket) => ({ label: bucket.label, value: data.aging[bucket.key] ?? 0 }))} empty="No open tasks." />
        <BarList title="Overdue tasks by time past due" rows={buckets.map((bucket) => ({ label: bucket.label, value: data.overdueAging[bucket.key] ?? 0 }))} empty="Nothing overdue." />
        <BarList title="By priority (open now)" rows={data.byPriority.map((row) => ({ label: row.label.toLowerCase(), value: row.open, note: `${row.completed} completed · ${pct(row.onTimeRate)} on time` }))} empty="No tasks." />
        <BarList title="By task type (open now)" rows={data.byType.map((row) => ({ label: row.label, value: row.open, note: `${row.completed} completed in the period` }))} empty="No tasks." />
        <BarList title="By assignee's department (open now)" rows={data.byDepartment.map((row) => ({ label: row.label, value: row.open, note: `${row.overdue} overdue · ${row.completed} completed · ${pct(row.onTimeRate)} on time` }))} empty="No tasks." />
      </div>
      <Section title="Workload by assignee" note="A workload and throughput indicator, not a productivity score: task size, priority and assignment differ.">
        <BarList title="Open tasks by assignee" rows={data.byAssignee.map((row) => ({ label: row.label, value: row.open, note: `${row.overdue} overdue · ${row.completed} completed in the period` }))} empty="No open tasks." />
      </Section>
      <Section title="Oldest open tasks">
        <Table
          caption="Oldest open tasks"
          head={["Task", "Priority", "Assignee", "Open for", "Overdue"]}
          rows={data.oldest.map((row) => [
            <Link key={row.id} href={`/users/tasks/${row.id}`} className="link">
              {row.taskNo}
            </Link>,
            row.priority.toLowerCase(),
            row.assignee,
            `${row.ageDays} days`,
            row.overdue ? "Yes" : "No",
          ])}
        />
      </Section>
      <Section title="Not tracked">
        <div className="space-y-2">
          <Unavailable title="Effort and utilisation" why="Tasks record no effort estimates or time logs, and there are no working hours per person." />
          <Unavailable title="Dependencies and recurring tasks" why="Tasks have no dependency links and don't repeat." />
        </div>
      </Section>
    </>
  );
}

async function Information({ scope, viewer, period, previous, compareLabel, buckets, today }: Common & { buckets: ReturnType<typeof agingBuckets>; today: string }) {
  const [data, before] = await Promise.all([infoBoard(scope, viewer, period, buckets, today), infoBoard(scope, viewer, previous, buckets, today)]);
  return (
    <>
      <Section title="Volume and lifecycle">
        <Grid>
          <KpiCard metric="x_info_published" value={data.publishedInPeriod} previous={before.publishedInPeriod} compareLabel={compareLabel} note={`${data.createdInPeriod} created · ${data.ackRequiredInPeriod} need acknowledgement · ${data.withdrawnInPeriod} withdrawn`} />
          <KpiCard metric="x_ack_rate" value={data.ack.rate} previous={before.ack.rate} compareLabel={compareLabel} note={`${data.ack.acknowledged} of ${data.ack.recipients} eligible recipients`} />
          <KpiCard metric="i_ack_time" value={data.ack.medianHours} lowerIsBetter note={`Median; average ${hoursText(data.ack.avgHours)}`} />
          <KpiCard metric="i_read_rate" value={data.reads.rate} previous={before.reads.rate} compareLabel={compareLabel} note={`${data.reads.read} of ${data.reads.recipients} opened it in ARS`} />
        </Grid>
        <div className="mt-4">
          <BarList
            title="Lifecycle now"
            rows={[
              { label: "Drafts", value: data.drafts },
              { label: "Scheduled (effective date ahead)", value: data.scheduled },
              { label: "Active", value: data.active },
              { label: "Expired", value: data.expired },
              { label: "Archived", value: data.archived },
            ]}
          />
        </div>
      </Section>
      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BarList title="Pending acknowledgements by time since publishing" rows={buckets.map((bucket) => ({ label: bucket.label, value: data.pendingAging[bucket.key] ?? 0 }))} empty="Nothing waiting for acknowledgement." />
        <BarList title="Acknowledgement rate by recipient's department" unit="percent" rows={data.byRecipientDepartment.map((row) => ({ label: row.label, value: row.ackRate, note: `${row.recipients} recipients · ${row.pending} still pending` }))} empty="No information needing acknowledgement in this period." />
        <BarList title="Published by type" rows={data.byType.map((row) => ({ label: row.label, value: row.published, note: `${pct(row.ackRate)} acknowledged (where required)` }))} empty="Nothing published." />
        <BarList title="Published by sender" rows={data.byPublisher.map((row) => ({ label: row.label, value: row.published, note: `${pct(row.ackRate)} acknowledged (where required)` }))} empty="Nothing published." />
      </div>
      <Section title="Lowest acknowledgement (published 7+ days ago)" note="Titles are shown to the sender and IT only.">
        <Table
          caption="Information with the lowest acknowledgement"
          head={["Information", "Recipients", "Acknowledged", "Published"]}
          rows={data.lowest.map((row) => [
            <Link key={row.id} href={`/users/information/${row.id}`} className="link">
              {row.infoNo}
              {row.title ? ` · ${row.title}` : ""}
            </Link>,
            row.recipients,
            pct(row.ackRate),
            `${row.ageDays} days ago`,
          ])}
        />
      </Section>
      <Section title="Notification delivery" note="Delivery is not reading, and reading is not acknowledgement: the three are kept apart.">
        <Table caption="Notification delivery of information" head={["Channel", "Sent", "Delivered", "Failed"]} rows={data.delivery.map((row) => [row.channel === "EMAIL" ? "Email" : "WhatsApp", row.sent, row.channel === "EMAIL" ? "not reported" : row.delivered, row.failed])} />
      </Section>
      <Section title="Not tracked">
        <div className="space-y-2">
          <Unavailable title="Acknowledgement deadlines and overdue acknowledgements" why="Information has no acknowledgement deadline field. Pending acknowledgements are shown by age instead." />
          <Unavailable title="Total and repeat views" why="Only the first time each person opens a record is recorded." />
        </div>
      </Section>
    </>
  );
}

async function Employees({ base, carry, query, scope, viewer, period, exportHref }: { base: Base; carry: Query; query: Query; scope: Scope; viewer: Viewer; period: ReturnType<typeof resolvePeriod>; exportHref: string | null }) {
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const sort = ((EMPLOYEE_SORTS as readonly string[]).includes(query.sort ?? "") ? query.sort : "name") as EmployeeSort;
  const size = 25;
  const search = (query.q ?? "").trim().slice(0, 60);
  const { rows, total } = await employeeRows(scope, viewer, period, { search, sort, page, size });
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <Section title={`People (${total})`} note="Approvals, tasks and information are kept in separate columns and never combined into one score. These are workload and throughput indicators, not productivity ratings.">
      {exportHref && (
        <p className="mb-2">
          <a href={exportHref} className="link text-label">
            Download as CSV
          </a>
        </p>
      )}
      <Table
        caption="Workload per person"
        testid="employee-table"
        head={["Person", "Requests raised", "Decisions", "Avg decision", "Approvals waiting", "Approvals overdue", "Tasks assigned", "Tasks completed", "Tasks open", "Tasks overdue", "On time", "Median task time", "Info published", "Acks pending"]}
        rows={rows.map((row) => [
          <span key={row.id}>
            {row.name}
            {row.department && <span className="block text-caption text-ink-muted">{row.department}</span>}
          </span>,
          row.submitted,
          row.decisions,
          hoursText(row.avgDecisionHours),
          row.pendingApprovals,
          row.overdueApprovals,
          row.tasksAssigned,
          row.tasksCompleted,
          row.tasksOpen,
          row.tasksOverdue,
          pct(row.onTimeRate),
          hoursText(row.medianTaskHours),
          row.infoPublished,
          row.acksPending,
        ])}
      />
      {pages > 1 && (
        <nav aria-label="Pages" className="mt-3 flex items-center gap-3 text-label">
          {page > 1 && (
            <Link href={boardHref(base, { ...carry, q: query.q, sort }, { page: String(page - 1) })} className="link">
              ← Previous
            </Link>
          )}
          <span>
            Page {page} of {pages}
          </span>
          {page < pages && (
            <Link href={boardHref(base, { ...carry, q: query.q, sort }, { page: String(page + 1) })} className="link">
              Next →
            </Link>
          )}
        </nav>
      )}
    </Section>
  );
}

async function Departments({ scope, period, exportHref }: { scope: Scope; period: ReturnType<typeof resolvePeriod>; exportHref: string | null }) {
  const rows = await departmentRows(scope, period);
  if (!rows) return <p className="card px-4 py-6 text-label text-ink-muted">Department analytics are for heads of department (their departments) and the IT team. Choose &ldquo;My department&rdquo; or &ldquo;Whole organisation&rdquo; if you have it.</p>;
  return (
    <Section title={`Departments (${rows.length})`} note="Requests by raiser's department; tasks by assignee's department; information by sender's department; acknowledgements by recipient's department. Each uses the person's department now.">
      {exportHref && (
        <p className="mb-2">
          <a href={exportHref} className="link text-label">
            Download as CSV
          </a>
        </p>
      )}
      <Table
        caption="Workload per department"
        testid="department-table"
        head={["Department", "People", "Requests raised", "Requests open", "Requests overdue", "Avg turnaround", "Tasks created", "Tasks completed", "Tasks open", "Tasks overdue", "Tasks on time", "Info published", "Ack rate", "Acks pending"]}
        rows={rows.map((row) => [row.name, row.people, row.requestsRaised, row.requestsOpen, row.requestsOverdue, hoursText(row.avgCycleHours), row.tasksCreated, row.tasksCompleted, row.tasksOpen, row.tasksOverdue, pct(row.taskOnTimeRate), row.infoPublished, pct(row.ackRate), row.acksPending])}
      />
    </Section>
  );
}

async function Sla({ base, carry, scope, viewer, period }: { base: Base; carry: Query; scope: Scope; viewer: Viewer; period: ReturnType<typeof resolvePeriod> }) {
  const data = await slaBoard(scope, viewer, period);
  return (
    <>
      <Section title="Approval response times" note="Steps with a response time only; due times are in working hours and move on while a request is on hold.">
        <Grid>
          <KpiCard metric="on_time_rate" value={data.approvals.onTimeRate} note={`${data.approvals.onTime} of ${data.approvals.timed} decisions in time; ${data.approvals.untimed} had no response time`} />
          <KpiCard metric="sla_breaches" value={data.approvals.breached} lowerIsBetter />
          <KpiCard metric="overdue_tasks" value={data.approvals.overdueNow} lowerIsBetter note={data.approvals.avgOverdueHours === null ? undefined : `Past due by ${hoursText(data.approvals.avgOverdueHours)} on average`} />
        </Grid>
        <p className="mt-2 text-label">
          <Link href={boardHref(base, carry, { board: "approvals" })} className="link">
            Response-time status, backlog and steps in detail (Approval analytics)
          </Link>
        </p>
      </Section>
      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BarList title="Decided in time, by raiser's department" unit="percent" rows={data.approvalsByDepartment.map((row) => ({ label: row.label, value: row.onTimeRate, note: `${row.timed} decisions with a response time` }))} empty="No decisions with a response time in this period." />
        <BarList title="Response times passed, by step" rows={data.approvalsByStep.map((row) => ({ label: row.label, value: row.breaches, note: `of ${row.timed} decisions with a response time` }))} empty="No response times passed in this period." />
      </div>
      <Section title="Task due dates">
        <Grid>
          <KpiCard metric="t_on_time" value={data.tasks.onTimeRate} note={`${data.tasks.onTime} of ${data.tasks.timed} with a due date; ${data.tasks.untimed} had none`} />
        </Grid>
        <div className="mt-4">
          <BarList title="Completed by the due date, by priority" unit="percent" rows={data.tasksByPriority.map((row) => ({ label: row.label.toLowerCase(), value: row.onTimeRate, note: `${row.timed} with a due date` }))} empty="No tasks with a due date completed in this period." />
        </div>
      </Section>
      <Section title="Information">
        <Unavailable title="Acknowledgement deadline compliance" why="Information has no acknowledgement deadline field." />
      </Section>
    </>
  );
}

async function Trends({ scope, viewer, period, previous, compareLabel, today, exportHref }: Common & { today: string; exportHref: string | null }) {
  const [monthly, approvals, approvalsBefore, tasks, tasksBefore, info, infoBefore] = await Promise.all([
    monthlyActivity(scope, viewer, today, 24),
    approvalSummary(scope, viewer, period),
    approvalSummary(scope, viewer, previous),
    taskSummary(scope, viewer, period),
    taskSummary(scope, viewer, previous),
    infoSummary(scope, viewer, period),
    infoSummary(scope, viewer, previous),
  ]);
  const last12 = monthly.slice(-12);
  const change = (now: number, then: number) => (then === 0 ? (now === 0 ? "0%" : "new") : `${now >= then ? "+" : ""}${Math.round(((now - then) / then) * 100)}%`);
  const series: [string, number[]][] = [
    ["Requests raised", monthly.map((row) => row.requestsRaised)],
    ["Tasks created", monthly.map((row) => row.tasksCreated)],
    ["Information published", monthly.map((row) => row.infoPublished)],
  ];
  const forecasts = series.map(([label, values]) => [label, forecastNext(values.slice(0, -1))] as const); // whole months only
  return (
    <>
      <Section title={`This period against the ${compareLabel}`}>
        <Table
          caption="Period comparison"
          head={["Measure", "This period", "Comparison", "Change"]}
          rows={[
            ["Requests raised", approvals.created, approvalsBefore.created, change(approvals.created, approvalsBefore.created)],
            ["Requests completed", approvals.completed, approvalsBefore.completed, change(approvals.completed, approvalsBefore.completed)],
            ["Approval completion rate", pct(approvals.completionRate), pct(approvalsBefore.completionRate), "—"],
            ["Tasks created", tasks.created, tasksBefore.created, change(tasks.created, tasksBefore.created)],
            ["Tasks completed", tasks.completed, tasksBefore.completed, change(tasks.completed, tasksBefore.completed)],
            ["Task completion rate", pct(tasks.completionRate), pct(tasksBefore.completionRate), "—"],
            ["Information published", info.published, infoBefore.published, change(info.published, infoBefore.published)],
            ["Acknowledgement rate", pct(info.ackRate), pct(infoBefore.ackRate), "—"],
          ]}
        />
      </Section>
      <Section title="Last 12 months">
        {exportHref && (
          <p className="mb-2">
            <a href={exportHref} className="link text-label">
              Download 24 months as CSV
            </a>
          </p>
        )}
        <LineChart
          title="Completion over 12 months"
          labels={last12.map((row) => monthLabel(row.month))}
          series={[
            { key: "closed", label: "Requests completed", colorVar: "--color-primary-600", marker: "circle" },
            { key: "tasks", label: "Tasks completed", colorVar: "--color-warning-600", marker: "square", dash: "6 3" },
            { key: "acks", label: "Acknowledgements", colorVar: "--color-success-600", marker: "diamond", dash: "2 3" },
          ]}
          values={{ closed: last12.map((row) => row.requestsClosed), tasks: last12.map((row) => row.tasksCompleted), acks: last12.map((row) => row.acknowledgements) }}
          empty="Nothing completed in the last 12 months."
        />
        <div className="mt-4">
          <Table
            caption="Monthly activity"
            head={["Month", "Requests raised", "Requests completed", "Tasks created", "Tasks completed", "Info published", "Acknowledgements"]}
            rows={last12.map((row) => [monthLabel(row.month), row.requestsRaised, row.requestsClosed, row.tasksCreated, row.tasksCompleted, row.infoPublished, row.acknowledgements])}
          />
        </div>
      </Section>
      <Section title="Next-month estimates" note="A straight-line estimate over the last 12 complete months, with a range. Shown only when there are 12 months of steady history; it is an estimate, not a promise.">
        <ul className="space-y-1 text-label" data-testid="center-forecasts">
          {forecasts.map(([label, forecast]) => (
            <li key={label}>
              <strong>{label}:</strong> {forecast ? `about ${forecast.value} (likely ${forecast.low}–${forecast.high})` : "not enough history yet (needs 12 complete months with activity)."}
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

async function Quality({ base, carry, scope, viewer, today }: { base: Base; carry: Query; scope: Scope; viewer: Viewer; today: string }) {
  const checks = await qualityChecks(scope, viewer, today);
  return (
    <Section title="Data quality" note="Records with missing or inconsistent data, and where to fix each. These are review indicators, not proof of a mistake.">
      <Table caption="Data quality checks" testid="quality-table" head={["Check", "Module", "Records", "Where to fix"]} rows={checks.map((check) => [check.label, check.module, check.count, <span key={check.key} className="whitespace-normal text-left">{check.fix}</span>])} />
      <p className="mt-3 text-label">
        Approval-specific checks (amendments, overrides, budget warnings, stuck requests) are on{" "}
        <Link href={boardHref(base, carry, { board: "approvals" })} className="link">
          Approval analytics
        </Link>{" "}
        and Admin → Needs attention.
      </p>
    </Section>
  );
}
