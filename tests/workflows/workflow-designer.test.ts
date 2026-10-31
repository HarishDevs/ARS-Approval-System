import { describe, expect, it } from "vitest";
import { allProblems, duplicateStage, parseLocalDraft, stageProblems, stageSummary } from "@/features/admin/workflow-designer/model";
import type { BuilderStage, BuilderStep } from "@/server/workflows/builder";
import type { FormField } from "@/server/forms/fields";

// D-239: the Workflow Designer's own rules (the server checks again on save).
const form: FormField[] = [
  { key: "amount", label: "Amount", type: "NUMBER", required: true },
  { key: "buyer", label: "Buyer", type: "PERSON", required: false },
];
const context = { form };
const step = (id: string, extra: Partial<BuilderStep> = {}): BuilderStep => ({ id, label: `Step ${id}`, approvers: { kind: "REQUESTER_MANAGER" }, rule: "ALL", ...extra });
let counter = 0;
const newId = () => `n${(counter += 1)}`;

describe("workflow designer", () => {
  it("names each level's problems where they are", () => {
    expect(stageProblems({ kind: "STEP", step: step("a") }, context)).toEqual([]);
    expect(stageProblems({ kind: "STEP", step: step("b", { approvers: { kind: "PEOPLE", userIds: [] } }) }, context)).toEqual(['"Step b": choose at least one person.']);
    expect(stageProblems({ kind: "STEP", step: step("c", { approvers: { kind: "REQUESTER" } }) }, context)).toEqual(['"Step c": the requester can\'t approve their own request.']);
    expect(stageProblems({ kind: "STEP", step: step("d", { type: "WORK", approvers: { kind: "REQUESTER" } }) }, context)).toEqual([]);
    expect(stageProblems({ kind: "STEP", step: step("e", { approvers: { kind: "FORM_FIELD_USER", fieldKey: "amount" } }) }, context)).toEqual(['"Step e": choose the person field.']);
    expect(stageProblems({ kind: "STEP", step: step("f", { approvers: { kind: "PEOPLE", userIds: [1] }, rule: "ANY_N", n: 2 }) }, context)).toEqual(['"Step f": N is more than the people chosen.']);
    expect(stageProblems({ kind: "STEP", step: step("g", { skipWhen: { field: "gone", operator: "IS_EMPTY" } }) }, context)).toEqual(['"Step g" skip rule: choose a field that is on the form.']);
  });

  it("checks parallel steps, choices (with their paths) and the DoA matrix", () => {
    expect(stageProblems({ kind: "PARALLEL", id: "p", label: "Both", join: "ANY_N", n: 3, steps: [step("x"), step("y")] }, context)).toEqual(['"Both": N is more than the branches.']);
    const choice: BuilderStage = { kind: "BRANCH", id: "b", label: "Big", condition: { field: "amount", operator: "GT", value: 5 }, then: [{ kind: "STEP", step: step("z", { approvers: { kind: "PEOPLE", userIds: [] } }) }], otherwise: [] };
    expect(stageProblems(choice, context)).toEqual(['"Step z": choose at least one person.']);
    const doa: BuilderStage = { kind: "DOA", id: "d", label: "DoA", field: "amount", limits: [100, 50], levels: [{ step: step("l1"), bands: [true, false, false] }] };
    expect(stageProblems(doa, context)).toEqual(['"DoA": limits must go up from left to right.', '"DoA": every amount band needs a ticked level.']);
    expect(allProblems([], context)).toBe(1); // a flow needs at least one level
  });

  it("summarises a level in one line", () => {
    expect(stageSummary({ kind: "STEP", step: step("s", { approvers: { kind: "PEOPLE", userIds: [1, 2] }, rule: "ANY_ONE", slaHours: 24 }) })).toBe("Approval · 2 people · any one · 24 h");
    expect(stageSummary({ kind: "PARALLEL", id: "p", label: "P", join: "ALL", steps: [step("x"), step("y")] })).toBe("2 at once · all finish");
  });

  it("duplicates with fresh ids everywhere, leaving the original alone", () => {
    const original: BuilderStage = { kind: "BRANCH", id: "b", label: "Big", condition: { field: "amount", operator: "GT", value: 5 }, then: [{ kind: "PARALLEL", id: "p", label: "Both", join: "ALL", steps: [step("x"), step("y")] }], otherwise: [{ kind: "STEP", step: step("z") }] };
    const copy = duplicateStage(original, newId);
    const ids = (stage: unknown): string[] => JSON.stringify(stage).match(/"id":"[^"]+"/g) ?? [];
    expect(ids(copy).some((id) => ids(original).includes(id))).toBe(false);
    expect(copy.kind === "BRANCH" && copy.label).toBe("Big (copy)");
    expect(original.kind === "BRANCH" && original.then[0]!.kind === "PARALLEL" && original.then[0]!.steps[0]!.id).toBe("x");
  });

  it("offers a kept browser copy only for the same version", () => {
    const raw = JSON.stringify({ base: "7-v3", savedAt: 1, stages: [], form: [] });
    expect(parseLocalDraft(raw, "7-v3")).toMatchObject({ base: "7-v3" });
    expect(parseLocalDraft(raw, "7-v4")).toBeNull();
    expect(parseLocalDraft("{not json", "7-v3")).toBeNull();
    expect(parseLocalDraft(null, "7-v3")).toBeNull();
  });
});
