import { describe, expect, it } from "vitest";
import { builderSpecSchema, compileBuilder, newStep, toSources, type BuilderSpec } from "@/server/workflows/builder";
import { buildStepMap, describeRule, peopleInState } from "@/server/approvals/step-map";
import { decide, simulate, startInstance, validateWorkflow } from "@/server/engine";
import type { InstanceState } from "@/server/engine";
import { checkFormDefinition, displayValue, parseFormSubmission, type FormField } from "@/server/forms/fields";
import { ctx, makeDirectory } from "../helpers/engine-fixtures";

const directory = makeDirectory();

// Manager → parallel(HOD, Finance any-one of role, join ALL) → ED skipped at or below ₹5L → MD
const spec: BuilderSpec = {
  stages: [
    { kind: "STEP", step: { id: "mgr", label: "Manager", approvers: { kind: "REQUESTER_MANAGER" }, rule: "ALL" } },
    {
      kind: "PARALLEL",
      id: "checks",
      label: "HOD and Finance",
      join: "ALL",
      steps: [
        { id: "hod", label: "HOD", approvers: { kind: "REQUESTER_DEPARTMENT_HOD" }, rule: "ALL" },
        { id: "fin", label: "Finance", approvers: { kind: "ROLE", roleCode: "FINANCE" }, rule: "ANY_ONE" },
      ],
    },
    { kind: "STEP", step: { id: "ed", label: "ED", approvers: { kind: "PEOPLE", userIds: [7] }, rule: "ALL", skipWhen: { field: "amount", operator: "LTE", value: 500000 } } },
    { kind: "STEP", step: { id: "md", label: "MD", approvers: { kind: "PEOPLE", userIds: [8] }, rule: "ALL" } },
  ],
};

function compiled() {
  const result = compileBuilder(builderSpecSchema.parse(spec));
  if (!result.ok) throw new Error(result.errors.join("; "));
  return result.definition;
}

describe("builder → graph (D-056)", () => {
  it("produces a graph the validator accepts", () => {
    expect(validateWorkflow(compiled()).errors).toEqual([]);
  });

  it("parallel stages become SPLIT → steps → JOIN with the join rule", () => {
    const definition = compiled();
    expect(definition.nodes.map((node) => `${node.kind}:${node.id}`)).toEqual([
      "START:start",
      "APPROVAL:step_mgr",
      "SPLIT:par_checks_split",
      "APPROVAL:step_hod",
      "APPROVAL:step_fin",
      "JOIN:par_checks_join",
      "APPROVAL:step_ed",
      "APPROVAL:step_md",
      "END:end",
    ]);
    const join = definition.nodes.find((node) => node.id === "par_checks_join");
    expect(join).toMatchObject({ completion: { type: "ALL" } });
    expect(definition.edges.filter((edge) => edge.to === "par_checks_join").map((edge) => edge.from).sort()).toEqual(["step_fin", "step_hod"]);
  });

  it("runs on the engine: ₹12.5L includes the ED, ₹75k skips it", () => {
    const definition = compiled();
    const big = simulate(definition, ctx({ amount: 1250000 }), directory);
    expect(big.stages.map((stage) => stage.map((step) => step.nodeId).sort())).toEqual([["step_mgr"], ["step_fin", "step_hod"], ["step_ed"], ["step_md"]]);
    const small = simulate(definition, ctx({ amount: 75000 }), directory);
    expect(small.stages.flat().map((step) => step.nodeId)).not.toContain("step_ed");
    expect(small.skipped.map((step) => step.nodeId)).toEqual(["step_ed"]);
  });

  it("maps every approver source", () => {
    expect(toSources({ kind: "PEOPLE", userIds: [1, 2] })).toEqual([{ type: "USER", userId: 1 }, { type: "USER", userId: 2 }]);
    expect(toSources({ kind: "REQUESTER_MANAGERS_MANAGER" })).toEqual([{ type: "REQUESTER_MANAGERS_MANAGER" }]);
    expect(toSources({ kind: "DEPARTMENT_HOD", departmentId: 10 })).toEqual([{ type: "DEPARTMENT_HOD", departmentId: 10 }]);
    expect(toSources({ kind: "GROUP", groupId: 1 })).toEqual([{ type: "GROUP", groupId: 1 }]);
    expect(toSources({ kind: "FORM_FIELD_USER", fieldKey: "reviewer" })).toEqual([{ type: "FORM_FIELD_USER", fieldKey: "reviewer" }]);
  });

  it("any-N steps and joins carry N", () => {
    const result = compileBuilder({
      stages: [
        { kind: "STEP", step: { ...newStep("c"), approvers: { kind: "PEOPLE", userIds: [4, 5, 6] }, rule: "ANY_N", n: 2 } },
        { kind: "PARALLEL", id: "p", label: "Heads", join: "ANY_N", n: 2, steps: [newStep("a"), newStep("b"), newStep("d")] },
      ],
    });
    if (!result.ok) throw new Error();
    expect(result.definition.nodes.find((node) => node.id === "step_c")).toMatchObject({ completion: { type: "ANY_N", n: 2 } });
    expect(result.definition.nodes.find((node) => node.id === "par_p_join")).toMatchObject({ completion: { type: "ANY_N", n: 2 } });
  });

  it("rejects duplicate ids and bad specs", () => {
    expect(compileBuilder({ stages: [{ kind: "STEP", step: newStep("x") }, { kind: "STEP", step: newStep("x") }] })).toMatchObject({ ok: false });
    expect(builderSpecSchema.safeParse({ stages: [] }).success).toBe(false);
    expect(builderSpecSchema.safeParse({ stages: [{ kind: "PARALLEL", id: "p", label: "P", join: "ALL", steps: [newStep("a")] }] }).success).toBe(false);
    expect(builderSpecSchema.safeParse({ stages: [{ kind: "STEP", step: { ...newStep("a"), approvers: { kind: "PEOPLE", userIds: [] } } }] }).success).toBe(false);
  });
});

describe("step map (S3-05b)", () => {
  const names = new Map([
    [2, "Manager"],
    [3, "HOD"],
    [4, "Fin A"],
    [5, "Fin B"],
    [6, "Fin C"],
    [7, "ED"],
    [8, "MD"],
  ]);

  it("shows every stage, parallel branches together, with people and statuses", () => {
    const definition = compiled();
    let state: InstanceState = startInstance(definition, ctx({ amount: 75000 }), directory).state;
    const mgr = state.tasks.find((task) => task.nodeId === "step_mgr")!;
    state = decide(definition, state, { taskId: mgr.id, actorId: 2, decision: "APPROVE" }, ctx({ amount: 75000 }), directory).state;

    const map = buildStepMap(definition, state, builderSpecSchema.parse(spec), names);
    expect(map.map((stage) => `${stage.kind}:${stage.label}`)).toEqual(["STEP:Manager", "PARALLEL:HOD and Finance", "STEP:ED", "STEP:MD"]);
    expect(map[0]!.steps[0]).toMatchObject({ status: "APPROVED", people: [{ name: "Manager", status: "APPROVED" }] });
    expect(map[1]!.joinRule).toBe("All branches must finish");
    expect(map[1]!.steps.map((step) => step.status)).toEqual(["ACTIVE", "ACTIVE"]);
    expect(map[1]!.steps[1]!.rule).toBe("Any one of 3");
    expect(map[1]!.steps[1]!.people.map((person) => person.name)).toEqual(["Fin A", "Fin B", "Fin C"]);
    expect(map[2]!.steps[0]).toMatchObject({ status: "WAITING", people: [] });
  });

  it("falls back to graph order without a builder spec, and explains skipped/blocked steps", () => {
    const definition = compiled();
    const state = startInstance(definition, ctx({ amount: 1000 }), makeDirectory({ managerOf: () => null })).state;
    const map = buildStepMap(definition, state, null, names);
    expect(map.map((stage) => stage.label)).toEqual(["Manager", "HOD", "Finance", "ED", "MD"]);
    expect(map[0]!.steps[0]).toMatchObject({ status: "BLOCKED", reason: expect.stringContaining("no eligible approver") });
    expect(peopleInState(state)).toEqual([]);
  });

  it("describes rules in plain words", () => {
    expect(describeRule({ type: "ALL" }, 1)).toBe("Must approve");
    expect(describeRule({ type: "ALL" }, 3)).toBe("All 3 must approve");
    expect(describeRule({ type: "ANY_N", n: 2 }, 4)).toBe("Any 2 of 4");
  });
});

describe("form fields (D-055)", () => {
  const fields: FormField[] = [
    { key: "amount", label: "Amount", type: "NUMBER", required: true },
    { key: "nature", label: "Nature", type: "CHOICE", required: true, options: ["Capex", "Opex"] },
    { key: "needed_by", label: "Needed by", type: "DATE", required: false },
    { key: "reviewer", label: "Reviewer", type: "PERSON", required: false },
    { key: "notes", label: "Notes", type: "LONG_TEXT", required: false },
  ];

  it("parses Indian number grouping, dates, choices and people", () => {
    const result = parseFormSubmission(fields, { amount: "₹12,50,000", nature: "Capex", needed_by: "2026-10-15", reviewer: "3", notes: "" }, new Set([3]));
    expect(result).toEqual({ ok: true, data: { amount: 1250000, nature: "Capex", needed_by: "2026-10-15", reviewer: 3 } });
  });

  it("reports every problem at once", () => {
    const result = parseFormSubmission(fields, { amount: "abc", nature: "Other", needed_by: "2026-02-30", reviewer: "99" }, new Set([3]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(["amount", "nature", "needed_by", "reviewer"]);
    expect(parseFormSubmission(fields, {}, new Set())).toMatchObject({ ok: false, errors: { amount: "Amount is required.", nature: "Nature is required." } });
  });

  it("checks the form definition", () => {
    expect(checkFormDefinition(fields)).toEqual([]);
    expect(checkFormDefinition([...fields, { key: "amount", label: "Again", type: "TEXT", required: false }])).toEqual(['Two fields use the key "amount".']);
    expect(checkFormDefinition([{ key: "x", label: "X", type: "CHOICE", required: true, options: ["only"] }])).toHaveLength(1);
  });

  it("displays stored values", () => {
    expect(displayValue(fields[0]!, 1250000, new Map())).toBe("12,50,000");
    expect(displayValue(fields[3]!, 3, new Map([[3, "HOD"]]))).toBe("HOD");
    expect(displayValue(fields[4]!, undefined, new Map())).toBe("—");
  });
});

describe("timeline wording and resubmitted maps", () => {
  it("keeps the approver of a step finished in an earlier round", async () => {
    const { resubmit } = await import("@/server/engine");
    const definition = compiled();
    let state: InstanceState = startInstance(definition, ctx({ amount: 1000 }), directory).state;
    const mgr = state.tasks.find((task) => task.nodeId === "step_mgr")!;
    state = decide(definition, state, { taskId: mgr.id, actorId: 2, decision: "APPROVE" }, ctx({ amount: 1000 }), directory).state;
    const hodTask = state.tasks.find((task) => task.nodeId === "step_hod" && task.status === "PENDING")!;
    state = decide(definition, state, { taskId: hodTask.id, actorId: 3, decision: "REQUEST_CHANGES", comment: "More detail" }, ctx({ amount: 1000 }), directory).state;
    state = resubmit(definition, state, "REQUESTING_STEP", ctx({ amount: 1000 }), directory).state;
    const map = buildStepMap(definition, state, builderSpecSchema.parse(spec), new Map([[2, "Manager"]]));
    expect(state.round).toBe(2);
    expect(map[0]!.steps[0]!.people).toEqual([expect.objectContaining({ name: "Manager", status: "APPROVED" })]);
  });

  it("describes events in plain sentences and hides bookkeeping", async () => {
    const { describeEvent } = await import("@/server/approvals/timeline");
    const label = (id: string) => ({ step_hod: "HOD" })[id] ?? id;
    const name = (id: number) => ({ 3: "Asha", 7: "Ravi" })[id] ?? `#${id}`;
    expect(describeEvent({ type: "TASK_DECIDED", taskId: "t1", nodeId: "step_hod", decision: "APPROVE", actorId: 7, onBehalfOf: 3 }, label, name)).toBe('Approved by Ravi for Asha at "HOD"');
    expect(describeEvent({ type: "CHANGES_REQUESTED", nodeId: "step_hod", actorId: 3, comment: "Add quotes" }, label, name)).toBe("Asha asked for changes: Add quotes");
    expect(describeEvent({ type: "TASK_DECIDED", taskId: "t1", nodeId: "step_hod", decision: "REQUEST_CHANGES", actorId: 3 }, label, name)).toBeNull();
    expect(describeEvent({ type: "BRANCH_TAKEN", nodeId: "c", edgeId: "e", isDefault: true }, label, name)).toBeNull();
    expect(describeEvent({ type: "SUBMITTED", requestNo: "PUR-2026-000001" }, label, name)).toBe("Submitted as PUR-2026-000001");
  });
});
