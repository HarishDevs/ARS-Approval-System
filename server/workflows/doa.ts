import { evaluateCondition } from "@/server/engine/conditions";
import type { BuilderSpec, BuilderStep } from "@/server/workflows/builder";

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

function stepsOf(spec: BuilderSpec): BuilderStep[] {
  return spec.stages.flatMap((stage) => (stage.kind === "STEP" ? [stage.step] : stage.steps));
}

export function deriveDoaTable(spec: BuilderSpec, field = "amount"): DoaTable {
  const steps = stepsOf(spec);
  const thresholds = new Set<number>();
  const otherConditions: string[] = [];
  for (const step of steps) {
    const skip = step.skipWhen;
    if (!skip) continue;
    if (skip.field === field && AMOUNT_OPERATORS.has(skip.operator) && typeof skip.value === "number") thresholds.add(skip.value);
    else otherConditions.push(`${step.label} (depends on ${skip.field})`);
  }
  // Whole-rupee sample points around every threshold, then group the runs
  // that need the same levels.
  const points = [...new Set([0, ...[...thresholds].flatMap((value) => [value, value + 1])])].filter((value) => value >= 0).sort((a, b) => a - b);
  const levelsAt = (amount: number) =>
    steps
      .filter((step) => {
        const skip = step.skipWhen;
        if (!skip || skip.field !== field) return true;
        return !evaluateCondition(skip, { [field]: amount });
      })
      .map((step) => step.label);

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
