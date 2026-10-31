// Auditor probes (DB prefix). Pure engine calls only: no database, no server.
import { describe, expect, it } from "vitest";
import { decide, resubmit, startInstance, resolveBlocked } from "@/server/engine/engine";
import { routeChanged } from "@/server/engine/conditions";
import type { InstanceState, WorkflowDefinition } from "@/server/engine/types";
import { approval, chain, ctx, makeDirectory, user, start, end, edge, decision } from "../../../../tests/helpers/engine-fixtures";

const dir = makeDirectory();
const pending = (s: InstanceState, node: string) => s.tasks.filter((t) => t.nodeId === node && t.status === "PENDING");
const approveAll = (d: WorkflowDefinition, s: InstanceState, node: string, form = {}, req = 1) => {
  for (const t of pending(s, node)) s = decide(d, s, { taskId: t.id, actorId: t.approverId, decision: "APPROVE" }, ctx(form, req), dir).state;
  return s;
};

describe("DB-P1 DoA/skip level on resubmit (Q-022 / AUD-02)", () => {
  // manager -> senior (skipped when amount <= 1,000,000) -> md
  const def = chain(
    approval("manager", [{ type: "REQUESTER_MANAGER" }]),
    approval("senior", [user(7)], { type: "ALL" }, { skipIf: { field: "amount", operator: "LTE", value: 1000000 } }),
    approval("md", [user(8)]),
  );
  it("engine alone (REQUESTING_STEP) keeps the skipped senior level skipped after the amount rises", () => {
    let s = startInstance(def, ctx({ amount: 5000 }), dir).state;
    s = approveAll(def, s, "manager", { amount: 5000 });
    expect(s.nodes.senior!.status).toBe("SKIPPED");
    const t = pending(s, "md")[0]!;
    s = decide(def, s, { taskId: t.id, actorId: 8, decision: "REQUEST_CHANGES", comment: "fix" }, ctx({ amount: 5000 }), dir).state;
    const r = resubmit(def, s, "REQUESTING_STEP", ctx({ amount: 5000000 }), dir).state;
    expect(r.nodes.senior!.status).toBe("SKIPPED"); // so the guard must come from the service
  });
  it("service guard: routeChanged() detects it, and BEGINNING restores the senior level", () => {
    expect(routeChanged(def, { amount: 5000 }, { amount: 5000000 })).toBe(true);
    let s = startInstance(def, ctx({ amount: 5000 }), dir).state;
    s = approveAll(def, s, "manager", { amount: 5000 });
    const t = pending(s, "md")[0]!;
    s = decide(def, s, { taskId: t.id, actorId: 8, decision: "REQUEST_CHANGES", comment: "fix" }, ctx({ amount: 5000 }), dir).state;
    let r = resubmit(def, s, "BEGINNING", ctx({ amount: 5000000 }), dir).state;
    r = approveAll(def, r, "manager", { amount: 5000000 });
    expect(r.nodes.senior!.status).toBe("ACTIVE");
  });
});

describe("DB-P2 conditional branch change on resubmit", () => {
  const def: WorkflowDefinition = {
    nodes: [start(), decision("c"), approval("small", [user(7)]), approval("big", [user(8)]), end()],
    edges: [
      edge("start", "c"),
      edge("c", "big", { condition: { field: "amount", operator: "GT", value: 100 } }),
      edge("c", "small", { isDefault: true }),
      edge("small", "end"),
      edge("big", "end"),
    ],
  };
  it("routeChanged() flags a branch flip", () => {
    expect(routeChanged(def, { amount: 50 }, { amount: 500 })).toBe(true);
  });
});

describe("DB-P3 approver chosen in a form field changes on resubmit", () => {
  const def = chain(approval("picked", [{ type: "FORM_FIELD_USER", fieldKey: "approver" }]), approval("md", [user(8)]));
  it("routeChanged() is false, so REQUESTING_STEP keeps the earlier approval by the previously chosen person", () => {
    let s = startInstance(def, ctx({ approver: 7 }), dir).state;
    s = approveAll(def, s, "picked", { approver: 7 });
    const t = pending(s, "md")[0]!;
    s = decide(def, s, { taskId: t.id, actorId: 8, decision: "REQUEST_CHANGES", comment: "fix" }, ctx({ approver: 7 }), dir).state;
    expect(routeChanged(def, { approver: 7 }, { approver: 4 })).toBe(false);
    const r = resubmit(def, s, "REQUESTING_STEP", ctx({ approver: 4 }), dir).state;
    expect(r.nodes.picked!.status).toBe("APPROVED"); // approved by 7 while the form now names 4
    expect(r.tasks.find((x) => x.nodeId === "picked" && x.status === "APPROVED")!.approverId).toBe(7);
  });
});

describe("DB-P4 self-exclusion and onNoApprover", () => {
  const noManager = makeDirectory({ managerOf: () => null });
  it("BLOCK (default): a step with nobody left blocks, it is not skipped", () => {
    const def = chain(approval("m", [{ type: "REQUESTER_MANAGER" }]));
    const s = startInstance(def, ctx({}), noManager).state;
    expect(s.status).toBe("IN_PROGRESS");
    expect(s.nodes.m!.status).toBe("BLOCKED");
  });
  it("SKIP: every approval step skipped -> APPROVED at submit with zero decisions", () => {
    const def = chain(approval("m", [{ type: "REQUESTER_MANAGER" }], { type: "ALL" }, { onNoApprover: "SKIP" }));
    const s = startInstance(def, ctx({}), noManager).state;
    expect(s.status).toBe("APPROVED");
    expect(s.tasks.length).toBe(0);
  });
  it("SKIP: requester is the only member of the group -> step skipped, request APPROVED", () => {
    const soleMember = makeDirectory({ groupMembers: () => [1] });
    const def = chain(approval("g", [{ type: "GROUP", groupId: 9 }], { type: "ANY_ONE" }, { onNoApprover: "SKIP" }));
    const s = startInstance(def, ctx({}, 1), soleMember).state;
    expect(s.status).toBe("APPROVED");
    expect(s.tasks.length).toBe(0);
  });
  it("inactive approver at activation is filtered out -> BLOCKED by default", () => {
    const def = chain(approval("x", [user(11)]));
    expect(startInstance(def, ctx({}), dir).state.nodes.x!.status).toBe("BLOCKED");
  });
  it("ANY_N needing more people than resolve -> BLOCKED, not skipped", () => {
    const def = chain(approval("f", [{ type: "ROLE", roleCode: "FINANCE" }], { type: "ANY_N", n: 4 }));
    expect(startInstance(def, ctx({}), dir).state.nodes.f!.status).toBe("BLOCKED");
  });
});

describe("DB-P5 nobody approves their own request", () => {
  it("a requester who is the approver's delegate cannot decide", () => {
    const def = chain(approval("ed", [user(7)]));
    const s = startInstance(def, ctx({}, 12), dir).state; // 12 may act for 7
    const t = pending(s, "ed")[0]!;
    expect(() => decide(def, s, { taskId: t.id, actorId: 12, decision: "APPROVE" }, ctx({}, 12), dir)).toThrow();
  });
  it("a requester inside a ROLE source is excluded from the tasks", () => {
    const def = chain(approval("f", [{ type: "ROLE", roleCode: "FINANCE" }], { type: "ANY_ONE" }));
    const s = startInstance(def, ctx({}, 4), dir).state;
    expect(pending(s, "f").map((t) => t.approverId)).toEqual([5, 6]);
  });
  it("IT 'ASSIGN' on a blocked step refuses the requester", () => {
    const def = chain(approval("x", [user(11)]));
    const s = startInstance(def, ctx({}), dir).state;
    expect(() => resolveBlocked(def, s, { nodeId: "x", actorId: 99, reason: "r", action: "ASSIGN", userIds: [1] }, ctx({}), dir)).toThrow();
  });
});

describe("DB-P6 IT recovery of a blocked step on the IT person's OWN request", () => {
  // Requester 1 is (say) an IT Admin; the service checks only isAdmin(actor) (server/approvals/service.ts resolveBlockedStep).
  it("SKIP by the requester themself is accepted by the engine and the request ends APPROVED", () => {
    const def = chain(approval("x", [user(11)])); // 11 is inactive -> BLOCKED
    const s = startInstance(def, ctx({}, 1), dir).state;
    expect(s.nodes.x!.status).toBe("BLOCKED");
    const r = resolveBlocked(def, s, { nodeId: "x", actorId: 1, reason: "moving on", action: "SKIP" }, ctx({}, 1), dir).state;
    expect(r.status).toBe("APPROVED");
    expect(r.tasks.length).toBe(0);
  });
  it("RETRY / ASSIGN still refuse the requester as approver (contrast)", () => {
    const def = chain(approval("x", [user(11)]));
    const s = startInstance(def, ctx({}, 1), dir).state;
    expect(() => resolveBlocked(def, s, { nodeId: "x", actorId: 1, reason: "r", action: "ASSIGN", userIds: [1] }, ctx({}, 1), dir)).toThrow();
  });
});

void end;
