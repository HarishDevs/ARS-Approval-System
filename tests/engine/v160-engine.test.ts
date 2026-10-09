import { describe, expect, it } from "vitest";
import { answerInformation, askForInformation, decide, reassignTask, recall, resubmit, resume, startInstance } from "@/server/engine/engine";
import { EngineError, type InstanceState, type WorkflowDefinition } from "@/server/engine/types";
import { approval, chain, ctx, edge, end, join, makeDirectory, split, start, user } from "../helpers/engine-fixtures";

// v1.6.0 engine additions: recall (EN-04), ask for information (EN-05) and
// the hand-on history for request-level delegation (EN-07). The existing
// engine tests (engine.test.ts, v140-engine.test.ts) must stay green.
const directory = makeDirectory();
const pending = (state: InstanceState, nodeId?: string) => state.tasks.filter((task) => task.status === "PENDING" && (!nodeId || task.nodeId === nodeId));
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error instanceof EngineError ? error.code : String(error);
  }
  return "no error";
};

describe("recall (EN-04)", () => {
  const twoLevels = chain(approval("mgr", [user(2)]), approval("hod", [user(3)]));

  it("closes the pending approvals, keeps earlier decisions, and resubmitting restarts where it was", () => {
    let { state } = startInstance(twoLevels, ctx(), directory);
    ({ state } = decide(twoLevels, state, { taskId: pending(state, "mgr")[0]!.id, actorId: 2, decision: "APPROVE" }, ctx(), directory));
    const recalled = recall(twoLevels, state, { actorId: 1, reason: "Wrong quote attached" }, ctx(), directory);
    expect(recalled.state.status).toBe("CHANGES_REQUIRED");
    expect(pending(recalled.state)).toEqual([]);
    expect(recalled.state.tasks.find((task) => task.nodeId === "mgr")?.status).toBe("APPROVED"); // history kept
    expect(recalled.events.at(-1)).toMatchObject({ type: "RECALLED", reason: "Wrong quote attached", approverIds: [3] });

    const again = resubmit(twoLevels, recalled.state, "REQUESTING_STEP", ctx(), directory);
    expect(again.state.round).toBe(2);
    expect(pending(again.state).map((task) => [task.nodeId, task.approverId])).toEqual([["hod", 3]]);
    expect(again.state.nodes.mgr?.status).toBe("APPROVED"); // not asked again
  });

  it("with parallel branches, every open branch restarts", () => {
    const parallel: WorkflowDefinition = {
      nodes: [start(), split("s"), approval("a", [user(4)]), approval("b", [user(5)]), join("j"), end()],
      edges: [edge("start", "s"), edge("s", "a"), edge("s", "b"), edge("a", "j"), edge("b", "j"), edge("j", "end")],
    };
    let { state } = startInstance(parallel, ctx(), directory);
    ({ state } = decide(parallel, state, { taskId: pending(state, "a")[0]!.id, actorId: 4, decision: "APPROVE" }, ctx(), directory));
    const recalled = recall(parallel, state, { actorId: 1, reason: "Change" }, ctx(), directory);
    const again = resubmit(parallel, recalled.state, "REQUESTING_STEP", ctx(), directory);
    expect(pending(again.state).map((task) => task.nodeId)).toEqual(["b"]);
    expect(again.state.nodes.a?.status).toBe("APPROVED");
  });

  it("needs a reason, and only an open request can be recalled", () => {
    const { state } = startInstance(twoLevels, ctx(), directory);
    expect(code(() => recall(twoLevels, state, { actorId: 1, reason: " " }, ctx(), directory))).toBe("COMMENT_REQUIRED");
    const done = { ...state, status: "APPROVED" as const };
    expect(code(() => recall(twoLevels, done, { actorId: 1, reason: "x" }, ctx(), directory))).toBe("NOT_RECALLABLE");
  });

  it("a decision on the old state after a recall is refused (no double outcome)", () => {
    const { state } = startInstance(twoLevels, ctx(), directory);
    const taskId = pending(state, "mgr")[0]!.id;
    const recalled = recall(twoLevels, state, { actorId: 1, reason: "Wait" }, ctx(), directory);
    expect(code(() => decide(twoLevels, recalled.state, { taskId, actorId: 2, decision: "APPROVE" }, ctx(), directory))).toBe("NOT_IN_PROGRESS");
  });
});

describe("ask for information (EN-05)", () => {
  const oneLevel = chain(approval("mgr", [user(2)]));

  it("holds the request with the question; only the requester's answer resumes it", () => {
    const { state } = startInstance(oneLevel, ctx(), directory);
    const taskId = pending(state)[0]!.id;
    const asked = askForInformation(state, { taskId, actorId: 2, question: "Which cost centre?" }, ctx(), directory);
    expect(asked.state.status).toBe("ON_HOLD");
    expect(asked.state.hold).toMatchObject({ kind: "INFO", reason: "Which cost centre?", by: 2 });
    expect(asked.events).toEqual([{ type: "INFO_REQUESTED", nodeId: "mgr", actorId: 2, question: "Which cost centre?" }]);
    // Nobody decides meanwhile.
    expect(code(() => decide(oneLevel, asked.state, { taskId, actorId: 2, decision: "APPROVE" }, ctx(), directory))).toBe("NOT_IN_PROGRESS");
    // Someone else can't answer for the requester.
    expect(code(() => answerInformation(asked.state, { actorId: 2, answer: "CC-12" }, ctx()))).toBe("NOT_AUTHORISED");
    const answered = answerInformation(asked.state, { actorId: 1, answer: "CC-12" }, ctx());
    expect(answered.state.status).toBe("IN_PROGRESS");
    expect(answered.events[0]).toMatchObject({ type: "INFO_ANSWERED", answer: "CC-12", askedBy: 2, pendingApproverIds: [2] });
    // And then it can be decided.
    expect(decide(oneLevel, answered.state, { taskId, actorId: 2, decision: "APPROVE" }, ctx(), directory).state.status).toBe("APPROVED");
  });

  it("the approver can also simply resume; a plain hold can't be 'answered'", () => {
    const { state } = startInstance(oneLevel, ctx(), directory);
    const taskId = pending(state)[0]!.id;
    const asked = askForInformation(state, { taskId, actorId: 2, question: "Q?" }, ctx(), directory);
    expect(resume(asked.state, { actorId: 2 }, directory).state.status).toBe("IN_PROGRESS");
    expect(code(() => askForInformation(state, { taskId, actorId: 2, question: "" }, ctx(), directory))).toBe("COMMENT_REQUIRED");
    expect(code(() => askForInformation(state, { taskId, actorId: 9, question: "Q?" }, ctx(), directory))).toBe("NOT_AUTHORISED");
  });
});

describe("hand-on history (EN-07)", () => {
  it("records who held the task before", () => {
    const definition = chain(approval("mgr", [user(2)]));
    const { state } = startInstance(definition, ctx(), directory);
    const taskId = pending(state)[0]!.id;
    const first = reassignTask(state, { taskId, toUserId: 4, actorId: 2 }, ctx(), directory);
    const second = reassignTask(first.state, { taskId, toUserId: 7, actorId: 4 }, ctx(), directory);
    expect(second.state.tasks.find((task) => task.id === taskId)?.previousApprovers).toEqual([2, 4]);
  });
});
