import type { DashboardMeeting } from "@/lib/db/repositories/meetings.repository";
import { onTime } from "@/server/meetings/rules";

// v1.51.1: the meeting figures shared by the Meeting dashboard and the
// Meetings view of Home (one calculation, so both always agree).
export const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "—");

export interface Tally {
  name: string;
  meetings: number;
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

export const emptyTally = (name: string): Tally => ({
  name,
  meetings: 0,
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

export function addToTally(tally: Tally, row: DashboardMeeting) {
  tally.meetings += 1;
  if (row.status === "CANCELLED") {
    tally.cancelled += 1;
    return;
  }
  const facts = onTime(row); // v1.51.2: the Coordinator's ticks
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

// Totals, by meeting type and by department.
export function tallyMeetings(rows: readonly DashboardMeeting[]) {
  const total = emptyTally("All meetings");
  const byType = new Map<string, Tally>();
  const byDepartment = new Map<string, Tally>();
  const into = (map: Map<string, Tally>, key: string) => {
    if (!map.has(key)) map.set(key, emptyTally(key));
    return map.get(key)!;
  };
  for (const row of rows) {
    addToTally(total, row);
    addToTally(into(byType, row.typeName), row);
    addToTally(into(byDepartment, row.departmentName ?? "No department"), row);
  }
  const sorted = (map: Map<string, Tally>) => [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { total, byType: sorted(byType), byDepartment: sorted(byDepartment) };
}

export function kpisOf(total: Tally) {
  return [
    { label: "Meetings", value: String(total.meetings) },
    { label: "Held", value: String(total.held) },
    { label: "Points in time", value: pct(total.pointsOnTime, total.pointsJudged) },
    { label: "Started on time", value: pct(total.startOnTime, total.startJudged) },
    { label: "MOM in time", value: pct(total.momOnTime, total.momJudged) },
    { label: "Attendance", value: pct(total.present, total.invited) },
    { label: "Actions done", value: `${total.done} of ${total.actions}` },
    { label: "Actions overdue", value: String(total.overdue) },
  ];
}

export function KpiGrid({ total }: { total: Tally }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="meeting-kpis">
      {kpisOf(total).map((kpi) => (
        <div key={kpi.label} className="card px-4 py-3">
          <dt className="text-caption text-ink-muted">{kpi.label}</dt>
          <dd className="text-xl font-semibold tabular-nums">{kpi.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function TallyTable({ caption, rows }: { caption: string; rows: Tally[] }) {
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
