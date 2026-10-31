import { isConditionGroup, type ApproverPick, type BuilderCondition, type BuilderInnerStage, type BuilderStage, type BuilderStep } from "@/server/workflows/builder";
import { NUMERIC_TYPES, type FormField } from "@/server/forms/fields";

// D-239: the Workflow Designer's pure rules (unit-tested): what each level
// needs fixing before it can be saved, a level's one-line summary, and a
// duplicate with fresh ids. The server checks everything again on save
// (resolveContent); these only point at the level a problem is in.
export type AnyStage = BuilderStage | BuilderInnerStage;
export interface DesignContext {
  form: readonly FormField[];
}

const PICK_SHORT: Record<ApproverPick["kind"], string> = {
  PEOPLE: "chosen people",
  REQUESTER_MANAGER: "requester's manager",
  REQUESTER_MANAGERS_MANAGER: "manager's manager",
  REQUESTER_DEPARTMENT_HOD: "department HOD",
  DEPARTMENT_HOD: "HOD of a department",
  ROLE: "a role",
  GROUP: "a group",
  FORM_FIELD_USER: "person in a field",
  DESIGNATION: "a designation",
  REQUESTER: "the requester",
};
const RULE_SHORT = { ALL: "all", ANY_ONE: "any one", ANY_N: "any N" } as const;

export function pickText(pick: ApproverPick): string {
  return pick.kind === "PEOPLE" ? `${pick.userIds.length} ${pick.userIds.length === 1 ? "person" : "people"}` : PICK_SHORT[pick.kind];
}

export function stepSummary(step: BuilderStep): string {
  const kind = step.type === "WORK" ? "Work" : step.type === "NOTIFY" ? "FYI" : "Approval";
  const who = pickText(step.approvers);
  const rule = step.type === "NOTIFY" ? "" : ` · ${step.rule === "ANY_N" ? `any ${step.n ?? 1}` : RULE_SHORT[step.rule]}`;
  const sla = step.slaHours ? ` · ${step.slaHours} h` : "";
  return `${kind} · ${who}${rule}${sla}${step.skipWhen ? " · may be skipped" : ""}`;
}

export function stageName(stage: AnyStage): string {
  return stage.kind === "STEP" ? stage.step.label : stage.label;
}

export function stageSummary(stage: AnyStage): string {
  switch (stage.kind) {
    case "STEP":
      return stepSummary(stage.step);
    case "PARALLEL":
      return `${stage.steps.length} at once · ${stage.join === "ANY_N" ? `any ${stage.n ?? 1} finish` : stage.join === "ANY_ONE" ? "any one finishes" : "all finish"}`;
    case "BRANCH":
      return `If … then ${stage.then.length} level${stage.then.length === 1 ? "" : "s"}, otherwise ${stage.otherwise.length}`;
    case "DOA":
      return `${stage.limits.length + 1} amount bands · ${stage.levels.length} level${stage.levels.length === 1 ? "" : "s"}`;
  }
}

function conditionProblems(condition: BuilderCondition, form: readonly FormField[], where: string): string[] {
  const rows = isConditionGroup(condition) ? condition.conditions : [condition];
  return rows.flatMap((row) => ("field" in row && !form.some((field) => field.key === row.field) ? [`${where}: choose a field that is on the form.`] : []));
}

export function stepProblems(step: BuilderStep, context: DesignContext, where = `"${step.label || "A step"}"`): string[] {
  const problems: string[] = [];
  const type = step.type ?? "APPROVE";
  if (!step.label.trim()) problems.push("A step needs a name.");
  const pick = step.approvers;
  // (Someone no longer approver-eligible stays valid once chosen, D-085: the server decides.)
  if (pick.kind === "PEOPLE" && !pick.userIds.length) problems.push(`${where}: choose at least one person.`);
  if (pick.kind === "FORM_FIELD_USER" && !context.form.some((field) => field.key === pick.fieldKey && field.type === "PERSON")) problems.push(`${where}: choose the person field.`);
  if (pick.kind === "REQUESTER" && type === "APPROVE") problems.push(`${where}: the requester can't approve their own request.`);
  if (type !== "NOTIFY" && step.rule === "ANY_N") {
    const n = step.n ?? 1;
    if (n < 1) problems.push(`${where}: N must be at least 1.`);
    if (pick.kind === "PEOPLE" && n > pick.userIds.length) problems.push(`${where}: N is more than the people chosen.`);
  }
  if (step.slaHours !== undefined && step.slaHours !== null && (step.slaHours < 1 || step.slaHours > 720)) problems.push(`${where}: respond within 1 to 720 hours.`);
  if (step.skipWhen) problems.push(...conditionProblems(step.skipWhen, context.form, `${where} skip rule`));
  return problems;
}

// Problems in one level (and, for a choice, in the levels on its paths).
export function stageProblems(stage: AnyStage, context: DesignContext): string[] {
  switch (stage.kind) {
    case "STEP":
      return stepProblems(stage.step, context);
    case "PARALLEL": {
      const problems = stage.steps.flatMap((step) => stepProblems(step, context));
      if (!stage.label.trim()) problems.push("Parallel steps need a name.");
      if (stage.join === "ANY_N" && (stage.n ?? 1) > stage.steps.length) problems.push(`"${stage.label}": N is more than the branches.`);
      return problems;
    }
    case "BRANCH": {
      const problems = conditionProblems(stage.condition, context.form, `"${stage.label || "A choice"}"`);
      if (!stage.label.trim()) problems.push("A choice needs a name.");
      if (stage.then.length + stage.otherwise.length === 0) problems.push(`"${stage.label}": add levels on at least one path.`);
      return [...problems, ...[...stage.then, ...stage.otherwise].flatMap((inner) => stageProblems(inner, context))];
    }
    case "DOA": {
      const problems: string[] = [];
      const field = context.form.find((item) => item.key === stage.field);
      if (!field || !NUMERIC_TYPES.includes(field.type)) problems.push(`"${stage.label}": choose the amount field (a number on the form).`);
      if (stage.limits.some((limit) => !(limit > 0))) problems.push(`"${stage.label}": limits must be more than ₹0.`);
      if (stage.limits.some((limit, index) => index > 0 && limit <= stage.limits[index - 1]!)) problems.push(`"${stage.label}": limits must go up from left to right.`);
      for (let band = 0; band <= stage.limits.length; band += 1) if (!stage.levels.some((level) => level.bands[band])) problems.push(`"${stage.label}": every amount band needs a ticked level.`);
      for (const level of stage.levels) if (!level.bands.some(Boolean)) problems.push(`"${level.step.label}" isn't needed for any band.`);
      return [...new Set([...problems, ...stage.levels.flatMap((level) => stepProblems(level.step, context))])];
    }
  }
}

export function allProblems(stages: readonly AnyStage[], context: DesignContext): number {
  const own = stages.reduce((sum, stage) => sum + stageProblems(stage, context).length, 0);
  return own + (stages.length === 0 ? 1 : 0);
}

// A copy with its own ids (ids must be unique across the whole spec).
export function duplicateStage<T extends AnyStage>(stage: T, newId: () => string): T {
  const step = (item: BuilderStep): BuilderStep => ({ ...structuredClone(item), id: newId() });
  const copy = (item: AnyStage): AnyStage => {
    switch (item.kind) {
      case "STEP":
        return { kind: "STEP", step: { ...step(item.step), label: `${item.step.label} (copy)`.slice(0, 100) } };
      case "PARALLEL":
        return { ...item, id: newId(), label: `${item.label} (copy)`.slice(0, 100), steps: item.steps.map(step) };
      case "BRANCH":
        return {
          ...item,
          id: newId(),
          label: `${item.label} (copy)`.slice(0, 100),
          condition: structuredClone(item.condition),
          then: item.then.map((inner) => copy(inner) as BuilderInnerStage),
          otherwise: item.otherwise.map((inner) => copy(inner) as BuilderInnerStage),
        };
      case "DOA":
        return { ...item, id: newId(), label: `${item.label} (copy)`.slice(0, 100), limits: [...item.limits], levels: item.levels.map((level) => ({ step: step(level.step), bands: [...level.bands] })) };
    }
  };
  return copy(stage) as T;
}

// The browser-side copy of unsaved work (D-239): which version it was made
// from, so an older copy is never offered over newer saved work.
export interface LocalDraft {
  base: string; // workflow id and the version the editor opened
  savedAt: number;
  stages: BuilderStage[];
  form: FormField[];
}
export function parseLocalDraft(raw: string | null, base: string): LocalDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<LocalDraft>;
    if (value.base !== base || !Array.isArray(value.stages) || !Array.isArray(value.form) || typeof value.savedAt !== "number") return null;
    return value as LocalDraft;
  } catch {
    return null;
  }
}
