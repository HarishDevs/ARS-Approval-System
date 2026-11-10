import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { requireArea } from "@/server/authorization/guards";
import { EmptyState, PageHeader } from "@/features/shell/PageHeader";
import { MeetingSections, MeetingStatusBadge } from "@/features/meetings/MeetingParts";
import { dashboardMeetings, type DashboardMeeting } from "@/lib/db/repositories/meetings.repository";
import { scopeFor } from "@/server/meetings/service";
import { compliance, durationBand, minutesBetween } from "@/server/meetings/rules";
import { indiaLocalToUtc } from "@/server/modules/settings";

export const metadata: Metadata = { title: "Meeting dashboard" };
export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const IST = 330 * 60_000;
const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "—");

interface Tally {
  name: string;
  held: number;
  cancelled: number;
  pointsOnTime: number;
  pointsJudged: number;
  startOnTime: number;
  startJudged: number;
  momOnTime: number;
  momJudged: number;
  present: number;
  invited: number;
  actions: number;
  done: number;
  overdue: number;
}
const empty = (name: string): Tally => ({
  name,
  held: 0,
  cancelled: 0,
  pointsOnTime: 0,
  pointsJudged: 0,
  startOnTime: 0,
  startJudged: 0,
  momOnTime: 0,
  momJudged: 0,
  present: 0,
  invited: 0,
  actions: 0,
  done: 0,
  overdue: 0,
});
function add(tally: Tally, row: DashboardMeeting) {
  if (row.status === "CANCELLED") {
    tally.cancelled += 1;
    return;
  }
  const facts = compliance(row);
  if (row.actualStart) tally.held += 1;
  if (facts.agendaOnTime !== null) {
    tally.pointsJudged += 1;
    if (facts.agendaOnTime) tally.pointsOnTime += 1;
  }
  if (facts.startedOnTime !== null) {
    tally.startJudged += 1;
    if (facts.startedOnTime) tally.startOnTime += 1;
  }
  if (facts.momOnTime !== null) {
    tally.momJudged += 1;
    if (facts.momOnTime) tally.momOnTime += 1;
  }
  if (row.actualStart) {
    tally.present += row.present;
    tally.invited += row.participants;
  }
  tally.actions += row.actions;
  tally.done += row.actionsDone;
  tally.overdue += row.actionsOverdue;
}

function TallyTable({ caption, rows }: { caption: string; rows: Tally[] }) {
  return (
    <div className="card overflow-x-auto">
      <table className="data-table">
        <caption className="px-4 py-2 text-left font-semibold">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Held</th>
            <th scope="col">Cancelled</th>
            <th scope="col">Points in time</th>
            <th scope="col">Started on time</th>
            <th scope="col">MOM in time</th>
            <th scope="col">Attendance</th>
            <th scope="col">Actions done</th>
            <th scope="col">Overdue</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td>{row.name}</td>
              <td>{row.held}</td>
              <td>{row.cancelled}</td>
              <td>{pct(row.pointsOnTime, row.pointsJudged)}</td>
              <td>{pct(row.startOnTime, row.startJudged)}</td>
              <td>{pct(row.momOnTime, row.momJudged)}</td>
              <td>{pct(row.present, row.invited)}</td>
              <td>
                {row.done} of {row.actions}
              </td>
              <td>{row.overdue}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// v1.51.0 (D-300): meeting compliance, from timestamps only (the register's
// ticked columns are worked out, never typed in). People see the meetings
// they are on; HODs their departments'; ED, MD and IT everything.
export default async function MeetingDashboardPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { user } = await requireArea("users");
  const query = await searchParams;
  const today = new Date(Date.now() + IST).toISOString().slice(0, 10);
  const from = query.from && ISO.test(query.from) ? query.from : `${today.slice(0, 8)}01`;
  // Default: this month, including meetings still to come.
  const monthEnd = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const to = query.to && ISO.test(query.to) && query.to >= from ? query.to : monthEnd;
  const start = indiaLocalToUtc(`${from}T00:00`) ?? new Date();
  const end = new Date((indiaLocalToUtc(`${to}T00:00`) ?? new Date()).getTime() + 86_400_000);
  const rows = await dashboardMeetings(await scopeFor(user), start, end);
  const total = empty("All meetings");
  const byType = new Map<string, Tally>();
  const byDepartment = new Map<string, Tally>();
  for (const row of rows) {
    add(total, row);
    add(byType.get(row.typeName) ?? byType.set(row.typeName, empty(row.typeName)).get(row.typeName)!, row);
    const department = row.departmentName ?? "No department";
    add(byDepartment.get(department) ?? byDepartment.set(department, empty(department)).get(department)!, row);
  }
  const kpis = [
    { label: "Meetings", value: String(rows.length) },
    { label: "Held", value: String(total.held) },
    { label: "Points in time", value: pct(total.pointsOnTime, total.pointsJudged) },
    { label: "Started on time", value: pct(total.startOnTime, total.startJudged) },
    { label: "MOM in time", value: pct(total.momOnTime, total.momJudged) },
    { label: "Attendance", value: pct(total.present, total.invited) },
    { label: "Actions done", value: `${total.done} of ${total.actions}` },
    { label: "Actions overdue", value: String(total.overdue) },
  ];
  return (
    <>
      <PageHeader icon={BarChart3} title="Meeting dashboard" description="How meetings run: on time, attendance and action follow-up." />
      <MeetingSections current="/users/meetings/dashboard" />
      <form method="get" action="/users/meetings/dashboard" className="mb-4 flex flex-wrap items-end gap-2" aria-label="Period">
        <label className="text-label">
          From
          <input type="date" name="from" defaultValue={from} className="field-input" />
        </label>
        <label className="text-label">
          To
          <input type="date" name="to" defaultValue={to} className="field-input" />
        </label>
        <button type="submit" className="btn-secondary w-auto">
          Show
        </button>
      </form>
      {rows.length === 0 ? (
        <EmptyState title="No meetings in this period" body="Choose another period, or schedule a meeting." />
      ) : (
        <div className="space-y-6">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="card px-4 py-3">
                <dt className="text-caption text-ink-muted">{kpi.label}</dt>
                <dd className="text-xl font-semibold">{kpi.value}</dd>
              </div>
            ))}
          </dl>
          <TallyTable caption="By meeting type" rows={[...byType.values()].sort((a, b) => a.name.localeCompare(b.name))} />
          <TallyTable caption="By department" rows={[...byDepartment.values()].sort((a, b) => a.name.localeCompare(b.name))} />
          <div className="card overflow-x-auto">
            <table className="data-table" data-testid="meeting-register">
              <caption className="px-4 py-2 text-left font-semibold">Register</caption>
              <thead>
                <tr>
                  <th scope="col">Meeting</th>
                  <th scope="col">Type</th>
                  <th scope="col">Department</th>
                  <th scope="col">Duration</th>
                  <th scope="col">Present</th>
                  <th scope="col">Actions</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const minutes = minutesBetween(row.actualStart, row.actualEnd);
                  return (
                    <tr key={row.id}>
                      <td>
                        <Link href={`/users/meetings/${row.id}`} className="text-primary-700 underline">
                          {row.meetingNo}
                        </Link>
                        <p className="text-caption text-ink-muted">{row.title}</p>
                      </td>
                      <td className="text-label">{row.typeName}</td>
                      <td className="text-label">{row.departmentName ?? "—"}</td>
                      <td className="text-label">{minutes === null ? "—" : `${minutes} min (${durationBand(minutes)})`}</td>
                      <td className="text-label">
                        {row.present} of {row.participants}
                      </td>
                      <td className="text-label">
                        {row.actionsDone} of {row.actions}
                        {row.actionsOverdue ? `, ${row.actionsOverdue} overdue` : ""}
                      </td>
                      <td>
                        <MeetingStatusBadge status={row.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
