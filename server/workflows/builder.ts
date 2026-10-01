import { z } from "zod";
import type { ApproverSource, Comparison, CompletionRule, WorkflowDefinition, WorkflowEdge, WorkflowNode } from "@/server/engine/types";

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

const approverPickSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("PEOPLE"), userIds: z.array(z.number().int().positive()).min(1, "Pick at least one person.").max(50) }),
  z.object({ kind: z.literal("ROLE"), roleCode: z.string().min(1).max(50) }),
  z.object({ kind: z.literal("REQUESTER_MANAGER") }),
  z.object({ kind: z.literal("REQUESTER_MANAGERS_MANAGER") }),
  z.object({ kind: z.literal("REQUESTER_DEPARTMENT_HOD") }),
  z.object({ kind: z.literal("DEPARTMENT_HOD"), departmentId: z.number().int().positive() }),
  z.object({ kind: z.literal("GROUP"), groupId: z.number().int().positive() }),
  z.object({ kind: z.literal("FORM_FIELD_USER"), fieldKey: z.string().min(1).max(50) }),
]);

const ruleSchema = z.enum(["ALL", "ANY_ONE", "ANY_N"]);

const stepSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]{1,30}$/),
  label: z.string().trim().min(1, "Every step needs a name.").max(100),
  approvers: approverPickSchema,
  rule: ruleSchema,
  n: z.number().int().min(1).max(50).optional(),
  skipWhen: comparisonSchema.nullish(),
  onNoApprover: z.enum(["BLOCK", "SKIP"]).optional(),
  slaHours: z.number().int().min(1, "Use at least 1 hour.").max(720, "Use at most 720 hours (30 days).").nullish(),
});

const stageSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("STEP"), step: stepSchema }),
  z.object({
    kind: z.literal("PARALLEL"),
    id: z.string().regex(/^[a-z0-9_]{1,30}$/),
    label: z.string().trim().min(1).max(100),
    steps: z.array(stepSchema).min(2, "A parallel stage needs at least two steps.").max(10),
    join: ruleSchema,
    n: z.number().int().min(1).max(10).optional(),
  }),
]);

export const builderSpecSchema = z.object({ stages: z.array(stageSchema).min(1, "Add at least one step.").max(30) });

export type ApproverPick = z.infer<typeof approverPickSchema>;
export type BuilderStep = z.infer<typeof stepSchema>;
export type BuilderStage = z.infer<typeof stageSchema>;
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
    default:
      return [{ type: pick.kind }];
  }
}

function toRule(rule: BuilderStep["rule"], n: number | undefined): CompletionRule {
  return rule === "ANY_N" ? { type: "ANY_N", n: n ?? 1 } : { type: rule };
}

const stepNodeId = (step: BuilderStep) => `step_${step.id}`;

function stepNode(step: BuilderStep): WorkflowNode {
  return {
    id: stepNodeId(step),
    kind: "APPROVAL",
    label: step.label,
    approvers: toSources(step.approvers),
    completion: toRule(step.rule, step.n),
    ...(step.skipWhen ? { skipIf: step.skipWhen as Comparison } : {}),
    ...(step.onNoApprover ? { onNoApprover: step.onNoApprover } : {}),
    ...(step.slaHours ? { slaHours: step.slaHours } : {}),
  };
}

export type CompileResult = { ok: true; definition: WorkflowDefinition } | { ok: false; errors: string[] };

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
  const connect = (from: string, to: string) => edges.push({ id: `e${++edgeCount}`, from, to });
  let previous = "start";

  for (const stage of spec.stages) {
    if (stage.kind === "STEP") {
      claim(stage.step.id);
      nodes.push(stepNode(stage.step));
      connect(previous, stepNodeId(stage.step));
      previous = stepNodeId(stage.step);
      continue;
    }
    claim(stage.id);
    const splitId = `par_${stage.id}_split`;
    const joinId = `par_${stage.id}_join`;
    nodes.push({ id: splitId, kind: "SPLIT", label: stage.label });
    connect(previous, splitId);
    for (const step of stage.steps) {
      claim(step.id);
      nodes.push(stepNode(step));
      connect(splitId, stepNodeId(step));
      connect(stepNodeId(step), joinId);
    }
    nodes.push({ id: joinId, kind: "JOIN", label: `${stage.label} complete`, completion: toRule(stage.join, stage.n) });
    // The join links on to the next stage (or End) at the top of the loop.
    previous = joinId;
  }
  nodes.push({ id: "end", kind: "END", label: "End" });
  connect(previous, "end");

  return errors.length ? { ok: false, errors } : { ok: true, definition: { nodes, edges } };
}

// A new, empty step with a fresh id (used by the builder screen and tests).
export function newStep(id: string, label = "New step"): BuilderStep {
  return { id, label, approvers: { kind: "REQUESTER_MANAGER" }, rule: "ALL" };
}
