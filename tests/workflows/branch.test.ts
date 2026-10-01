import { describe, expect, it } from "vitest";
import { builderSpecSchema, compileBuilder, newStep, type BuilderSpec } from "@/server/workflows/builder";
import { buildStepMap } from "@/server/approvals/step-map";
import { deriveDoaTable } from "@/server/workflows/doa";
import { decide, simulate, startInstance, validateWorkflow } from "@/server/engine";
import { ctx, makeDirectory } from "../helpers/engine-fixtures";

const directory = makeDirectory();

// HOD → choice(amount > ₹5L: ED → MD, otherwise: Finance) → Purchase
const spec: BuilderSpec = {
  stages: [
    { kind: "STEP", step: { ...newStep("hod", "HOD"), approvers: { kind: "PEOPLE", userIds: [3] } } },
    {
      kind: "BRANCH",
      id: "big",
      label: "Amount check",
      condition: { field: "amount", operator: "GT", value: 500000 },
      then: [
        { kind: "STEP", step: { ...newStep("ed", "ED"), approvers: { kind: "PEOPLE", userIds: [7] } } },
        { kind: "STEP", step: { ...newStep("md", "MD"), approvers: { kind: "PEOPLE", userIds: [8] } } },
      ],
      otherwise: [{ kind: "STEP", step: { ...newStep("fin", "Finance"), approvers: { kind: "PEOPLE", userIds: [4] } } }],
    },
    { kind: "STEP", step: { ...newStep("pur", "Purchase"), approvers: { kind: "PEOPLE", userIds: [6] } } },
  ],
};

function compiled(input: BuilderSpec = spec) {
  const result = compileBuilder(builderSpecSchema.parse(input));
  if (!result.ok) throw new Error(result.errors.join("; "));
  return result.definition;
}

describe("choices in the builder (D-068)", () => {
  it("compiles to a CONDITION node with one condition edge and one otherwise edge, and validates", () => {
    const definition = compiled();
    const choice = definition.nodes.find((node) => node.id === "choice_big");
    expect(choice?.kind).toBe("CONDITION");
    const out = definition.edges.filter((edge) => edge.from === "choice_big");
    expect(out.map((edge) => [edge.to, Boolean(edge.condition), Boolean(edge.isDefault)])).toEqual([
      ["step_ed", true, false],
      ["step_fin", false, true],
    ]);
    // Both paths carry on to Purchase.
    expect(definition.edges.filter((edge) => edge.to === "step_pur").map((edge) => edge.from).sort()).toEqual(["step_fin", "step_md"]);
    expect(validateWorkflow(definition).errors).toEqual([]);
  });

  it("takes the right path on the engine", () => {
    const definition = compiled();
    const big = simulate(definition, ctx({ amount: 1250000 }), directory);
    expect(big.stages.flat().map((step) => step.label)).toEqual(["HOD", "ED", "MD", "Purchase"]);
    const small = simulate(definition, ctx({ amount: 50000 }), directory);
    expect(small.stages.flat().map((step) => step.label)).toEqual(["HOD", "Finance", "Purchase"]);
    expect(small.outcome).toBe("APPROVED");
  });

  it("an empty path goes straight on", () => {
    const definition = compiled({
      stages: [
        { kind: "STEP", step: { ...newStep("a", "A"), approvers: { kind: "PEOPLE", userIds: [3] } } },
        { kind: "BRANCH", id: "c", label: "C", condition: { field: "amount", operator: "GT", value: 100 }, then: [{ kind: "STEP", step: { ...newStep("x", "X"), approvers: { kind: "PEOPLE", userIds: [7] } } }], otherwise: [] },
      ],
    });
    expect(validateWorkflow(definition).errors).toEqual([]);
    expect(simulate(definition, ctx({ amount: 5 }), directory).stages.flat().map((step) => step.label)).toEqual(["A"]);
    expect(simulate(definition, ctx({ amount: 500 }), directory).stages.flat().map((step) => step.label)).toEqual(["A", "X"]);
  });

  it("refuses a choice with no levels on either path", () => {
    expect(builderSpecSchema.safeParse({ stages: [{ kind: "BRANCH", id: "c", label: "C", condition: { field: "amount", operator: "GT", value: 1 }, then: [], otherwise: [] }] }).success).toBe(false);
  });

  it("the level map shows the path taken and marks the other not taken", () => {
    const definition = compiled();
    let state = startInstance(definition, ctx({ amount: 50000 }), directory).state;
    const hod = state.tasks.find((task) => task.nodeId === "step_hod")!;
    state = decide(definition, state, { taskId: hod.id, actorId: 3, decision: "APPROVE" }, ctx({ amount: 50000 }), directory).state;
    const map = buildStepMap(definition, state, builderSpecSchema.parse(spec), new Map(), { formData: { amount: 50000 }, fieldLabel: () => "Amount" });
    const choice = map[1]!;
    expect(choice.kind).toBe("CHOICE");
    expect(choice.label).toBe("Amount check: if Amount is more than 5,00,000");
    expect(choice.paths!.map((path) => path.taken)).toEqual([false, true]);
    expect(choice.paths![0]!.stages[0]!.steps[0]!.notTaken).toBe(true);
    expect(choice.paths![1]!.stages[0]!.steps[0]).toMatchObject({ label: "Finance", status: "ACTIVE" });
  });

  it("the DoA view follows amount choices", () => {
    expect(deriveDoaTable(builderSpecSchema.parse(spec)).bands).toEqual([
      { from: 0, to: 500000, levels: ["HOD", "Finance", "Purchase"] },
      { from: 500001, to: null, levels: ["HOD", "ED", "MD", "Purchase"] },
    ]);
  });
});
