import { describe, expect, it } from "vitest";
import { decide, reopen, startInstance, withdraw } from "@/server/engine";
import { EngineError } from "@/server/engine/types";
import { addWorkingHours, DEFAULT_WORKING_DAYS, indiaDate, isWorkingDay, parseWorkingDays, type WorkingCalendar } from "@/server/workflows/calendar";
import { approval, chain, ctx, makeDirectory, user } from "../helpers/engine-fixtures";

const directory = makeDirectory();

describe("working calendar (D-067)", () => {
  // 2026-10-02 is a Friday; 2026-10-04 a Sunday.
  const calendar: WorkingCalendar = { workingDays: new Set(DEFAULT_WORKING_DAYS), holidays: new Set(["2026-10-05"]) };
  const ist = (local: string) => new Date(`${local}+05:30`);

  it("uses India dates", () => {
    expect(indiaDate(new Date("2026-10-01T20:00:00Z"))).toBe("2026-10-02");
    expect(isWorkingDay("2026-10-04", calendar)).toBe(false); // Sunday
    expect(isWorkingDay("2026-10-05", calendar)).toBe(false); // holiday
    expect(isWorkingDay("2026-10-03", calendar)).toBe(true); // Saturday works by default
  });

  it("counts within a working day", () => {
    expect(addWorkingHours(ist("2026-10-02T10:00:00"), 4, calendar)).toEqual(ist("2026-10-02T14:00:00"));
  });

  it("skips Sunday and a holiday", () => {
    // Sat 10:00 + 24h → Sat has 14h left, Sun and Mon (holiday) skipped, Tue 00:00 + 10h.
    expect(addWorkingHours(ist("2026-10-03T10:00:00"), 24, calendar)).toEqual(ist("2026-10-06T10:00:00"));
  });

  it("a start on a non-working day begins at the next working midnight", () => {
    expect(addWorkingHours(ist("2026-10-04T15:00:00"), 2, calendar)).toEqual(ist("2026-10-06T02:00:00"));
  });

  it("no working days set means plain hours", () => {
    expect(addWorkingHours(ist("2026-10-04T15:00:00"), 2, { workingDays: new Set(), holidays: new Set() })).toEqual(ist("2026-10-04T17:00:00"));
  });

  it("reads the stored setting safely", () => {
    expect(parseWorkingDays("mon, tue,FRI")).toEqual(["MON", "TUE", "FRI"]);
    expect(parseWorkingDays("nonsense")).toEqual(DEFAULT_WORKING_DAYS);
    expect(parseWorkingDays(null)).toEqual(DEFAULT_WORKING_DAYS);
  });
});

describe("withdraw and reopen (D-066)", () => {
  const definition = chain(approval("ed", [user(7)]), approval("md", [user(8)]));

  it("withdraw closes pending approvals and names who had them", () => {
    const { state } = startInstance(definition, ctx(), directory);
    const result = withdraw(state, { actorId: 1, reason: "Not needed now" });
    expect(result.state.status).toBe("CANCELLED");
    expect(result.state.tasks.every((task) => task.status !== "PENDING")).toBe(true);
    expect(result.events).toEqual([{ type: "WITHDRAWN", actorId: 1, reason: "Not needed now", closedTaskIds: [state.tasks[0]!.id], approverIds: [7] }]);
    expect(() => withdraw(result.state, { actorId: 1 })).toThrow(EngineError);
  });

  it("reopen restarts an approved request from the first level in a new round", () => {
    let state = startInstance(definition, ctx(), directory).state;
    for (const approver of [7, 8]) {
      const task = state.tasks.find((candidate) => candidate.status === "PENDING")!;
      state = decide(definition, state, { taskId: task.id, actorId: approver, decision: "APPROVE" }, ctx(), directory).state;
    }
    expect(state.status).toBe("APPROVED");
    expect(() => reopen(definition, state, { actorId: 2, reason: "  " }, ctx(), directory)).toThrow(/reason/);
    const reopened = reopen(definition, state, { actorId: 2, reason: "Wrong vendor" }, ctx(), directory);
    expect(reopened.state).toMatchObject({ status: "IN_PROGRESS", round: 2 });
    expect(reopened.state.nodes.ed!.status).toBe("ACTIVE");
    expect(reopened.state.tasks.filter((task) => task.status === "PENDING").map((task) => [task.approverId, task.round])).toEqual([[7, 2]]);
    expect(reopened.events[0]).toEqual({ type: "REOPENED", actorId: 2, reason: "Wrong vendor", round: 2 });
  });

  it("only an approved request can be reopened", () => {
    const { state } = startInstance(definition, ctx(), directory);
    expect(() => reopen(definition, state, { actorId: 2, reason: "x" }, ctx(), directory)).toThrow(/approved/);
  });
});
