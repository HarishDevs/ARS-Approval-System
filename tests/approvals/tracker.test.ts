import { describe, expect, it } from "vitest";
import { buildStepMap, summarizeTracker } from "@/server/approvals/step-map";
import { decide, putOnHold, startInstance, withdraw } from "@/server/engine";
import { approval, chain, ctx, makeDirectory, user } from "../helpers/engine-fixtures";

// Spec #2: the "where it is now" summary agrees with the engine state.
const directory = makeDirectory();
const names = new Map([[2, "Manoj"], [3, "Harini"], [4, "Fiona"], [5, "Faisal"], [8, "Meera"]]);
const definition = chain(approval("mgr", [user(2)]), approval("fin", [user(4), user(5)], { type: "ANY_ONE" }), approval("md", [user(8)]));
const summary = (state: ReturnType<typeof startInstance>["state"]) =>
  summarizeTracker(buildStepMap(definition, state, null, names), { status: state.status, requesterName: "Ravi", holdSince: state.hold?.at ?? null });
const approveFirst = (state: ReturnType<typeof startInstance>["state"], nodeId: string) => {
  const task = state.tasks.find((item) => item.nodeId === nodeId && item.status === "PENDING")!;
  return decide(definition, state, { taskId: task.id, actorId: task.approverId, decision: "APPROVE" }, ctx(), directory).state;
};

describe("tracker summary", () => {
  it("in progress: who it waits for, where, and what comes next", () => {
    let state = startInstance(definition, ctx(), directory).state;
    expect(summary(state)).toMatchObject({ headline: "Waiting for Manoj to decide", detail: 'At "mgr". Next: "fin".', done: 0, total: 3, tone: "waiting" });
    state = approveFirst(state, "mgr");
    expect(summary(state)).toMatchObject({ headline: "Waiting for Fiona, Faisal to decide", done: 1 });
    state = approveFirst(state, "fin");
    expect(summary(state).detail).toBe('At "md". This is the last step.');
  });

  it("finished, held, sent back and withdrawn", () => {
    let state = startInstance(definition, ctx(), directory).state;
    const held = putOnHold(state, { taskId: state.tasks[0]!.id, actorId: 2 }, ctx(), directory).state;
    expect(summary(held)).toMatchObject({ headline: "On hold", tone: "attention" });
    const back = decide(definition, state, { taskId: state.tasks[0]!.id, actorId: 2, decision: "REQUEST_CHANGES", comment: "quotes" }, ctx(), directory).state;
    expect(summary(back).headline).toBe("Back with Ravi for changes");
    expect(summary(withdraw(state, { actorId: 1 }).state).headline).toBe("Withdrawn or removed");
    for (const nodeId of ["mgr", "fin", "md"]) state = approveFirst(state, nodeId);
    expect(summary(state)).toMatchObject({ headline: "Fully approved", done: 3, total: 3, tone: "done" });
  });

  it("a stuck step says IT has been told", () => {
    const stuck = chain(approval("hod", [{ type: "DEPARTMENT_HOD", departmentId: 99 }]));
    const state = startInstance(stuck, ctx(), directory).state;
    const result = summarizeTracker(buildStepMap(stuck, state, null, names), { status: state.status, requesterName: "Ravi" });
    expect(result).toMatchObject({ headline: 'Stuck at "hod"', tone: "attention" });
  });
});
