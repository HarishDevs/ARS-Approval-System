import { z } from "zod";
import type { ApproverSource, Comparison, CompletionRule, Condition, WorkflowDefinition, WorkflowEdge, WorkflowNode } from "@/server/engine/types";
import { NUMERIC_TYPES, type FormField } from "@/server/forms/fields";

// Structured workflow builder (D-056, S3-05a, F-50). The IT team describes a
// workflow as stages run in order; each stage is one step or several steps
// in parallel. compileBuilder turns that into the engine's node graph.
// Pure and unit-tested. The spec is saved with the version so it can be
// edited again.
const comparisonSchema = z.object({
  field: z.string().min(1).max(50),
  operator: z.enum(["EQ", "NEQ", "GT", "GTE", "LT", "LTE", "IN", "NOT_IN", "CONTAINS", "IS_EMPTY", "IS_NOT_EMPTY"]),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]).optional(),
});

// A rule is one comparison, or several joined by "all of" / "any of"
// (D-099). Old specs hold a single comparison and stay valid.
const conditionGroupSchema = z.object({
  match: z.enum(["ALL", "ANY"]),
  conditions: z.array(comparisonSchema).min(1, "Add at least one condition.").max(10),
});
const conditionSpecSchema = z.union([comparisonSchema, conditionGroupSchema]);
export type BuilderCondition = z.infer<typeof conditionSpecSchema>;
export type BuilderConditionGroup = z.infer<typeof conditionGroupSchema>;

export const isConditionGroup = (condition: BuilderCondition): condition is BuilderConditionGroup => "match" in condition;

// Builder rule → engine condition.
export function toCondition(condition: BuilderCondition): Condition {
  if (!isConditionGroup(condition)) return condition as Comparison;
  if (condition.conditions.length === 1) return condition.conditions[0] as Comparison;
  return { op: condition.match === "ALL" ? "AND" : "OR", conditions: condition.conditions as Comparison[] };
}

const approverPickSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("PEOPLE"), userIds: z.array(z.number().int().positive()).min(1, "Pick at least one person.").max(50) }),
  z.object({ kind: z.literal("ROLE"), roleCode: z.string().min(1).max(50) }),
  z.object({ kind: z.literal("REQUESTER_MANAGER") }),
  z.object({ kind: z.literal("REQUESTER_MANAGERS_MANAGER") }),
  z.object({ kind: z.literal("REQUESTER_DEPARTMENT_HOD") }),
  z.object({ kind: z.literal("DEPARTMENT_HOD"), departmentId: z.number().int().positive() }),
  z.object({ kind: z.literal("GROUP"), groupId: z.number().int().positive() }),
  z.object({ kind: z.literal("FORM_FIELD_USER"), fieldKey: z.string().min(1).max(50) }),
  z.object({ kind: z.literal("DESIGNATION"), designationId: z.number().int().positive(), sameDepartment: z.boolean().optional() }),
  z.object({ kind: z.literal("REQUESTER") }),
]);

const ruleSchema = z.enum(["ALL", "ANY_ONE", "ANY_N"]);

// type (D-097): APPROVE decides; WORK is a task to mark done (hand-off after
// approval, F-32); NOTIFY tells people and moves on.
const stepSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]{1,30}$/),
  label: z.string().trim().min(1, "Every step needs a name.").max(100),
  type: z.enum(["APPROVE", "WORK", "NOTIFY"]).optional(),
  note: z.string().trim().max(300).optional(),
  approvers: approverPickSchema,
  rule: ruleSchema,
  n: z.number().int().min(1).max(50).optional(),
  skipWhen: conditionSpecSchema.nullish(),
  onNoApprover: z.enum(["BLOCK", "SKIP"]).optional(),
  slaHours: z.number().int().min(1, "Use at least 1 hour.").max(720, "Use at most 720 hours (30 days).").nullish(),
});

const plainStageSchemas = [
  z.object({ kind: z.literal("STEP"), step: stepSchema }),
  z.object({
    kind: z.literal("PARALLEL"),
    id: z.string().regex(/^[a-z0-9_]{1,30}$/),
    label: z.string().trim().min(1).max(100),
    steps: z.array(stepSchema).min(2, "A parallel stage needs at least two steps.").max(10),
    join: ruleSchema,
    n: z.number().int().min(1).max(10).optional(),
  }),
] as const;

// Inside a choice: steps, parallel steps, or another choice (D-099: up to
// three choices deep; D-068 allowed none).
type PlainStage = z.infer<(typeof plainStageSchemas)[number]>;
export interface BuilderBranch {
  kind: "BRANCH";
  id: string;
  label: string;
  condition: BuilderCondition;
  then: BuilderInnerStage[];
  otherwise: BuilderInnerStage[];
}
export type BuilderInnerStage = PlainStage | BuilderBranch;

const branchStageSchema: z.ZodType<BuilderBranch> = z.lazy(() =>
  z
    .object({
      kind: z.literal("BRANCH"),
      id: z.string().regex(/^[a-z0-9_]{1,30}$/),
      label: z.string().trim().min(1).max(100),
      condition: conditionSpecSchema,
      then: z.array(innerStageSchema).max(20),
      otherwise: z.array(innerStageSchema).max(20),
    })
    .refine((stage) => stage.then.length + stage.otherwise.length > 0, { message: "A choice needs levels on at least one path." }),
);
const innerStageSchema: z.ZodType<BuilderInnerStage> = z.lazy(() => z.union([z.discriminatedUnion("kind", [...plainStageSchemas]), branchStageSchema]));

export const MAX_CHOICE_DEPTH = 3;
function choiceDepth(stages: readonly (BuilderStage | BuilderInnerStage)[]): number {
  return Math.max(0, ...stages.map((stage) => (stage.kind === "BRANCH" ? 1 + Math.max(choiceDepth(stage.then), choiceDepth(stage.otherwise)) : 0)));
}

// DoA matrix (D-075, F-58): the approval authority of one approval type.
// Bands are cut at rising limits (inclusive upper limit; the last band is
// "above"). Each level is ticked for the bands that need it, so bands can be
// cumulative (more levels as the amount grows) or not.
const doaLevelSchema = z.object({ step: stepSchema, bands: z.array(z.boolean()).min(2).max(11) });

const doaStageSchema = z
  .object({
    kind: z.literal("DOA"),
    id: z.string().regex(/^[a-z0-9_]{1,30}$/),
    label: z.string().trim().min(1).max(100),
    field: z.string().regex(/^[a-z][a-z0-9_]{0,49}$/, "Pick the amount field the DoA reads."),
    limits: z.array(z.number().positive("Limits must be more than ₹0.").max(1e13)).min(1, "Add at least one amount limit.").max(10),
    levels: z.array(doaLevelSchema).min(1, "Add at least one DoA level.").max(15),
  })
  .superRefine((stage, ctx) => {
    for (let i = 1; i < stage.limits.length; i += 1) {
      if (stage.limits[i]! <= stage.limits[i - 1]!) ctx.addIssue({ code: "custom", message: "DoA limits must go up from left to right." });
    }
    const bands = stage.limits.length + 1;
    for (const level of stage.levels) {
      if (level.bands.length !== bands) ctx.addIssue({ code: "custom", message: `"${level.step.label}" needs a tick box for every amount band.` });
      else if (!level.bands.some(Boolean)) ctx.addIssue({ code: "custom", message: `"${level.step.label}" isn't needed at any amount: tick at least one band, or remove it.` });
    }
    for (let band = 0; band < bands; band += 1) {
      if (!stage.levels.some((level) => level.bands[band])) ctx.addIssue({ code: "custom", message: `Nobody approves in the band "${doaBandLabels(stage.limits)[band]}": tick at least one level.` });
    }
  });

const stageSchema = z.union([z.discriminatedUnion("kind", [...plainStageSchemas]), branchStageSchema, doaStageSchema]);

export const builderSpecSchema = z
  .object({ stages: z.array(stageSchema).min(1, "Add at least one step.").max(30) })
  .refine((spec) => spec.stages.filter((stage) => stage.kind === "DOA").length <= 1, { message: "An approval type has one DoA matrix." })
  .refine((spec) => choiceDepth(spec.stages) <= MAX_CHOICE_DEPTH, { message: `Choices can be nested at most ${MAX_CHOICE_DEPTH} deep.` });

export type ApproverPick = z.infer<typeof approverPickSchema>;
export type BuilderStep = z.infer<typeof stepSchema>;
export type BuilderStage = z.infer<typeof stageSchema>;
export type BuilderDoa = z.infer<typeof doaStageSchema>;
export type BuilderSpec = z.infer<typeof builderSpecSchema>;

export function toSources(pick: ApproverPick): ApproverSource[] {
  switch (pick.kind) {
    case "PEOPLE":
      return pick.userIds.map((userId) => ({ type: "USER", userId }));
    case "ROLE":
      return [{ type: "ROLE", roleCode: pick.roleCode }];
    case "DEPARTMENT_HOD":
      return [{ type: "DEPARTMENT_HOD", departmentId: pick.departmentId }];
    case "GROUP":
      return [{ type: "GROUP", groupId: pick.groupId }];
    case "FORM_FIELD_USER":
      return [{ type: "FORM_FIELD_USER", fieldKey: pick.fieldKey }];
    case "DESIGNATION":
      return [{ type: "DESIGNATION", designationId: pick.designationId, ...(pick.sameDepartment ? { sameDepartment: true } : {}) }];
    default:
      return [{ type: pick.kind }];
  }
}

function toRule(rule: BuilderStep["rule"], n: number | undefined): CompletionRule {
  return rule === "ANY_N" ? { type: "ANY_N", n: n ?? 1 } : { type: rule };
}

const stepNodeId = (step: BuilderStep) => `step_${step.id}`;

function stepNode(step: BuilderStep): WorkflowNode {
  if (step.type === "NOTIFY") {
    return { id: stepNodeId(step), kind: "NOTIFY", label: step.label, recipients: toSources(step.approvers), ...(step.note ? { note: step.note } : {}) };
  }
  return {
    id: stepNodeId(step),
    kind: "APPROVAL",
    label: step.label,
    approvers: toSources(step.approvers),
    completion: toRule(step.rule, step.n),
    ...(step.type === "WORK" ? { mode: "WORK" as const } : {}),
    ...(step.skipWhen ? { skipIf: toCondition(step.skipWhen) } : {}),
    ...(step.onNoApprover ? { onNoApprover: step.onNoApprover } : {}),
    ...(step.slaHours ? { slaHours: step.slaHours } : {}),
  };
}

export type CompileResult = { ok: true; definition: WorkflowDefinition } | { ok: false; errors: string[] };

// Compiles forward, carrying the "loose ends" that must connect to the next
// level: one after a step or a join; several after a choice (each path's
// last node, or the choice itself when a path is empty).
interface LooseEnd {
  from: string;
  condition?: Condition;
  isDefault?: boolean;
  order?: number;
}

export function compileBuilder(spec: BuilderSpec): CompileResult {
  const errors: string[] = [];
  const ids = new Set<string>();
  const claim = (id: string) => {
    if (ids.has(id)) errors.push(`The id "${id}" is used twice.`);
    ids.add(id);
  };

  const nodes: WorkflowNode[] = [{ id: "start", kind: "START", label: "Start" }];
  const edges: WorkflowEdge[] = [];
  let edgeCount = 0;
  const connectAll = (ends: LooseEnd[], to: string) => {
    for (const end of ends) {
      edges.push({
        id: `e${++edgeCount}`,
        from: end.from,
        to,
        ...(end.condition ? { condition: end.condition } : {}),
        ...(end.isDefault ? { isDefault: true } : {}),
        ...(end.order ? { order: end.order } : {}),
      });
    }
  };

  const emit = (stages: readonly (BuilderStage | BuilderInnerStage)[], incoming: LooseEnd[]): LooseEnd[] => {
    let ends = incoming;
    for (const stage of stages) {
      if (stage.kind === "STEP") {
        claim(stage.step.id);
        nodes.push(stepNode(stage.step));
        connectAll(ends, stepNodeId(stage.step));
        ends = [{ from: stepNodeId(stage.step) }];
      } else if (stage.kind === "PARALLEL") {
        claim(stage.id);
        const splitId = `par_${stage.id}_split`;
        const joinId = `par_${stage.id}_join`;
        nodes.push({ id: splitId, kind: "SPLIT", label: stage.label });
        connectAll(ends, splitId);
        for (const step of stage.steps) {
          claim(step.id);
          nodes.push(stepNode(step));
          connectAll([{ from: splitId }], stepNodeId(step));
          connectAll([{ from: stepNodeId(step) }], joinId);
        }
        nodes.push({ id: joinId, kind: "JOIN", label: `${stage.label} complete`, completion: toRule(stage.join, stage.n) });
        ends = [{ from: joinId }];
      } else if (stage.kind === "DOA") {
        claim(stage.id);
        for (const level of stage.levels) {
          claim(level.step.id);
          // A DoA level's own skip rule is replaced by the matrix.
          const step: BuilderStep = { ...level.step, skipWhen: null };
          const skipIf = doaSkipCondition(stage.field, stage.limits, level.bands);
          nodes.push({ ...stepNode(step), ...(skipIf ? { skipIf } : {}) });
          connectAll(ends, stepNodeId(step));
          ends = [{ from: stepNodeId(step) }];
        }
      } else {
        claim(stage.id);
        const choiceId = `choice_${stage.id}`;
        nodes.push({ id: choiceId, kind: "CONDITION", label: stage.label });
        connectAll(ends, choiceId);
        const thenEnds = emit(stage.then, [{ from: choiceId, condition: toCondition(stage.condition), order: 1 }]);
        const otherwiseEnds = emit(stage.otherwise, [{ from: choiceId, isDefault: true }]);
        ends = [...thenEnds, ...otherwiseEnds];
      }
    }
    return ends;
  };

  const ends = emit(spec.stages, [{ from: "start" }]);
  nodes.push({ id: "end", kind: "END", label: "End" });
  connectAll(ends, "end");

  return errors.length ? { ok: false, errors } : { ok: true, definition: { nodes, edges } };
}

// Every step in the spec, including those inside choices and parallel levels.
export function allSteps(spec: { stages: readonly (BuilderStage | BuilderInnerStage)[] }): BuilderStep[] {
  return spec.stages.flatMap((stage) => {
    if (stage.kind === "STEP") return [stage.step];
    if (stage.kind === "PARALLEL") return stage.steps;
    if (stage.kind === "DOA") return stage.levels.map((level) => level.step);
    return [...allSteps({ stages: stage.then }), ...allSteps({ stages: stage.otherwise })];
  });
}

// A new, empty step with a fresh id (used by the builder screen and tests).
export function newStep(id: string, label = "New step"): BuilderStep {
  return { id, label, approvers: { kind: "REQUESTER_MANAGER" }, rule: "ALL" };
}

// ---- DoA matrix helpers (D-075). Pure. ------------------------------------------
const rupees = (value: number) => `₹${value.toLocaleString("en-IN")}`;

// "Up to ₹1,00,000", "₹1,00,001 to ₹10,00,000", …, "Above ₹25,00,000".
export function doaBandLabels(limits: readonly number[]): string[] {
  return [...limits.map((limit, i) => (i === 0 ? `Up to ${rupees(limit)}` : `${rupees(limits[i - 1]! + 1)} to ${rupees(limit)}`)), `Above ${rupees(limits.at(-1) ?? 0)}`];
}

// The band an amount falls in (upper limits are inclusive).
export function doaBandIndex(limits: readonly number[], amount: number): number {
  const index = limits.findIndex((limit) => amount <= limit);
  return index === -1 ? limits.length : index;
}

// Skip a level in every band it isn't ticked for. Neighbouring unticked
// bands merge into one range; null = needed at every amount.
export function doaSkipCondition(field: string, limits: readonly number[], bands: readonly boolean[]): Condition | null {
  const ranges: Condition[] = [];
  let band = 0;
  while (band < bands.length) {
    if (bands[band]) {
      band += 1;
      continue;
    }
    const from = band;
    while (band + 1 < bands.length && !bands[band + 1]) band += 1;
    const lower = from === 0 ? null : limits[from - 1]!;
    const upper = band === bands.length - 1 ? null : limits[band]!;
    const parts: Comparison[] = [
      ...(lower !== null ? [{ field, operator: "GT" as const, value: lower }] : []),
      ...(upper !== null ? [{ field, operator: "LTE" as const, value: upper }] : []),
    ];
    if (parts.length === 1) ranges.push(parts[0]!);
    else if (parts.length === 2) ranges.push({ op: "AND", conditions: parts });
    band += 1;
  }
  if (ranges.length === 0) return null;
  return ranges.length === 1 ? ranges[0]! : { op: "OR", conditions: ranges };
}

export function findDoa(spec: { stages: readonly BuilderStage[] } | null | undefined): BuilderDoa | null {
  const stage = spec?.stages.find((item) => item.kind === "DOA");
  return stage && stage.kind === "DOA" ? stage : null;
}

// The DoA reads one form field: it must exist, be a number and be required,
// or a request without an amount would need every level.
export function checkDoaForm(spec: BuilderSpec, form: readonly FormField[]): string[] {
  const doa = findDoa(spec);
  if (!doa) return [];
  const field = form.find((item) => item.key === doa.field);
  if (!field) return [`The DoA reads "${doa.field}", which isn't on the form. Add a number field with that key.`];
  const problems: string[] = [];
  // v1.6.0: a calculated total or a line-items total can drive the DoA too.
  if (!NUMERIC_TYPES.includes(field.type)) problems.push(`The DoA field "${field.label}" must be a number, a calculated field or line items.`);
  if (!field.required && field.type !== "CALC") problems.push(`Make "${field.label}" required: the DoA needs it to pick the approvers.`);
  return problems;
}

// The DoA field can never be negative: a negative amount would fall in the
// lowest band and skip approval levels (D-QA-04). Checked on every submit
// and resubmit, whatever the form's own minimum says.
export function checkDoaAmount(spec: { stages: readonly BuilderStage[] } | null | undefined, formData: Record<string, unknown>): Record<string, string> {
  const doa = findDoa(spec);
  if (!doa) return {};
  const value = formData[doa.field];
  if (typeof value === "number" && value < 0) return { [doa.field]: "Enter an amount of ₹0 or more." };
  return {};
}

// A fresh DoA matrix for a new approval type: three limits, four bands,
// cumulative levels the IT team then renames and assigns.
export function newDoaStage(newId: () => string, field = "amount"): BuilderDoa {
  const level = (label: string, from: number): BuilderDoa["levels"][number] => ({
    step: { id: newId(), label, approvers: { kind: "REQUESTER_MANAGER" }, rule: "ALL" },
    bands: [0, 1, 2, 3].map((band) => band >= from),
  });
  return {
    kind: "DOA",
    id: newId(),
    label: "Approval authority (DoA)",
    field,
    limits: [100_000, 1_000_000, 2_500_000],
    levels: [level("Level 1", 0), level("Level 2", 1), level("Level 3", 2), level("Level 4", 3)],
  };
}
