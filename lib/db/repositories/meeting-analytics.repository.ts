import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import type { MeetingStatus } from "@/server/meetings/rules";

// v1.52.0 (owner: "an end to end Meeting Analytics based on the access and
// hierarchy"): the Meetings board of Analytics. Which meetings count is
// decided here, in SQL, from the Analytics scope:
// - the person's own meetings (Owner, Coordinator, creator or participant);
// - My team: the same for everyone below them in the reporting line (all levels);
// - My department(s): meetings organised by or involving the departments they
//   head, and meetings their department's people are on;
// - Whole organisation (IT) and the Management group (ED, MD): every meeting.
// Management-only meetings count only for people on them, the Management
// group and IT.
type Row = RowDataPacket & Record<string, unknown>;
const num = (value: unknown) => Number(value ?? 0);
const str = (value: unknown) => (value === null || value === undefined ? "" : String(value));
const dateOrNull = (value: unknown) => (value instanceof Date ? value : value ? new Date(String(value)) : null);
const tick = (value: unknown): boolean | null => (value === null || value === undefined ? null : Boolean(Number(value)));

export type MeetingAnalyticsScope = { all: true; seeManagement: true } | { all: false; peopleIds: number[]; departmentIds: number[]; viewerId: number; seeManagement: boolean };

export function meetingScopeSql(scope: MeetingAnalyticsScope): { sql: string; params: unknown[] } {
  if (scope.all) return { sql: "m.deleted_at IS NULL", params: [] };
  const parts: string[] = [];
  const params: unknown[] = [];
  const people = scope.peopleIds.length ? scope.peopleIds : [0];
  parts.push("(m.owner_id IN (?) OR m.coordinator_id IN (?) OR m.created_by IN (?) OR EXISTS (SELECT 1 FROM meeting_participants sp WHERE sp.meeting_id = m.id AND sp.user_id IN (?)))");
  params.push(people, people, people, people);
  if (scope.departmentIds.length) {
    parts.push(
      "(m.department_id IN (?) OR EXISTS (SELECT 1 FROM meeting_departments sd WHERE sd.meeting_id = m.id AND sd.department_id IN (?)) OR EXISTS (SELECT 1 FROM meeting_participants sp2 JOIN users su ON su.id = sp2.user_id WHERE sp2.meeting_id = m.id AND su.department_id IN (?)))",
    );
    params.push(scope.departmentIds, scope.departmentIds, scope.departmentIds);
  }
  // Management-only meetings: the viewer must be on them (unless Management or IT).
  const confidential = scope.seeManagement
    ? ""
    : " AND (m.confidentiality = 'GENERAL' OR m.owner_id = ? OR m.coordinator_id = ? OR m.created_by = ? OR EXISTS (SELECT 1 FROM meeting_participants cp WHERE cp.meeting_id = m.id AND cp.user_id = ?))";
  if (!scope.seeManagement) params.push(scope.viewerId, scope.viewerId, scope.viewerId, scope.viewerId);
  return { sql: `m.deleted_at IS NULL AND (${parts.join(" OR ")})${confidential}`, params };
}

export interface AnalyticsMeeting {
  id: number;
  meetingNo: string;
  title: string;
  typeName: string;
  departmentName: string | null;
  ownerName: string;
  coordinatorId: number;
  coordinatorName: string;
  status: MeetingStatus;
  scheduledStart: Date;
  scheduledEnd: Date;
  actualStart: Date | null;
  actualEnd: Date | null;
  pointsOnTime: boolean | null;
  startedOnTime: boolean | null;
  endedOnTime: boolean | null;
  momOnTime: boolean | null;
  pointsSubmittedAt: Date | null;
  pointsDecidedAt: Date | null;
  momSubmittedAt: Date | null;
  momDecidedAt: Date | null;
  participants: number;
  present: number;
  absent: number;
  actions: number;
  actionsDone: number;
  actionsConfirmed: number;
  actionsOverdue: number;
  openPoints: number;
}

// Meetings scheduled in [from, to) within the scope, with everything the board needs.
export async function analyticsMeetings(scope: MeetingAnalyticsScope, from: Date, to: Date, db: Queryable = getDbPool()): Promise<AnalyticsMeeting[]> {
  const where = meetingScopeSql(scope);
  const [rows] = await db.query<Row[]>(
    `SELECT m.id, m.meeting_no, m.title, t.name AS type_name, d.name AS department_name, o.name AS owner_name, m.coordinator_id, c.name AS coordinator_name, m.status,
            m.scheduled_start, m.scheduled_end, m.actual_start, m.actual_end, m.points_on_time, m.started_on_time, m.ended_on_time, m.mom_on_time,
            m.points_submitted_at, m.points_decided_at, m.mom_submitted_at, m.mom_decided_at,
            (SELECT COUNT(*) FROM meeting_participants p WHERE p.meeting_id = m.id) AS participants,
            (SELECT COUNT(*) FROM meeting_participants p WHERE p.meeting_id = m.id AND p.attendance IN ('PRESENT', 'LATE')) AS present,
            (SELECT COUNT(*) FROM meeting_participants p WHERE p.meeting_id = m.id AND p.attendance IN ('ABSENT', 'EXCUSED')) AS absent,
            (SELECT COUNT(*) FROM meeting_actions a WHERE a.meeting_id = m.id AND a.carried_from_id IS NULL) AS actions,
            (SELECT COUNT(*) FROM meeting_actions a LEFT JOIN tasks tk ON tk.id = a.task_id WHERE a.meeting_id = m.id AND a.carried_from_id IS NULL AND (a.confirmed_at IS NOT NULL OR tk.status = 'COMPLETED')) AS actions_done,
            (SELECT COUNT(*) FROM meeting_actions a WHERE a.meeting_id = m.id AND a.carried_from_id IS NULL AND a.confirmed_at IS NOT NULL) AS actions_confirmed,
            (SELECT COUNT(*) FROM meeting_actions a JOIN tasks tk ON tk.id = a.task_id WHERE a.meeting_id = m.id AND a.carried_from_id IS NULL AND a.confirmed_at IS NULL AND tk.status NOT IN ('COMPLETED', 'CANCELLED') AND tk.due_at < UTC_TIMESTAMP()) AS actions_overdue,
            (SELECT COUNT(*) FROM meeting_open_points op WHERE op.meeting_id = m.id AND op.status = 'OPEN' AND op.carried_from_id IS NULL) AS open_points
       FROM meetings m JOIN meeting_types t ON t.id = m.type_id JOIN users o ON o.id = m.owner_id JOIN users c ON c.id = m.coordinator_id LEFT JOIN departments d ON d.id = m.department_id
      WHERE ${where.sql} AND m.scheduled_start >= ? AND m.scheduled_start < ?
      ORDER BY m.scheduled_start DESC LIMIT 5000`,
    [...where.params, from, to],
  );
  return rows.map((row) => ({
    id: num(row.id),
    meetingNo: str(row.meeting_no),
    title: str(row.title),
    typeName: str(row.type_name),
    departmentName: row.department_name === null ? null : str(row.department_name),
    ownerName: str(row.owner_name),
    coordinatorId: num(row.coordinator_id),
    coordinatorName: str(row.coordinator_name),
    status: str(row.status) as MeetingStatus,
    scheduledStart: dateOrNull(row.scheduled_start)!,
    scheduledEnd: dateOrNull(row.scheduled_end)!,
    actualStart: dateOrNull(row.actual_start),
    actualEnd: dateOrNull(row.actual_end),
    pointsOnTime: tick(row.points_on_time),
    startedOnTime: tick(row.started_on_time),
    endedOnTime: tick(row.ended_on_time),
    momOnTime: tick(row.mom_on_time),
    pointsSubmittedAt: dateOrNull(row.points_submitted_at),
    pointsDecidedAt: dateOrNull(row.points_decided_at),
    momSubmittedAt: dateOrNull(row.mom_submitted_at),
    momDecidedAt: dateOrNull(row.mom_decided_at),
    participants: num(row.participants),
    present: num(row.present),
    absent: num(row.absent),
    actions: num(row.actions),
    actionsDone: num(row.actions_done),
    actionsConfirmed: num(row.actions_confirmed),
    actionsOverdue: num(row.actions_overdue),
    openPoints: num(row.open_points),
  }));
}

// Open action items now (any meeting in scope), with the responsible person and their department.
export interface OpenAction {
  ownerId: number;
  ownerName: string;
  departmentName: string | null;
  dueAt: Date | null;
  overdue: boolean;
  doneUnconfirmed: boolean;
}
export async function openActionsInScope(scope: MeetingAnalyticsScope, db: Queryable = getDbPool()): Promise<OpenAction[]> {
  const where = meetingScopeSql(scope);
  const [rows] = await db.query<Row[]>(
    `SELECT a.owner_id, u.name AS owner_name, d.name AS department_name, tk.due_at, tk.status
       FROM meeting_actions a JOIN meetings m ON m.id = a.meeting_id JOIN users u ON u.id = a.owner_id LEFT JOIN departments d ON d.id = u.department_id
       JOIN tasks tk ON tk.id = a.task_id AND tk.deleted_at IS NULL
      WHERE ${where.sql} AND a.confirmed_at IS NULL AND tk.status <> 'CANCELLED'
        AND NOT EXISTS (SELECT 1 FROM meeting_actions later WHERE later.carried_from_id = a.id)
      LIMIT 20000`,
    where.params,
  );
  const now = Date.now();
  return rows.map((row) => {
    const dueAt = dateOrNull(row.due_at);
    const status = str(row.status);
    return { ownerId: num(row.owner_id), ownerName: str(row.owner_name), departmentName: row.department_name === null ? null : str(row.department_name), dueAt, overdue: status !== "COMPLETED" && dueAt !== null && dueAt.getTime() < now, doneUnconfirmed: status === "COMPLETED" };
  });
}

// Twelve months (India), by month: meetings, held, MOM in time ticks, actions done.
export interface MonthRow {
  month: string; // YYYY-MM
  meetings: number;
  held: number;
  cancelled: number;
  momOnTime: number;
  momJudged: number;
  present: number;
  invited: number;
}
export async function meetingMonths(scope: MeetingAnalyticsScope, from: Date, db: Queryable = getDbPool()): Promise<MonthRow[]> {
  const where = meetingScopeSql(scope);
  const [rows] = await db.query<Row[]>(
    `SELECT DATE_FORMAT(DATE_ADD(m.scheduled_start, INTERVAL 330 MINUTE), '%Y-%m') AS month, COUNT(*) AS meetings,
            SUM(m.actual_start IS NOT NULL AND m.status <> 'CANCELLED') AS held, SUM(m.status = 'CANCELLED') AS cancelled,
            SUM(m.mom_on_time = TRUE) AS mom_on_time, SUM(m.mom_on_time IS NOT NULL) AS mom_judged,
            SUM((SELECT COUNT(*) FROM meeting_participants p WHERE p.meeting_id = m.id AND p.attendance IN ('PRESENT', 'LATE'))) AS present,
            SUM(CASE WHEN m.actual_start IS NOT NULL THEN (SELECT COUNT(*) FROM meeting_participants p WHERE p.meeting_id = m.id) ELSE 0 END) AS invited
       FROM meetings m WHERE ${where.sql} AND m.scheduled_start >= ? GROUP BY 1 ORDER BY 1`,
    [...where.params, from],
  );
  return rows.map((row) => ({ month: str(row.month), meetings: num(row.meetings), held: num(row.held), cancelled: num(row.cancelled), momOnTime: num(row.mom_on_time), momJudged: num(row.mom_judged), present: num(row.present), invited: num(row.invited) }));
}

// People below the viewer in the reporting line, and people of departments.
export async function peopleOfDepartments(departmentIds: readonly number[], db: Queryable = getDbPool()): Promise<number[]> {
  if (!departmentIds.length) return [];
  const [rows] = await db.query<Row[]>("SELECT id FROM users WHERE department_id IN (?) AND is_break_glass = FALSE", [departmentIds]);
  return rows.map((row) => num(row.id));
}

