import { describe, expect, it } from "vitest";
import { decide, resolveBlocked, startInstance } from "@/server/engine/engine";
import type { InstanceState } from "@/server/engine/types";
import { approval, chain, ctx, makeDirectory, user } from "../helpers/engine-fixtures";

// D-245 (audit DB-004, DB-005): no request is approved without an
// independent decision.
const dir = makeDirectory();
const pending = (state: InstanceState, nodeId: string) => state.tasks.filter((task) => task.nodeId === nodeId && task.status === "PENDING");

describe("if nobody: skip never approves a request with no decision (DB-005)", () => {
  const noManager = makeDirectory({ managerOf: () => null });

  it("every approval step skipped for nobody: the last one blocks for IT; the request is not approved", () => {
    const def = chain(approval("m", [{ type: "REQUESTER_MANAGER" }], { type: "ALL" }, { onNoApprover: "SKIP" }));
    const state = startInstance(def, ctx({}), noManager).state;
    expect(state.status).toBe("IN_PROGRESS");
    expect(state.nodes.m!.status).toBe("BLOCKED");
    expect(state.nodes.m!.reason).toBe("NO_ELIGIBLE_APPROVER");
  });

  it("the requester as the only member of the group: blocked, not approved", () => {
    const soleMember = makeDirectory({ groupMembers: () => [1] });
    const def = chain(approval("g", [{ type: "GROUP", groupId: 9 }], { type: "ANY_ONE" }, { onNoApprover: "SKIP" }));
    expect(startInstance(def, ctx({}, 1), soleMember).state.nodes.g!.status).toBe("BLOCKED");
  });

  it("IT then assigns someone, they approve, and the request finishes approved", () => {
    const def = chain(approval("m", [{ type: "REQUESTER_MANAGER" }], { type: "ALL" }, { onNoApprover: "SKIP" }));
    let state = startInstance(def, ctx({}), noManager).state;
    state = resolveBlocked(def, state, { nodeId: "m", actorId: 99, reason: "HOD decides", action: "ASSIGN", userIds: [7] }, ctx({}), noManager).state;
    const task = pending(state, "m")[0]!;
    state = decide(def, state, { taskId: task.id, actorId: 7, decision: "APPROVE" }, ctx({}), noManager).state;
    expect(state.status).toBe("APPROVED");
  });

  it("a skipped step is fine when someone else approved: the request is approved", () => {
    const def = chain(approval("m", [{ type: "REQUESTER_MANAGER" }], { type: "ALL" }, { onNoApprover: "SKIP" }), approval("md", [user(8)]));
    let state = startInstance(def, ctx({}), noManager).state;
    expect(state.nodes.m!.status).toBe("SKIPPED");
    const task = pending(state, "md")[0]!;
    state = decide(def, state, { taskId: task.id, actorId: 8, decision: "APPROVE" }, ctx({}), noManager).state;
    expect(state.status).toBe("APPROVED");
  });

  it("a step skipped by a rule IT set still lets a request through without a decision (by design)", () => {
    const def = chain(approval("m", [user(7)], { type: "ALL" }, { skipIf: { field: "amount", operator: "LT", value: 100 } }));
    expect(startInstance(def, ctx({ amount: 5 }), dir).state.status).toBe("APPROVED");
  });
});

describe("nobody moves a step of their own request on (DB-004)", () => {
  it("SKIP by the requester (an IT person) is refused; another IT person may skip it", () => {
    const def = chain(approval("x", [user(11)])); // 11 is inactive: the step blocks
    const state = startInstance(def, ctx({}, 1), dir).state;
    expect(state.nodes.x!.status).toBe("BLOCKED");
    expect(() => resolveBlocked(def, state, { nodeId: "x", actorId: 1, reason: "moving on", action: "SKIP" }, ctx({}, 1), dir)).toThrow(/own request/);
    expect(resolveBlocked(def, state, { nodeId: "x", actorId: 99, reason: "not needed", action: "SKIP" }, ctx({}, 1), dir).state.status).toBe("APPROVED");
  });

  it("RETRY by the requester is still allowed (it decides nothing)", () => {
    const def = chain(approval("x", [user(11)]));
    const state = startInstance(def, ctx({}, 1), dir).state;
    expect(resolveBlocked(def, state, { nodeId: "x", actorId: 1, reason: "fixed the masters", action: "RETRY" }, ctx({}, 1), dir).state.nodes.x!.status).toBe("BLOCKED");
  });
});

describe("a changed approver field restarts the route on resubmit (DB-006)", () => {
  it("routeChanged notices a different person in an approver field, and not an unchanged one", async () => {
    const { routeChanged } = await import("@/server/engine/conditions");
    const def = chain(approval("picked", [{ type: "FORM_FIELD_USER", fieldKey: "approver" }]), approval("md", [user(8)]));
    expect(routeChanged(def, { approver: 7 }, { approver: 4 })).toBe(true);
    expect(routeChanged(def, { approver: 7 }, { approver: 7 })).toBe(false);
  });
});
