import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import * as meetings from "@/server/meetings/service";
import * as repo from "@/lib/db/repositories/meetings.repository";
import { findTask } from "@/lib/db/repositories/tasks.repository";
import { createDepartment, createUser } from "./helpers";

// v1.51.0 (D-300, D-301): Meeting Management end to end against MySQL:
// schedule → points (Coordinator raises, Owner approves) → start → MOM →
// Owner approves → action items become General tasks linked to the meeting →
// Owner or Coordinator confirms → follow-up meeting carries the rest → close.
const tag = Date.now().toString(36);
const who = (id: number, roles: string[] = ["USER"]) => ({ id, name: `P${id}`, roles });
let owner: number;
let coordinator: number;
let member: number;
let outsider: number;
let hod: number;
let manager: number;
let dept: number;
let typeId: number;
let meetingId: number;

const IST = 330 * 60_000;
const local = (offsetMinutes: number) => new Date(Date.now() + IST + offsetMinutes * 60_000).toISOString().slice(0, 16);
const base = (over: Partial<meetings.ScheduleMeetingInput> = {}): meetings.ScheduleMeetingInput => ({
  meetingId: null,
  rowVersion: null,
  parentMeetingId: null,
  title: `IDM ${tag}`,
  description: "",
  typeId,
  departmentId: dept,
  departmentIds: [dept],
  ownerId: owner,
  coordinatorId: coordinator,
  participantIds: [member],
  mode: "OFFLINE",
  venue: "Board room",
  link: "",
  priority: "IMPORTANT",
  confidentiality: "GENERAL",
  guests: "",
  start: local(60 * 24),
  end: local(60 * 25),
  agendaDue: "",
  momDue: "",
  pointsPolicy: "BLOCK",
  points: ["Production review", "Despatch plan"],
  ...over,
});
const act = (action: meetings.ActOnMeetingInput["action"], actor: number, over: Partial<meetings.ActOnMeetingInput> = {}) =>
  meetings.actOnMeeting({ meetingId, action, rowVersion: null, remarks: "", response: "", points: null, mom: null, actualStart: "", actualEnd: "", ...over }, who(actor));
async function notices(userId: number, eventType: string): Promise<number> {
  const [rows] = await getDbPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND event_type = ?", [userId, eventType]);
  return Number(rows[0]!.n);
}

beforeAll(async () => {
  owner = await createUser({ name: `Owner ${tag}` });
  coordinator = await createUser({ name: `Coordinator ${tag}` });
  member = await createUser({ name: `Member ${tag}` });
  outsider = await createUser({ name: `Outsider ${tag}` });
  hod = await createUser({ name: `HOD ${tag}` });
  manager = await createUser({ name: `MD ${tag}` });
  dept = await createDepartment(hod);
  typeId = (await repo.listMeetingTypes()).find((type) => type.code === "IDM")!.id;
});

afterAll(async () => {
  await getDbPool().end();
});

describe("Meeting Management (D-300)", () => {
  it("schedules a meeting: Owner and Coordinator join the participants; everyone is told", async () => {
    const created = await meetings.scheduleMeeting(base(), who(coordinator));
    expect(created.ok).toBe(true);
    meetingId = created.ok ? created.value.id : 0;
    expect(created.ok && created.value.meetingNo).toMatch(/^MTG-\d{4}-\d{6}$/);
    const people = (await repo.listParticipants(meetingId)).map((person) => person.userId).sort();
    expect(people).toEqual([owner, coordinator, member].sort());
    expect((await repo.listPoints(meetingId)).map((point) => point.title)).toEqual(["Production review", "Despatch plan"]);
    expect(await notices(member, "MEETING_INVITED")).toBe(1);
    expect(await notices(owner, "MEETING_INVITED")).toBe(1);
    // v1.51.1: meeting messages are in the Inbox under Meetings, linked to the meeting.
    const [rows] = await getDbPool().query<RowDataPacket[]>("SELECT category, entity_type, entity_id FROM notifications WHERE user_id = ? AND event_type = 'MEETING_INVITED'", [member]);
    expect(rows[0]).toMatchObject({ category: "MEETING", entity_type: "MEETING", entity_id: meetingId });
  });

  it("refuses a meeting without an Owner, or ending before it starts", async () => {
    const bad = await meetings.scheduleMeeting(base({ ownerId: null, end: local(60 * 23) }), who(coordinator));
    expect(bad.ok).toBe(false);
    expect(!bad.ok && Object.keys(bad.fieldErrors ?? {}).sort()).toEqual(["end", "ownerId"]);
  });

  it("visibility: people on it and the HOD of its department; not outsiders; Management sees all", async () => {
    expect(await meetings.loadMeetingFor(meetingId, who(member))).not.toBeNull();
    expect(await meetings.loadMeetingFor(meetingId, who(hod))).not.toBeNull();
    expect(await meetings.loadMeetingFor(meetingId, who(outsider))).toBeNull();
    expect(await meetings.loadMeetingFor(meetingId, who(manager))).toBeNull();
    await getDbPool().query("INSERT INTO meeting_management_members (user_id) VALUES (?)", [manager]);
    expect(await meetings.loadMeetingFor(meetingId, who(manager))).not.toBeNull();
  });

  it("the Owner's choice (BLOCK): the meeting can't start before the points are approved", async () => {
    const early = await act("START", coordinator);
    expect(early.ok).toBe(false);
  });

  it("only the Coordinator raises points; only the Owner approves; returning needs remarks", async () => {
    expect((await act("SUBMIT_POINTS", owner)).ok).toBe(false);
    expect((await act("SUBMIT_POINTS", coordinator)).ok).toBe(true);
    expect(await notices(owner, "MEETING_APPROVAL")).toBe(1);
    expect((await act("APPROVE_POINTS", coordinator)).ok).toBe(false);
    expect((await act("RETURN_POINTS", owner)).ok).toBe(false); // no remarks
    expect((await act("RETURN_POINTS", owner, { remarks: "Add the safety point" })).ok).toBe(true);
    const points = await repo.listPoints(meetingId);
    const saved = await act("SAVE_POINTS", coordinator, {
      points: [...points.map((point) => ({ id: point.id, title: point.title, presenterId: null })), { id: null, title: "Safety", presenterId: member }],
    });
    expect(saved.ok).toBe(true);
    expect((await act("SUBMIT_POINTS", coordinator)).ok).toBe(true);
    expect((await act("APPROVE_POINTS", owner)).ok).toBe(true);
    expect((await repo.findMeeting(meetingId))!.pointsStatus).toBe("APPROVED");
    expect(await notices(member, "MEETING_PUBLISHED")).toBe(1);
  });

  it("participants answer; can't attend needs a reason and tells the Coordinator", async () => {
    expect((await act("RESPOND", member, { response: "DECLINED" })).ok).toBe(false);
    expect((await act("RESPOND", member, { response: "DECLINED", remarks: "On leave" })).ok).toBe(true);
    expect((await act("RESPOND", member, { response: "ACCEPTED" })).ok).toBe(true);
    expect((await repo.listParticipants(meetingId)).find((person) => person.userId === member)!.response).toBe("ACCEPTED");
  });

  it("the Coordinator runs it and writes the MOM; action items need a responsible person", async () => {
    expect((await act("START", coordinator)).ok).toBe(true);
    const points = await repo.listPoints(meetingId);
    const mom = {
      discussions: [{ pointId: points[0]!.id, text: "Output up 4%." }],
      decisions: ["Second shift from Monday"],
      actions: [
        { title: "Hire two operators", description: "", ownerId: member, priority: "HIGH", dueOn: "2026-12-01" },
        { title: "Fix conveyor", description: "Line 2", ownerId: null, priority: "NORMAL", dueOn: "" },
      ],
      openPoints: [{ text: "Power tariff review", ownerId: owner, reviewOn: "" }],
      attendance: [
        { userId: member, attendance: "PRESENT" },
        { userId: owner, attendance: "LATE" },
      ],
    };
    expect((await act("SUBMIT_MOM", coordinator, { mom })).ok).toBe(false); // the second action has nobody responsible
    mom.actions[1]!.ownerId = coordinator;
    expect((await act("SAVE_MOM", coordinator, { mom })).ok).toBe(true);
    expect((await act("END", coordinator)).ok).toBe(true);
    expect((await act("SUBMIT_MOM", coordinator)).ok).toBe(true);
    const saved = await repo.findMeeting(meetingId);
    expect(saved!.status).toBe("MOM_SUBMITTED");
    expect(await repo.listDecisions(meetingId)).toEqual(["Second shift from Monday"]);
    expect((await repo.listActions(meetingId)).every((action) => action.taskId === null)).toBe(true);
  });

  it("the Owner approves the MOM: each action item becomes a General task linked to the meeting", async () => {
    expect((await act("APPROVE_MOM", coordinator)).ok).toBe(false);
    expect((await act("APPROVE_MOM", owner)).ok).toBe(true);
    const actions = await repo.listActions(meetingId);
    expect(actions).toHaveLength(2);
    for (const action of actions) {
      expect(action.taskId).not.toBeNull();
      const task = await findTask(action.taskId!);
      expect(task!.assigneeId).toBe(action.ownerId);
      expect(task!.createdBy).toBe(coordinator);
      expect((await repo.meetingOfTask(task!.id))!.id).toBe(meetingId);
    }
    const hire = actions.find((action) => action.title === "Hire two operators")!;
    expect((await findTask(hire.taskId!))!.priority).toBe("HIGH");
    expect(await notices(member, "WORK_TASK_ASSIGNED")).toBeGreaterThanOrEqual(1);
    expect(await notices(member, "MEETING_PUBLISHED")).toBe(2);
  });

  it("can't close while actions are open; confirming needs the task completed", async () => {
    expect((await act("CLOSE", coordinator)).ok).toBe(false);
    const hire = (await repo.listActions(meetingId)).find((action) => action.title === "Hire two operators")!;
    expect((await meetings.reviewAction({ actionId: hire.id, decision: "CONFIRM", note: "" }, who(owner))).ok).toBe(false);
    await getDbPool().query("UPDATE tasks SET status = 'COMPLETED', completed_at = UTC_TIMESTAMP(), completed_by = ? WHERE id = ?", [member, hire.taskId]);
    expect((await meetings.reviewAction({ actionId: hire.id, decision: "CONFIRM", note: "" }, who(member))).ok).toBe(false); // not Owner or Coordinator
    // Sent back: the task reopens.
    expect((await meetings.reviewAction({ actionId: hire.id, decision: "SEND_BACK", note: "Need joining dates" }, who(owner))).ok).toBe(true);
    expect((await findTask(hire.taskId!))!.status).toBe("OPEN");
    await getDbPool().query("UPDATE tasks SET status = 'COMPLETED', completed_at = UTC_TIMESTAMP(), completed_by = ? WHERE id = ?", [member, hire.taskId]);
    expect((await meetings.reviewAction({ actionId: hire.id, decision: "CONFIRM", note: "" }, who(coordinator))).ok).toBe(true);
    expect((await repo.findAction(hire.id))!.confirmedAt).not.toBeNull();
  });

  it("a follow-up meeting carries the open action (same task) and the open point; then the first one closes", async () => {
    const followUp = await meetings.scheduleMeeting(base({ parentMeetingId: meetingId, title: `Follow-up ${tag}`, points: [] }), who(coordinator));
    expect(followUp.ok).toBe(true);
    const nextId = followUp.ok ? followUp.value.id : 0;
    const carried = await repo.listActions(nextId);
    expect(carried).toHaveLength(1);
    const original = (await repo.listActions(meetingId)).find((action) => action.title === "Fix conveyor")!;
    expect(carried[0]!.taskId).toBe(original.taskId);
    expect(carried[0]!.carriedFromId).toBe(original.id);
    expect((await repo.listOpenPoints(nextId)).map((point) => point.text)).toEqual(["Power tariff review"]);
    expect((await repo.findMeeting(nextId))!.seriesId).toBe(meetingId);
    expect((await act("CLOSE", coordinator)).ok).toBe(true);
    expect((await repo.findMeeting(meetingId))!.status).toBe("CLOSED");
  });

  it("the follow-up register shows the latest row of each action, for the people on the meeting", async () => {
    const rows = await repo.listFollowUps(await meetings.scopeFor(who(coordinator)), { ownerOnly: null, q: tag, limit: 100 });
    // The carried action shows once (its newest meeting's row is not approved yet, so only the confirmed one shows).
    expect(rows.map((row) => row.title).sort()).toEqual(["Hire two operators"]);
    expect(await repo.listFollowUps(await meetings.scopeFor(who(outsider)), { ownerOnly: null, q: tag, limit: 100 })).toEqual([]);
  });

  it("a meeting where the Coordinator is the Owner approves on submit", async () => {
    const created = await meetings.scheduleMeeting(base({ ownerId: coordinator, pointsPolicy: "LAST_APPROVED", title: `Self ${tag}` }), who(coordinator));
    meetingId = created.ok ? created.value.id : 0;
    expect((await act("SUBMIT_POINTS", coordinator)).ok).toBe(true);
    expect((await repo.findMeeting(meetingId))!.pointsStatus).toBe("APPROVED");
    expect((await act("START", coordinator)).ok).toBe(true);
    const mom = { discussions: [], decisions: [], actions: [{ title: "Send report", description: "", ownerId: member, priority: "NORMAL", dueOn: "" }], openPoints: [], attendance: [] };
    expect((await act("SUBMIT_MOM", coordinator, { mom })).ok).toBe(true);
    expect((await repo.findMeeting(meetingId))!.status).toBe("MOM_APPROVED");
    expect((await repo.listActions(meetingId))[0]!.taskId).not.toBeNull();
  });

  it("cancelling needs a reason and tells everyone", async () => {
    const created = await meetings.scheduleMeeting(base({ title: `Cancel ${tag}` }), who(coordinator));
    meetingId = created.ok ? created.value.id : 0;
    expect((await act("CANCEL", member, { remarks: "Not mine" })).ok).toBe(false);
    expect((await act("CANCEL", coordinator)).ok).toBe(false);
    expect((await act("CANCEL", coordinator, { remarks: "Plant shutdown" })).ok).toBe(true);
    expect(await notices(member, "MEETING_CANCELLED")).toBe(1);
  });
});
