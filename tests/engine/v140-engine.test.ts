import { describe, expect, it } from "vitest";
import { decide, resolveApprovers, resolveBlocked, resubmit, resume, putOnHold, startInstance } from "@/server/engine/engine";
import { validateWorkflow } from "@/server/engine/validate";
import { EngineError, type InstanceState, type WorkflowDefinition, type WorkflowNode } from "@/server/engine/types";
import { approval, chain, ctx, decision, edge, end, makeDirectory, start, user } from "../helpers/engine-fixtures";

const directory = makeDirectory();
const pending = (state: InstanceState, nodeId: string) => state.tasks.filter((task) => task.nodeId === nodeId && task.status === "PENDING");
const notify = (id: string, recipients: Extract<WorkflowNode, { kind: "NOTIFY" }>["recipients"], note?: string): WorkflowNode => ({ id, kind: "NOTIFY", label: id, recipients, ...(note ? { note } : {}) });

describe("designation and requester sources (D-097)", () => {
  it("DESIGNATION finds everyone active with it, optionally only in the requester's department", () => {
    expect(resolveApprovers([{ type: "DESIGNATION", designationId: 20 }], ctx(), directory)).toEqual([2, 3, 4, 7]);
    expect(resolveApprovers([{ type: "DESIGNATION", designationId: 20, sameDepartment: true }], ctx(), directory)).toEqual([2, 3, 4]);
    expect(resolveApprovers([{ type: "DESIGNATION", designationId: 99 }], ctx(), directory)).toEqual([]);
  });

  it("REQUESTER is never an approver, but can be given work or an FYI", () => {
    expect(resolveApprovers([{ type: "REQUESTER" }], ctx(), directory)).toEqual([]);
    expect(resolveApprovers([{ type: "REQUESTER" }], ctx(), directory, { allowRequester: true })).toEqual([1]);
  });

  it("the validator refuses the requester on an approval step but allows it on a work step", () => {
    const bad = validateWorkflow(chain(approval("self", [{ type: "REQUESTER" }])));
    expect(bad.errors.map((issue) => issue.code)).toContain("APPROVER_IS_REQUESTER");
    const ok = validateWorkflow(chain(approval("mgr", [user(2)]), approval("upload", [{ type: "REQUESTER" }], { type: "ALL" }, { mode: "WORK" })));
    expect(ok.valid).toBe(true);
  });

  it("a workflow of only work steps isn't an approval", () => {
    const result = validateWorkflow(chain(approval("do", [user(2)], { type: "ALL" }, { mode: "WORK" })));
    expect(result.errors.map((issue) => issue.code)).toContain("NO_APPROVAL_STEP");
  });
});

describe("work steps (hand-off after approval, F-32)", () => {
  const definition = chain(approval("mgr", [user(2)]), approval("raise_po", [{ type: "REQUESTER" }, user(4)], { type: "ANY_ONE" }, { mode: "WORK" }));

  it("after approval the work goes to the requester (or the buyer); one marking it done finishes the request", () => {
    let { state } = startInstance(definition, ctx(), directory);
    state = decide(definition, state, { taskId: pending(state, "mgr")[0]!.id, actorId: 2, decision: "APPROVE" }, ctx(), directory).state;
    expect(pending(state, "raise_po").map((task) => task.approverId).sort()).toEqual([1, 4]);
    const mine = pending(state, "raise_po").find((task) => task.approverId === 1)!;
    const done = decide(definition, state, { taskId: mine.id, actorId: 1, decision: "APPROVE", comment: "PO 4471 raised" }, ctx(), directory);
    expect(done.state.status).toBe("APPROVED");
  });

  it("a work task can't be rejected, but can be sent back for changes", () => {
    let { state } = startInstance(definition, ctx(), directory);
    state = decide(definition, state, { taskId: pending(state, "mgr")[0]!.id, actorId: 2, decision: "APPROVE" }, ctx(), directory).state;
    const task = pending(state, "raise_po").find((item) => item.approverId === 4)!;
    expect(() => decide(definition, state, { taskId: task.id, actorId: 4, decision: "REJECT", comment: "no" }, ctx(), directory)).toThrow(EngineError);
    const back = decide(definition, state, { taskId: task.id, actorId: 4, decision: "REQUEST_CHANGES", comment: "Attach the quote" }, ctx(), directory);
    expect(back.state.status).toBe("CHANGES_REQUIRED");
  });

  it("the requester still can't decide an approval step of their own request", () => {
    const own = chain(approval("mgr", [user(2), user(3)], { type: "ANY_ONE" }));
    const { state } = startInstance(own, ctx({}, 2), directory);
    // 2 is the requester here, so only 3 has a task.
    expect(pending(state, "mgr").map((task) => task.approverId)).toEqual([3]);
  });
});

describe("FYI steps", () => {
  it("tells the people and moves straight on", () => {
    const definition = chain(approval("mgr", [user(2)]), notify("tell_finance", [{ type: "ROLE", roleCode: "FINANCE" }, { type: "REQUESTER" }], "Budget booked"));
    let result = startInstance(definition, ctx(), directory);
    result = decide(definition, result.state, { taskId: pending(result.state, "mgr")[0]!.id, actorId: 2, decision: "APPROVE" }, ctx(), directory);
    expect(result.state.status).toBe("APPROVED");
    expect(result.events).toContainEqual({ type: "NOTIFIED", nodeId: "tell_finance", userIds: [4, 5, 6, 1], note: "Budget booked" });
  });

  it("the validator wants someone to tell", () => {
    const result = validateWorkflow(chain(approval("mgr", [user(2)]), notify("nobody", [])));
    expect(result.errors.map((issue) => issue.code)).toContain("NOTIFY_RECIPIENTS_MISSING");
  });
});

describe("blocked step recovery by IT (D-098)", () => {
  const definition = chain(approval("hod", [{ type: "DEPARTMENT_HOD", departmentId: 99 }]), approval("md", [user(8)]));
  const blocked = () => startInstance(definition, ctx(), directory).state;
  const it_ = { actorId: 9, reason: "HOD not set yet" };

  it("starts blocked when nobody resolves", () => {
    expect(blocked().nodes.hod?.status).toBe("BLOCKED");
  });

  it("ASSIGN: chosen people decide the step", () => {
    const result = resolveBlocked(definition, blocked(), { ...it_, nodeId: "hod", action: "ASSIGN", userIds: [3] }, ctx(), directory);
    expect(result.state.nodes.hod?.status).toBe("ACTIVE");
    expect(pending(result.state, "hod").map((task) => task.approverId)).toEqual([3]);
    expect(result.events[0]).toMatchObject({ type: "BLOCK_RESOLVED", action: "ASSIGN", userIds: [3] });
  });

  it("ASSIGN refuses the requester, inactive people and too few people", () => {
    expect(() => resolveBlocked(definition, blocked(), { ...it_, nodeId: "hod", action: "ASSIGN", userIds: [1] }, ctx(), directory)).toThrow(/own request/);
    expect(() => resolveBlocked(definition, blocked(), { ...it_, nodeId: "hod", action: "ASSIGN", userIds: [11] }, ctx(), directory)).toThrow(/active/);
    const anyTwo = chain(approval("pair", [{ type: "GROUP", groupId: 99 }], { type: "ANY_N", n: 2 }));
    const state = startInstance(anyTwo, ctx(), directory).state;
    expect(() => resolveBlocked(anyTwo, state, { ...it_, nodeId: "pair", action: "ASSIGN", userIds: [4] }, ctx(), directory)).toThrow(/at least 2/);
  });

  it("SKIP moves on to the next level", () => {
    const result = resolveBlocked(definition, blocked(), { ...it_, nodeId: "hod", action: "SKIP" }, ctx(), directory);
    expect(result.state.nodes.hod).toMatchObject({ status: "SKIPPED", reason: "SKIPPED_BY_IT" });
    expect(pending(result.state, "md").map((task) => task.approverId)).toEqual([8]);
  });

  it("RETRY resolves again (after IT fixed the masters)", () => {
    const fixed = makeDirectory({ hodOfDepartment: (id) => (id === 99 ? 3 : null) });
    const result = resolveBlocked(definition, blocked(), { ...it_, nodeId: "hod", action: "RETRY" }, ctx(), fixed);
    expect(pending(result.state, "hod").map((task) => task.approverId)).toEqual([3]);
  });

  it("TAKE_PATH on a choice that found no path (only possible in data from before the validator)", () => {
    const def: WorkflowDefinition = {
      nodes: [start(), decision("route"), approval("a", [user(2)]), approval("b", [user(3)]), end()],
      edges: [
        edge("start", "route"),
        edge("route", "a", { condition: { field: "amount", operator: "GT", value: 10 }, order: 1 }),
        edge("route", "b", { isDefault: true }),
        edge("a", "end"),
        edge("b", "end"),
      ],
    };
    const state: InstanceState = {
      status: "IN_PROGRESS",
      round: 1,
      seq: 0,
      tasks: [],
      joins: {},
      nodes: { start: { status: "APPROVED" }, route: { status: "BLOCKED", reason: "NO_MATCHING_BRANCH" }, a: { status: "WAITING" }, b: { status: "WAITING" }, end: { status: "WAITING" } },
    };
    const toB = def.edges.find((item) => item.to === "b")!;
    const result = resolveBlocked(def, state, { ...it_, nodeId: "route", action: "TAKE_PATH", edgeId: toB.id }, ctx({}), directory);
    expect(pending(result.state, "b").map((task) => task.approverId)).toEqual([3]);
    expect(() => resolveBlocked(def, state, { ...it_, nodeId: "route", action: "SKIP" }, ctx({}), directory)).toThrow(EngineError);
  });

  it("needs a reason, and only works on a step that is blocked", () => {
    expect(() => resolveBlocked(definition, blocked(), { ...it_, reason: " ", nodeId: "hod", action: "SKIP" }, ctx(), directory)).toThrow(/reason/);
    expect(() => resolveBlocked(definition, blocked(), { ...it_, nodeId: "md", action: "SKIP" }, ctx(), directory)).toThrow(/isn't blocked/);
  });
});

describe("event details used for messages and due times", () => {
  it("RESUMED says since when and who is still waiting; RESUBMITTED says who asked", () => {
    const definition = chain(approval("mgr", [user(2)]));
    let state = startInstance(definition, ctx(), directory).state;
    const task = pending(state, "mgr")[0]!;
    state = putOnHold(state, { taskId: task.id, actorId: 2 }, { ...ctx(), now: "2026-09-28T11:00:00.000Z" }, directory).state;
    const resumed = resume(state, { actorId: 2 }, directory);
    expect(resumed.events[0]).toMatchObject({ type: "RESUMED", heldSince: "2026-09-28T11:00:00.000Z", pendingApproverIds: [2] });

    const back = decide(definition, resumed.state, { taskId: task.id, actorId: 2, decision: "REQUEST_CHANGES", comment: "fix" }, ctx(), directory).state;
    const again = resubmit(definition, back, "REQUESTING_STEP", ctx(), directory);
    expect(again.events[0]).toMatchObject({ type: "RESUBMITTED", changesAskedBy: 2 });
  });
});
