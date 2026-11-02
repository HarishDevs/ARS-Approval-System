import { describe, expect, it } from "vitest";
import { decide, reopen, resolveBlocked, resubmit, startInstance } from "@/server/engine/engine";
import { planReroute, routedSteps } from "@/server/engine/reroute";
import { validateWorkflow } from "@/server/engine/validate";
import type { EngineEvent, InstanceState, WorkflowDefinition, WorkflowNode } from "@/server/engine/types";
import { approval, chain, ctx, decision, edge, end, join, makeDirectory, split, start, user } from "../helpers/engine-fixtures";

// Owner decisions of 2 Nov 2026: DR-01 (join rejection per join), DR-02 (no
// approval without a human), DR-09 (resubmit restarts at the earliest
// affected step).
const dir = makeDirectory();
const pending = (state: InstanceState, nodeId: string) => state.tasks.filter((task) => task.nodeId === nodeId && task.status === "PENDING" && task.round === state.round);
const act = (def: WorkflowDefinition, state: InstanceState, nodeId: string, decisionValue: "APPROVE" | "REJECT" | "REQUEST_CHANGES", formData = {}, requesterId = 1) => {
  const task = pending(state, nodeId)[0];
  if (!task) throw new Error(`no pending task at ${nodeId}`);
  return decide(def, state, { taskId: task.id, actorId: task.approverId, decision: decisionValue, comment: decisionValue === "APPROVE" ? undefined : "reason" }, ctx(formData, requesterId), dir);
};
const ofType = <T extends EngineEvent["type"]>(events: EngineEvent[], type: T) => events.filter((event): event is Extract<EngineEvent, { type: T }> => event.type === type);

// start → split → a(4) | b(5) | c(6) → join → md(8) → end
function parallel(joinNode: WorkflowNode): WorkflowDefinition {
  return {
    nodes: [start(), split("s"), approval("a", [user(4)]), approval("b", [user(5)]), approval("c", [user(6)]), joinNode, approval("md", [user(8)]), end()],
    edges: [edge("start", "s"), edge("s", "a"), edge("s", "b"), edge("s", "c"), edge("a", "j"), edge("b", "j"), edge("c", "j"), edge("j", "md"), edge("md", "end")],
  };
}
const anyOne = (onReject?: "END" | "WHEN_UNREACHABLE"): WorkflowNode => ({ ...join("j", { type: "ANY_ONE" }), ...(onReject ? { onReject } : {}) }) as WorkflowNode;
const anyTwo = (onReject?: "END" | "WHEN_UNREACHABLE"): WorkflowNode => ({ ...join("j", { type: "ANY_N", n: 2 }), ...(onReject ? { onReject } : {}) }) as WorkflowNode;

describe("DR-01: a branch rejection under an any-one / any-N join", () => {
  it("default (no setting, or END): one branch's rejection ends the request, as before", () => {
    for (const def of [parallel(anyOne()), parallel(anyOne("END"))]) {
      const state = act(def, startInstance(def, ctx(), dir).state, "a", "REJECT").state;
      expect(state.status).toBe("REJECTED");
    }
  });

  it("WHEN_UNREACHABLE: the other branches keep deciding, and one approval completes the join", () => {
    const def = parallel(anyOne("WHEN_UNREACHABLE"));
    const rejected = act(def, startInstance(def, ctx(), dir).state, "a", "REJECT");
    expect(rejected.state.status).toBe("IN_PROGRESS");
    expect(rejected.state.nodes.a!.status).toBe("REJECTED");
    expect(ofType(rejected.events, "BRANCH_ENDED")).toEqual([{ type: "BRANCH_ENDED", nodeId: "a", joinId: "j" }]);
    expect(ofType(rejected.events, "INSTANCE_REJECTED")).toHaveLength(0);
    expect(pending(rejected.state, "b")).toHaveLength(1);
    const approved = act(def, rejected.state, "b", "APPROVE").state;
    expect(approved.nodes.j!.status).toBe("APPROVED");
    expect(pending(approved, "md")).toHaveLength(1);
    expect(act(def, approved, "md", "APPROVE").state.status).toBe("APPROVED");
  });

  it("WHEN_UNREACHABLE: the request ends when every branch is rejected", () => {
    const def = parallel(anyOne("WHEN_UNREACHABLE"));
    let state = startInstance(def, ctx(), dir).state;
    state = act(def, state, "a", "REJECT").state;
    state = act(def, state, "b", "REJECT").state;
    expect(state.status).toBe("IN_PROGRESS");
    const last = act(def, state, "c", "REJECT");
    expect(last.state.status).toBe("REJECTED");
    expect(ofType(last.events, "INSTANCE_REJECTED")).toHaveLength(1);
  });

  it("any 2 of 3: one rejection carries on, a second makes the join unreachable and ends it", () => {
    const def = parallel(anyTwo("WHEN_UNREACHABLE"));
    let state = startInstance(def, ctx(), dir).state;
    state = act(def, state, "a", "REJECT").state;
    expect(state.status).toBe("IN_PROGRESS");
    state = act(def, state, "b", "REJECT").state;
    expect(state.status).toBe("REJECTED");
    expect(pending(state, "c")).toHaveLength(0);
  });

  it("an ended branch stays ended when the request comes back from changes", () => {
    const def = parallel(anyTwo("WHEN_UNREACHABLE"));
    let state = startInstance(def, ctx(), dir).state;
    state = act(def, state, "a", "REJECT").state;
    state = act(def, state, "b", "REQUEST_CHANGES").state;
    expect(state.status).toBe("CHANGES_REQUIRED");
    state = resubmit(def, state, "REQUESTING_STEP", ctx(), dir).state;
    expect(state.nodes.a!.status).toBe("REJECTED");
    expect(pending(state, "b")).toHaveLength(1);
    expect(pending(state, "c")).toHaveLength(1);
    expect(act(def, state, "c", "REJECT").state.status).toBe("REJECTED");
  });

  it("validation: the choice belongs to any-one / any-N joins and has two values", () => {
    const onAll = parallel({ ...join("j", { type: "ALL" }), onReject: "WHEN_UNREACHABLE" } as WorkflowNode);
    expect(validateWorkflow(onAll).errors.map((issue) => issue.code)).toContain("JOIN_ON_REJECT_ALL");
    const bad = parallel({ ...join("j", { type: "ANY_ONE" }), onReject: "SOMETIMES" } as unknown as WorkflowNode);
    expect(validateWorkflow(bad).errors.map((issue) => issue.code)).toContain("JOIN_ON_REJECT_INVALID");
    expect(validateWorkflow(parallel(anyOne("WHEN_UNREACHABLE"))).valid).toBe(true);
    expect(validateWorkflow(parallel(anyOne("END"))).valid).toBe(true);
  });
});

describe("DR-02: no request ends approved without a human approval", () => {
  const skipAll = chain(approval("m", [user(7)], { type: "ALL" }, { skipIf: { field: "amount", operator: "LT", value: 100 } }));

  it("every level skipped: the requester's HOD is asked instead, and their approval finishes it", () => {
    const started = startInstance(skipAll, ctx({ amount: 5 }), dir);
    expect(started.state.status).toBe("IN_PROGRESS");
    expect(ofType(started.events, "HUMAN_APPROVAL_ROUTED")).toEqual([{ type: "HUMAN_APPROVAL_ROUTED", nodeId: "m", to: "HOD", userIds: [3] }]);
    expect(ofType(started.events, "INSTANCE_APPROVED")).toHaveLength(0);
    expect(pending(started.state, "m").map((task) => task.approverId)).toEqual([3]);
    const done = act(skipAll, started.state, "m", "APPROVE", { amount: 5 });
    expect(done.state.status).toBe("APPROVED");
    expect(done.state.humanCheck).toBeUndefined();
  });

  it("the HOD may reject it", () => {
    const state = startInstance(skipAll, ctx({ amount: 5 }), dir).state;
    expect(act(skipAll, state, "m", "REJECT", { amount: 5 }).state.status).toBe("REJECTED");
  });

  it("no HOD: the step blocks for IT (the existing fallback); IT can't skip it, but can assign someone", () => {
    const requester = 7; // no HOD in the fixture
    const started = startInstance(skipAll, ctx({ amount: 5 }, requester), dir);
    expect(started.state.nodes.m!.status).toBe("BLOCKED");
    expect(ofType(started.events, "HUMAN_APPROVAL_ROUTED")[0]).toMatchObject({ to: "IT", userIds: [] });
    expect(ofType(started.events, "NODE_BLOCKED")).toHaveLength(1);
    expect(() => resolveBlocked(skipAll, started.state, { nodeId: "m", actorId: 99, reason: "no need", action: "SKIP" }, ctx({ amount: 5 }, requester), dir)).toThrow(/can't be skipped/);
    const retried = resolveBlocked(skipAll, started.state, { nodeId: "m", actorId: 99, reason: "again", action: "RETRY" }, ctx({ amount: 5 }, requester), dir).state;
    expect(retried.nodes.m!.status).toBe("BLOCKED");
    const assigned = resolveBlocked(skipAll, started.state, { nodeId: "m", actorId: 99, reason: "MD decides", action: "ASSIGN", userIds: [8] }, ctx({ amount: 5 }, requester), dir).state;
    expect(act(skipAll, assigned, "m", "APPROVE", { amount: 5 }, requester).state.status).toBe("APPROVED");
  });

  it("an any-3 step used for the human check needs only the one person asked", () => {
    const def = chain(approval("g", [{ type: "GROUP", groupId: 1 }], { type: "ANY_N", n: 3 }, { skipIf: { field: "amount", operator: "LT", value: 100 } }));
    const state = startInstance(def, ctx({ amount: 5 }), dir).state;
    expect(act(def, state, "g", "APPROVE", { amount: 5 }).state.status).toBe("APPROVED");
  });

  it("a type IT ticked may finish with every level skipped, and keeps that on reopen", () => {
    const started = startInstance(skipAll, { ...ctx({ amount: 5 }), mayFinishWithoutApprover: true }, dir);
    expect(started.state.status).toBe("APPROVED");
    expect(started.state.mayFinishWithoutApprover).toBe(true);
    const reopened = reopen(skipAll, started.state, { actorId: 99, reason: "check again" }, ctx({ amount: 5 }), dir).state;
    expect(reopened.status).toBe("APPROVED");
  });

  it("a request someone approved finishes as before", () => {
    const def = chain(approval("a", [user(7)]), approval("m", [user(8)], { type: "ALL" }, { skipIf: { field: "amount", operator: "LT", value: 100 } }));
    const state = startInstance(def, ctx({ amount: 5 }), dir).state;
    const done = act(def, state, "a", "APPROVE", { amount: 5 });
    expect(done.state.status).toBe("APPROVED");
    expect(ofType(done.events, "HUMAN_APPROVAL_ROUTED")).toHaveLength(0);
  });

  it("work done isn't an approval: a route with only work and skipped levels still asks the HOD", () => {
    const def = chain(approval("w", [user(7)], { type: "ALL" }, { mode: "WORK" }), approval("m", [user(8)], { type: "ALL" }, { skipIf: { field: "amount", operator: "LT", value: 100 } }));
    const state = act(def, startInstance(def, ctx({ amount: 5 }), dir).state, "w", "APPROVE", { amount: 5 }).state;
    expect(state.status).toBe("IN_PROGRESS");
    expect(pending(state, "m").map((task) => task.approverId)).toEqual([3]);
  });
});

describe("DR-09: a resubmit that changes the route restarts at the earliest affected step", () => {
  const band = { field: "amount", operator: "LT" as const, value: 1000 };
  // a(7) → b(8, skipped under ₹1,000) → c(9)
  const def = chain(approval("a", [user(7)]), approval("b", [user(8)], { type: "ALL" }, { skipIf: band }), approval("c", [user(9)]));

  function askedAtC(): InstanceState {
    let state = startInstance(def, ctx({ amount: 500 }), dir).state;
    state = act(def, state, "a", "APPROVE", { amount: 500 }).state;
    expect(state.nodes.b!.status).toBe("SKIPPED");
    return act(def, state, "c", "REQUEST_CHANGES", { amount: 500 }).state;
  }

  it("a level the new amount needs runs again; the level before it keeps its approval", () => {
    const result = resubmit(def, askedAtC(), "REQUESTING_STEP", ctx({ amount: 5000 }), dir, { previousFormData: { amount: 500 } });
    expect(result.state.nodes.a!.status).toBe("APPROVED");
    expect(pending(result.state, "a")).toHaveLength(0);
    expect(pending(result.state, "b").map((task) => task.approverId)).toEqual([8]);
    expect(result.state.nodes.c!.status).toBe("WAITING");
    expect(ofType(result.events, "ROUTE_CHANGED")).toEqual([{ type: "ROUTE_CHANGED", added: ["b"], removed: [], approverChanged: [], restartNodeIds: ["b"], fromBeginning: false }]);
    expect(ofType(result.events, "RESUBMITTED")[0]!.restartNodeId).toBe("b");
    const afterB = act(def, result.state, "b", "APPROVE", { amount: 5000 }).state;
    expect(pending(afterB, "c")).toHaveLength(1);
  });

  it("a level the new amount no longer needs is skipped, and said so", () => {
    let state = startInstance(def, ctx({ amount: 5000 }), dir).state;
    state = act(def, state, "a", "APPROVE", { amount: 5000 }).state;
    state = act(def, state, "b", "APPROVE", { amount: 5000 }).state;
    state = act(def, state, "c", "REQUEST_CHANGES", { amount: 5000 }).state;
    const result = resubmit(def, state, "REQUESTING_STEP", ctx({ amount: 500 }), dir, { previousFormData: { amount: 5000 } });
    expect(result.state.nodes.a!.status).toBe("APPROVED");
    expect(result.state.nodes.b!.status).toBe("SKIPPED");
    expect(pending(result.state, "c")).toHaveLength(1);
    expect(ofType(result.events, "ROUTE_CHANGED")[0]).toMatchObject({ added: [], removed: ["b"], restartNodeIds: ["b"] });
  });

  it("a change affecting only a later, not yet reached step restarts at the step that asked", () => {
    let state = startInstance(def, ctx({ amount: 500 }), dir).state;
    state = act(def, state, "a", "REQUEST_CHANGES", { amount: 500 }).state;
    const result = resubmit(def, state, "REQUESTING_STEP", ctx({ amount: 5000 }), dir, { previousFormData: { amount: 500 } });
    expect(pending(result.state, "a")).toHaveLength(1);
    expect(ofType(result.events, "ROUTE_CHANGED")[0]).toMatchObject({ added: ["b"], restartNodeIds: ["a"] });
  });

  it("no routing change: the type's restart setting applies exactly as before (no route entry)", () => {
    const result = resubmit(def, askedAtC(), "REQUESTING_STEP", ctx({ amount: 600 }), dir, { previousFormData: { amount: 500 } });
    expect(pending(result.state, "c")).toHaveLength(1);
    expect(result.state.nodes.a!.status).toBe("APPROVED");
    expect(ofType(result.events, "ROUTE_CHANGED")).toHaveLength(0);
  });

  it("a type set to restart from the beginning still does, and the route change is recorded", () => {
    const result = resubmit(def, askedAtC(), "BEGINNING", ctx({ amount: 5000 }), dir, { previousFormData: { amount: 500 } });
    expect(pending(result.state, "a")).toHaveLength(1);
    expect(ofType(result.events, "ROUTE_CHANGED")[0]).toMatchObject({ added: ["b"], fromBeginning: true });
  });

  it("a choice that now goes the other way restarts at the choice; steps before it keep their approvals", () => {
    const big = { field: "amount", operator: "GT" as const, value: 1000 };
    const choiceDef: WorkflowDefinition = {
      nodes: [start(), approval("a", [user(7)]), decision("d"), approval("x", [user(8)]), approval("y", [user(4)]), approval("c", [user(9)]), end()],
      edges: [edge("start", "a"), edge("a", "d"), edge("d", "x", { condition: big, order: 1 }), edge("d", "y", { isDefault: true }), edge("x", "c"), edge("y", "c"), edge("c", "end")],
    };
    let state = startInstance(choiceDef, ctx({ amount: 500 }), dir).state;
    state = act(choiceDef, state, "a", "APPROVE", { amount: 500 }).state;
    state = act(choiceDef, state, "y", "APPROVE", { amount: 500 }).state;
    state = act(choiceDef, state, "c", "REQUEST_CHANGES", { amount: 500 }).state;
    const result = resubmit(choiceDef, state, "REQUESTING_STEP", ctx({ amount: 5000 }), dir, { previousFormData: { amount: 500 } });
    expect(result.state.nodes.a!.status).toBe("APPROVED");
    expect(result.state.nodes.y!.status).toBe("WAITING");
    expect(pending(result.state, "x")).toHaveLength(1);
    expect(ofType(result.events, "ROUTE_CHANGED")[0]).toMatchObject({ added: ["x"], removed: ["y"], restartNodeIds: ["d"] });
  });

  it("a new person in an approver field restarts that step for them", () => {
    const fieldDef = chain(approval("a", [user(7)]), approval("p", [{ type: "FORM_FIELD_USER", fieldKey: "approver" }]), approval("c", [user(9)]));
    let state = startInstance(fieldDef, ctx({ approver: 4 }), dir).state;
    state = act(fieldDef, state, "a", "APPROVE", { approver: 4 }).state;
    state = act(fieldDef, state, "p", "APPROVE", { approver: 4 }).state;
    state = act(fieldDef, state, "c", "REQUEST_CHANGES", { approver: 4 }).state;
    const result = resubmit(fieldDef, state, "REQUESTING_STEP", ctx({ approver: 5 }), dir, { previousFormData: { approver: 4 } });
    expect(result.state.nodes.a!.status).toBe("APPROVED");
    expect(pending(result.state, "p").map((task) => task.approverId)).toEqual([5]);
    expect(ofType(result.events, "ROUTE_CHANGED")[0]).toMatchObject({ approverChanged: ["p"], restartNodeIds: ["p"] });
  });

  it("planReroute / routedSteps: pure route comparison", () => {
    expect(routedSteps(def, { amount: 500 })).toEqual(["a", "c"]);
    expect(routedSteps(def, { amount: 5000 })).toEqual(["a", "b", "c"]);
    expect(planReroute(def, { amount: 500 }, { amount: 700 }).changed).toBe(false);
    expect(planReroute(def, { amount: 500 }, { amount: 5000 })).toMatchObject({ changed: true, affectedNodeIds: ["b"], added: ["b"], removed: [] });
  });
});
