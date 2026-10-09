import { describe, expect, it } from "vitest";
import { builderSpecSchema, compileBuilder, newStep, toCondition, type BuilderSpec } from "@/server/workflows/builder";
import { buildStepMap, describeBuilderCondition } from "@/server/approvals/step-map";
import { messagesForEvents } from "@/server/approvals/messages";
import { describeEvent } from "@/server/approvals/timeline";
import { decide, startInstance, validateWorkflow } from "@/server/engine";
import { checkCustomSpec } from "@/server/approvals/service";
import { ctx, makeDirectory } from "../helpers/engine-fixtures";

const directory = makeDirectory();
const names = new Map([
  [1, "Ravi"],
  [2, "Manoj"],
  [4, "Fiona"],
  [5, "Faisal"],
  [6, "Farah"],
]);

describe("step types in the builder (D-097)", () => {
  // Manager approves → requester raises the PO (work) → Finance told (FYI).
  const spec: BuilderSpec = {
    stages: [
      { kind: "STEP", step: { ...newStep("mgr", "Manager"), approvers: { kind: "PEOPLE", userIds: [2] } } },
      { kind: "STEP", step: { ...newStep("po", "Raise the PO"), type: "WORK", approvers: { kind: "REQUESTER" } } },
      { kind: "STEP", step: { ...newStep("fyi", "Tell Finance"), type: "NOTIFY", note: "PO raised", approvers: { kind: "ROLE", roleCode: "FINANCE" } } },
    ],
  };

  it("compiles work as an approval step in WORK mode and FYI as a NOTIFY node", () => {
    const compiled = compileBuilder(builderSpecSchema.parse(spec));
    if (!compiled.ok) throw new Error(compiled.errors.join());
    const kinds = compiled.definition.nodes.map((node) => `${node.kind}${node.kind === "APPROVAL" && node.mode ? `:${node.mode}` : ""}`);
    expect(kinds).toEqual(["START", "APPROVAL", "APPROVAL:WORK", "NOTIFY", "END"]);
    expect(validateWorkflow(compiled.definition).valid).toBe(true);
  });

  it("runs end to end: approval, the requester's own work, then the FYI; the map says so", () => {
    const compiled = compileBuilder(builderSpecSchema.parse(spec));
    if (!compiled.ok) throw new Error();
    const definition = compiled.definition;
    let result = startInstance(definition, ctx(), directory);
    result = decide(definition, result.state, { taskId: result.state.tasks[0]!.id, actorId: 2, decision: "APPROVE" }, ctx(), directory);
    const work = result.state.tasks.find((task) => task.nodeId === "step_po")!;
    expect(work.approverId).toBe(1);
    result = decide(definition, result.state, { taskId: work.id, actorId: 1, decision: "APPROVE", comment: "PO 77 raised" }, ctx(), directory);
    expect(result.state.status).toBe("APPROVED");

    const map = buildStepMap(definition, result.state, builderSpecSchema.parse(spec), names).flatMap((stage) => stage.steps);
    expect(map.map((step) => [step.label, step.type ?? "APPROVE", step.rule])).toEqual([
      ["Manager", "APPROVE", "Must approve"],
      ["Raise the PO", "WORK", "Must mark it done"],
      ["Tell Finance", "NOTIFY", "For information: PO raised"],
    ]);
    expect(map[2]!.people.map((person) => `${person.name}:${person.status}`)).toEqual(["Fiona:TOLD", "Faisal:TOLD", "Farah:TOLD"]);

    const messages = messagesForEvents(result.events, { id: 9, requestNo: "PUR-1", title: "Laptops", requesterId: 1, requesterName: "Ravi" }, { baseUrl: "https://x.test", adminIds: [] });
    expect(messages.map((message) => message.eventType)).toEqual(["REQUEST_FYI", "REQUEST_FYI", "REQUEST_FYI", "REQUEST_APPROVED"]);
  });

  it("work tasks are announced as tasks, not approvals; the timeline says 'Marked done'", () => {
    const compiled = compileBuilder(builderSpecSchema.parse(spec));
    if (!compiled.ok) throw new Error();
    const isWork = (nodeId: string) => nodeId === "step_po";
    const message = messagesForEvents([{ type: "TASK_CREATED", taskId: "t2", nodeId: "step_po", approverId: 1 }], { id: 9, requestNo: "PUR-1", title: "Laptops", requesterId: 1, requesterName: "Ravi" }, { baseUrl: "https://x.test", adminIds: [], isWorkStep: isWork, labelOf: () => "Raise the PO" });
    expect(message[0]).toMatchObject({ eventType: "TASK_ASSIGNED", title: "Task for you" });
    expect(describeEvent({ type: "TASK_DECIDED", taskId: "t2", nodeId: "step_po", decision: "APPROVE", actorId: 1 }, () => "Raise the PO", (id) => names.get(id) ?? "?", isWork)).toBe('Marked done by Ravi at "Raise the PO"');
  });

  it("a custom approval may give work to yourself, but not an approval", () => {
    expect(checkCustomSpec({ stages: [{ kind: "STEP", step: { ...newStep("a", "Me"), approvers: { kind: "PEOPLE", userIds: [1] } } }] }, 1)).toHaveLength(1);
    expect(checkCustomSpec({ stages: [{ kind: "STEP", step: { ...newStep("a", "Me"), type: "WORK", approvers: { kind: "PEOPLE", userIds: [1] } } }] }, 1)).toHaveLength(0);
  });
});

describe("and/or conditions (D-099)", () => {
  const group = { match: "ANY" as const, conditions: [{ field: "amount", operator: "GT" as const, value: 500000 }, { field: "nature", operator: "EQ" as const, value: "Capex" }] };

  it("compile to OR / AND groups, and a single row stays a plain comparison", () => {
    expect(toCondition(group)).toEqual({ op: "OR", conditions: group.conditions });
    expect(toCondition({ ...group, match: "ALL" })).toEqual({ op: "AND", conditions: group.conditions });
    expect(toCondition({ match: "ALL", conditions: [group.conditions[0]!] })).toEqual(group.conditions[0]);
  });

  it("a choice with 'any of' takes the path when either holds; the words say 'or'", () => {
    const spec: BuilderSpec = builderSpecSchema.parse({
      stages: [
        { kind: "BRANCH", id: "big", label: "Big or capex", condition: group, then: [{ kind: "STEP", step: { ...newStep("md", "MD"), approvers: { kind: "PEOPLE", userIds: [8] } } }], otherwise: [] },
        { kind: "STEP", step: { ...newStep("fin", "Finance"), approvers: { kind: "PEOPLE", userIds: [4] } } },
      ],
    });
    const compiled = compileBuilder(spec);
    if (!compiled.ok) throw new Error();
    const first = (formData: Record<string, string | number>) => startInstance(compiled.definition, ctx(formData), directory).state.tasks[0]!.approverId;
    expect(first({ amount: 100, nature: "Capex" })).toBe(8);
    expect(first({ amount: 900000, nature: "Opex" })).toBe(8);
    expect(first({ amount: 100, nature: "Opex" })).toBe(4);
    expect(describeBuilderCondition(group, (key) => key)).toBe("amount is more than 5,00,000 or nature is Capex");
  });

  it("the validator still catches impossible 'all of' rules (G-08)", () => {
    const spec = builderSpecSchema.parse({
      stages: [
        { kind: "STEP", step: { ...newStep("mgr", "Manager"), approvers: { kind: "PEOPLE", userIds: [2] }, skipWhen: { match: "ALL", conditions: [{ field: "nature", operator: "EQ", value: "A" }, { field: "nature", operator: "EQ", value: "B" }] } } },
      ],
    });
    const compiled = compileBuilder(spec);
    if (!compiled.ok) throw new Error();
    expect(validateWorkflow(compiled.definition).errors.map((issue) => issue.code)).toContain("CONDITION_IMPOSSIBLE");
  });
});

describe("choices inside choices (D-099)", () => {
  const step = (id: string, user: number) => ({ kind: "STEP" as const, step: { ...newStep(id, id.toUpperCase()), approvers: { kind: "PEOPLE" as const, userIds: [user] } } });
  const choice = (id: string, field: string, then: unknown[], otherwise: unknown[] = []) => ({ kind: "BRANCH", id, label: id, condition: { field, operator: "EQ", value: "yes" }, then, otherwise });

  it("route through two levels of choices", () => {
    const spec = builderSpecSchema.parse({ stages: [choice("a", "x", [choice("b", "y", [step("deep", 8)], [step("mid", 7)])], [step("other", 4)])] });
    const compiled = compileBuilder(spec);
    if (!compiled.ok) throw new Error(compiled.errors.join());
    expect(validateWorkflow(compiled.definition).valid).toBe(true);
    const first = (formData: Record<string, string>) => startInstance(compiled.definition, ctx(formData), directory).state.tasks[0]!.approverId;
    expect(first({ x: "yes", y: "yes" })).toBe(8);
    expect(first({ x: "yes", y: "no" })).toBe(7);
    expect(first({ x: "no", y: "yes" })).toBe(4);
  });

  it("refuses more than three levels of choices", () => {
    const deep = choice("a", "x", [choice("b", "x", [choice("c", "x", [choice("d", "x", [step("s", 2)])])])]);
    expect(builderSpecSchema.safeParse({ stages: [deep] }).success).toBe(false);
    const ok = choice("a", "x", [choice("b", "x", [choice("c", "x", [step("s", 2)])])]);
    expect(builderSpecSchema.safeParse({ stages: [ok] }).success).toBe(true);
  });
});
