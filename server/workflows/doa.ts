import { evaluateCondition } from "@/server/engine/conditions";
import type { BuilderInnerStage, BuilderSpec, BuilderStage } from "@/server/workflows/builder";
import type { Comparison } from "@/server/engine/types";

// DoA view (F-54, D-065): approval limits live in the workflow as "skip
// this step when amount …". This turns them back into a matrix of amount
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

export function deriveDoaTable(spec: BuilderSpec, field = "amount"): DoaTable {
  const thresholds = new Set<number>();
  const otherConditions: string[] = [];
  const note = (condition: Comparison | null | undefined, label: string) => {
    if (!condition) return;
    if (condition.field === field && AMOUNT_OPERATORS.has(condition.operator) && typeof condition.value === "number") thresholds.add(condition.value);
    else otherConditions.push(`${label} (depends on ${condition.field})`);
  };
  const scan = (stages: readonly AnyStage[]) => {
    for (const stage of stages) {
      if (stage.kind === "STEP") note(stage.step.skipWhen as Comparison | null | undefined, stage.step.label);
      else if (stage.kind === "PARALLEL") stage.steps.forEach((step) => note(step.skipWhen as Comparison | null | undefined, step.label));
      else {
        note(stage.condition as Comparison, stage.label);
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
      const keep = (skip: unknown) => {
        const condition = skip as Comparison | null | undefined;
        return !condition || condition.field !== field || !evaluateCondition(condition, { [field]: amount });
      };
      if (stage.kind === "STEP") return keep(stage.step.skipWhen) ? [mark(stage.step.label)] : [];
      if (stage.kind === "PARALLEL") return stage.steps.filter((step) => keep(step.skipWhen)).map((step) => mark(step.label));
      if (stage.condition.field === field) {
        return evaluateCondition(stage.condition as Comparison, { [field]: amount }) ? levelsIn(stage.then, amount, maybe) : levelsIn(stage.otherwise, amount, maybe);
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
