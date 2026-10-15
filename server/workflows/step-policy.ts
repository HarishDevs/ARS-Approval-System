import { z } from "zod";
import type { BuilderInnerStage, BuilderSpec, BuilderStage, BuilderStep } from "@/server/workflows/builder";

// v1.8.0 (owner): the step options people may set on a custom approval.
// For each of "All of them must approve", "Respond within" and "If nobody
// to approve", IT sets a default and whether people may change it. The
// server applies this to every submitted custom approval; the screen only
// mirrors it. Approval types built by IT are not affected.
export const RULES = ["ALL", "ANY_ONE", "ANY_N"] as const;
export const NOBODY = ["BLOCK", "SKIP"] as const;

export const stepPolicySchema = z.object({
  rule: z.object({ value: z.enum(RULES).default("ALL"), n: z.number().int().min(1).max(50).default(1), editable: z.boolean().default(true) }).default({ value: "ALL", n: 1, editable: true }),
  slaHours: z.object({ value: z.number().int().min(1).max(720).nullable().default(null), editable: z.boolean().default(true) }).default({ value: null, editable: true }),
  onNoApprover: z.object({ value: z.enum(NOBODY).default("BLOCK"), editable: z.boolean().default(true) }).default({ value: "BLOCK", editable: true }),
});
export type StepPolicy = z.infer<typeof stepPolicySchema>;
export const DEFAULT_STEP_POLICY: StepPolicy = stepPolicySchema.parse({});

export function parseStepPolicy(raw: unknown): StepPolicy {
  const value = typeof raw === "string" ? safeJson(raw) : raw;
  const parsed = stepPolicySchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : DEFAULT_STEP_POLICY;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// The fields a new step starts with.
export function stepDefaults(policy: StepPolicy): Pick<BuilderStep, "rule" | "n" | "slaHours" | "onNoApprover"> {
  return {
    rule: policy.rule.value,
    ...(policy.rule.value === "ANY_N" ? { n: policy.rule.n } : {}),
    slaHours: policy.slaHours.value,
    onNoApprover: policy.onNoApprover.value,
  };
}

// Fixed options overwrite whatever was sent; FYI steps have none of them.
export function applyStepPolicy(spec: BuilderSpec, policy: StepPolicy): BuilderSpec {
  const fix = (step: BuilderStep): BuilderStep => {
    if ((step.type ?? "APPROVE") === "NOTIFY") return step;
    const next: BuilderStep = { ...step };
    if (!policy.rule.editable) {
      next.rule = policy.rule.value;
      if (policy.rule.value === "ANY_N") next.n = policy.rule.n;
      else delete next.n;
    }
    if (!policy.slaHours.editable) next.slaHours = policy.slaHours.value;
    if (!policy.onNoApprover.editable) next.onNoApprover = policy.onNoApprover.value;
    return next;
  };
  const stage = <T extends BuilderStage | BuilderInnerStage>(item: T): T => {
    if (item.kind === "STEP") return { ...item, step: fix(item.step) };
    if (item.kind === "PARALLEL") return { ...item, steps: item.steps.map(fix) };
    if (item.kind === "DOA") return { ...item, levels: item.levels.map((level) => ({ ...level, step: fix(level.step) })) };
    return { ...item, then: item.then.map(stage), otherwise: item.otherwise.map(stage) } as T;
  };
  return { ...spec, stages: spec.stages.map(stage) };
}

export const RULE_TEXT: Record<(typeof RULES)[number], string> = { ALL: "All of them must approve", ANY_ONE: "Any one of them", ANY_N: "Any N of them" };
export const NOBODY_TEXT: Record<(typeof NOBODY)[number], string> = { BLOCK: "Stop and tell IT", SKIP: "Skip the step" };
