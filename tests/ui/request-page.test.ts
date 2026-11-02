import { describe, expect, it } from "vitest";
import { bannerKind, fieldIconKind, indiaDateTime, newestFirst, processFigures, splitTimeline, timeInProcess } from "@/features/requests/request-page";

// v1.49 request page layout (owner, 2 Nov 2026).
const at = (iso: string) => new Date(iso);
const events = [
  { id: 1, at: at("2026-11-01T17:00:00Z"), text: "Submitted" },
  { id: 2, at: at("2026-11-01T17:00:00Z"), text: "Sent to Harish" },
  { id: 3, at: at("2026-11-01T18:00:00Z"), text: "Comment" },
  { id: 4, at: at("2026-11-02T05:00:00Z"), text: "Approved" },
  { id: 5, at: at("2026-11-01T19:00:00Z"), text: "File added" },
];

describe("timeline order", () => {
  it("puts the newest first, a later id first at the same moment", () => {
    expect(newestFirst(events).map((event) => event.id)).toEqual([4, 5, 3, 2, 1]);
  });
  it("shows the latest 3 and keeps the older rest, newest first", () => {
    const { shown, rest } = splitTimeline(events);
    expect(shown.map((event) => event.id)).toEqual([4, 5, 3]);
    expect(rest.map((event) => event.id)).toEqual([2, 1]);
  });
  it("has nothing more to show for 3 or fewer events", () => {
    expect(splitTimeline(events.slice(0, 2)).rest).toEqual([]);
    expect(splitTimeline([]).shown).toEqual([]);
  });
  it("does not change the list it was given", () => {
    const copy = [...events];
    splitTimeline(events, 2);
    expect(events).toEqual(copy);
  });
});

describe("time in process", () => {
  const from = "2026-11-01T17:00:00Z";
  it("counts hours and minutes", () => {
    expect(timeInProcess(from, "2026-11-02T10:28:00Z", 0)).toBe("17 hrs 28 mins");
    expect(timeInProcess(from, "2026-11-01T18:01:00Z", 0)).toBe("1 hr 1 min");
    expect(timeInProcess(from, "2026-11-01T19:00:00Z", 0)).toBe("2 hrs");
  });
  it("counts days and hours past a day", () => {
    expect(timeInProcess(from, "2026-11-03T20:10:00Z", 0)).toBe("2 days 3 hrs");
    expect(timeInProcess(from, "2026-11-02T17:00:00Z", 0)).toBe("1 day");
  });
  it("runs until now while open, never below zero", () => {
    expect(timeInProcess(from, null, Date.parse("2026-11-01T17:05:00Z"))).toBe("5 mins");
    expect(timeInProcess(from, "2026-11-01T16:00:00Z", 0)).toBe("0 mins");
    expect(timeInProcess(null, null, 0)).toBeNull();
  });
});

describe("India date-time", () => {
  it("prints IST the same everywhere", () => {
    expect(indiaDateTime("2026-11-01T17:00:00Z")).toBe("01 Nov, 10:30 pm");
    expect(indiaDateTime(at("2026-11-01T17:00:00Z"), true)).toBe("01 Nov 2026, 10:30 pm");
    expect(indiaDateTime("2026-11-01T18:45:00Z")).toBe("02 Nov, 12:15 am");
    expect(indiaDateTime(null)).toBeNull();
  });
});

describe("approval figures", () => {
  it("uses the road's level counts when it loaded", () => {
    const figures = processFigures({ status: "IN_PROGRESS", road: { levelsDone: 1, levels: 3, percent: 33 }, tracker: { done: 2, total: 5 }, timeline: events, raisedAt: "2026-11-01T17:00:00Z" });
    expect(figures).toMatchObject({ percent: 33, done: 1, total: 3, remaining: 2, endIso: null, lastUpdateIso: "2026-11-02T05:00:00.000Z" });
  });
  it("falls back to the tracker's steps and the first event", () => {
    const figures = processFigures({ status: "IN_PROGRESS", road: null, tracker: { done: 0, total: 1 }, timeline: events, raisedAt: null });
    expect(figures).toMatchObject({ percent: 0, done: 0, total: 1, remaining: 1, startIso: "2026-11-01T17:00:00.000Z" });
  });
  it("stops the clock at the last event once closed", () => {
    const figures = processFigures({ status: "APPROVED", road: null, tracker: { done: 2, total: 2 }, timeline: events, raisedAt: null });
    expect(figures).toMatchObject({ percent: 100, remaining: null, endIso: "2026-11-02T05:00:00.000Z" });
  });
  it("never shows 100% for an unfinished request", () => {
    expect(processFigures({ status: "IN_PROGRESS", road: null, tracker: { done: 199, total: 200 }, timeline: [], raisedAt: null }).percent).toBe(99);
  });
});

describe("detail row icons", () => {
  it("picks by the field's type", () => {
    expect(fieldIconKind({ type: "CURRENCY", key: "amount", label: "Amount" })).toBe("money");
    expect(fieldIconKind({ type: "DATE", key: "due", label: "Due date" })).toBe("date");
    expect(fieldIconKind({ type: "URL", key: "link", label: "Link" })).toBe("link");
    expect(fieldIconKind({ type: "CHOICE", key: "nature", label: "Nature of work" })).toBe("choice");
    expect(fieldIconKind({ type: "TEXT", key: "cheque", label: "Cheque No / PO No" })).toBe("text");
  });
  it("knows priority and department by name", () => {
    expect(fieldIconKind({ type: "CHOICE", key: "priority", label: "Priority" })).toBe("priority");
    expect(fieldIconKind({ type: "LOOKUP", key: "dept", label: "Department" })).toBe("department");
  });
});

describe("banner", () => {
  it("follows the request's status", () => {
    expect(bannerKind("IN_PROGRESS", "waiting")).toBe("waiting");
    expect(bannerKind("IN_PROGRESS", "attention")).toBe("stuck");
    expect(bannerKind("ON_HOLD", "attention")).toBe("hold");
    expect(bannerKind("CHANGES_REQUIRED", "attention")).toBe("returned");
    expect(bannerKind("APPROVED", "done")).toBe("approved");
    expect(bannerKind("REJECTED", "stopped")).toBe("rejected");
    expect(bannerKind("CANCELLED", "stopped")).toBe("withdrawn");
  });
});
