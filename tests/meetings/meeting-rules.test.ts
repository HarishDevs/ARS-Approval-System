import { describe, expect, it } from "vitest";
import {
  actionProblems,
  actionState,
  allowedActions,
  canViewMeeting,
  carriesForward,
  compliance,
  durationBand,
  mayStart,
  minutesBetween,
  scheduleProblems,
  selfApproved,
  type MeetingFacts,
  type MeetingViewer,
} from "@/server/meetings/rules";

// v1.51.0 (D-300, D-301): the Meeting Management rules.
const meeting = (over: Partial<MeetingFacts> = {}): MeetingFacts => ({
  status: "SCHEDULED",
  ownerId: 1,
  coordinatorId: 2,
  createdBy: 2,
  pointsStatus: "DRAFT",
  pointsPolicy: "LAST_APPROVED",
  confidentiality: "GENERAL",
  ...over,
});
const viewer = (id: number, over: Partial<MeetingViewer> = {}): MeetingViewer => ({ id, isAdmin: false, isManagement: false, isParticipant: false, isDepartmentHod: false, ...over });

describe("who sees a meeting", () => {
  it("people on it, IT and the Management group; HODs only for General meetings", () => {
    expect(canViewMeeting(meeting(), viewer(1))).toBe(true);
    expect(canViewMeeting(meeting(), viewer(2))).toBe(true);
    expect(canViewMeeting(meeting(), viewer(3, { isParticipant: true }))).toBe(true);
    expect(canViewMeeting(meeting(), viewer(4))).toBe(false);
    expect(canViewMeeting(meeting(), viewer(4, { isDepartmentHod: true }))).toBe(true);
    expect(canViewMeeting(meeting({ confidentiality: "MANAGEMENT" }), viewer(4, { isDepartmentHod: true }))).toBe(false);
    expect(canViewMeeting(meeting({ confidentiality: "MANAGEMENT" }), viewer(4, { isManagement: true }))).toBe(true);
    expect(canViewMeeting(meeting({ confidentiality: "MANAGEMENT" }), viewer(4, { isAdmin: true }))).toBe(true);
  });
});

describe("what each role may do", () => {
  it("the Coordinator raises points; only the Owner decides them", () => {
    expect(allowedActions(meeting(), viewer(2)).has("SUBMIT_POINTS")).toBe(true);
    expect(allowedActions(meeting(), viewer(1)).has("SUBMIT_POINTS")).toBe(false);
    expect(allowedActions(meeting({ pointsStatus: "SUBMITTED" }), viewer(1)).has("DECIDE_POINTS")).toBe(true);
    expect(allowedActions(meeting({ pointsStatus: "SUBMITTED" }), viewer(2)).has("DECIDE_POINTS")).toBe(false);
    expect(allowedActions(meeting({ pointsStatus: "SUBMITTED" }), viewer(2)).has("EDIT_POINTS")).toBe(false);
  });
  it("only the Owner approves the MOM; Owner or Coordinator confirms actions", () => {
    expect(allowedActions(meeting({ status: "MOM_SUBMITTED" }), viewer(1)).has("DECIDE_MOM")).toBe(true);
    expect(allowedActions(meeting({ status: "MOM_SUBMITTED" }), viewer(2)).has("DECIDE_MOM")).toBe(false);
    expect(allowedActions(meeting({ status: "MOM_APPROVED" }), viewer(1)).has("CONFIRM_ACTIONS")).toBe(true);
    expect(allowedActions(meeting({ status: "MOM_APPROVED" }), viewer(2)).has("CONFIRM_ACTIONS")).toBe(true);
    expect(allowedActions(meeting({ status: "MOM_APPROVED" }), viewer(3, { isParticipant: true })).has("CONFIRM_ACTIONS")).toBe(false);
  });
  it("participants answer the invitation; the Coordinator starts, ends and writes the MOM", () => {
    expect(allowedActions(meeting(), viewer(3, { isParticipant: true })).has("RESPOND")).toBe(true);
    expect(allowedActions(meeting(), viewer(2, { isParticipant: true })).has("RESPOND")).toBe(false); // the Coordinator always attends
    expect(allowedActions(meeting({ status: "IN_PROGRESS" }), viewer(3, { isParticipant: true })).has("RESPOND")).toBe(false);
    expect(allowedActions(meeting(), viewer(2)).has("START")).toBe(true);
    expect(allowedActions(meeting({ status: "IN_PROGRESS" }), viewer(2)).has("EDIT_MOM")).toBe(true);
    expect(allowedActions(meeting({ status: "AWAITING_MOM" }), viewer(2)).has("SUBMIT_MOM")).toBe(true);
    expect(allowedActions(meeting({ status: "MOM_RETURNED" }), viewer(2)).has("SUBMIT_MOM")).toBe(true);
    expect(allowedActions(meeting({ status: "CANCELLED" }), viewer(2)).size).toBe(0);
  });
  it("owner's choice when points aren't approved at meeting time", () => {
    expect(mayStart({ pointsStatus: "DRAFT", pointsPolicy: "LAST_APPROVED" })).toBe(true);
    expect(mayStart({ pointsStatus: "SUBMITTED", pointsPolicy: "BLOCK" })).toBe(false);
    expect(mayStart({ pointsStatus: "APPROVED", pointsPolicy: "BLOCK" })).toBe(true);
    expect(allowedActions(meeting({ pointsPolicy: "BLOCK" }), viewer(2)).has("START")).toBe(false);
  });
  it("the same person as Owner and Coordinator approves by submitting", () => {
    expect(selfApproved({ ownerId: 5, coordinatorId: 5 }, 5)).toBe(true);
    expect(selfApproved({ ownerId: 1, coordinatorId: 2 }, 2)).toBe(false);
  });
});

describe("register columns, worked out", () => {
  it("duration band", () => {
    expect(durationBand(null)).toBeNull();
    expect(durationBand(30)).toBe("Short");
    expect(durationBand(60)).toBe("Medium");
    expect(durationBand(150)).toBe("Long");
    expect(durationBand(240)).toBe("Extended");
    expect(minutesBetween(new Date("2026-11-10T04:30:00Z"), new Date("2026-11-10T05:15:00Z"))).toBe(45);
  });
  it("compliance from timestamps (5 minutes grace)", () => {
    const start = new Date("2026-11-10T04:30:00Z");
    const end = new Date("2026-11-10T05:30:00Z");
    const facts = compliance({
      scheduledStart: start,
      scheduledEnd: end,
      actualStart: new Date(start.getTime() + 4 * 60_000),
      actualEnd: new Date(end.getTime() + 10 * 60_000),
      agendaDueAt: new Date(start.getTime() - 86_400_000),
      pointsSubmittedAt: new Date(start.getTime() - 3_600_000),
      momDueAt: new Date(end.getTime() + 86_400_000),
      momSubmittedAt: new Date(end.getTime() + 3_600_000),
    });
    expect(facts).toEqual({ agendaOnTime: false, startedOnTime: true, endedOnTime: false, momOnTime: true });
    expect(compliance({ scheduledStart: start, scheduledEnd: end, actualStart: null, actualEnd: null, agendaDueAt: null, pointsSubmittedAt: null, momDueAt: null, momSubmittedAt: null })).toEqual({
      agendaOnTime: null,
      startedOnTime: null,
      endedOnTime: null,
      momOnTime: null,
    });
  });
});

describe("input checks", () => {
  const base = {
    title: "Weekly IDM",
    typeId: 1,
    ownerId: 1,
    coordinatorId: 2,
    participantIds: [3],
    departmentIds: [],
    start: new Date("2026-11-12T04:30:00Z"),
    end: new Date("2026-11-12T05:30:00Z"),
    agendaDueAt: null,
    momDueAt: null,
    mode: "OFFLINE",
    link: "",
  };
  const now = new Date("2026-11-10T00:00:00Z");
  it("a valid meeting passes", () => expect(scheduleProblems(base, now)).toEqual({}));
  it("needs owner, coordinator, type, and an end after the start", () => {
    expect(Object.keys(scheduleProblems({ ...base, ownerId: null, coordinatorId: null, typeId: null, end: base.start }, now)).sort()).toEqual(["coordinatorId", "end", "ownerId", "typeId"]);
  });
  it("deadlines: points before the meeting, MOM after it", () => {
    expect(scheduleProblems({ ...base, agendaDueAt: new Date("2026-11-12T06:00:00Z") }, now).agendaDueAt).toBeDefined();
    expect(scheduleProblems({ ...base, momDueAt: new Date("2026-11-12T05:00:00Z") }, now).momDueAt).toBeDefined();
  });
  it("online links must be web links", () => {
    expect(scheduleProblems({ ...base, mode: "ONLINE", link: "javascript:alert(1)" }, now).link).toBeDefined();
    expect(scheduleProblems({ ...base, mode: "ONLINE", link: "https://meet.example.com/x" }, now).link).toBeUndefined();
  });
  it("every action item needs a title and one responsible person", () => {
    expect(actionProblems([{ title: "Fix pump", ownerId: 3, dueOn: "2026-11-20" }])).toBeNull();
    expect(actionProblems([{ title: "Fix pump", ownerId: null, dueOn: "" }])).toMatch(/responsible/);
    expect(actionProblems([{ title: "x", ownerId: 3, dueOn: "" }])).toMatch(/needs doing/);
  });
});

describe("follow-up states", () => {
  const now = new Date("2026-11-10T00:00:00Z");
  it("from the task, until the Owner or Coordinator confirms", () => {
    expect(actionState({ taskStatus: null, dueAt: null, confirmedAt: null }, now)).toBe("NO_TASK");
    expect(actionState({ taskStatus: "OPEN", dueAt: new Date("2026-11-09T00:00:00Z"), confirmedAt: null }, now)).toBe("OVERDUE");
    expect(actionState({ taskStatus: "IN_PROGRESS", dueAt: new Date("2026-11-11T00:00:00Z"), confirmedAt: null }, now)).toBe("OPEN");
    expect(actionState({ taskStatus: "COMPLETED", dueAt: null, confirmedAt: null }, now)).toBe("DONE_UNCONFIRMED");
    expect(actionState({ taskStatus: "COMPLETED", dueAt: null, confirmedAt: now }, now)).toBe("CONFIRMED");
    expect(carriesForward("DONE_UNCONFIRMED")).toBe(true);
    expect(carriesForward("CONFIRMED")).toBe(false);
    expect(carriesForward("CANCELLED")).toBe(false);
  });
});
