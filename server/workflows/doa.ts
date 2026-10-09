import { evaluateCondition } from "@/server/engine/conditions";
import { doaBandIndex, findDoa, isConditionGroup, toCondition, type BuilderCondition, type BuilderInnerStage, type BuilderSpec, type BuilderStage } from "@/server/workflows/builder";
import type { Comparison } from "@/server/engine/types";

// The comparisons inside a builder rule (one, or an all/any group).
const comparisonsOf = (condition: BuilderCondition): Comparison[] => (isConditionGroup(condition) ? (condition.conditions as Comparison[]) : [condition as Comparison]);

// DoA view (F-54, D-065, D-075): an approval type's DoA matrix, or limits
// written as "skip this step when amount …", turned into a table of amount
// bands → the levels needed. Pure and unit-tested.
export interface DoaBand {
  from: number;
  to: number | null; // null = no upper limit
  levels: string[];
}

export interface DoaTable {
  field: string;
  bands: DoaBand[];
  otherConditions: string[]; // steps that depend on fields other than the amount
}

const AMOUNT_OPERATORS = new Set(["GT", "GTE", "LT", "LTE"]);

type AnyStage = BuilderStage | BuilderInnerStage;

export function deriveDoaTable(spec: BuilderSpec, fieldOverride?: string): DoaTable {
  // The DoA matrix names its own amount field.
  const field = fieldOverride ?? findDoa(spec)?.field ?? "amount";
  const thresholds = new Set<number>();
  const otherConditions: string[] = [];
  const note = (rule: BuilderCondition | null | undefined, label: string) => {
    if (!rule) return;
    for (const condition of comparisonsOf(rule)) {
      if (condition.field === field && AMOUNT_OPERATORS.has(condition.operator) && typeof condition.value === "number") thresholds.add(condition.value);
      else otherConditions.push(`${label} (depends on ${condition.field})`);
    }
  };
  // A rule that reads only the amount can be worked out per amount band.
  const onlyAmount = (rule: BuilderCondition) => comparisonsOf(rule).every((condition) => condition.field === field);
  const scan = (stages: readonly AnyStage[]) => {
    for (const stage of stages) {
      if (stage.kind === "STEP") note(stage.step.skipWhen, stage.step.label);
      else if (stage.kind === "PARALLEL") stage.steps.forEach((step) => note(step.skipWhen, step.label));
      else if (stage.kind === "DOA") {
        if (stage.field === field) stage.limits.forEach((limit) => thresholds.add(limit));
        else otherConditions.push(`${stage.label} (depends on ${stage.field})`);
      } else {
        note(stage.condition, stage.label);
        scan(stage.then);
        scan(stage.otherwise);
      }
    }
  };
  scan(spec.stages);
  // Whole-rupee sample points around every threshold, then group the runs
  // that need the same levels.
  const points = [...new Set([0, ...[...thresholds].flatMap((value) => [value, value + 1])])].filter((value) => value >= 0).sort((a, b) => a - b);
  // Levels needed at one amount: follows amount choices; a choice on another
  // field lists both paths' levels marked "(maybe)".
  const levelsIn = (stages: readonly AnyStage[], amount: number, maybe: boolean): string[] =>
    stages.flatMap((stage) => {
      const mark = (label: string) => (maybe ? `${label} (maybe)` : label);
      const keep = (skip: BuilderCondition | null | undefined) => {
        return !skip || !onlyAmount(skip) || !evaluateCondition(toCondition(skip), { [field]: amount });
      };
      if (stage.kind === "STEP") return keep(stage.step.skipWhen) ? [mark(stage.step.label)] : [];
      if (stage.kind === "PARALLEL") {
        // Steps in parallel are one level: "A + B (together)".
        const labels = stage.steps.filter((step) => keep(step.skipWhen)).map((step) => step.label);
        if (labels.length <= 1) return labels.map(mark);
        return [mark(`${labels.join(" + ")} (together)`)];
      }
      if (stage.kind === "DOA") {
        if (stage.field !== field) return stage.levels.map((level) => `${level.step.label} (maybe)`);
        const band = doaBandIndex(stage.limits, amount);
        return stage.levels.filter((level) => level.bands[band]).map((level) => mark(level.step.label));
      }
      if (onlyAmount(stage.condition)) {
        return evaluateCondition(toCondition(stage.condition), { [field]: amount }) ? levelsIn(stage.then, amount, maybe) : levelsIn(stage.otherwise, amount, maybe);
      }
      return [...levelsIn(stage.then, amount, true), ...levelsIn(stage.otherwise, amount, true)];
    });
  const levelsAt = (amount: number) => levelsIn(spec.stages, amount, false);

  const bands: DoaBand[] = [];
  points.forEach((point, index) => {
    const levels = levelsAt(point);
    const to = index + 1 < points.length ? points[index + 1]! - 1 : null;
    const last = bands.at(-1);
    if (last && last.levels.join("|") === levels.join("|")) last.to = to;
    else bands.push({ from: point, to, levels });
  });
  return { field, bands, otherConditions };
}
