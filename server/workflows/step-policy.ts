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
  // D-206 (owner): levels and parallel steps are for everyone; the DoA
  // matrix, the if / otherwise choice and "Skip this step when…" appear on
  // the custom approval page only when IT switches them on (off by default).
  features: z.object({ doa: z.boolean().default(false), choice: z.boolean().default(false), skip: z.boolean().default(false) }).default({ doa: false, choice: false, skip: false }),
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

// D-206: what a custom approval uses that IT hasn't switched on (empty when
// it may be submitted). The page hides these; this refuses a crafted request.
export function unavailableFeatures(spec: BuilderSpec, policy: StepPolicy): string[] {
  const found = new Set<string>();
  const step = (item: BuilderStep) => {
    if (item.skipWhen && !policy.features.skip) found.add("“Skip this step when…” isn't available on custom approvals.");
  };
  const stage = (item: BuilderStage | BuilderInnerStage): void => {
    if (item.kind === "STEP") step(item.step);
    else if (item.kind === "PARALLEL") item.steps.forEach(step);
    else if (item.kind === "DOA") {
      if (!policy.features.doa) found.add("A DoA matrix isn't available on custom approvals.");
      item.levels.forEach((level) => step(level.step));
    } else {
      if (!policy.features.choice) found.add("A choice (if / otherwise) isn't available on custom approvals.");
      [...item.then, ...item.otherwise].forEach(stage);
    }
  };
  spec.stages.forEach(stage);
  return [...found];
}

export const RULE_TEXT: Record<(typeof RULES)[number], string> = { ALL: "All of them must approve", ANY_ONE: "Any one of them", ANY_N: "Any N of them" };
export const NOBODY_TEXT: Record<(typeof NOBODY)[number], string> = { BLOCK: "Stop and tell IT", SKIP: "Skip the step" };
