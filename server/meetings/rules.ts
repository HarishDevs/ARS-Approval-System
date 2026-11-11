// v1.51.0 (owner, D-300/D-301): Meeting Management rules. Pure and
// unit-tested; the service applies them on the server for every action.
//
// One general format for every meeting. One Meeting Owner and one Coordinator
// per meeting (may be the same person). The Coordinator raises the meeting
// points and the MOM; only the Owner approves them. When the Coordinator is
// also the Owner, submitting counts as approved.

export const MEETING_STATUSES = ["SCHEDULED", "IN_PROGRESS", "AWAITING_MOM", "MOM_SUBMITTED", "MOM_RETURNED", "MOM_APPROVED", "CLOSED", "CANCELLED"] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];
export type PointsStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "RETURNED";
export type PointsPolicy = "BLOCK" | "LAST_APPROVED";
export type MeetingMode = "ONLINE" | "OFFLINE" | "HYBRID";
export type Confidentiality = "GENERAL" | "MANAGEMENT";
export type Attendance = "UNMARKED" | "PRESENT" | "LATE" | "ABSENT" | "EXCUSED";
export type MeetingPriority = "NORMAL" | "IMPORTANT" | "HIGH" | "URGENT";

export const STATUS_LABEL: Record<MeetingStatus, string> = {
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In progress",
  AWAITING_MOM: "MOM pending",
  MOM_SUBMITTED: "MOM with owner",
  MOM_RETURNED: "MOM returned",
  MOM_APPROVED: "MOM approved",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};
export const POINTS_LABEL: Record<PointsStatus, string> = { DRAFT: "Draft", SUBMITTED: "With owner", APPROVED: "Approved", RETURNED: "Returned" };
export const MODE_LABEL: Record<MeetingMode, string> = { ONLINE: "Online", OFFLINE: "Offline", HYBRID: "Hybrid" };
export const ATTENDANCE_LABEL: Record<Attendance, string> = { UNMARKED: "Not marked", PRESENT: "Present", LATE: "Late", ABSENT: "Absent", EXCUSED: "Excused" };
// Same names as tasks (owner, 10 Nov 2026).
export const PRIORITY_LABEL: Record<MeetingPriority, string> = { URGENT: "Critical", HIGH: "Most Important", IMPORTANT: "Important", NORMAL: "Normal" };
export const PRIORITIES: readonly MeetingPriority[] = ["URGENT", "HIGH", "IMPORTANT", "NORMAL"];

export interface MeetingFacts {
  status: MeetingStatus;
  ownerId: number;
  coordinatorId: number;
  createdBy: number;
  pointsStatus: PointsStatus;
  pointsPolicy: PointsPolicy;
  confidentiality: Confidentiality;
}

export interface MeetingViewer {
  id: number;
  isAdmin: boolean; // IT Admin or Super Admin
  isManagement: boolean; // the Management group (ED, MD)
  isParticipant: boolean;
  isDepartmentHod: boolean; // HOD of a department involved
}

export const isCoordinator = (meeting: Pick<MeetingFacts, "coordinatorId">, viewerId: number) => meeting.coordinatorId === viewerId;
export const isOwner = (meeting: Pick<MeetingFacts, "ownerId">, viewerId: number) => meeting.ownerId === viewerId;

// Who may open the meeting. A Management-confidential meeting is shown only to
// the people on it, the Management group and IT.
export function canViewMeeting(meeting: MeetingFacts, viewer: MeetingViewer): boolean {
  if (viewer.isAdmin || viewer.isManagement) return true;
  if (isOwner(meeting, viewer.id) || isCoordinator(meeting, viewer.id) || meeting.createdBy === viewer.id || viewer.isParticipant) return true;
  return meeting.confidentiality === "GENERAL" && viewer.isDepartmentHod;
}

const OPEN: readonly MeetingStatus[] = ["SCHEDULED", "IN_PROGRESS", "AWAITING_MOM", "MOM_SUBMITTED", "MOM_RETURNED", "MOM_APPROVED"];
export const isOpenMeeting = (status: MeetingStatus) => OPEN.includes(status);

// What the viewer may do now. Everything is checked again on the server.
export type MeetingAction =
  | "EDIT_DETAILS"
  | "CANCEL"
  | "EDIT_POINTS"
  | "SUBMIT_POINTS"
  | "DECIDE_POINTS"
  | "ENTER_MOM"
  | "START"
  | "END"
  | "MARK_ATTENDANCE"
  | "EDIT_MOM"
  | "SUBMIT_MOM"
  | "DECIDE_MOM"
  | "CONFIRM_ACTIONS"
  | "FOLLOW_UP"
  | "CLOSE"
  | "RESPOND";

export function allowedActions(meeting: MeetingFacts, viewer: MeetingViewer): Set<MeetingAction> {
  const out = new Set<MeetingAction>();
  const coordinator = isCoordinator(meeting, viewer.id) || viewer.isAdmin;
  const owner = isOwner(meeting, viewer.id);
  const s = meeting.status;
  // Invitees answer before the meeting; the Owner and Coordinator always attend.
  if (viewer.isParticipant && s === "SCHEDULED" && !owner && !isCoordinator(meeting, viewer.id)) out.add("RESPOND");
  if (coordinator && s === "SCHEDULED") out.add("CANCEL");
  // v1.51.2 (owner: the meeting time stays flexible and editable): details can
  // be changed until the MOM goes to the Owner.
  if (coordinator && (s === "SCHEDULED" || s === "IN_PROGRESS" || s === "AWAITING_MOM" || s === "MOM_RETURNED")) out.add("EDIT_DETAILS");
  if (coordinator && (s === "SCHEDULED" || s === "IN_PROGRESS") && meeting.pointsStatus !== "SUBMITTED" && meeting.pointsStatus !== "APPROVED") {
    out.add("EDIT_POINTS");
    out.add("SUBMIT_POINTS");
  }
  // Approved points can be changed again by the Coordinator before the meeting (they go back to the Owner).
  if (coordinator && s === "SCHEDULED" && meeting.pointsStatus === "APPROVED") out.add("EDIT_POINTS");
  if (owner && meeting.pointsStatus === "SUBMITTED" && (s === "SCHEDULED" || s === "IN_PROGRESS")) out.add("DECIDE_POINTS");
  // v1.51.2 (owner): one step, Enter MOM, before or after the meeting; the
  // MOM form asks whether it started on time and whether it was extended.
  if (coordinator && s === "SCHEDULED" && mayStart(meeting)) out.add("ENTER_MOM");
  // Meetings started before v1.51.2 can still be ended.
  if (coordinator && s === "IN_PROGRESS") {
    out.add("END");
    out.add("MARK_ATTENDANCE");
    out.add("EDIT_MOM");
    out.add("SUBMIT_MOM");
  }
  if (coordinator && (s === "AWAITING_MOM" || s === "MOM_RETURNED")) {
    out.add("MARK_ATTENDANCE");
    out.add("EDIT_MOM");
    out.add("SUBMIT_MOM");
  }
  if (owner && s === "MOM_SUBMITTED") out.add("DECIDE_MOM");
  // Owner or Coordinator confirms an action is done (owner, 10 Nov 2026).
  if ((owner || coordinator) && (s === "MOM_APPROVED" || s === "CLOSED")) out.add("CONFIRM_ACTIONS");
  if (coordinator && (s === "MOM_APPROVED" || s === "CLOSED")) out.add("FOLLOW_UP");
  if (coordinator && s === "MOM_APPROVED") out.add("CLOSE");
  return out;
}

// Owner's choice (points_policy): with points not approved at meeting time,
// BLOCK stops the start; LAST_APPROVED starts with the points as they are.
export function mayStart(meeting: Pick<MeetingFacts, "pointsStatus" | "pointsPolicy">): boolean {
  return meeting.pointsPolicy === "LAST_APPROVED" || meeting.pointsStatus === "APPROVED";
}

// The Coordinator is also the Owner: nobody waits on themselves.
export const selfApproved = (meeting: Pick<MeetingFacts, "ownerId" | "coordinatorId">, actorId: number) => meeting.ownerId === actorId && meeting.coordinatorId === actorId;

// Duration band, as in the register (calculated, never typed in).
export function durationBand(minutes: number | null): string | null {
  if (minutes === null || !Number.isFinite(minutes)) return null;
  if (minutes <= 30) return "Short";
  if (minutes <= 90) return "Medium";
  if (minutes <= 180) return "Long";
  return "Extended";
}

export const minutesBetween = (from: Date | null, to: Date | null) => (from && to ? Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000)) : null);

// v1.51.2 (owner: "all the on time parts make check boxes, don't calculate
// automatically"): the Coordinator's ticks, as stored. null = not answered.
export interface OnTimeTicks {
  pointsOnTime: boolean | null;
  startedOnTime: boolean | null;
  endedOnTime: boolean | null;
  momOnTime: boolean | null;
}
export const onTime = (ticks: OnTimeTicks) => ({ agendaOnTime: ticks.pointsOnTime, startedOnTime: ticks.startedOnTime, endedOnTime: ticks.endedOnTime, momOnTime: ticks.momOnTime });

// Minutes the meeting ran past its scheduled end (0 when it didn't).
export const extendedBy = (scheduledEnd: Date, actualEnd: Date | null) => (actualEnd ? Math.max(0, Math.round((actualEnd.getTime() - scheduledEnd.getTime()) / 60000)) : 0);

// The MOM form's timing questions → the actual times (India local "HH:MM" on the meeting day).
export interface TimingAnswer {
  startedOnTime: boolean;
  startTime: string; // when not on time
  extended: boolean;
  endTime: string; // when extended
  pointsOnTime: boolean;
  momOnTime: boolean;
}
export function timingProblem(answer: TimingAnswer, scheduledStart: Date, scheduledEnd: Date, toUtc: (local: string) => Date | null, day: string): { error: string } | { actualStart: Date; actualEnd: Date } {
  const actualStart = answer.startedOnTime ? scheduledStart : /^\d{2}:\d{2}$/.test(answer.startTime) ? toUtc(`${day}T${answer.startTime}`) : null;
  if (!actualStart) return { error: "The meeting didn't start on time: enter when it started." };
  const actualEnd = !answer.extended ? (scheduledEnd > actualStart ? scheduledEnd : new Date(actualStart.getTime() + (scheduledEnd.getTime() - scheduledStart.getTime()))) : /^\d{2}:\d{2}$/.test(answer.endTime) ? toUtc(`${day}T${answer.endTime}`) : null;
  if (!actualEnd) return { error: "The meeting was extended: enter when it ended." };
  if (actualEnd <= actualStart) return { error: "The end time must be after the start time." };
  if (answer.extended && actualEnd <= scheduledEnd) return { error: "An extended meeting ends after its scheduled end. Untick Extended, or enter a later end time." };
  return { actualStart, actualEnd };
}

// Before v1.51.2: compliance worked out from timestamps (kept for reference and old tests).
export interface ComplianceFacts {
  scheduledStart: Date;
  scheduledEnd: Date;
  actualStart: Date | null;
  actualEnd: Date | null;
  agendaDueAt: Date | null;
  pointsSubmittedAt: Date | null;
  momDueAt: Date | null;
  momSubmittedAt: Date | null;
}
const GRACE_MS = 5 * 60_000; // 5 minutes either side counts as on time
export function compliance(facts: ComplianceFacts) {
  return {
    agendaOnTime: facts.pointsSubmittedAt ? (facts.agendaDueAt ? facts.pointsSubmittedAt <= facts.agendaDueAt : facts.pointsSubmittedAt <= facts.scheduledStart) : null,
    startedOnTime: facts.actualStart ? facts.actualStart.getTime() <= facts.scheduledStart.getTime() + GRACE_MS : null,
    endedOnTime: facts.actualEnd ? facts.actualEnd.getTime() <= facts.scheduledEnd.getTime() + GRACE_MS : null,
    momOnTime: facts.momSubmittedAt ? (facts.momDueAt ? facts.momSubmittedAt <= facts.momDueAt : true) : null,
  };
}

// Input checks for scheduling (server side).
export interface ScheduleInput {
  title: string;
  typeId: number | null;
  ownerId: number | null;
  coordinatorId: number | null;
  participantIds: number[];
  departmentIds: number[];
  start: Date | null;
  end: Date | null;
  agendaDueAt: Date | null;
  momDueAt: Date | null;
  mode: string;
  link: string;
}
export function scheduleProblems(input: ScheduleInput, now = new Date()): Record<string, string> {
  const out: Record<string, string> = {};
  const title = input.title.trim();
  if (title.length < 3) out.title = "Give the meeting a title (at least 3 characters).";
  if (title.length > 200) out.title = "Use 200 characters or fewer.";
  if (!input.typeId) out.typeId = "Choose the meeting type.";
  if (!input.ownerId) out.ownerId = "Choose the Meeting Owner.";
  if (!input.coordinatorId) out.coordinatorId = "Choose the Coordinator.";
  if (input.participantIds.length > 200) out.participants = "Up to 200 participants.";
  if (!input.start) out.start = "Choose the date and start time.";
  if (!input.end) out.end = "Choose the end time.";
  if (input.start && input.end && input.end <= input.start) out.end = "The end must be after the start.";
  // v1.51.2 (owner): a meeting may be recorded after it happened (up to a year back).
  if (input.start && input.start.getTime() < now.getTime() - 366 * 86_400_000) out.start = "The date is more than a year ago.";
  if (input.start && input.agendaDueAt && input.agendaDueAt > input.start) out.agendaDueAt = "The points deadline must be before the meeting starts.";
  if (input.end && input.momDueAt && input.momDueAt < input.end) out.momDueAt = "The MOM deadline must be after the meeting ends.";
  if ((input.mode === "ONLINE" || input.mode === "HYBRID") && input.link && !/^https?:\/\//i.test(input.link)) out.link = "Use a full link starting with https://";
  return out;
}

// Action items in the MOM: each needs a title and an owner.
export interface ActionInput {
  title: string;
  ownerId: number | null;
  dueOn: string;
}
export function actionProblems(actions: readonly ActionInput[]): string | null {
  for (const [index, action] of actions.entries()) {
    if (action.title.trim().length < 3) return `Action ${index + 1}: write what needs doing.`;
    if (!action.ownerId) return `Action ${index + 1}: choose who is responsible.`;
    if (action.dueOn && !/^\d{4}-\d{2}-\d{2}$/.test(action.dueOn)) return `Action ${index + 1}: choose a valid due date.`;
  }
  return null;
}

// Follow-up register: where an action stands, from its task.
export type FollowUpState = "NO_TASK" | "OPEN" | "OVERDUE" | "DONE_UNCONFIRMED" | "CONFIRMED" | "CANCELLED";
export function actionState(action: { taskStatus: string | null; dueAt: Date | null; confirmedAt: Date | null }, now = new Date()): FollowUpState {
  if (action.confirmedAt) return "CONFIRMED";
  if (!action.taskStatus) return "NO_TASK";
  if (action.taskStatus === "CANCELLED") return "CANCELLED";
  if (action.taskStatus === "COMPLETED") return "DONE_UNCONFIRMED";
  if (action.dueAt && action.dueAt.getTime() < now.getTime()) return "OVERDUE";
  return "OPEN";
}
export const FOLLOW_UP_LABEL: Record<FollowUpState, string> = {
  NO_TASK: "Task not created yet",
  OPEN: "In progress",
  OVERDUE: "Overdue",
  DONE_UNCONFIRMED: "Done, to confirm",
  CONFIRMED: "Confirmed done",
  CANCELLED: "Task cancelled",
};
// Carried into a follow-up meeting: everything not confirmed done or cancelled.
export const carriesForward = (state: FollowUpState) => state !== "CONFIRMED" && state !== "CANCELLED";
