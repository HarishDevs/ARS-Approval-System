import { describe, expect, it } from "vitest";
import { builderSpecSchema, checkDoaForm, compileBuilder, doaBandIndex, doaBandLabels, doaSkipCondition, newDoaStage, newStep, type BuilderSpec } from "@/server/workflows/builder";
import { buildStepMap } from "@/server/approvals/step-map";
import { deriveDoaTable } from "@/server/workflows/doa";
import { simulate, startInstance, validateWorkflow } from "@/server/engine";
import type { FormField } from "@/server/forms/fields";
import { ctx, makeDirectory } from "../helpers/engine-fixtures";

// DoA matrix per approval type (D-075, F-58).
const directory = makeDirectory();
const person = (id: string, label: string, userId: number) => ({ ...newStep(id, label), approvers: { kind: "PEOPLE" as const, userIds: [userId] } });
const AMOUNT: FormField = { key: "amount", label: "Amount (₹)", type: "NUMBER", required: true };

// Manager first (ordinary level), then the DoA: HOD always; ED above ₹1L;
// MD only above ₹10L; CFO only in the middle band (not cumulative).
const spec: BuilderSpec = {
  stages: [
    { kind: "STEP", step: person("mgr", "Manager", 2) },
    {
      kind: "DOA",
      id: "doa",
      label: "Purchase DoA",
      field: "amount",
      limits: [100000, 1000000],
      levels: [
        { step: person("hod", "HOD", 3), bands: [true, true, true] },
        { step: person("ed", "ED", 7), bands: [false, true, true] },
        { step: person("cfo", "CFO", 9), bands: [false, true, false] },
        { step: person("md", "MD", 8), bands: [false, false, true] },
      ],
    },
  ],
};

function compiled(input: BuilderSpec = spec) {
  const result = compileBuilder(builderSpecSchema.parse(input));
  if (!result.ok) throw new Error(result.errors.join("; "));
  return result.definition;
}

const routeAt = (amount: number) =>
  simulate(compiled(), ctx({ amount }), directory)
    .stages.flat()
    .map((step) => step.label);

describe("DoA bands", () => {
  it("labels and finds bands; the upper limit is inclusive", () => {
    expect(doaBandLabels([100000, 1000000])).toEqual(["Up to ₹1,00,000", "₹1,00,001 to ₹10,00,000", "Above ₹10,00,000"]);
    expect([0, 100000, 100001, 1000000, 1000001].map((amount) => doaBandIndex([100000, 1000000], amount))).toEqual([0, 0, 1, 1, 2]);
  });

  it("builds the smallest skip condition for each level", () => {
    expect(doaSkipCondition("amount", [100, 200], [true, true, true])).toBeNull();
    expect(doaSkipCondition("amount", [100, 200], [false, true, true])).toEqual({ field: "amount", operator: "LTE", value: 100 });
    expect(doaSkipCondition("amount", [100, 200], [false, false, true])).toEqual({ field: "amount", operator: "LTE", value: 200 });
    expect(doaSkipCondition("amount", [100, 200], [true, true, false])).toEqual({ field: "amount", operator: "GT", value: 200 });
    expect(doaSkipCondition("amount", [100, 200], [true, false, true])).toEqual({
      op: "AND",
      conditions: [
        { field: "amount", operator: "GT", value: 100 },
        { field: "amount", operator: "LTE", value: 200 },
      ],
    });
    expect(doaSkipCondition("amount", [100, 200], [false, true, false])).toEqual({
      op: "OR",
      conditions: [
        { field: "amount", operator: "LTE", value: 100 },
        { field: "amount", operator: "GT", value: 200 },
      ],
    });
  });
});

describe("a DoA matrix on the engine", () => {
  it("compiles to one approval step per level and validates", () => {
    const definition = compiled();
    expect(definition.nodes.filter((node) => node.kind === "APPROVAL").map((node) => node.id)).toEqual(["step_mgr", "step_hod", "step_ed", "step_cfo", "step_md"]);
    expect(validateWorkflow(definition, { formFieldKeys: ["amount"] }).errors).toEqual([]);
  });

  it("routes by band, at every edge", () => {
    expect(routeAt(100000)).toEqual(["Manager", "HOD"]);
    expect(routeAt(100001)).toEqual(["Manager", "HOD", "ED", "CFO"]);
    expect(routeAt(1000000)).toEqual(["Manager", "HOD", "ED", "CFO"]);
    expect(routeAt(1000001)).toEqual(["Manager", "HOD", "ED", "MD"]);
  });

  it("the DoA view reads the matrix", () => {
    expect(deriveDoaTable(builderSpecSchema.parse(spec)).bands).toEqual([
      { from: 0, to: 100000, levels: ["Manager", "HOD"] },
      { from: 100001, to: 1000000, levels: ["Manager", "HOD", "ED", "CFO"] },
      { from: 1000001, to: null, levels: ["Manager", "HOD", "ED", "MD"] },
    ]);
  });

  it("the request map says a level isn't needed at this amount", () => {
    const definition = compiled();
    const state = startInstance(definition, ctx({ amount: 50000 }), directory).state;
    const map = buildStepMap(definition, state, builderSpecSchema.parse(spec), new Map(), { formData: { amount: 50000 } });
    expect(map.map((stage) => stage.label)).toEqual(["Manager", "HOD", "ED", "CFO", "MD"]);
    expect(map[2]!.steps[0]).toMatchObject({ status: "SKIPPED", reason: "Not needed at this amount (DoA)" });
  });
});

describe("DoA checks", () => {
  const doa = (patch: object) => ({ stages: [{ ...spec.stages[1]!, ...patch }] });

  it("refuses falling limits, an empty band, a level with no band, and a second matrix", () => {
    expect(builderSpecSchema.safeParse(doa({ limits: [1000000, 100000] })).success).toBe(false);
    const emptyBand = builderSpecSchema.safeParse(doa({ levels: [{ step: person("x", "X", 3), bands: [true, false, true] }] }));
    expect(emptyBand.success).toBe(false);
    expect(JSON.stringify(emptyBand.error)).toContain("Nobody approves in the band");
    expect(builderSpecSchema.safeParse(doa({ levels: [{ step: person("x", "X", 3), bands: [true, true, true] }, { step: person("y", "Y", 7), bands: [false, false, false] }] })).success).toBe(false);
    expect(builderSpecSchema.safeParse({ stages: [spec.stages[1], { ...spec.stages[1], id: "doa2" }] }).success).toBe(false);
  });

  it("the amount field must be on the form, a number, and required", () => {
    const parsed = builderSpecSchema.parse(spec);
    expect(checkDoaForm(parsed, [AMOUNT])).toEqual([]);
    expect(checkDoaForm(parsed, [])).toEqual(['The DoA reads "amount", which isn\'t on the form. Add a number field with that key.']);
    expect(checkDoaForm(parsed, [{ ...AMOUNT, required: false }])[0]).toContain("Make \"Amount (₹)\" required");
    expect(checkDoaForm(parsed, [{ ...AMOUNT, type: "TEXT" }])[0]).toContain("must be a number field");
  });

  it("a fresh matrix is valid as it comes", () => {
    let n = 0;
    expect(builderSpecSchema.safeParse({ stages: [newDoaStage(() => `x${++n}`)] }).success).toBe(true);
  });
});
