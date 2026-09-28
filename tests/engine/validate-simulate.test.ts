import { describe, expect, it } from "vitest";
import { evaluateCondition } from "@/server/engine/conditions";
import { simulate } from "@/server/engine/simulate";
import { validateWorkflow } from "@/server/engine/validate";
import type { WorkflowDefinition } from "@/server/engine/types";
import { approval, chain, ctx, decision, edge, end, join, makeDirectory, split, start, user } from "../helpers/engine-fixtures";

const codes = (definition: WorkflowDefinition, context = {}) => validateWorkflow(definition, context).errors.map((issue) => issue.code);

describe("conditions", () => {
  it("compares text case-insensitively, numbers from strings, and lists", () => {
    expect(evaluateCondition({ field: "nature", operator: "EQ", value: "Capex" }, { nature: "capex" })).toBe(true);
    expect(evaluateCondition({ field: "amount", operator: "GTE", value: 100000 }, { amount: "100000" })).toBe(true);
    expect(evaluateCondition({ field: "amount", operator: "GT", value: 100000 }, { amount: "abc" })).toBe(false);
    expect(evaluateCondition({ field: "plant", operator: "IN", value: ["Unit 1", "Unit 2"] }, { plant: "unit 2" })).toBe(true);
    expect(evaluateCondition({ field: "plant", operator: "NOT_IN", value: ["Unit 1"] }, { plant: "Unit 3" })).toBe(true);
    expect(evaluateCondition({ field: "note", operator: "IS_EMPTY" }, { note: "  " })).toBe(true);
    expect(evaluateCondition({ field: "note", operator: "IS_NOT_EMPTY" }, {})).toBe(false);
  });

  it("combines AND / OR groups", () => {
    const condition = {
      op: "AND" as const,
      conditions: [
        { field: "amount", operator: "GT" as const, value: 500000 },
        { op: "OR" as const, conditions: [{ field: "nature", operator: "EQ" as const, value: "Capex" }, { field: "urgent", operator: "EQ" as const, value: true }] },
      ],
    };
    expect(evaluateCondition(condition, { amount: 600000, nature: "Opex", urgent: true })).toBe(true);
    expect(evaluateCondition(condition, { amount: 600000, nature: "Opex", urgent: false })).toBe(false);
    expect(evaluateCondition(condition, { amount: 400000, nature: "Capex" })).toBe(false);
  });
});

describe("validator", () => {
  it("accepts a well-formed hybrid workflow", () => {
    const definition: WorkflowDefinition = {
      nodes: [start(), approval("a", [user(3)]), split("s"), approval("b", [user(4)]), approval("c", [user(5)]), join("j"), end()],
      edges: [edge("start", "a"), edge("a", "s"), edge("s", "b"), edge("s", "c"), edge("b", "j"), edge("c", "j"), edge("j", "end")],
    };
    const result = validateWorkflow(definition);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("needs one start, an end and an approval step", () => {
    expect(codes({ nodes: [end()], edges: [] })).toEqual(expect.arrayContaining(["START_COUNT", "NO_APPROVAL_STEP"]));
    expect(codes({ nodes: [start(), approval("a", [user(3)])], edges: [edge("start", "a")] })).toContain("END_MISSING");
  });

  it("finds dead ends and cycles", () => {
    const deadEnd: WorkflowDefinition = { nodes: [start(), approval("a", [user(3)]), approval("b", [user(4)]), end()], edges: [edge("start", "a"), edge("a", "end"), edge("b", "end")] };
    expect(validateWorkflow(deadEnd).warnings.map((w) => w.code)).toContain("UNREACHABLE");

    const cycle: WorkflowDefinition = {
      nodes: [start(), approval("a", [user(3)]), decision("d"), end()],
      edges: [edge("start", "a"), edge("a", "d"), edge("d", "a", { condition: { field: "x", operator: "EQ", value: 1 } }), edge("d", "end", { isDefault: true })],
    };
    expect(codes(cycle)).toContain("CYCLE");
  });

  it("requires exactly one 'otherwise' path on a decision and a condition on the others", () => {
    const noDefault: WorkflowDefinition = {
      nodes: [start(), approval("a", [user(3)]), decision("d"), approval("b", [user(4)]), end()],
      edges: [edge("start", "a"), edge("a", "d"), edge("d", "b", { condition: { field: "x", operator: "GT", value: 1 } }), edge("d", "end"), edge("b", "end")],
    };
    expect(codes(noDefault)).toEqual(expect.arrayContaining(["CONDITION_DEFAULT", "EDGE_CONDITION_MISSING"]));
  });

  it("G-08: rejects conditions that can never be true", () => {
    const impossible: WorkflowDefinition = {
      nodes: [start(), approval("a", [user(3)]), decision("d"), approval("b", [user(4)]), end()],
      edges: [
        edge("start", "a"),
        edge("a", "d"),
        edge("d", "b", { condition: { op: "AND", conditions: [{ field: "amount", operator: "GT", value: 500000 }, { field: "amount", operator: "LT", value: 100000 }] } }),
        edge("d", "end", { isDefault: true }),
        edge("b", "end"),
      ],
    };
    expect(codes(impossible)).toContain("CONDITION_IMPOSSIBLE");
  });

  it("G-09: rejects unknown roles, users, groups and form fields when the context is given", () => {
    const definition = chain(
      approval("a", [{ type: "ROLE", roleCode: "NOPE" }]),
      approval("b", [user(999)]),
      approval("c", [{ type: "GROUP", groupId: 42 }]),
      approval("d", [{ type: "FORM_FIELD_USER", fieldKey: "reviewer" }]),
    );
    expect(codes(definition, { knownRoleCodes: ["FINANCE"], knownUserIds: [3, 4], knownGroupIds: [1], formFieldKeys: ["amount"] })).toEqual(
      expect.arrayContaining(["APPROVER_UNKNOWN_ROLE", "APPROVER_UNKNOWN_USER", "APPROVER_UNKNOWN_GROUP", "APPROVER_UNKNOWN_FIELD"]),
    );
  });

  it("checks any-N and join counts", () => {
    expect(codes(chain(approval("a", [user(3), user(4)], { type: "ANY_N", n: 3 })))).toContain("ANY_N_TOO_HIGH");
    const tooHigh: WorkflowDefinition = {
      nodes: [start(), split("s"), approval("b", [user(4)]), approval("c", [user(5)]), join("j", { type: "ANY_N", n: 3 }), end()],
      edges: [edge("start", "s"), edge("s", "b"), edge("s", "c"), edge("b", "j"), edge("c", "j"), edge("j", "end")],
    };
    expect(codes(tooHigh)).toContain("JOIN_N_TOO_HIGH");
  });

  it("an approval step needs an approver", () => {
    expect(codes(chain(approval("a", [])))).toContain("APPROVERS_MISSING");
  });
});

describe("simulator (test mode)", () => {
  const definition: WorkflowDefinition = {
    nodes: [start(), approval("hod", [{ type: "REQUESTER_DEPARTMENT_HOD" }]), decision("band"), split("s"), approval("fin", [user(4)]), approval("legal", [user(5)]), join("j"), approval("md", [user(8)]), end()],
    edges: [
      edge("start", "hod"),
      edge("hod", "band"),
      edge("band", "s", { condition: { field: "amount", operator: "GT", value: 500000 }, order: 1 }),
      edge("band", "end", { isDefault: true }),
      edge("s", "fin"),
      edge("s", "legal"),
      edge("fin", "j"),
      edge("legal", "j"),
      edge("j", "md"),
      edge("md", "end"),
    ],
  };

  it("shows stages in order, with parallel steps together", () => {
    const result = simulate(definition, ctx({ amount: 1250000 }), makeDirectory());
    expect(result.outcome).toBe("APPROVED");
    expect(result.stages.map((stage) => stage.map((step) => step.nodeId).sort())).toEqual([["hod"], ["fin", "legal"], ["md"]]);
    expect(result.stages[0]![0]!.approverIds).toEqual([3]);
  });

  it("follows the default path for small amounts", () => {
    const result = simulate(definition, ctx({ amount: 1000 }), makeDirectory());
    expect(result.stages.map((stage) => stage.map((step) => step.nodeId))).toEqual([["hod"]]);
    expect(result.branches.some((b) => b.nodeId === "band" && b.isDefault)).toBe(true);
  });

  it("reports a blocked step", () => {
    const result = simulate(chain(approval("x", [{ type: "ROLE", roleCode: "EMPTY" }])), ctx(), makeDirectory());
    expect(result.outcome).toBe("BLOCKED");
    expect(result.blocked.map((b) => b.nodeId)).toEqual(["x"]);
  });
});
