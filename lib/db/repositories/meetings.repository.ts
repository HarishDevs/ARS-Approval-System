import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import type { Attendance, Confidentiality, MeetingMode, MeetingPriority, MeetingStatus, PointsPolicy, PointsStatus } from "@/server/meetings/rules";

// v1.51.0 (D-300): Meeting Management storage. Raw SQL; every change to a
// meeting row is guarded by row_version read under the lock.
type Row = RowDataPacket & Record<string, unknown>;
const num = (value: unknown) => Number(value);
const numOrNull = (value: unknown) => (value === null || value === undefined ? null : Number(value));
const str = (value: unknown) => (value === null || value === undefined ? "" : String(value));
const strOrNull = (value: unknown) => (value === null || value === undefined ? null : String(value));
const dateOrNull = (value: unknown) => (value instanceof Date ? value : value ? new Date(String(value)) : null);
const dayText = (value: unknown): string | null => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};

export interface MeetingType {
  id: number;
  code: string;
  name: string;
  template: string | null;
  position: number;
  active: boolean;
}

export interface MeetingRecord {
  id: number;
  meetingNo: string;
  title: string;
  description: string | null;
  typeId: number;
  typeName: string;
  departmentId: number | null;
  departmentName: string | null;
  ownerId: number;
  ownerName: string;
  coordinatorId: number;
  coordinatorName: string;
  mode: MeetingMode;
  venue: string | null;
  link: string | null;
  priority: MeetingPriority;
  confidentiality: Confidentiality;
  guests: string | null;
  status: MeetingStatus;
  scheduledStart: Date;
  scheduledEnd: Date;
  actualStart: Date | null;
  actualEnd: Date | null;
  agendaDueAt: Date | null;
  momDueAt: Date | null;
  pointsStatus: PointsStatus;
  pointsPolicy: PointsPolicy;
  pointsSubmittedAt: Date | null;
  pointsDecidedAt: Date | null;
  pointsRemarks: string | null;
  momSubmittedAt: Date | null;
  momDecidedAt: Date | null;
  momRemarks: string | null;
  seriesId: number | null;
  parentMeetingId: number | null;
  parentMeetingNo: string | null;
  cancelledReason: string | null;
  createdBy: number;
  createdAt: Date;
  rowVersion: number;
}

const MEETING_SELECT = `SELECT m.*, t.name AS type_name, d.name AS department_name, o.name AS owner_name, c.name AS coordinator_name, p.meeting_no AS parent_no
  FROM meetings m
  JOIN meeting_types t ON t.id = m.type_id
  JOIN users o ON o.id = m.owner_id
  JOIN users c ON c.id = m.coordinator_id
  LEFT JOIN departments d ON d.id = m.department_id
  LEFT JOIN meetings p ON p.id = m.parent_meeting_id`;

function toMeeting(row: Row): MeetingRecord {
  return {
    id: num(row.id),
    meetingNo: str(row.meeting_no),
    title: str(row.title),
    description: strOrNull(row.description),
    typeId: num(row.type_id),
    typeName: str(row.type_name),
    departmentId: numOrNull(row.department_id),
    departmentName: strOrNull(row.department_name),
    ownerId: num(row.owner_id),
    ownerName: str(row.owner_name),
    coordinatorId: num(row.coordinator_id),
    coordinatorName: str(row.coordinator_name),
    mode: str(row.mode) as MeetingMode,
    venue: strOrNull(row.venue),
    link: strOrNull(row.link),
    priority: str(row.priority) as MeetingPriority,
    confidentiality: str(row.confidentiality) as Confidentiality,
    guests: strOrNull(row.guests),
    status: str(row.status) as MeetingStatus,
    scheduledStart: dateOrNull(row.scheduled_start)!,
    scheduledEnd: dateOrNull(row.scheduled_end)!,
    actualStart: dateOrNull(row.actual_start),
    actualEnd: dateOrNull(row.actual_end),
    agendaDueAt: dateOrNull(row.agenda_due_at),
    momDueAt: dateOrNull(row.mom_due_at),
    pointsStatus: str(row.points_status) as PointsStatus,
    pointsPolicy: str(row.points_policy) as PointsPolicy,
    pointsSubmittedAt: dateOrNull(row.points_submitted_at),
    pointsDecidedAt: dateOrNull(row.points_decided_at),
    pointsRemarks: strOrNull(row.points_remarks),
    momSubmittedAt: dateOrNull(row.mom_submitted_at),
    momDecidedAt: dateOrNull(row.mom_decided_at),
    momRemarks: strOrNull(row.mom_remarks),
    seriesId: numOrNull(row.series_id),
    parentMeetingId: numOrNull(row.parent_meeting_id),
    parentMeetingNo: strOrNull(row.parent_no),
    cancelledReason: strOrNull(row.cancelled_reason),
    createdBy: num(row.created_by),
    createdAt: dateOrNull(row.created_at)!,
    rowVersion: num(row.row_version),
  };
}

// ---- types and the Management group ------------------------------------------------
export async function listMeetingTypes(includeInactive = false, db: Queryable = getDbPool()): Promise<MeetingType[]> {
  const [rows] = await db.query<Row[]>(`SELECT * FROM meeting_types ${includeInactive ? "" : "WHERE active = TRUE"} ORDER BY position, name`);
  return rows.map((row) => ({ id: num(row.id), code: str(row.code), name: str(row.name), template: strOrNull(row.template), position: num(row.position), active: Boolean(row.active) }));
}

export async function saveMeetingType(
  input: { id: number | null; code: string; name: string; template: string | null; position: number; active: boolean },
  db: Queryable = getDbPool(),
): Promise<number> {
  if (input.id) {
    await db.query("UPDATE meeting_types SET name = ?, template = ?, position = ?, active = ? WHERE id = ?", [input.name, input.template, input.position, input.active, input.id]);
    return input.id;
  }
  const [result] = await db.query<ResultSetHeader>("INSERT INTO meeting_types (code, name, template, position, active) VALUES (?, ?, ?, ?, ?)", [
    input.code,
    input.name,
    input.template,
    input.position,
    input.active,
  ]);
  return result.insertId;
}

export async function listManagementMembers(db: Queryable = getDbPool()): Promise<number[]> {
  const [rows] = await db.query<Row[]>("SELECT user_id FROM meeting_management_members");
  return rows.map((row) => num(row.user_id));
}

export async function isManagementMember(userId: number, db: Queryable = getDbPool()): Promise<boolean> {
  const [rows] = await db.query<Row[]>("SELECT 1 FROM meeting_management_members WHERE user_id = ?", [userId]);
  return rows.length > 0;
}

export async function replaceManagementMembers(userIds: readonly number[], actorId: number, db: Queryable): Promise<void> {
  await db.query("DELETE FROM meeting_management_members");
  for (const userId of userIds) await db.query("INSERT INTO meeting_management_members (user_id, added_by) VALUES (?, ?)", [userId, actorId]);
}

// ---- meetings ------------------------------------------------------------------------
export interface NewMeeting {
  meetingNo: string;
  title: string;
  description: string | null;
  typeId: number;
  departmentId: number | null;
  ownerId: number;
  coordinatorId: number;
  mode: MeetingMode;
  venue: string | null;
  link: string | null;
  priority: MeetingPriority;
  confidentiality: Confidentiality;
  guests: string | null;
  scheduledStart: Date;
  scheduledEnd: Date;
  agendaDueAt: Date | null;
  momDueAt: Date | null;
  pointsPolicy: PointsPolicy;
  seriesId: number | null;
  parentMeetingId: number | null;
  createdBy: number;
}

export async function insertMeeting(meeting: NewMeeting, db: Queryable): Promise<number> {
  const [result] = await db.query<ResultSetHeader>(
    `INSERT INTO meetings (meeting_no, title, description, type_id, department_id, owner_id, coordinator_id, mode, venue, link, priority, confidentiality, guests,
       scheduled_start, scheduled_end, agenda_due_at, mom_due_at, points_policy, series_id, parent_meeting_id, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
    [
      meeting.meetingNo,
      meeting.title,
      meeting.description,
      meeting.typeId,
      meeting.departmentId,
      meeting.ownerId,
      meeting.coordinatorId,
      meeting.mode,
      meeting.venue,
      meeting.link,
      meeting.priority,
      meeting.confidentiality,
      meeting.guests,
      meeting.scheduledStart,
      meeting.scheduledEnd,
      meeting.agendaDueAt,
      meeting.momDueAt,
      meeting.pointsPolicy,
      meeting.seriesId,
      meeting.parentMeetingId,
      meeting.createdBy,
    ],
  );
  const id = result.insertId;
  // The first meeting of a chain is its own series.
  if (meeting.seriesId === null) await db.query("UPDATE meetings SET series_id = ? WHERE id = ?", [id, id]);
  return id;
}

export async function findMeeting(id: number, db: Queryable = getDbPool(), lock = false): Promise<MeetingRecord | null> {
  const [rows] = await db.query<Row[]>(`${MEETING_SELECT} WHERE m.id = ? AND m.deleted_at IS NULL${lock ? " FOR UPDATE OF m" : ""}`, [id]);
  return rows[0] ? toMeeting(rows[0]) : null;
}

const MEETING_COLUMNS = [
  "title",
  "description",
  "type_id",
  "department_id",
  "owner_id",
  "coordinator_id",
  "mode",
  "venue",
  "link",
  "priority",
  "confidentiality",
  "guests",
  "status",
  "scheduled_start",
  "scheduled_end",
  "actual_start",
  "actual_end",
  "agenda_due_at",
  "mom_due_at",
  "points_status",
  "points_policy",
  "points_submitted_at",
  "points_decided_at",
  "points_remarks",
  "mom_submitted_at",
  "mom_decided_at",
  "mom_remarks",
  "cancelled_reason",
];

export async function updateMeeting(id: number, expectedVersion: number, changes: Record<string, unknown>, db: Queryable): Promise<boolean> {
  const keys = Object.keys(changes).filter((key) => MEETING_COLUMNS.includes(key));
  if (keys.length === 0) return true;
  const [result] = await db.query<ResultSetHeader>(`UPDATE meetings SET ${keys.map((key) => `${key} = ?`).join(", ")}, row_version = row_version + 1 WHERE id = ? AND row_version = ?`, [
    ...keys.map((key) => changes[key]),
    id,
    expectedVersion,
  ]);
  return result.affectedRows === 1;
}

// ---- people ---------------------------------------------------------------------------
export interface Participant {
  userId: number;
  name: string;
  departmentName: string | null;
  response: "PENDING" | "ACCEPTED" | "DECLINED" | "TENTATIVE";
  responseNote: string | null;
  attendance: Attendance;
}

export async function listParticipants(meetingId: number, db: Queryable = getDbPool()): Promise<Participant[]> {
  const [rows] = await db.query<Row[]>(
    `SELECT p.user_id, u.name, d.name AS department_name, p.response, p.response_note, p.attendance
       FROM meeting_participants p JOIN users u ON u.id = p.user_id LEFT JOIN departments d ON d.id = u.department_id
      WHERE p.meeting_id = ? ORDER BY u.name`,
    [meetingId],
  );
  return rows.map((row) => ({
    userId: num(row.user_id),
    name: str(row.name),
    departmentName: strOrNull(row.department_name),
    response: str(row.response) as Participant["response"],
    responseNote: strOrNull(row.response_note),
    attendance: str(row.attendance) as Attendance,
  }));
}

export async function isParticipant(meetingId: number, userId: number, db: Queryable = getDbPool()): Promise<boolean> {
  const [rows] = await db.query<Row[]>("SELECT 1 FROM meeting_participants WHERE meeting_id = ? AND user_id = ?", [meetingId, userId]);
  return rows.length > 0;
}

// Keeps answers and attendance of people who stay; returns who was added.
export async function replaceParticipants(meetingId: number, userIds: readonly number[], db: Queryable): Promise<number[]> {
  const [rows] = await db.query<Row[]>("SELECT user_id FROM meeting_participants WHERE meeting_id = ?", [meetingId]);
  const before = new Set(rows.map((row) => num(row.user_id)));
  const after = new Set(userIds);
  const removed = [...before].filter((id) => !after.has(id));
  if (removed.length) await db.query("DELETE FROM meeting_participants WHERE meeting_id = ? AND user_id IN (?)", [meetingId, removed]);
  const added = [...after].filter((id) => !before.has(id));
  for (const userId of added) await db.query("INSERT INTO meeting_participants (meeting_id, user_id) VALUES (?, ?)", [meetingId, userId]);
  return added;
}

export async function setResponse(meetingId: number, userId: number, response: string, note: string | null, db: Queryable = getDbPool()): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>("UPDATE meeting_participants SET response = ?, response_note = ? WHERE meeting_id = ? AND user_id = ?", [response, note, meetingId, userId]);
  return result.affectedRows === 1;
}

export async function setAttendance(meetingId: number, marks: ReadonlyMap<number, Attendance>, db: Queryable): Promise<void> {
  for (const [userId, attendance] of marks) await db.query("UPDATE meeting_participants SET attendance = ? WHERE meeting_id = ? AND user_id = ?", [attendance, meetingId, userId]);
}

export async function listDepartmentIds(meetingId: number, db: Queryable = getDbPool()): Promise<number[]> {
  const [rows] = await db.query<Row[]>("SELECT department_id FROM meeting_departments WHERE meeting_id = ?", [meetingId]);
  return rows.map((row) => num(row.department_id));
}

export async function replaceDepartments(meetingId: number, departmentIds: readonly number[], db: Queryable): Promise<void> {
  await db.query("DELETE FROM meeting_departments WHERE meeting_id = ?", [meetingId]);
  for (const departmentId of departmentIds) await db.query("INSERT INTO meeting_departments (meeting_id, department_id) VALUES (?, ?)", [meetingId, departmentId]);
}

// Is the person HOD of a department on the meeting (organising or involved)?
export async function isHodOfMeeting(meetingId: number, userId: number, db: Queryable = getDbPool()): Promise<boolean> {
  const [rows] = await db.query<Row[]>(
    `SELECT 1 FROM departments d WHERE d.hod_user_id = ? AND (d.id = (SELECT department_id FROM meetings WHERE id = ?) OR d.id IN (SELECT department_id FROM meeting_departments WHERE meeting_id = ?)) LIMIT 1`,
    [userId, meetingId, meetingId],
  );
  return rows.length > 0;
}

// ---- points, decisions -----------------------------------------------------------------
export interface MeetingPoint {
  id: number;
  position: number;
  title: string;
  presenterId: number | null;
  presenterName: string | null;
  discussion: string | null;
}

export async function listPoints(meetingId: number, db: Queryable = getDbPool()): Promise<MeetingPoint[]> {
  const [rows] = await db.query<Row[]>("SELECT p.*, u.name AS presenter_name FROM meeting_points p LEFT JOIN users u ON u.id = p.presenter_id WHERE p.meeting_id = ? ORDER BY p.position, p.id", [
    meetingId,
  ]);
  return rows.map((row) => ({
    id: num(row.id),
    position: num(row.position),
    title: str(row.title),
    presenterId: numOrNull(row.presenter_id),
    presenterName: strOrNull(row.presenter_name),
    discussion: strOrNull(row.discussion),
  }));
}

// Points are replaced as a list; discussion notes are kept for points that stay (matched by id).
export async function replacePoints(meetingId: number, points: readonly { id: number | null; title: string; presenterId: number | null; discussion?: string | null }[], db: Queryable): Promise<void> {
  const existing = await listPoints(meetingId, db);
  const keep = new Set(points.map((point) => point.id).filter((id): id is number => id !== null));
  const drop = existing.filter((point) => !keep.has(point.id)).map((point) => point.id);
  if (drop.length) await db.query("DELETE FROM meeting_points WHERE meeting_id = ? AND id IN (?)", [meetingId, drop]);
  const known = new Map(existing.map((point) => [point.id, point]));
  for (const [index, point] of points.entries()) {
    const old = point.id !== null ? known.get(point.id) : undefined;
    const discussion = point.discussion === undefined ? (old?.discussion ?? null) : point.discussion;
    if (old)
      await db.query("UPDATE meeting_points SET position = ?, title = ?, presenter_id = ?, discussion = ? WHERE id = ? AND meeting_id = ?", [
        index + 1,
        point.title,
        point.presenterId,
        discussion,
        old.id,
        meetingId,
      ]);
    else
      await db.query("INSERT INTO meeting_points (meeting_id, position, title, presenter_id, discussion) VALUES (?, ?, ?, ?, ?)", [meetingId, index + 1, point.title, point.presenterId, discussion]);
  }
}

export async function listDecisions(meetingId: number, db: Queryable = getDbPool()): Promise<string[]> {
  const [rows] = await db.query<Row[]>("SELECT text FROM meeting_decisions WHERE meeting_id = ? ORDER BY position, id", [meetingId]);
  return rows.map((row) => str(row.text));
}

export async function replaceDecisions(meetingId: number, decisions: readonly string[], db: Queryable): Promise<void> {
  await db.query("DELETE FROM meeting_decisions WHERE meeting_id = ?", [meetingId]);
  for (const [index, text] of decisions.entries()) await db.query("INSERT INTO meeting_decisions (meeting_id, position, text) VALUES (?, ?, ?)", [meetingId, index + 1, text]);
}

// ---- action items ----------------------------------------------------------------------
export interface MeetingActionItem {
  id: number;
  meetingId: number;
  position: number;
  title: string;
  description: string | null;
  ownerId: number;
  ownerName: string;
  priority: MeetingPriority;
  dueOn: string | null;
  taskId: number | null;
  taskNo: string | null;
  taskStatus: string | null;
  taskDueAt: Date | null;
  taskCompletedAt: Date | null;
  carriedFromId: number | null;
  confirmedBy: number | null;
  confirmedByName: string | null;
  confirmedAt: Date | null;
  reviewNote: string | null;
}

const ACTION_SELECT = `SELECT a.*, u.name AS owner_name, t.task_no, t.status AS task_status, t.due_at AS task_due_at, t.completed_at AS task_completed_at, cb.name AS confirmed_by_name
  FROM meeting_actions a JOIN users u ON u.id = a.owner_id
  LEFT JOIN tasks t ON t.id = a.task_id AND t.deleted_at IS NULL
  LEFT JOIN users cb ON cb.id = a.confirmed_by`;

function toAction(row: Row): MeetingActionItem {
  return {
    id: num(row.id),
    meetingId: num(row.meeting_id),
    position: num(row.position),
    title: str(row.title),
    description: strOrNull(row.description),
    ownerId: num(row.owner_id),
    ownerName: str(row.owner_name),
    priority: str(row.priority) as MeetingPriority,
    dueOn: dayText(row.due_on),
    taskId: numOrNull(row.task_id),
    taskNo: strOrNull(row.task_no),
    taskStatus: strOrNull(row.task_status),
    taskDueAt: dateOrNull(row.task_due_at),
    taskCompletedAt: dateOrNull(row.task_completed_at),
    carriedFromId: numOrNull(row.carried_from_id),
    confirmedBy: numOrNull(row.confirmed_by),
    confirmedByName: strOrNull(row.confirmed_by_name),
    confirmedAt: dateOrNull(row.confirmed_at),
    reviewNote: strOrNull(row.review_note),
  };
}

export async function listActions(meetingId: number, db: Queryable = getDbPool()): Promise<MeetingActionItem[]> {
  const [rows] = await db.query<Row[]>(`${ACTION_SELECT} WHERE a.meeting_id = ? ORDER BY a.position, a.id`, [meetingId]);
  return rows.map(toAction);
}

export async function findAction(actionId: number, db: Queryable = getDbPool()): Promise<MeetingActionItem | null> {
  const [rows] = await db.query<Row[]>(`${ACTION_SELECT} WHERE a.id = ?`, [actionId]);
  return rows[0] ? toAction(rows[0]) : null;
}

// Replaces the not-yet-tasked action items (those with a task stay as they are).
export async function replaceDraftActions(
  meetingId: number,
  actions: readonly { title: string; description: string | null; ownerId: number; priority: MeetingPriority; dueOn: string | null }[],
  db: Queryable,
): Promise<void> {
  await db.query("DELETE FROM meeting_actions WHERE meeting_id = ? AND task_id IS NULL", [meetingId]);
  const [rows] = await db.query<Row[]>("SELECT COALESCE(MAX(position), 0) AS top FROM meeting_actions WHERE meeting_id = ?", [meetingId]);
  let position = num(rows[0]?.top ?? 0);
  for (const action of actions) {
    position += 1;
    await db.query("INSERT INTO meeting_actions (meeting_id, position, title, description, owner_id, priority, due_on) VALUES (?, ?, ?, ?, ?, ?, ?)", [
      meetingId,
      position,
      action.title,
      action.description,
      action.ownerId,
      action.priority,
      action.dueOn,
    ]);
  }
}

export async function insertCarriedAction(meetingId: number, from: MeetingActionItem, position: number, db: Queryable): Promise<void> {
  await db.query("INSERT INTO meeting_actions (meeting_id, position, title, description, owner_id, priority, due_on, task_id, carried_from_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [
    meetingId,
    position,
    from.title,
    from.description,
    from.ownerId,
    from.priority,
    from.dueOn,
    from.taskId,
    from.id,
  ]);
}

export async function linkActionTask(actionId: number, taskId: number, db: Queryable): Promise<void> {
  await db.query("UPDATE meeting_actions SET task_id = ? WHERE id = ?", [taskId, actionId]);
}

export async function setTaskMeeting(taskId: number, meetingId: number, db: Queryable): Promise<void> {
  await db.query("UPDATE tasks SET meeting_id = ? WHERE id = ? AND meeting_id IS NULL", [meetingId, taskId]);
}

// Confirming (or sending back) applies to every row that shares the task, so a
// carried action shows the same answer in each meeting of the chain.
export async function confirmAction(action: MeetingActionItem, confirmedBy: number | null, note: string | null, db: Queryable): Promise<void> {
  if (action.taskId)
    await db.query(`UPDATE meeting_actions SET confirmed_by = ?, confirmed_at = ${confirmedBy ? "UTC_TIMESTAMP()" : "NULL"}, review_note = COALESCE(?, review_note) WHERE task_id = ?`, [
      confirmedBy,
      note,
      action.taskId,
    ]);
  else
    await db.query(`UPDATE meeting_actions SET confirmed_by = ?, confirmed_at = ${confirmedBy ? "UTC_TIMESTAMP()" : "NULL"}, review_note = COALESCE(?, review_note) WHERE id = ?`, [
      confirmedBy,
      note,
      action.id,
    ]);
}

export async function noteAction(actionId: number, note: string, db: Queryable = getDbPool()): Promise<void> {
  await db.query("UPDATE meeting_actions SET review_note = ? WHERE id = ?", [note, actionId]);
}

// ---- open points -----------------------------------------------------------------------
export interface OpenPoint {
  id: number;
  meetingId: number;
  text: string;
  ownerId: number | null;
  ownerName: string | null;
  reviewOn: string | null;
  status: "OPEN" | "CLOSED";
  closedNote: string | null;
  closedAt: Date | null;
  carriedFromId: number | null;
}

function toOpenPoint(row: Row): OpenPoint {
  return {
    id: num(row.id),
    meetingId: num(row.meeting_id),
    text: str(row.text),
    ownerId: numOrNull(row.owner_id),
    ownerName: strOrNull(row.owner_name),
    reviewOn: dayText(row.review_on),
    status: str(row.status) as OpenPoint["status"],
    closedNote: strOrNull(row.closed_note),
    closedAt: dateOrNull(row.closed_at),
    carriedFromId: numOrNull(row.carried_from_id),
  };
}

export async function listOpenPoints(meetingId: number, db: Queryable = getDbPool()): Promise<OpenPoint[]> {
  const [rows] = await db.query<Row[]>("SELECT o.*, u.name AS owner_name FROM meeting_open_points o LEFT JOIN users u ON u.id = o.owner_id WHERE o.meeting_id = ? ORDER BY o.id", [meetingId]);
  return rows.map(toOpenPoint);
}

export async function findOpenPoint(id: number, db: Queryable = getDbPool()): Promise<OpenPoint | null> {
  const [rows] = await db.query<Row[]>("SELECT o.*, u.name AS owner_name FROM meeting_open_points o LEFT JOIN users u ON u.id = o.owner_id WHERE o.id = ?", [id]);
  return rows[0] ? toOpenPoint(rows[0]) : null;
}

// Replaces the open points still open and not carried in (closed ones are history).
export async function replaceOpenPoints(meetingId: number, points: readonly { text: string; ownerId: number | null; reviewOn: string | null }[], db: Queryable): Promise<void> {
  await db.query("DELETE FROM meeting_open_points WHERE meeting_id = ? AND status = 'OPEN' AND carried_from_id IS NULL", [meetingId]);
  for (const point of points) await db.query("INSERT INTO meeting_open_points (meeting_id, text, owner_id, review_on) VALUES (?, ?, ?, ?)", [meetingId, point.text, point.ownerId, point.reviewOn]);
}

export async function insertCarriedOpenPoint(meetingId: number, from: OpenPoint, db: Queryable): Promise<void> {
  await db.query("INSERT INTO meeting_open_points (meeting_id, text, owner_id, review_on, carried_from_id) VALUES (?, ?, ?, ?, ?)", [meetingId, from.text, from.ownerId, from.reviewOn, from.id]);
}

export async function closeOpenPoint(id: number, note: string, actorId: number, db: Queryable): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>("UPDATE meeting_open_points SET status = 'CLOSED', closed_note = ?, closed_by = ?, closed_at = UTC_TIMESTAMP() WHERE id = ? AND status = 'OPEN'", [
    note,
    actorId,
    id,
  ]);
  return result.affectedRows === 1;
}

// ---- events ----------------------------------------------------------------------------
export interface MeetingEvent {
  id: number;
  actorName: string | null;
  eventType: string;
  body: string | null;
  createdAt: Date;
}

export async function appendMeetingEvent(meetingId: number, event: { actorId: number | null; type: string; body?: string | null; payload?: Record<string, unknown> }, db: Queryable): Promise<void> {
  await db.query("INSERT INTO meeting_events (meeting_id, actor_id, event_type, body, payload_json, created_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())", [
    meetingId,
    event.actorId,
    event.type,
    event.body ? event.body.slice(0, 2000) : null,
    event.payload ? JSON.stringify(event.payload) : null,
  ]);
}

export async function listMeetingEvents(meetingId: number, db: Queryable = getDbPool()): Promise<MeetingEvent[]> {
  const [rows] = await db.query<Row[]>(
    "SELECT e.id, u.name AS actor_name, e.event_type, e.body, e.created_at FROM meeting_events e LEFT JOIN users u ON u.id = e.actor_id WHERE e.meeting_id = ? ORDER BY e.id DESC LIMIT 200",
    [meetingId],
  );
  return rows.map((row) => ({ id: num(row.id), actorName: strOrNull(row.actor_name), eventType: str(row.event_type), body: strOrNull(row.body), createdAt: dateOrNull(row.created_at)! }));
}

// ---- lists -----------------------------------------------------------------------------
export type MeetingScope = { kind: "ALL" } | { kind: "PERSON"; userId: number; hodDepartmentIds: number[] };

// Visible meetings: the person's own (owner, coordinator, creator, participant),
// plus General meetings of departments they head. IT and Management see all.
function scopeSql(scope: MeetingScope): { sql: string; params: unknown[] } {
  if (scope.kind === "ALL") return { sql: "1 = 1", params: [] };
  const parts = ["m.owner_id = ?", "m.coordinator_id = ?", "m.created_by = ?", "EXISTS (SELECT 1 FROM meeting_participants mp WHERE mp.meeting_id = m.id AND mp.user_id = ?)"];
  const params: unknown[] = [scope.userId, scope.userId, scope.userId, scope.userId];
  if (scope.hodDepartmentIds.length) {
    parts.push("(m.confidentiality = 'GENERAL' AND (m.department_id IN (?) OR EXISTS (SELECT 1 FROM meeting_departments md WHERE md.meeting_id = m.id AND md.department_id IN (?))))");
    params.push(scope.hodDepartmentIds, scope.hodDepartmentIds);
  }
  return { sql: `(${parts.join(" OR ")})`, params };
}

export interface MeetingListFilter {
  tab: "upcoming" | "mine" | "approve" | "past" | "all";
  userId: number;
  q: string;
  typeId: number | null;
  departmentId: number | null;
  status: string | null;
  from: Date | null;
  to: Date | null;
  page: number;
  pageSize: number;
}

export interface MeetingListRow {
  id: number;
  meetingNo: string;
  title: string;
  typeName: string;
  departmentName: string | null;
  ownerName: string;
  coordinatorName: string;
  status: MeetingStatus;
  pointsStatus: PointsStatus;
  mode: MeetingMode;
  priority: MeetingPriority;
  scheduledStart: Date;
  scheduledEnd: Date;
  openActions: number;
  participants: number;
}

export async function listMeetings(scope: MeetingScope, filter: MeetingListFilter, db: Queryable = getDbPool()): Promise<{ rows: MeetingListRow[]; total: number }> {
  const visible = scopeSql(scope);
  const where = ["m.deleted_at IS NULL", visible.sql];
  const params: unknown[] = [...visible.params];
  if (filter.tab === "upcoming") where.push("m.status IN ('SCHEDULED', 'IN_PROGRESS') AND m.scheduled_end >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)");
  if (filter.tab === "mine") {
    where.push("(m.owner_id = ? OR m.coordinator_id = ?)");
    params.push(filter.userId, filter.userId);
  }
  if (filter.tab === "approve") {
    where.push("m.owner_id = ? AND (m.status = 'MOM_SUBMITTED' OR (m.points_status = 'SUBMITTED' AND m.status IN ('SCHEDULED', 'IN_PROGRESS')))");
    params.push(filter.userId);
  }
  if (filter.tab === "past") where.push("(m.status NOT IN ('SCHEDULED', 'IN_PROGRESS') OR m.scheduled_end < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY))");
  if (filter.q) {
    where.push("(m.title LIKE ? OR m.meeting_no LIKE ?)");
    params.push(`%${filter.q}%`, `%${filter.q}%`);
  }
  if (filter.typeId) {
    where.push("m.type_id = ?");
    params.push(filter.typeId);
  }
  if (filter.departmentId) {
    where.push("(m.department_id = ? OR EXISTS (SELECT 1 FROM meeting_departments md2 WHERE md2.meeting_id = m.id AND md2.department_id = ?))");
    params.push(filter.departmentId, filter.departmentId);
  }
  if (filter.status) {
    where.push("m.status = ?");
    params.push(filter.status);
  }
  if (filter.from) {
    where.push("m.scheduled_start >= ?");
    params.push(filter.from);
  }
  if (filter.to) {
    where.push("m.scheduled_start < ?");
    params.push(filter.to);
  }
  const whereSql = where.join(" AND ");
  const [countRows] = await db.query<Row[]>(`SELECT COUNT(*) AS total FROM meetings m WHERE ${whereSql}`, params);
  const order = filter.tab === "upcoming" ? "m.scheduled_start ASC" : "m.scheduled_start DESC";
  const [rows] = await db.query<Row[]>(
    `SELECT m.id, m.meeting_no, m.title, t.name AS type_name, d.name AS department_name, o.name AS owner_name, c.name AS coordinator_name, m.status, m.points_status, m.mode, m.priority, m.scheduled_start, m.scheduled_end,
            (SELECT COUNT(*) FROM meeting_actions a LEFT JOIN tasks tk ON tk.id = a.task_id WHERE a.meeting_id = m.id AND a.confirmed_at IS NULL AND (tk.status IS NULL OR tk.status <> 'CANCELLED')) AS open_actions,
            (SELECT COUNT(*) FROM meeting_participants p WHERE p.meeting_id = m.id) AS participants
       FROM meetings m JOIN meeting_types t ON t.id = m.type_id JOIN users o ON o.id = m.owner_id JOIN users c ON c.id = m.coordinator_id LEFT JOIN departments d ON d.id = m.department_id
      WHERE ${whereSql} ORDER BY ${order}, m.id DESC LIMIT ? OFFSET ?`,
    [...params, filter.pageSize, (filter.page - 1) * filter.pageSize],
  );
  return {
    total: num(countRows[0]?.total ?? 0),
    rows: rows.map((row) => ({
      id: num(row.id),
      meetingNo: str(row.meeting_no),
      title: str(row.title),
      typeName: str(row.type_name),
      departmentName: strOrNull(row.department_name),
      ownerName: str(row.owner_name),
      coordinatorName: str(row.coordinator_name),
      status: str(row.status) as MeetingStatus,
      pointsStatus: str(row.points_status) as PointsStatus,
      mode: str(row.mode) as MeetingMode,
      priority: str(row.priority) as MeetingPriority,
      scheduledStart: dateOrNull(row.scheduled_start)!,
      scheduledEnd: dateOrNull(row.scheduled_end)!,
      openActions: num(row.open_actions),
      participants: num(row.participants),
    })),
  };
}

// Follow-up register: every action item (latest row per task) across visible meetings.
export interface FollowUpRow extends MeetingActionItem {
  meetingNo: string;
  meetingTitle: string;
  meetingStatus: MeetingStatus;
  meetingOwnerId: number;
  meetingCoordinatorId: number;
}

export async function listFollowUps(scope: MeetingScope, filter: { ownerOnly: number | null; q: string; limit: number }, db: Queryable = getDbPool()): Promise<FollowUpRow[]> {
  const visible = scopeSql(scope);
  const where = ["m.deleted_at IS NULL", visible.sql, "m.status IN ('MOM_APPROVED', 'CLOSED')", "NOT EXISTS (SELECT 1 FROM meeting_actions later WHERE later.carried_from_id = a.id)"];
  const params: unknown[] = [...visible.params];
  if (filter.ownerOnly) {
    where.push("a.owner_id = ?");
    params.push(filter.ownerOnly);
  }
  if (filter.q) {
    where.push("(a.title LIKE ? OR m.title LIKE ? OR m.meeting_no LIKE ?)");
    params.push(`%${filter.q}%`, `%${filter.q}%`, `%${filter.q}%`);
  }
  const [rows] = await db.query<Row[]>(
    `SELECT a.*, u.name AS owner_name, t.task_no, t.status AS task_status, t.due_at AS task_due_at, t.completed_at AS task_completed_at, cb.name AS confirmed_by_name,
            m.meeting_no, m.title AS meeting_title, m.status AS meeting_status, m.owner_id AS meeting_owner_id, m.coordinator_id AS meeting_coordinator_id
       FROM meeting_actions a JOIN meetings m ON m.id = a.meeting_id JOIN users u ON u.id = a.owner_id
       LEFT JOIN tasks t ON t.id = a.task_id AND t.deleted_at IS NULL LEFT JOIN users cb ON cb.id = a.confirmed_by
      WHERE ${where.join(" AND ")} ORDER BY a.confirmed_at IS NOT NULL, COALESCE(t.due_at, a.due_on) IS NULL, COALESCE(t.due_at, a.due_on), a.id LIMIT ?`,
    [...params, filter.limit],
  );
  return rows.map((row) => ({
    ...toAction(row),
    meetingNo: str(row.meeting_no),
    meetingTitle: str(row.meeting_title),
    meetingStatus: str(row.meeting_status) as MeetingStatus,
    meetingOwnerId: num(row.meeting_owner_id),
    meetingCoordinatorId: num(row.meeting_coordinator_id),
  }));
}

export interface OpenPointRow extends OpenPoint {
  meetingNo: string;
  meetingTitle: string;
  meetingOwnerId: number;
  meetingCoordinatorId: number;
}
export async function listOpenPointRegister(scope: MeetingScope, limit: number, db: Queryable = getDbPool()): Promise<OpenPointRow[]> {
  const visible = scopeSql(scope);
  const [rows] = await db.query<Row[]>(
    `SELECT o.*, u.name AS owner_name, m.meeting_no, m.title AS meeting_title, m.owner_id AS meeting_owner_id, m.coordinator_id AS meeting_coordinator_id
       FROM meeting_open_points o JOIN meetings m ON m.id = o.meeting_id LEFT JOIN users u ON u.id = o.owner_id
      WHERE m.deleted_at IS NULL AND ${visible.sql} AND o.status = 'OPEN' AND m.status IN ('MOM_APPROVED', 'CLOSED')
        AND NOT EXISTS (SELECT 1 FROM meeting_open_points later WHERE later.carried_from_id = o.id)
      ORDER BY o.review_on IS NULL, o.review_on, o.id LIMIT ?`,
    [...visible.params, limit],
  );
  return rows.map((row) => ({
    ...toOpenPoint(row),
    meetingNo: str(row.meeting_no),
    meetingTitle: str(row.meeting_title),
    meetingOwnerId: num(row.meeting_owner_id),
    meetingCoordinatorId: num(row.meeting_coordinator_id),
  }));
}

// Dashboard: one row per meeting in the period (compliance worked out by the caller).
export interface DashboardMeeting {
  id: number;
  meetingNo: string;
  title: string;
  typeName: string;
  departmentName: string | null;
  status: MeetingStatus;
  scheduledStart: Date;
  scheduledEnd: Date;
  actualStart: Date | null;
  actualEnd: Date | null;
  agendaDueAt: Date | null;
  pointsSubmittedAt: Date | null;
  momDueAt: Date | null;
  momSubmittedAt: Date | null;
  participants: number;
  present: number;
  absent: number;
  actions: number;
  actionsDone: number;
  actionsOverdue: number;
}

export async function dashboardMeetings(scope: MeetingScope, from: Date, to: Date, db: Queryable = getDbPool()): Promise<DashboardMeeting[]> {
  const visible = scopeSql(scope);
  const [rows] = await db.query<Row[]>(
    `SELECT m.id, m.meeting_no, m.title, t.name AS type_name, d.name AS department_name, m.status, m.scheduled_start, m.scheduled_end, m.actual_start, m.actual_end, m.agenda_due_at, m.points_submitted_at, m.mom_due_at, m.mom_submitted_at,
            (SELECT COUNT(*) FROM meeting_participants p WHERE p.meeting_id = m.id) AS participants,
            (SELECT COUNT(*) FROM meeting_participants p WHERE p.meeting_id = m.id AND p.attendance IN ('PRESENT', 'LATE')) AS present,
            (SELECT COUNT(*) FROM meeting_participants p WHERE p.meeting_id = m.id AND p.attendance = 'ABSENT') AS absent,
            (SELECT COUNT(*) FROM meeting_actions a WHERE a.meeting_id = m.id AND a.carried_from_id IS NULL) AS actions,
            (SELECT COUNT(*) FROM meeting_actions a LEFT JOIN tasks tk ON tk.id = a.task_id WHERE a.meeting_id = m.id AND a.carried_from_id IS NULL AND (a.confirmed_at IS NOT NULL OR tk.status = 'COMPLETED')) AS actions_done,
            (SELECT COUNT(*) FROM meeting_actions a JOIN tasks tk ON tk.id = a.task_id WHERE a.meeting_id = m.id AND a.carried_from_id IS NULL AND a.confirmed_at IS NULL AND tk.status NOT IN ('COMPLETED', 'CANCELLED') AND tk.due_at < UTC_TIMESTAMP()) AS actions_overdue
       FROM meetings m JOIN meeting_types t ON t.id = m.type_id LEFT JOIN departments d ON d.id = m.department_id
      WHERE m.deleted_at IS NULL AND ${visible.sql} AND m.scheduled_start >= ? AND m.scheduled_start < ?
      ORDER BY m.scheduled_start DESC LIMIT 2000`,
    [...visible.params, from, to],
  );
  return rows.map((row) => ({
    id: num(row.id),
    meetingNo: str(row.meeting_no),
    title: str(row.title),
    typeName: str(row.type_name),
    departmentName: strOrNull(row.department_name),
    status: str(row.status) as MeetingStatus,
    scheduledStart: dateOrNull(row.scheduled_start)!,
    scheduledEnd: dateOrNull(row.scheduled_end)!,
    actualStart: dateOrNull(row.actual_start),
    actualEnd: dateOrNull(row.actual_end),
    agendaDueAt: dateOrNull(row.agenda_due_at),
    pointsSubmittedAt: dateOrNull(row.points_submitted_at),
    momDueAt: dateOrNull(row.mom_due_at),
    momSubmittedAt: dateOrNull(row.mom_submitted_at),
    participants: num(row.participants),
    present: num(row.present),
    absent: num(row.absent),
    actions: num(row.actions),
    actionsDone: num(row.actions_done),
    actionsOverdue: num(row.actions_overdue),
  }));
}

export async function hodDepartmentIds(userId: number, db: Queryable = getDbPool()): Promise<number[]> {
  const [rows] = await db.query<Row[]>("SELECT id FROM departments WHERE hod_user_id = ? AND active = TRUE", [userId]);
  return rows.map((row) => num(row.id));
}

// The meeting a task came from (task page link, like projects).
export async function meetingOfTask(taskId: number, db: Queryable = getDbPool()): Promise<{ id: number; meetingNo: string; title: string } | null> {
  const [rows] = await db.query<Row[]>("SELECT m.id, m.meeting_no, m.title FROM tasks t JOIN meetings m ON m.id = t.meeting_id WHERE t.id = ? AND m.deleted_at IS NULL", [taskId]);
  return rows[0] ? { id: num(rows[0].id), meetingNo: str(rows[0].meeting_no), title: str(rows[0].title) } : null;
}

// Meetings needing a deadline reminder (points or MOM due within the window, not yet submitted).
export async function meetingsNeedingReminder(db: Queryable = getDbPool()): Promise<{ id: number; meetingNo: string; title: string; coordinatorId: number; kind: "POINTS" | "MOM"; dueAt: Date }[]> {
  const [rows] = await db.query<Row[]>(
    `SELECT id, meeting_no, title, coordinator_id, 'POINTS' AS kind, agenda_due_at AS due_at FROM meetings
      WHERE deleted_at IS NULL AND status = 'SCHEDULED' AND points_status IN ('DRAFT', 'RETURNED') AND agenda_due_at IS NOT NULL
        AND agenda_due_at BETWEEN UTC_TIMESTAMP() AND DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 DAY)
      UNION ALL
     SELECT id, meeting_no, title, coordinator_id, 'MOM' AS kind, mom_due_at AS due_at FROM meetings
      WHERE deleted_at IS NULL AND status IN ('IN_PROGRESS', 'AWAITING_MOM', 'MOM_RETURNED') AND mom_due_at IS NOT NULL
        AND mom_due_at BETWEEN DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY) AND DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 DAY)`,
  );
  return rows.map((row) => ({
    id: num(row.id),
    meetingNo: str(row.meeting_no),
    title: str(row.title),
    coordinatorId: num(row.coordinator_id),
    kind: str(row.kind) as "POINTS" | "MOM",
    dueAt: dateOrNull(row.due_at)!,
  }));
}

// Designation and department of every active person, for the people search.
export async function listPeopleLabels(db: Queryable = getDbPool()): Promise<Map<number, string>> {
  const [rows] = await db.query<Row[]>(
    "SELECT u.id, g.name AS designation, d.name AS department FROM users u LEFT JOIN designations g ON g.id = u.designation_id LEFT JOIN departments d ON d.id = u.department_id WHERE u.active = TRUE AND u.is_break_glass = FALSE",
  );
  return new Map(rows.map((row) => [num(row.id), [strOrNull(row.designation), strOrNull(row.department)].filter(Boolean).join(" · ")]));
}
