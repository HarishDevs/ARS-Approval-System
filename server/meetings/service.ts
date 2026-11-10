import "server-only";
import type { PoolConnection } from "mysql2/promise";
import { withTransaction } from "@/lib/db/transaction";
import { afterResponse } from "@/lib/http/after-response";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { insertOutbox } from "@/lib/db/repositories/outbox.repository";
import { nextRequestNumber } from "@/lib/db/repositories/approvals.repository";
import { appendTaskEvent, findTask, insertTask, listPeopleFacts, updateTask } from "@/lib/db/repositories/tasks.repository";
import { addFollower, generalTypeVersion } from "@/lib/db/repositories/work.repository";
import * as repo from "@/lib/db/repositories/meetings.repository";
import { deliverOutbox } from "@/server/approvals/service";
import { meetingMessages, taskMessages, type MeetingInfo } from "@/server/modules/messages";
import { isAdminActor, type TaskActor } from "@/server/modules/tasks";
import { indiaLocalToUtc } from "@/server/modules/settings";
import type { NotifyInput } from "@/server/notifications/notify";
import {
  actionProblems,
  actionState,
  allowedActions,
  canViewMeeting,
  carriesForward,
  isOpenMeeting,
  PRIORITIES,
  scheduleProblems,
  selfApproved,
  type Attendance,
  type MeetingAction,
  type MeetingFacts,
  type MeetingMode,
  type MeetingPriority,
  type MeetingViewer,
} from "@/server/meetings/rules";

// v1.51.0 (D-300, D-301): Meeting Management. Coordinator-driven: the
// Coordinator schedules, raises the meeting points and records the MOM; only
// the Meeting Owner approves the points and the MOM. On MOM approval each
// action item becomes a General task linked to the meeting (tasks.meeting_id).
// Every rule is checked here, under the meeting row lock.
export type MeetingActor = TaskActor;
export type MeetingResult<T = undefined> = { ok: true; value: T } | { ok: false; message: string; fieldErrors?: Record<string, string> };
const fail = <T = undefined>(message: string, fieldErrors?: Record<string, string>): MeetingResult<T> => ({ ok: false, message, fieldErrors });
const NOT_FOUND = "Not found.";
const STALE = "The meeting changed while you were looking. Reload and try again.";

async function send(ids: number[]) {
  if (ids.length) await afterResponse("meeting messages", () => deliverOutbox(ids.slice(0, 200)));
}
const info = (meeting: repo.MeetingRecord): MeetingInfo => ({ id: meeting.id, meetingNo: meeting.meetingNo, title: meeting.title, start: meeting.scheduledStart });
const facts = (meeting: repo.MeetingRecord): MeetingFacts => ({
  status: meeting.status,
  ownerId: meeting.ownerId,
  coordinatorId: meeting.coordinatorId,
  createdBy: meeting.createdBy,
  pointsStatus: meeting.pointsStatus,
  pointsPolicy: meeting.pointsPolicy,
  confidentiality: meeting.confidentiality,
});

export async function viewerFor(meeting: repo.MeetingRecord, actor: { id: number; roles: readonly string[] }): Promise<MeetingViewer> {
  const [management, participant, hod] = await Promise.all([repo.isManagementMember(actor.id), repo.isParticipant(meeting.id, actor.id), repo.isHodOfMeeting(meeting.id, actor.id)]);
  return { id: actor.id, isAdmin: isAdminActor(actor), isManagement: management, isParticipant: participant, isDepartmentHod: hod };
}

// The scope of lists and dashboards for this person.
export async function scopeFor(actor: { id: number; roles: readonly string[] }): Promise<repo.MeetingScope> {
  if (isAdminActor(actor) || (await repo.isManagementMember(actor.id))) return { kind: "ALL" };
  return { kind: "PERSON", userId: actor.id, hodDepartmentIds: await repo.hodDepartmentIds(actor.id) };
}

export async function loadMeetingFor(id: number, actor: { id: number; roles: readonly string[] }) {
  const meeting = await repo.findMeeting(id);
  if (!meeting) return null;
  const viewer = await viewerFor(meeting, actor);
  if (!canViewMeeting(facts(meeting), viewer)) return null;
  return { meeting, viewer, actions: allowedActions(facts(meeting), viewer) };
}

// Under the lock: the meeting, the viewer and what they may do now.
async function lockFor(id: number, actor: MeetingActor, connection: PoolConnection) {
  const meeting = await repo.findMeeting(id, connection, true);
  if (!meeting) return null;
  const viewer = await viewerFor(meeting, actor);
  if (!canViewMeeting(facts(meeting), viewer)) return null;
  return { meeting, viewer, allowed: allowedActions(facts(meeting), viewer) };
}

// Everyone told about the meeting: participants, Owner and Coordinator (never the actor).
async function audience(meetingId: number, meeting: repo.MeetingRecord, actorId: number, connection: PoolConnection): Promise<number[]> {
  const people = await repo.listParticipants(meetingId, connection);
  return [...new Set([...people.map((person) => person.userId), meeting.ownerId, meeting.coordinatorId])].filter((id) => id !== actorId);
}

const cleanText = (value: string, max: number) => value.replace(/\s+$/g, "").trim().slice(0, max);

// ---- scheduling --------------------------------------------------------------------------
export interface ScheduleMeetingInput {
  meetingId: number | null; // null = new
  rowVersion: number | null;
  parentMeetingId: number | null; // a follow-up of this meeting
  title: string;
  description: string;
  typeId: number | null;
  departmentId: number | null;
  departmentIds: number[];
  ownerId: number | null;
  coordinatorId: number | null;
  participantIds: number[];
  mode: string;
  venue: string;
  link: string;
  priority: string;
  confidentiality: string;
  guests: string;
  start: string; // India local "YYYY-MM-DDTHH:MM"
  end: string;
  agendaDue: string;
  momDue: string;
  pointsPolicy: string;
  points: string[]; // initial points (new meetings only; from the type template)
}

export async function scheduleMeeting(input: ScheduleMeetingInput, actor: MeetingActor): Promise<MeetingResult<{ id: number; meetingNo: string }>> {
  const start = indiaLocalToUtc(input.start);
  const end = indiaLocalToUtc(input.end);
  const agendaDueAt = input.agendaDue ? indiaLocalToUtc(input.agendaDue) : null;
  const momDueAt = input.momDue ? indiaLocalToUtc(input.momDue) : null;
  const mode: MeetingMode = input.mode === "ONLINE" || input.mode === "HYBRID" ? input.mode : "OFFLINE";
  const link = cleanText(input.link, 500);
  const problems = scheduleProblems({
    title: input.title,
    typeId: input.typeId,
    ownerId: input.ownerId,
    coordinatorId: input.coordinatorId,
    participantIds: input.participantIds,
    departmentIds: input.departmentIds,
    start,
    end,
    agendaDueAt,
    momDueAt,
    mode,
    link,
  });
  if (input.agendaDue && !agendaDueAt) problems.agendaDueAt = "Choose a valid date and time.";
  if (input.momDue && !momDueAt) problems.momDueAt = "Choose a valid date and time.";
  // Editing keeps the original date check relaxed (a meeting already in the past week stays editable).
  if (input.meetingId && problems.start === "The date is more than a week ago.") delete problems.start;
  const people = await listPeopleFacts();
  const active = new Set(people.map((person) => person.id));
  for (const [key, id] of [
    ["ownerId", input.ownerId],
    ["coordinatorId", input.coordinatorId],
  ] as const)
    if (id && !active.has(id)) problems[key] = "Choose an active person.";
  const participantIds = [...new Set(input.participantIds.filter((id) => active.has(id)))];
  const types = await repo.listMeetingTypes(true);
  const type = types.find((row) => row.id === input.typeId);
  if (input.typeId && (!type || (!type.active && !input.meetingId))) problems.typeId = "Choose a meeting type.";
  if (Object.keys(problems).length) return fail("Check the highlighted fields.", problems);
  const priority: MeetingPriority = (PRIORITIES as readonly string[]).includes(input.priority) ? (input.priority as MeetingPriority) : "NORMAL";
  const values = {
    title: cleanText(input.title, 200),
    description: cleanText(input.description, 8000) || null,
    typeId: input.typeId!,
    departmentId: input.departmentId,
    ownerId: input.ownerId!,
    coordinatorId: input.coordinatorId!,
    mode,
    venue: cleanText(input.venue, 200) || null,
    link: mode === "OFFLINE" ? null : link || null,
    priority,
    confidentiality: input.confidentiality === "MANAGEMENT" ? ("MANAGEMENT" as const) : ("GENERAL" as const),
    guests: cleanText(input.guests, 1000) || null,
    scheduledStart: start!,
    scheduledEnd: end!,
    agendaDueAt,
    momDueAt,
    pointsPolicy: input.pointsPolicy === "BLOCK" ? ("BLOCK" as const) : ("LAST_APPROVED" as const),
  };
  // Owner and Coordinator always attend.
  const everyone = [...new Set([...participantIds, values.ownerId, values.coordinatorId])];
  const departmentIds = [...new Set(input.departmentIds)].slice(0, 50);

  const outcome = await withTransaction(async (connection) => {
    if (input.meetingId) {
      const locked = await lockFor(input.meetingId, actor, connection);
      if (!locked || !locked.allowed.has("EDIT_DETAILS")) return { error: NOT_FOUND } as const;
      if (input.rowVersion !== null && input.rowVersion !== locked.meeting.rowVersion) return { error: STALE } as const;
      const before = locked.meeting;
      await repo.updateMeeting(
        before.id,
        before.rowVersion,
        {
          title: values.title,
          description: values.description,
          type_id: values.typeId,
          department_id: values.departmentId,
          owner_id: values.ownerId,
          coordinator_id: values.coordinatorId,
          mode: values.mode,
          venue: values.venue,
          link: values.link,
          priority: values.priority,
          confidentiality: values.confidentiality,
          guests: values.guests,
          scheduled_start: values.scheduledStart,
          scheduled_end: values.scheduledEnd,
          agenda_due_at: values.agendaDueAt,
          mom_due_at: values.momDueAt,
          points_policy: values.pointsPolicy,
        },
        connection,
      );
      const added = await repo.replaceParticipants(before.id, everyone, connection);
      await repo.replaceDepartments(before.id, departmentIds, connection);
      const moved = before.scheduledStart.getTime() !== values.scheduledStart.getTime() || before.scheduledEnd.getTime() !== values.scheduledEnd.getTime();
      await repo.appendMeetingEvent(before.id, { actorId: actor.id, type: "UPDATED", body: moved ? "Date or time changed" : "Details changed", payload: { added } }, connection);
      await recordAudit(
        {
          actorUserId: actor.id,
          action: "MEETING_UPDATED",
          entityType: "MEETING",
          entityId: before.id,
          sessionId: actor.sessionId,
          ipAddress: actor.ipAddress ?? null,
          metadata: { meetingNo: before.meetingNo, added: added.length },
        },
        connection,
      );
      const after = { ...info(before), title: values.title, start: values.scheduledStart };
      const addedSet = new Set(added);
      const messages: NotifyInput[] = [
        ...added.filter((id) => id !== actor.id).map((id) => meetingMessages.invited(after, id, actor.name)),
        ...everyone.filter((id) => id !== actor.id && !addedSet.has(id)).map((id) => meetingMessages.updated(after, id, moved ? "the date or time changed" : "the details changed")),
      ];
      return { id: before.id, meetingNo: before.meetingNo, outbox: await insertOutbox(null, messages, connection) };
    }
    // New meeting (or a follow-up of a parent the actor coordinates).
    let seriesId: number | null = null;
    let parent: repo.MeetingRecord | null = null;
    if (input.parentMeetingId) {
      const locked = await lockFor(input.parentMeetingId, actor, connection);
      if (!locked || !locked.allowed.has("FOLLOW_UP")) return { error: NOT_FOUND } as const;
      parent = locked.meeting;
      seriesId = parent.seriesId ?? parent.id;
    }
    const meetingNo = await nextRequestNumber("MTG", connection);
    const id = await repo.insertMeeting({ meetingNo, ...values, seriesId, parentMeetingId: parent?.id ?? null, createdBy: actor.id }, connection);
    await repo.replaceParticipants(id, everyone, connection);
    await repo.replaceDepartments(id, departmentIds, connection);
    const startPoints = input.points
      .map((point) => cleanText(point, 300))
      .filter(Boolean)
      .slice(0, 100);
    if (startPoints.length)
      await repo.replacePoints(
        id,
        startPoints.map((title) => ({ id: null, title, presenterId: null })),
        connection,
      );
    let carried = 0;
    if (parent) {
      // Carry forward: actions not confirmed done or cancelled (same task), and open points.
      const actions = await repo.listActions(parent.id, connection);
      let position = 0;
      for (const action of actions) {
        if (!carriesForward(actionState({ taskStatus: action.taskStatus, dueAt: action.taskDueAt, confirmedAt: action.confirmedAt }))) continue;
        if (!action.taskId) continue;
        position += 1;
        await repo.insertCarriedAction(id, action, position, connection);
        carried += 1;
      }
      for (const point of await repo.listOpenPoints(parent.id, connection)) if (point.status === "OPEN") await repo.insertCarriedOpenPoint(id, point, connection);
      await repo.appendMeetingEvent(parent.id, { actorId: actor.id, type: "FOLLOW_UP", body: `Follow-up meeting ${meetingNo} scheduled`, payload: { followUpId: id } }, connection);
    }
    await repo.appendMeetingEvent(id, { actorId: actor.id, type: "SCHEDULED", body: parent ? `Follow-up of ${parent.meetingNo}; ${carried} open action(s) carried forward` : null }, connection);
    await recordAudit(
      {
        actorUserId: actor.id,
        action: "MEETING_SCHEDULED",
        entityType: "MEETING",
        entityId: id,
        sessionId: actor.sessionId,
        ipAddress: actor.ipAddress ?? null,
        metadata: { meetingNo, participants: everyone.length, parent: parent?.meetingNo ?? null },
      },
      connection,
    );
    const summary: MeetingInfo = { id, meetingNo, title: values.title, start: values.scheduledStart };
    const messages = everyone.filter((personId) => personId !== actor.id).map((personId) => meetingMessages.invited(summary, personId, actor.name));
    return { id, meetingNo, outbox: await insertOutbox(null, messages, connection) };
  });
  if ("error" in outcome) return fail(outcome.error ?? NOT_FOUND);
  await send(outcome.outbox);
  return { ok: true, value: { id: outcome.id, meetingNo: outcome.meetingNo } };
}

// ---- actions on a meeting ------------------------------------------------------------------
export interface PointInput {
  id: number | null;
  title: string;
  presenterId: number | null;
}
export interface MomInput {
  discussions: { pointId: number; text: string }[];
  decisions: string[];
  actions: { title: string; description: string; ownerId: number | null; priority: string; dueOn: string }[];
  openPoints: { text: string; ownerId: number | null; reviewOn: string }[];
  attendance: { userId: number; attendance: string }[];
}
export interface ActOnMeetingInput {
  meetingId: number;
  action: MeetingAction | "SAVE_POINTS" | "SAVE_MOM" | "APPROVE_POINTS" | "RETURN_POINTS" | "APPROVE_MOM" | "RETURN_MOM";
  rowVersion: number | null;
  remarks: string;
  response: string;
  points: PointInput[] | null;
  mom: MomInput | null;
  actualStart: string;
  actualEnd: string;
}

const ATTENDANCE: readonly Attendance[] = ["UNMARKED", "PRESENT", "LATE", "ABSENT", "EXCUSED"];
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function cleanPoints(points: readonly PointInput[], active: ReadonlySet<number>): { error: string } | { points: PointInput[] } {
  const out: PointInput[] = [];
  for (const point of points.slice(0, 100)) {
    const title = cleanText(point.title, 300);
    if (!title) continue;
    if (point.presenterId && !active.has(point.presenterId)) return { error: "A presenter isn't an active person." };
    out.push({ id: point.id, title, presenterId: point.presenterId || null });
  }
  return { points: out };
}

function cleanMom(mom: MomInput, active: ReadonlySet<number>) {
  const actions = mom.actions
    .slice(0, 200)
    .map((action) => ({
      title: cleanText(action.title, 200),
      description: cleanText(action.description, 2000) || null,
      ownerId: action.ownerId && active.has(action.ownerId) ? action.ownerId : null,
      priority: ((PRIORITIES as readonly string[]).includes(action.priority) ? action.priority : "NORMAL") as MeetingPriority,
      dueOn: ISO_DAY.test(action.dueOn) ? action.dueOn : "",
    }))
    .filter((action) => action.title || action.ownerId);
  const openPoints = mom.openPoints
    .slice(0, 200)
    .map((point) => ({ text: cleanText(point.text, 1000), ownerId: point.ownerId && active.has(point.ownerId) ? point.ownerId : null, reviewOn: ISO_DAY.test(point.reviewOn) ? point.reviewOn : null }))
    .filter((point) => point.text);
  const decisions = mom.decisions
    .map((text) => cleanText(text, 1000))
    .filter(Boolean)
    .slice(0, 200);
  const attendance = new Map<number, Attendance>();
  for (const mark of mom.attendance.slice(0, 500)) if ((ATTENDANCE as readonly string[]).includes(mark.attendance)) attendance.set(mark.userId, mark.attendance as Attendance);
  return { actions, openPoints, decisions, attendance, discussions: mom.discussions.slice(0, 200).map((row) => ({ pointId: row.pointId, text: cleanText(row.text, 8000) })) };
}

// MOM approved: every untasked action item becomes a General task linked to the meeting.
async function createActionTasks(meeting: repo.MeetingRecord, actor: MeetingActor, connection: PoolConnection): Promise<{ messages: NotifyInput[]; created: number } | { error: string }> {
  const general = await generalTypeVersion(connection);
  if (!general) return { error: "The General task type is switched off, so the action items can't become tasks. Ask IT to switch it on in Admin → Task types." };
  const messages: NotifyInput[] = [];
  let created = 0;
  for (const action of await repo.listActions(meeting.id, connection)) {
    if (action.taskId) continue;
    const taskNo = await nextRequestNumber("TSK", connection);
    const dueAt = action.dueOn ? indiaLocalToUtc(`${action.dueOn}T18:00`) : null;
    const description = [action.description, `From meeting ${meeting.meetingNo}: ${meeting.title}`].filter(Boolean).join("\n\n");
    // Assigned by the Coordinator (who raised it), approved by the Owner.
    const taskId = await insertTask(
      {
        taskNo,
        typeVersionId: general.versionId,
        title: action.title,
        description,
        priority: action.priority,
        createdBy: meeting.coordinatorId,
        assigneeId: action.ownerId,
        dueAt,
        startsOn: null,
        formData: { __meeting: meeting.id },
        relatedRequestId: null,
        submissionKey: null,
      },
      connection,
    );
    await repo.setTaskMeeting(taskId, meeting.id, connection);
    await repo.linkActionTask(action.id, taskId, connection);
    await appendTaskEvent(
      taskId,
      {
        actorId: actor.id,
        type: "CREATED",
        to: "OPEN",
        body: `Action item of meeting ${meeting.meetingNo}`,
        payload: { meetingId: meeting.id, assigneeId: action.ownerId, priority: action.priority, dueAt: dueAt?.toISOString() ?? null },
      },
      connection,
    );
    await addFollower(taskId, meeting.coordinatorId, "CREATOR", actor.id, connection);
    if (meeting.ownerId !== meeting.coordinatorId) await addFollower(taskId, meeting.ownerId, "MANUAL", actor.id, connection);
    if (action.ownerId !== meeting.coordinatorId) await addFollower(taskId, action.ownerId, "ASSIGNEE", actor.id, connection);
    if (action.ownerId !== actor.id) messages.push(taskMessages.assigned({ id: taskId, taskNo, title: action.title, dueAt }, action.ownerId, meeting.coordinatorName));
    created += 1;
  }
  return { messages, created };
}

export async function actOnMeeting(input: ActOnMeetingInput, actor: MeetingActor): Promise<MeetingResult<{ message: string }>> {
  const people = await listPeopleFacts();
  const active = new Set(people.map((person) => person.id));
  const remarks = cleanText(input.remarks, 1000);
  const outcome = await withTransaction(async (connection) => {
    const locked = await lockFor(input.meetingId, actor, connection);
    if (!locked) return { error: NOT_FOUND } as const;
    const { meeting, allowed } = locked;
    if (input.rowVersion !== null && input.rowVersion !== meeting.rowVersion && input.action !== "RESPOND") return { error: STALE } as const;
    const update = async (changes: Record<string, unknown>) => {
      if (!(await repo.updateMeeting(meeting.id, meeting.rowVersion, changes, connection))) throw new Error("stale");
    };
    const event = (type: string, body?: string | null, payload?: Record<string, unknown>) => repo.appendMeetingEvent(meeting.id, { actorId: actor.id, type, body, payload }, connection);
    const audit = (action: string, metadata: Record<string, unknown> = {}) =>
      recordAudit(
        {
          actorUserId: actor.id,
          action,
          entityType: "MEETING",
          entityId: meeting.id,
          sessionId: actor.sessionId,
          ipAddress: actor.ipAddress ?? null,
          metadata: { meetingNo: meeting.meetingNo, ...metadata },
        },
        connection,
      );
    const messages: NotifyInput[] = [];
    const everyone = () => audience(meeting.id, meeting, actor.id, connection);
    const summary = info(meeting);

    switch (input.action) {
      case "RESPOND": {
        if (!allowed.has("RESPOND")) return { error: NOT_FOUND } as const;
        const answer = ["ACCEPTED", "DECLINED", "TENTATIVE"].includes(input.response) ? input.response : null;
        if (!answer) return { error: "Choose Attend, Maybe or Can't attend." } as const;
        if (answer === "DECLINED" && remarks.length < 3) return { error: "Say why you can't attend (at least 3 characters)." } as const;
        await repo.setResponse(meeting.id, actor.id, answer, remarks || null, connection);
        await event("RESPONDED", `${answer === "ACCEPTED" ? "Attending" : answer === "DECLINED" ? "Can't attend" : "Maybe"}${remarks ? `: ${remarks}` : ""}`);
        if (answer !== "ACCEPTED" && meeting.coordinatorId !== actor.id)
          messages.push(meetingMessages.responded(summary, meeting.coordinatorId, actor.name, answer === "DECLINED" ? "Can't attend" : "Maybe"));
        return { message: "Your answer is saved.", outbox: await insertOutbox(null, messages, connection) };
      }
      case "CANCEL": {
        if (!allowed.has("CANCEL")) return { error: NOT_FOUND } as const;
        if (remarks.length < 3) return { error: "Say why the meeting is cancelled (at least 3 characters)." } as const;
        await update({ status: "CANCELLED", cancelled_reason: remarks });
        await event("CANCELLED", remarks);
        await audit("MEETING_CANCELLED", { reason: remarks });
        for (const id of await everyone()) messages.push(meetingMessages.cancelled(summary, id, actor.name, remarks));
        return { message: "Meeting cancelled. Everyone was told.", outbox: await insertOutbox(null, messages, connection) };
      }
      case "SAVE_POINTS":
      case "SUBMIT_POINTS": {
        if (!allowed.has("EDIT_POINTS") && !(input.action === "SUBMIT_POINTS" && allowed.has("SUBMIT_POINTS"))) return { error: NOT_FOUND } as const;
        if (input.points) {
          const cleaned = cleanPoints(input.points, active);
          if ("error" in cleaned) return { error: cleaned.error } as const;
          await repo.replacePoints(meeting.id, cleaned.points, connection);
        }
        const count = (await repo.listPoints(meeting.id, connection)).length;
        if (input.action === "SAVE_POINTS") {
          // Changing approved points sends them back to draft (the Owner approves again).
          await update({ points_status: meeting.pointsStatus === "APPROVED" || meeting.pointsStatus === "SUBMITTED" ? "DRAFT" : meeting.pointsStatus });
          await event("POINTS_SAVED", `${count} point(s)`);
          return { message: "Meeting points saved.", outbox: [] };
        }
        if (count === 0) return { error: "Add at least one meeting point before sending it." } as const;
        if (selfApproved(meeting, actor.id)) {
          await update({ points_status: "APPROVED", points_submitted_at: new Date(), points_decided_at: new Date(), points_remarks: null });
          await event("POINTS_APPROVED", `${count} point(s); the Coordinator is the Meeting Owner`);
          await audit("MEETING_POINTS_APPROVED", { self: true });
          for (const id of await everyone()) messages.push(meetingMessages.published(summary, id, "meeting points"));
          return { message: "Meeting points approved and shared with the participants.", outbox: await insertOutbox(null, messages, connection) };
        }
        await update({ points_status: "SUBMITTED", points_submitted_at: new Date(), points_remarks: null });
        await event("POINTS_SUBMITTED", `${count} point(s)`);
        await audit("MEETING_POINTS_SUBMITTED");
        messages.push(meetingMessages.toApprove(summary, meeting.ownerId, actor.name, "meeting points"));
        return { message: `Sent to ${meeting.ownerName} (Meeting Owner) for approval.`, outbox: await insertOutbox(null, messages, connection) };
      }
      case "APPROVE_POINTS":
      case "RETURN_POINTS": {
        if (!allowed.has("DECIDE_POINTS")) return { error: NOT_FOUND } as const;
        const approve = input.action === "APPROVE_POINTS";
        if (!approve && remarks.length < 3) return { error: "Say what to change (at least 3 characters)." } as const;
        await update({ points_status: approve ? "APPROVED" : "RETURNED", points_decided_at: new Date(), points_remarks: remarks || null });
        await event(approve ? "POINTS_APPROVED" : "POINTS_RETURNED", remarks || null);
        await audit(approve ? "MEETING_POINTS_APPROVED" : "MEETING_POINTS_RETURNED");
        if (meeting.coordinatorId !== actor.id) messages.push(meetingMessages.decided(summary, meeting.coordinatorId, actor.name, "meeting points", approve, remarks));
        if (approve) for (const id of await everyone()) if (id !== meeting.coordinatorId) messages.push(meetingMessages.published(summary, id, "meeting points"));
        return { message: approve ? "Meeting points approved and shared with the participants." : "Returned to the Coordinator.", outbox: await insertOutbox(null, messages, connection) };
      }
      case "START": {
        if (!allowed.has("START"))
          return { error: meeting.pointsPolicy === "BLOCK" && meeting.pointsStatus !== "APPROVED" ? "The Meeting Owner asked for approved points before the meeting starts." : NOT_FOUND } as const;
        await update({ status: "IN_PROGRESS", actual_start: new Date() });
        await event("STARTED");
        return { message: "Meeting started. Mark attendance and take the minutes as you go.", outbox: [] };
      }
      case "END": {
        if (!allowed.has("END")) return { error: NOT_FOUND } as const;
        // Recorded as held after the fact: the Coordinator enters the real times.
        let actualStart = meeting.actualStart;
        let actualEnd = new Date();
        if (meeting.status === "SCHEDULED") {
          const from = indiaLocalToUtc(input.actualStart);
          const to = indiaLocalToUtc(input.actualEnd);
          if (!from || !to || to <= from) return { error: "Enter when the meeting really started and ended (the end after the start)." } as const;
          if (to.getTime() > Date.now() + 5 * 60_000) return { error: "The end time can't be in the future." } as const;
          actualStart = from;
          actualEnd = to;
        }
        await update({ status: "AWAITING_MOM", actual_start: actualStart, actual_end: actualEnd });
        await event("ENDED");
        return { message: "Meeting ended. Write the MOM and send it to the Meeting Owner.", outbox: [] };
      }
      case "SAVE_MOM":
      case "SUBMIT_MOM": {
        if (!allowed.has("EDIT_MOM")) return { error: NOT_FOUND } as const;
        if (input.mom) {
          const mom = cleanMom(input.mom, active);
          const problem = actionProblems(mom.actions.map((action) => ({ title: action.title, ownerId: action.ownerId, dueOn: action.dueOn })));
          if (problem && input.action === "SUBMIT_MOM") return { error: problem } as const;
          const points = await repo.listPoints(meeting.id, connection);
          const notes = new Map(mom.discussions.map((row) => [row.pointId, row.text]));
          await repo.replacePoints(
            meeting.id,
            points.map((point) => ({ id: point.id, title: point.title, presenterId: point.presenterId, discussion: notes.has(point.id) ? notes.get(point.id) || null : point.discussion })),
            connection,
          );
          await repo.replaceDecisions(meeting.id, mom.decisions, connection);
          await repo.replaceDraftActions(
            meeting.id,
            mom.actions
              .filter((action) => action.title.length >= 3 && action.ownerId)
              .map((action) => ({ title: action.title, description: action.description, ownerId: action.ownerId!, priority: action.priority, dueOn: action.dueOn || null })),
            connection,
          );
          await repo.replaceOpenPoints(meeting.id, mom.openPoints, connection);
          if (mom.attendance.size) await repo.setAttendance(meeting.id, mom.attendance, connection);
        }
        if (input.action === "SAVE_MOM") {
          await event("MOM_SAVED");
          return { message: "MOM saved.", outbox: [] };
        }
        if (!allowed.has("SUBMIT_MOM")) return { error: NOT_FOUND } as const;
        const ended = meeting.actualEnd ?? new Date();
        const changes: Record<string, unknown> = { mom_submitted_at: new Date(), mom_remarks: null, actual_end: ended, actual_start: meeting.actualStart ?? meeting.scheduledStart };
        if (selfApproved(meeting, actor.id)) {
          const tasks = await createActionTasks(meeting, actor, connection);
          if ("error" in tasks) return { error: tasks.error } as const;
          await update({ ...changes, status: "MOM_APPROVED", mom_decided_at: new Date() });
          await event("MOM_APPROVED", `The Coordinator is the Meeting Owner; ${tasks.created} task(s) created`);
          await audit("MOM_APPROVED", { self: true, tasks: tasks.created });
          for (const id of await everyone()) messages.push(meetingMessages.published(summary, id, "MOM"));
          return { message: `MOM approved and shared. ${tasks.created} action item(s) are now tasks.`, outbox: await insertOutbox(null, [...messages, ...tasks.messages], connection) };
        }
        await update({ ...changes, status: "MOM_SUBMITTED" });
        await event("MOM_SUBMITTED");
        await audit("MOM_SUBMITTED");
        messages.push(meetingMessages.toApprove(summary, meeting.ownerId, actor.name, "MOM"));
        return { message: `MOM sent to ${meeting.ownerName} (Meeting Owner) for approval.`, outbox: await insertOutbox(null, messages, connection) };
      }
      case "APPROVE_MOM":
      case "RETURN_MOM": {
        if (!allowed.has("DECIDE_MOM")) return { error: NOT_FOUND } as const;
        const approve = input.action === "APPROVE_MOM";
        if (!approve) {
          if (remarks.length < 3) return { error: "Say what to change (at least 3 characters)." } as const;
          await update({ status: "MOM_RETURNED", mom_decided_at: new Date(), mom_remarks: remarks });
          await event("MOM_RETURNED", remarks);
          await audit("MOM_RETURNED");
          if (meeting.coordinatorId !== actor.id) messages.push(meetingMessages.decided(summary, meeting.coordinatorId, actor.name, "MOM", false, remarks));
          return { message: "MOM returned to the Coordinator.", outbox: await insertOutbox(null, messages, connection) };
        }
        const tasks = await createActionTasks(meeting, actor, connection);
        if ("error" in tasks) return { error: tasks.error } as const;
        await update({ status: "MOM_APPROVED", mom_decided_at: new Date(), mom_remarks: remarks || null });
        await event("MOM_APPROVED", `${tasks.created} task(s) created${remarks ? `. ${remarks}` : ""}`);
        await audit("MOM_APPROVED", { tasks: tasks.created });
        if (meeting.coordinatorId !== actor.id) messages.push(meetingMessages.decided(summary, meeting.coordinatorId, actor.name, "MOM", true, remarks));
        for (const id of await everyone()) if (id !== meeting.coordinatorId) messages.push(meetingMessages.published(summary, id, "MOM"));
        return { message: `MOM approved and shared. ${tasks.created} action item(s) are now tasks.`, outbox: await insertOutbox(null, [...messages, ...tasks.messages], connection) };
      }
      case "CLOSE": {
        if (!allowed.has("CLOSE")) return { error: NOT_FOUND } as const;
        const actions = await repo.listActions(meeting.id, connection);
        const followUps = await connection.query("SELECT carried_from_id FROM meeting_actions WHERE carried_from_id IN (?)", [actions.length ? actions.map((action) => action.id) : [0]]);
        const carried = new Set((followUps[0] as { carried_from_id: number }[]).map((row) => Number(row.carried_from_id)));
        const open = actions.filter((action) => !carried.has(action.id) && carriesForward(actionState({ taskStatus: action.taskStatus, dueAt: action.taskDueAt, confirmedAt: action.confirmedAt })));
        if (open.length) return { error: `${open.length} action item(s) are still open. Confirm them as done, or carry them to a follow-up meeting first.` } as const;
        await update({ status: "CLOSED" });
        await event("CLOSED");
        await audit("MEETING_CLOSED");
        return { message: "Meeting closed.", outbox: [] };
      }
      default:
        return { error: NOT_FOUND } as const;
    }
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message === "stale") return { error: STALE } as const;
    throw error;
  });
  if ("error" in outcome) return fail(outcome.error ?? NOT_FOUND);
  await send(outcome.outbox);
  return { ok: true, value: { message: outcome.message } };
}

// ---- follow-up of one action item (Owner or Coordinator) --------------------------------------
export async function reviewAction(
  input: { actionId: number; decision: "CONFIRM" | "SEND_BACK" | "NOTE"; note: string },
  actor: MeetingActor,
): Promise<MeetingResult<{ message: string; meetingId: number }>> {
  const note = cleanText(input.note, 1000);
  const outcome = await withTransaction(async (connection) => {
    const action = await repo.findAction(input.actionId, connection);
    if (!action) return { error: NOT_FOUND } as const;
    const locked = await lockFor(action.meetingId, actor, connection);
    if (!locked || !locked.allowed.has("CONFIRM_ACTIONS")) return { error: NOT_FOUND } as const;
    const { meeting } = locked;
    const summary = info(meeting);
    const messages: NotifyInput[] = [];
    if (input.decision === "NOTE") {
      if (note.length < 3) return { error: "Write the follow-up note (at least 3 characters)." } as const;
      await repo.noteAction(action.id, note, connection);
      await repo.appendMeetingEvent(meeting.id, { actorId: actor.id, type: "ACTION_NOTE", body: `${action.title}: ${note}` }, connection);
      return { message: "Note saved.", outbox: [] as number[], meetingId: meeting.id };
    }
    if (input.decision === "CONFIRM") {
      if (action.confirmedAt) return { error: "Already confirmed." } as const;
      if (action.taskStatus !== "COMPLETED") return { error: "The task isn't completed yet. It can be confirmed once its owner completes it." } as const;
      await repo.confirmAction(action, actor.id, note || null, connection);
      await repo.appendMeetingEvent(meeting.id, { actorId: actor.id, type: "ACTION_CONFIRMED", body: action.title }, connection);
      if (action.ownerId !== actor.id) messages.push(meetingMessages.actionReview(summary, action.ownerId, actor.name, true, action.title, note));
      return { message: "Confirmed as done.", outbox: await insertOutbox(null, messages, connection), meetingId: meeting.id };
    }
    // Send back: the work isn't acceptable; the task reopens with the note.
    if (note.length < 3) return { error: "Say what is still needed (at least 3 characters)." } as const;
    if (!action.taskId) return { error: NOT_FOUND } as const;
    const task = await findTask(action.taskId);
    if (!task || task.deletedAt) return { error: "The task was deleted." } as const;
    if (task.status === "COMPLETED") {
      if (!(await updateTask(task.id, task.rowVersion, { status: "OPEN", completed_by: null, completed_at: null }, connection))) return { error: STALE } as const;
      await appendTaskEvent(task.id, { actorId: actor.id, type: "REOPENED", from: "COMPLETED", to: "OPEN", body: `Sent back from meeting ${meeting.meetingNo}: ${note}` }, connection);
    }
    await repo.confirmAction(action, null, note, connection);
    await repo.appendMeetingEvent(meeting.id, { actorId: actor.id, type: "ACTION_SENT_BACK", body: `${action.title}: ${note}` }, connection);
    if (action.ownerId !== actor.id) messages.push(meetingMessages.actionReview(summary, action.ownerId, actor.name, false, action.title, note));
    return { message: "Sent back to the action owner.", outbox: await insertOutbox(null, messages, connection), meetingId: meeting.id };
  });
  if ("error" in outcome) return fail(outcome.error ?? NOT_FOUND);
  await send(outcome.outbox);
  return { ok: true, value: { message: outcome.message, meetingId: outcome.meetingId } };
}

export async function closeOpenPointFor(input: { pointId: number; note: string }, actor: MeetingActor): Promise<MeetingResult<{ meetingId: number }>> {
  const note = cleanText(input.note, 1000);
  if (note.length < 3) return fail("Write how it was closed (at least 3 characters).");
  return withTransaction(async (connection) => {
    const point = await repo.findOpenPoint(input.pointId, connection);
    if (!point) return fail<{ meetingId: number }>(NOT_FOUND);
    const locked = await lockFor(point.meetingId, actor, connection);
    if (!locked || !locked.allowed.has("CONFIRM_ACTIONS")) return fail<{ meetingId: number }>(NOT_FOUND);
    // Closing closes the whole chain (the point carried into later meetings too).
    await repo.closeOpenPoint(point.id, note, actor.id, connection);
    await connection.query("UPDATE meeting_open_points SET status = 'CLOSED', closed_note = ?, closed_by = ?, closed_at = UTC_TIMESTAMP() WHERE status = 'OPEN' AND carried_from_id = ?", [
      note,
      actor.id,
      point.id,
    ]);
    if (point.carriedFromId)
      await connection.query("UPDATE meeting_open_points SET status = 'CLOSED', closed_note = ?, closed_by = ?, closed_at = UTC_TIMESTAMP() WHERE status = 'OPEN' AND id = ?", [
        note,
        actor.id,
        point.carriedFromId,
      ]);
    await repo.appendMeetingEvent(point.meetingId, { actorId: actor.id, type: "OPEN_POINT_CLOSED", body: `${point.text.slice(0, 200)}: ${note}` }, connection);
    return { ok: true as const, value: { meetingId: point.meetingId } };
  });
}

// ---- deadline reminders (job) ---------------------------------------------------------------
export async function sendMeetingReminders(): Promise<number> {
  const due = await repo.meetingsNeedingReminder();
  if (!due.length) return 0;
  // Once per meeting and deadline: the reminder is recorded in the history.
  const ids = await withTransaction(async (connection) => {
    const out: number[] = [];
    for (const row of due) {
      const type = `REMINDER_${row.kind}`;
      const [seen] = await connection.query("SELECT 1 FROM meeting_events WHERE meeting_id = ? AND event_type = ? AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.due')) = ? LIMIT 1", [
        row.id,
        type,
        row.dueAt.toISOString(),
      ]);
      if ((seen as unknown[]).length) continue;
      await repo.appendMeetingEvent(
        row.id,
        { actorId: null, type, body: `Reminder sent: ${row.kind === "POINTS" ? "meeting points" : "MOM"} due`, payload: { due: row.dueAt.toISOString() } },
        connection,
      );
      out.push(
        ...(await insertOutbox(
          null,
          [meetingMessages.reminder({ id: row.id, meetingNo: row.meetingNo, title: row.title }, row.coordinatorId, row.kind === "POINTS" ? "meeting points" : "MOM", row.dueAt)],
          connection,
        )),
      );
    }
    return out;
  });
  await deliverOutbox(ids);
  return ids.length;
}

export { isOpenMeeting };
