import { describe, expect, it } from "vitest";
import { decide, pendingTasksFor, putOnHold, resolveApprovers, resubmit, resume, startInstance } from "@/server/engine/engine";
import { EngineError, type InstanceState, type WorkflowDefinition } from "@/server/engine/types";
import { approval, chain, ctx, decision, edge, end, join, makeDirectory, split, start, user } from "../helpers/engine-fixtures";

const directory = makeDirectory();

function pending(state: InstanceState, nodeId: string) {
  return state.tasks.filter((task) => task.nodeId === nodeId && task.status === "PENDING");
}

function approveAll(definition: WorkflowDefinition, state: InstanceState, nodeId: string, formData = {}) {
  for (const task of pending(state, nodeId)) {
    state = decide(definition, state, { taskId: task.id, actorId: task.approverId, decision: "APPROVE" }, ctx(formData), directory).state;
  }
  return state;
}

describe("sequential levels", () => {
  const definition = chain(
    approval("manager", [{ type: "REQUESTER_MANAGER" }]),
    approval("hod", [{ type: "REQUESTER_DEPARTMENT_HOD" }]),
    approval("finance", [{ type: "ROLE", roleCode: "FINANCE" }], { type: "ANY_ONE" }),
    approval("ed", [user(7)]),
    approval("md", [user(8)]),
  );

  it("activates only the first level, then each next level in order", () => {
    let { state } = startInstance(definition, ctx(), directory);
    expect(state.status).toBe("IN_PROGRESS");
    expect(pending(state, "manager").map((t) => t.approverId)).toEqual([2]);
    expect(state.nodes.hod!.status).toBe("WAITING");

    state = approveAll(definition, state, "manager");
    expect(pending(state, "hod").map((t) => t.approverId)).toEqual([3]);
    state = approveAll(definition, state, "hod");
    expect(pending(state, "finance").map((t) => t.approverId)).toEqual([4, 5, 6]);

    const first = pending(state, "finance")[0]!;
    state = decide(definition, state, { taskId: first.id, actorId: first.approverId, decision: "APPROVE" }, ctx(), directory).state;
    expect(state.nodes.finance!.status).toBe("APPROVED");
    expect(state.tasks.filter((t) => t.nodeId === "finance" && t.status === "NOT_REQUIRED")).toHaveLength(2);

    state = approveAll(definition, state, "ed");
    expect(state.status).toBe("IN_PROGRESS");
    state = approveAll(definition, state, "md");
    expect(state.status).toBe("APPROVED");
  });

  it("supports any number of levels (12 in a row)", () => {
    const many = chain(...Array.from({ length: 12 }, (_, i) => approval(`l${i + 1}`, [user(i % 2 === 0 ? 7 : 8)])));
    let { state } = startInstance(many, ctx(), directory);
    for (let i = 1; i <= 12; i += 1) {
      expect(state.nodes[`l${i}`]!.status).toBe("ACTIVE");
      state = approveAll(many, state, `l${i}`);
    }
    expect(state.status).toBe("APPROVED");
  });
});

describe("parallel levels", () => {
  function parallel(joinRule: Parameters<typeof join>[1]): WorkflowDefinition {
    return {
      nodes: [start(), split("s"), approval("fin", [user(4)]), approval("legal", [user(5)]), approval("pur", [user(6)]), join("j", joinRule), approval("ed", [user(7)]), end()],
      edges: [edge("start", "s"), edge("s", "fin"), edge("s", "legal"), edge("s", "pur"), edge("fin", "j"), edge("legal", "j"), edge("pur", "j"), edge("j", "ed"), edge("ed", "end")],
    };
  }

  it("ALL: waits for every branch, then continues", () => {
    const definition = parallel({ type: "ALL" });
    let { state } = startInstance(definition, ctx(), directory);
    expect(["fin", "legal", "pur"].map((id) => state.nodes[id]!.status)).toEqual(["ACTIVE", "ACTIVE", "ACTIVE"]);
    state = approveAll(definition, state, "fin");
    state = approveAll(definition, state, "legal");
    expect(state.nodes.ed!.status).toBe("WAITING");
    state = approveAll(definition, state, "pur");
    expect(state.nodes.ed!.status).toBe("ACTIVE");
    state = approveAll(definition, state, "ed");
    expect(state.status).toBe("APPROVED");
  });

  it("ANY_ONE join: first finished branch continues and the others are closed", () => {
    const definition = parallel({ type: "ANY_ONE" });
    let { state } = startInstance(definition, ctx(), directory);
    state = approveAll(definition, state, "legal");
    expect(state.nodes.ed!.status).toBe("ACTIVE");
    expect(state.nodes.fin!.status).toBe("CANCELLED");
    expect(pending(state, "fin")).toHaveLength(0);
  });

  it("ANY_N join: 2 of 3 branches", () => {
    const definition = parallel({ type: "ANY_N", n: 2 });
    let { state } = startInstance(definition, ctx(), directory);
    state = approveAll(definition, state, "fin");
    expect(state.nodes.ed!.status).toBe("WAITING");
    state = approveAll(definition, state, "pur");
    expect(state.nodes.ed!.status).toBe("ACTIVE");
    expect(state.nodes.legal!.status).toBe("CANCELLED");
  });
});

describe("any-N-of-M on one level", () => {
  const definition = chain(approval("committee", [{ type: "GROUP", groupId: 1 }], { type: "ANY_N", n: 3 }));

  it("needs 3 approvals out of 4", () => {
    let { state } = startInstance(definition, ctx(), directory);
    const tasks = pending(state, "committee");
    expect(tasks).toHaveLength(4);
    for (const task of tasks.slice(0, 2)) {
      state = decide(definition, state, { taskId: task.id, actorId: task.approverId, decision: "APPROVE" }, ctx(), directory).state;
    }
    expect(state.status).toBe("IN_PROGRESS");
    state = decide(definition, state, { taskId: tasks[2]!.id, actorId: tasks[2]!.approverId, decision: "APPROVE" }, ctx(), directory).state;
    expect(state.status).toBe("APPROVED");
  });

  it("one rejection doesn't end it while 3 approvals are still possible; two do", () => {
    let { state } = startInstance(definition, ctx(), directory);
    const tasks = pending(state, "committee");
    state = decide(definition, state, { taskId: tasks[0]!.id, actorId: tasks[0]!.approverId, decision: "REJECT", comment: "No budget" }, ctx(), directory).state;
    expect(state.status).toBe("IN_PROGRESS");
    const result = decide(definition, state, { taskId: tasks[1]!.id, actorId: tasks[1]!.approverId, decision: "REJECT", comment: "Agree" }, ctx(), directory);
    expect(result.state.status).toBe("REJECTED");
    expect(result.events.some((e) => e.type === "INSTANCE_REJECTED")).toBe(true);
  });
});

describe("conditions and amount routing", () => {
  // HOD, then Finance above ₹1L, then ED above ₹5L (placeholder DoA bands).
  const definition: WorkflowDefinition = {
    nodes: [
      start(),
      approval("hod", [{ type: "REQUESTER_DEPARTMENT_HOD" }]),
      decision("band"),
      approval("finance", [user(4)]),
      decision("band2"),
      approval("ed", [user(7)]),
      end(),
    ],
    edges: [
      edge("start", "hod"),
      edge("hod", "band"),
      edge("band", "finance", { condition: { field: "amount", operator: "GT", value: 100000 }, order: 1 }),
      edge("band", "end", { isDefault: true }),
      edge("finance", "band2"),
      edge("band2", "ed", { condition: { field: "amount", operator: "GT", value: 500000 }, order: 1 }),
      edge("band2", "end", { isDefault: true }),
      edge("ed", "end"),
    ],
  };

  it("₹75,000 → HOD only", () => {
    let { state } = startInstance(definition, ctx({ amount: 75000 }), directory);
    state = approveAll(definition, state, "hod", { amount: 75000 });
    expect(state.status).toBe("APPROVED");
    expect(state.nodes.finance!.status).toBe("WAITING");
  });

  it("₹12,50,000 → HOD, Finance, ED", () => {
    const form = { amount: "1250000" };
    let { state } = startInstance(definition, ctx(form), directory);
    state = approveAll(definition, state, "hod", form);
    expect(state.nodes.finance!.status).toBe("ACTIVE");
    state = approveAll(definition, state, "finance", form);
    expect(state.nodes.ed!.status).toBe("ACTIVE");
  });

  it("skipIf skips a level", () => {
    const skipping = chain(approval("a", [user(7)], { type: "ALL" }, { skipIf: { field: "nature", operator: "EQ", value: "Review" } }), approval("b", [user(8)]));
    const { state, events } = startInstance(skipping, ctx({ nature: "review" }), directory);
    expect(state.nodes.a!.status).toBe("SKIPPED");
    expect(state.nodes.b!.status).toBe("ACTIVE");
    expect(events.some((e) => e.type === "NODE_SKIPPED")).toBe(true);
  });
});

describe("approver resolution and safety", () => {
  it("never makes the requester their own approver, drops inactive users, and removes duplicates", () => {
    const ids = resolveApprovers([user(1), user(11), user(7), user(7), { type: "ROLE", roleCode: "FINANCE" }], ctx(), directory);
    expect(ids).toEqual([7, 4, 5, 6]);
  });

  it("blocks a level with no eligible approver (never silently approves)", () => {
    const definition = chain(approval("x", [{ type: "ROLE", roleCode: "EMPTY" }]));
    const { state, events } = startInstance(definition, ctx(), directory);
    expect(state.nodes.x!.status).toBe("BLOCKED");
    expect(state.status).toBe("IN_PROGRESS");
    expect(events).toContainEqual({ type: "NODE_BLOCKED", nodeId: "x", reason: "NO_ELIGIBLE_APPROVER" });
  });

  it("can skip a level with no approver when configured", () => {
    const definition = chain(approval("x", [{ type: "ROLE", roleCode: "EMPTY" }], { type: "ALL" }, { onNoApprover: "SKIP" }), approval("y", [user(8)]));
    const { state } = startInstance(definition, ctx(), directory);
    expect(state.nodes.x!.status).toBe("SKIPPED");
    expect(state.nodes.y!.status).toBe("ACTIVE");
  });

  it("only the task's approver (or their delegate) can decide it (G-01)", () => {
    const definition = chain(approval("ed", [user(7)]));
    const { state } = startInstance(definition, ctx(), directory);
    const task = pending(state, "ed")[0]!;
    expect(() => decide(definition, state, { taskId: task.id, actorId: 8, decision: "APPROVE" }, ctx(), directory)).toThrowError(EngineError);
    expect(() => decide(definition, state, { taskId: task.id, actorId: 1, decision: "APPROVE" }, ctx(), directory)).toThrowError(/not allowed/);

    const byDelegate = decide(definition, state, { taskId: task.id, actorId: 12, decision: "APPROVE" }, ctx(), directory);
    const decided = byDelegate.state.tasks.find((t) => t.id === task.id)!;
    expect(decided.decidedBy).toBe(12);
    expect(decided.onBehalfOf).toBe(7);
    expect(byDelegate.state.status).toBe("APPROVED");
  });

  it("a decided task can't be decided again", () => {
    const definition = chain(approval("ed", [user(7)]), approval("md", [user(8)]));
    let { state } = startInstance(definition, ctx(), directory);
    const task = pending(state, "ed")[0]!;
    state = decide(definition, state, { taskId: task.id, actorId: 7, decision: "APPROVE" }, ctx(), directory).state;
    expect(() => decide(definition, state, { taskId: task.id, actorId: 7, decision: "REJECT", comment: "x" }, ctx(), directory)).toThrowError(EngineError);
  });

  it("reject and request changes need a reason", () => {
    const definition = chain(approval("ed", [user(7)]));
    const { state } = startInstance(definition, ctx(), directory);
    const task = pending(state, "ed")[0]!;
    expect(() => decide(definition, state, { taskId: task.id, actorId: 7, decision: "REJECT" }, ctx(), directory)).toThrowError(/reason/);
    expect(() => decide(definition, state, { taskId: task.id, actorId: 7, decision: "REQUEST_CHANGES", comment: "  " }, ctx(), directory)).toThrowError(/reason/);
  });

  it("decisions don't mutate the previous state", () => {
    const definition = chain(approval("ed", [user(7)]));
    const { state } = startInstance(definition, ctx(), directory);
    const before = JSON.stringify(state);
    decide(definition, state, { taskId: pending(state, "ed")[0]!.id, actorId: 7, decision: "APPROVE" }, ctx(), directory);
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe("reject, changes, hold, resubmit", () => {
  const definition = chain(approval("hod", [user(3)]), approval("ed", [user(7)]), approval("md", [user(8)]));

  it("reject at any level ends the request and closes open tasks (never shows as approved, G-02)", () => {
    let { state } = startInstance(definition, ctx(), directory);
    state = approveAll(definition, state, "hod");
    const edTask = pending(state, "ed")[0]!;
    const { state: rejected } = decide(definition, state, { taskId: edTask.id, actorId: 7, decision: "REJECT", comment: "Too costly" }, ctx(), directory);
    expect(rejected.status).toBe("REJECTED");
    expect(rejected.nodes.ed!.status).toBe("REJECTED");
    expect(rejected.nodes.md!.status).toBe("WAITING");
    expect(rejected.tasks.some((t) => t.status === "PENDING")).toBe(false);
  });

  it("changes required keeps the request open, then resubmits from the requesting level with earlier approvals kept", () => {
    let { state } = startInstance(definition, ctx(), directory);
    state = approveAll(definition, state, "hod");
    const edTask = pending(state, "ed")[0]!;
    state = decide(definition, state, { taskId: edTask.id, actorId: 7, decision: "REQUEST_CHANGES", comment: "Attach the revised quote" }, ctx(), directory).state;
    expect(state.status).toBe("CHANGES_REQUIRED");
    expect(pendingTasksFor(state, 7, directory)).toHaveLength(0);

    const resubmitted = resubmit(definition, state, "REQUESTING_STEP", ctx(), directory);
    state = resubmitted.state;
    expect(state.status).toBe("IN_PROGRESS");
    expect(state.round).toBe(2);
    expect(state.nodes.hod!.status).toBe("APPROVED");
    expect(pending(state, "ed").map((t) => t.round)).toEqual([2]);
    state = approveAll(definition, state, "ed");
    state = approveAll(definition, state, "md");
    expect(state.status).toBe("APPROVED");
    // Full history kept in one request (G-04).
    expect(state.tasks.filter((t) => t.nodeId === "ed")).toHaveLength(2);
  });

  it("resubmit from the beginning restarts every level", () => {
    let { state } = startInstance(definition, ctx(), directory);
    state = approveAll(definition, state, "hod");
    const edTask = pending(state, "ed")[0]!;
    state = decide(definition, state, { taskId: edTask.id, actorId: 7, decision: "REQUEST_CHANGES", comment: "Redo" }, ctx(), directory).state;
    state = resubmit(definition, state, "BEGINNING", ctx(), directory).state;
    expect(state.nodes.hod!.status).toBe("ACTIVE");
    expect(state.nodes.ed!.status).toBe("WAITING");
  });

  it("previous-round approvals don't count in the new round", () => {
    const allOf = chain(approval("pair", [user(7), user(8)]));
    let { state } = startInstance(allOf, ctx(), directory);
    const [t7, t8] = pending(state, "pair");
    state = decide(allOf, state, { taskId: t7!.id, actorId: 7, decision: "APPROVE" }, ctx(), directory).state;
    state = decide(allOf, state, { taskId: t8!.id, actorId: 8, decision: "REQUEST_CHANGES", comment: "Fix" }, ctx(), directory).state;
    state = resubmit(allOf, state, "REQUESTING_STEP", ctx(), directory).state;
    const again = pending(state, "pair");
    expect(again).toHaveLength(2);
    state = decide(allOf, state, { taskId: again.find((t) => t.approverId === 8)!.id, actorId: 8, decision: "APPROVE" }, ctx(), directory).state;
    expect(state.status).toBe("IN_PROGRESS");
  });

  it("restart at the requesting level also restarts open parallel branches and keeps finished ones", () => {
    const definition2: WorkflowDefinition = {
      nodes: [start(), split("s"), approval("a", [user(4)]), approval("b", [user(5)]), approval("c", [user(6)]), join("j"), end()],
      edges: [edge("start", "s"), edge("s", "a"), edge("s", "b"), edge("s", "c"), edge("a", "j"), edge("b", "j"), edge("c", "j"), edge("j", "end")],
    };
    let { state } = startInstance(definition2, ctx(), directory);
    state = approveAll(definition2, state, "a");
    const bTask = pending(state, "b")[0]!;
    state = decide(definition2, state, { taskId: bTask.id, actorId: 5, decision: "REQUEST_CHANGES", comment: "More detail" }, ctx(), directory).state;
    state = resubmit(definition2, state, "REQUESTING_STEP", ctx(), directory).state;
    expect(state.nodes.a!.status).toBe("APPROVED");
    expect(state.nodes.b!.status).toBe("ACTIVE");
    expect(state.nodes.c!.status).toBe("ACTIVE");
    state = approveAll(definition2, state, "b");
    state = approveAll(definition2, state, "c");
    expect(state.status).toBe("APPROVED");
  });

  it("on hold pauses decisions and stays open; the approver resumes", () => {
    let { state } = startInstance(definition, ctx(), directory);
    const task = pending(state, "hod")[0]!;
    state = putOnHold(state, { taskId: task.id, actorId: 3, reason: "Waiting for vendor" }, ctx(), directory).state;
    expect(state.status).toBe("ON_HOLD");
    expect(() => decide(definition, state, { taskId: task.id, actorId: 3, decision: "APPROVE" }, ctx(), directory)).toThrowError(/on hold/);
    expect(() => resume(state, { actorId: 8 }, directory)).toThrowError(EngineError);
    state = resume(state, { actorId: 3 }, directory).state;
    expect(state.status).toBe("IN_PROGRESS");
    state = approveAll(definition, state, "hod");
    expect(state.nodes.ed!.status).toBe("ACTIVE");
  });
});

describe("hybrid workflow from the plan (HOD → parallel → any-one of ED/CFO → MD)", () => {
  const definition: WorkflowDefinition = {
    nodes: [
      start(),
      approval("hod", [{ type: "REQUESTER_DEPARTMENT_HOD" }]),
      split("s"),
      approval("finance", [user(4)]),
      approval("legal", [user(5)]),
      approval("purchase", [user(6)]),
      join("j"),
      approval("exec", [user(7), user(9)], { type: "ANY_ONE" }),
      approval("md", [user(8)]),
      end(),
    ],
    edges: [
      edge("start", "hod"),
      edge("hod", "s"),
      edge("s", "finance"),
      edge("s", "legal"),
      edge("s", "purchase"),
      edge("finance", "j"),
      edge("legal", "j"),
      edge("purchase", "j"),
      edge("j", "exec"),
      edge("exec", "md"),
      edge("md", "end"),
    ],
  };

  it("runs end to end", () => {
    let { state } = startInstance(definition, ctx(), directory);
    for (const id of ["hod", "finance", "legal", "purchase"]) state = approveAll(definition, state, id);
    const cfo = pending(state, "exec").find((t) => t.approverId === 9)!;
    state = decide(definition, state, { taskId: cfo.id, actorId: 9, decision: "APPROVE" }, ctx(), directory).state;
    expect(state.nodes.md!.status).toBe("ACTIVE");
    state = approveAll(definition, state, "md");
    expect(state.status).toBe("APPROVED");
  });

  it("refuses to start an invalid workflow", () => {
    const broken: WorkflowDefinition = { nodes: [start(), end()], edges: [edge("start", "end")] };
    expect(() => startInstance(broken, ctx(), directory)).toThrowError(/approval step/);
  });
});
