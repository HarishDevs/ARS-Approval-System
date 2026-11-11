import Link from "next/link";
import { analyticsMeetings, meetingMonths, openActionsInScope, peopleOfDepartments, type AnalyticsMeeting, type MeetingAnalyticsScope } from "@/lib/db/repositories/meeting-analytics.repository";
import { isManagementMember } from "@/lib/db/repositories/meetings.repository";
import { teamOf } from "@/server/work/task-access";
import { durationBand, extendedBy, minutesBetween, STATUS_LABEL } from "@/server/meetings/rules";
import type { Scope, Viewer } from "@/server/analytics/scope";
import type { Period } from "@/server/analytics/periods";

// v1.52.0 (owner: "an end to end Meeting Analytics based on the access and
// hierarchy"): the Meetings board of Analytics. The scope at the top decides
// which meetings count (see meeting-analytics.repository.ts): the person's
// own, their whole reporting line (My team), the departments they head, or
// everything (IT; the Management group can switch to all meetings).
// The on-time figures are the Coordinator's ticks, never worked out.
const IST = 330 * 60_000;
const istStart = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - IST);
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : null);
const pctText = (value: number | null) => (value === null ? "—" : `${value}%`);
const avg = (values: number[]) => (values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null);
const hours = (from: Date | null, to: Date | null) => (from && to ? Math.max(0, (to.getTime() - from.getTime()) / 3_600_000) : null);
const hoursText = (value: number | null) => (value === null ? "—" : value < 24 ? `${Math.round(value)} h` : `${(value / 24).toFixed(1)} days`);

async function scopeFor(scope: Scope, viewer: Viewer, everything: boolean): Promise<MeetingAnalyticsScope> {
  const admin = viewer.roles.includes("IT_ADMIN") || viewer.roles.includes("SUPER_ADMIN");
  const management = await isManagementMember(viewer.id).catch(() => false);
  if (scope.kind === "ORGANISATION" || (management && everything)) return { all: true, seeManagement: true };
  const seeManagement = admin || management;
  if (scope.kind === "TEAM") return { all: false, peopleIds: [viewer.id, ...(await teamOf(viewer.id))], departmentIds: [], viewerId: viewer.id, seeManagement };
  if (scope.kind === "DEPARTMENT") {
    const departmentIds = scope.departmentIds ?? [];
    return { all: false, peopleIds: [viewer.id, ...(await peopleOfDepartments(departmentIds))], departmentIds, viewerId: viewer.id, seeManagement };
  }
  return { all: false, peopleIds: [viewer.id], departmentIds: [], viewerId: viewer.id, seeManagement };
}

interface Figures {
  meetings: number;
  held: number;
  cancelled: number;
  waitingMom: number;
  momApproved: number;
  pointsOnTime: number | null;
  startedOnTime: number | null;
  endedOnTime: number | null;
  momOnTime: number | null;
  attendance: number | null;
  present: number;
  invited: number;
  absent: number;
  avgMinutes: number | null;
  extendedCount: number;
  avgExtension: number | null;
  actions: number;
  actionsDone: number;
  actionsConfirmed: number;
  actionsOverdue: number;
  openPoints: number;
  pointsApprovalHours: number | null;
  momApprovalHours: number | null;
}

function figuresOf(rows: readonly AnalyticsMeeting[]): Figures {
  const live = rows.filter((row) => row.status !== "CANCELLED");
  const held = live.filter((row) => row.actualStart);
  const ratio = (key: "pointsOnTime" | "startedOnTime" | "endedOnTime" | "momOnTime") => {
    const judged = live.filter((row) => row[key] !== null);
    return pct(judged.filter((row) => row[key]).length, judged.length);
  };
  const extensions = held.map((row) => extendedBy(row.scheduledEnd, row.actualEnd)).filter((minutes) => minutes > 0);
  const present = held.reduce((sum, row) => sum + row.present, 0);
  const invited = held.reduce((sum, row) => sum + row.participants, 0);
  const pointsHours = live.map((row) => hours(row.pointsSubmittedAt, row.pointsDecidedAt)).filter((value): value is number => value !== null);
  const momHours = live.map((row) => hours(row.momSubmittedAt, row.momDecidedAt)).filter((value): value is number => value !== null);
  return {
    meetings: rows.length,
    held: held.length,
    cancelled: rows.length - live.length,
    waitingMom: live.filter((row) => ["AWAITING_MOM", "MOM_RETURNED", "MOM_SUBMITTED", "IN_PROGRESS"].includes(row.status)).length,
    momApproved: live.filter((row) => row.status === "MOM_APPROVED" || row.status === "CLOSED").length,
    pointsOnTime: ratio("pointsOnTime"),
    startedOnTime: ratio("startedOnTime"),
    endedOnTime: ratio("endedOnTime"),
    momOnTime: ratio("momOnTime"),
    attendance: pct(present, invited),
    present,
    invited,
    absent: held.reduce((sum, row) => sum + row.absent, 0),
    avgMinutes: avg(held.map((row) => minutesBetween(row.actualStart, row.actualEnd) ?? 0)),
    extendedCount: extensions.length,
    avgExtension: avg(extensions),
    actions: live.reduce((sum, row) => sum + row.actions, 0),
    actionsDone: live.reduce((sum, row) => sum + row.actionsDone, 0),
    actionsConfirmed: live.reduce((sum, row) => sum + row.actionsConfirmed, 0),
    actionsOverdue: live.reduce((sum, row) => sum + row.actionsOverdue, 0),
    openPoints: live.reduce((sum, row) => sum + row.openPoints, 0),
    pointsApprovalHours: pointsHours.length ? pointsHours.reduce((a, b) => a + b, 0) / pointsHours.length : null,
    momApprovalHours: momHours.length ? momHours.reduce((a, b) => a + b, 0) / momHours.length : null,
  };
}

function groupBy(rows: readonly AnalyticsMeeting[], key: (row: AnalyticsMeeting) => string) {
  const map = new Map<string, AnalyticsMeeting[]>();
  for (const row of rows) map.set(key(row), [...(map.get(key(row)) ?? []), row]);
  return [...map.entries()].map(([label, items]) => ({ label, figures: figuresOf(items) })).sort((a, b) => b.figures.meetings - a.figures.meetings || a.label.localeCompare(b.label));
}

function Change({ now, before, lowerIsBetter = false, unit = "" }: { now: number | null; before: number | null; lowerIsBetter?: boolean; unit?: string }) {
  if (now === null || before === null) return <span className="text-caption text-ink-muted">No earlier figure to compare</span>;
  const diff = now - before;
  if (diff === 0) return <span className="text-caption text-ink-muted">Same as the previous period</span>;
  const good = lowerIsBetter ? diff < 0 : diff > 0;
  return (
    <span className={`text-caption ${good ? "text-success-600" : "text-danger-600"}`}>
      {diff > 0 ? "▲" : "▼"} {Math.abs(diff)}
      {unit} vs previous period
    </span>
  );
}

function Kpi({ label, value, note, change }: { label: string; value: string; note?: string; change?: React.ReactNode }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-caption text-ink-muted">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      {note && <p className="text-caption text-ink-muted">{note}</p>}
      {change}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="mb-8">
      <h2 className="mb-3 text-body font-semibold">{title}</h2>
      {children}
    </section>
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

const breakdownRow = (label: React.ReactNode, f: Figures) => [label, f.meetings, f.held, pctText(f.pointsOnTime), pctText(f.startedOnTime), pctText(f.endedOnTime), pctText(f.momOnTime), pctText(f.attendance), `${f.actionsDone} of ${f.actions}`, f.actionsOverdue];
const BREAKDOWN_HEAD = ["Meetings", "Held", "Points in time", "Started on time", "Ended on time", "MOM in time", "Attendance", "Actions done", "Overdue"];

export async function MeetingBoard({ scope, viewer, period, previous, everything, everythingHref }: { scope: Scope; viewer: Viewer; period: Period; previous: Period; everything: boolean; everythingHref: string | null }) {
  const meetingScope = await scopeFor(scope, viewer, everything);
  const end = (day: string) => new Date(istStart(day).getTime() + 86_400_000);
  const yearAgo = new Date(istStart(period.to).getTime() - 365 * 86_400_000);
  const [rows, before, open, months, management] = await Promise.all([
    analyticsMeetings(meetingScope, istStart(period.from), end(period.to)),
    analyticsMeetings(meetingScope, istStart(previous.from), end(previous.to)),
    openActionsInScope(meetingScope),
    meetingMonths(meetingScope, yearAgo),
    isManagementMember(viewer.id).catch(() => false),
  ]);
  const now = figuresOf(rows);
  const then = figuresOf(before);
  const byType = groupBy(rows, (row) => row.typeName);
  const byDepartment = groupBy(rows, (row) => row.departmentName ?? "No department");
  const byCoordinator = groupBy(rows, (row) => row.coordinatorName).slice(0, 20);
  const owners = new Map<string, { name: string; department: string; open: number; overdue: number; toConfirm: number }>();
  for (const action of open) {
    const entry = owners.get(String(action.ownerId)) ?? { name: action.ownerName, department: action.departmentName ?? "—", open: 0, overdue: 0, toConfirm: 0 };
    if (action.doneUnconfirmed) entry.toConfirm += 1;
    else entry.open += 1;
    if (action.overdue) entry.overdue += 1;
    owners.set(String(action.ownerId), entry);
  }
  const ownerRows = [...owners.values()].sort((a, b) => b.overdue - a.overdue || b.open - a.open).slice(0, 25);
  const ageing = [
    { label: "Not due yet or no due date", value: open.filter((row) => !row.overdue && !row.doneUnconfirmed).length },
    { label: "Overdue up to 7 days", value: open.filter((row) => row.overdue && row.dueAt && Date.now() - row.dueAt.getTime() <= 7 * 86_400_000).length },
    { label: "Overdue 8 to 30 days", value: open.filter((row) => row.overdue && row.dueAt && Date.now() - row.dueAt.getTime() > 7 * 86_400_000 && Date.now() - row.dueAt.getTime() <= 30 * 86_400_000).length },
    { label: "Overdue over 30 days", value: open.filter((row) => row.overdue && row.dueAt && Date.now() - row.dueAt.getTime() > 30 * 86_400_000).length },
    { label: "Done, waiting for confirmation", value: open.filter((row) => row.doneUnconfirmed).length },
  ];
  const longest = [...rows].filter((row) => row.actualEnd).sort((a, b) => extendedBy(b.scheduledEnd, b.actualEnd) - extendedBy(a.scheduledEnd, a.actualEnd)).filter((row) => extendedBy(row.scheduledEnd, row.actualEnd) > 0).slice(0, 10);
  const attention = [...rows].filter((row) => row.actionsOverdue > 0 || ["AWAITING_MOM", "MOM_RETURNED"].includes(row.status)).sort((a, b) => b.actionsOverdue - a.actionsOverdue).slice(0, 15);

  return (
    <div data-testid="meeting-analytics">
      <p className="mb-4 text-label text-ink-muted">
        {meetingScope.all
          ? "Every meeting in the organisation."
          : scope.kind === "TEAM"
            ? "Meetings you or anyone below you in the reporting line (all levels) own, coordinate or attend."
            : scope.kind === "DEPARTMENT"
              ? "Meetings of the departments you head, and meetings their people are on."
              : "Meetings you own, coordinate, scheduled or attend."}{" "}
        On-time figures are the Coordinator&apos;s ticks in the MOM.
        {management && everythingHref && (
          <>
            {" "}
            <Link href={everythingHref} className="link">
              {everything ? "Show my scope only" : "Show all meetings (Management)"}
            </Link>
          </>
        )}
      </p>

      <Section title="Volume">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Meetings" value={String(now.meetings)} note={`${now.cancelled} cancelled`} change={<Change now={now.meetings} before={then.meetings} />} />
          <Kpi label="Held" value={String(now.held)} note={`${now.waitingMom} waiting for or with the MOM`} change={<Change now={now.held} before={then.held} />} />
          <Kpi label="MOM approved" value={String(now.momApproved)} note={`Points approved in ${hoursText(now.pointsApprovalHours)} · MOM in ${hoursText(now.momApprovalHours)} (average)`} />
          <Kpi label="Average length" value={now.avgMinutes === null ? "—" : `${now.avgMinutes} min`} note={now.avgMinutes === null ? undefined : durationBand(now.avgMinutes) ?? undefined} />
        </div>
      </Section>

      <Section title="On time (Coordinator's ticks)">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Points shared in time" value={pctText(now.pointsOnTime)} change={<Change now={now.pointsOnTime} before={then.pointsOnTime} unit="%" />} />
          <Kpi label="Started on time" value={pctText(now.startedOnTime)} change={<Change now={now.startedOnTime} before={then.startedOnTime} unit="%" />} />
          <Kpi label="Ended on time" value={pctText(now.endedOnTime)} note={`${now.extendedCount} extended${now.avgExtension ? `, by ${now.avgExtension} min on average` : ""}`} change={<Change now={now.endedOnTime} before={then.endedOnTime} unit="%" />} />
          <Kpi label="MOM in time" value={pctText(now.momOnTime)} change={<Change now={now.momOnTime} before={then.momOnTime} unit="%" />} />
        </div>
      </Section>

      <Section title="Attendance and follow-up">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Attendance" value={pctText(now.attendance)} note={`${now.present} present · ${now.absent} absent of ${now.invited}`} change={<Change now={now.attendance} before={then.attendance} unit="%" />} />
          <Kpi label="Action items" value={String(now.actions)} note={`${now.actionsDone} done · ${now.actionsConfirmed} confirmed`} />
          <Kpi label="Actions overdue" value={String(now.actionsOverdue)} change={<Change now={now.actionsOverdue} before={then.actionsOverdue} lowerIsBetter />} />
          <Kpi label="Open points" value={String(now.openPoints)} note="Still open, from these meetings" />
        </div>
      </Section>

      <Section title="By meeting type">
        <Table caption="Meetings by type" head={["Type", ...BREAKDOWN_HEAD]} rows={byType.map((row) => breakdownRow(row.label, row.figures))} testid="meeting-by-type" />
      </Section>
      <Section title="By department">
        <Table caption="Meetings by organising department" head={["Department", ...BREAKDOWN_HEAD]} rows={byDepartment.map((row) => breakdownRow(row.label, row.figures))} />
      </Section>
      <Section title="By Coordinator">
        <Table caption="Meetings by Coordinator" head={["Coordinator", ...BREAKDOWN_HEAD]} rows={byCoordinator.map((row) => breakdownRow(row.label, row.figures))} />
      </Section>

      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="Open action items by age (now)">
          <Table caption="Open action items by age" head={["Age", "Actions"]} rows={ageing.map((row) => [row.label, row.value])} />
        </Section>
        <Section title="Action owners (now)">
          <Table caption="Open action items by responsible person" head={["Person", "Department", "Open", "Overdue", "To confirm"]} rows={ownerRows.map((row) => [row.name, row.department, row.open, row.overdue, row.toConfirm])} testid="meeting-action-owners" />
        </Section>
      </div>

      <Section title="Twelve months">
        <Table
          caption="Meetings by month"
          head={["Month", "Meetings", "Held", "Cancelled", "MOM in time", "Attendance"]}
          rows={months.map((row) => [new Date(`${row.month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }), row.meetings, row.held, row.cancelled, pctText(pct(row.momOnTime, row.momJudged)), pctText(pct(row.present, row.invited))])}
        />
      </Section>

      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="Needs attention">
          <Table
            caption="Meetings with overdue actions or a MOM pending"
            head={["Meeting", "Status", "Overdue actions"]}
            rows={attention.map((row) => [
              <Link key={row.id} href={`/users/meetings/${row.id}`} className="link">
                {row.meetingNo} · {row.title}
              </Link>,
              STATUS_LABEL[row.status],
              row.actionsOverdue,
            ])}
          />
        </Section>
        <Section title="Most extended">
          <Table
            caption="Meetings that ran longest past their scheduled end"
            head={["Meeting", "Extended by"]}
            rows={longest.map((row) => [
              <Link key={row.id} href={`/users/meetings/${row.id}`} className="link">
                {row.meetingNo} · {row.title}
              </Link>,
              `${extendedBy(row.scheduledEnd, row.actualEnd)} min`,
            ])}
          />
        </Section>
      </div>
    </div>
  );
}
