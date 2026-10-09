// #11 test mode: the route this version would take next to the route the
// live version takes for the same sample, in plain words. Pure.
export interface RouteStage {
  label: string;
  rule: string;
  people: string[];
}

export interface RouteSummary {
  outcome: "APPROVED" | "BLOCKED";
  stages: RouteStage[][];
  skipped: string[];
}

const stageText = (stage: readonly RouteStage[]) => stage.map((step) => `${step.label} (${step.people.join(", ") || "nobody"})`).join(" + ");

export function compareRoutes(draft: RouteSummary, live: RouteSummary): { same: boolean; notes: string[] } {
  const notes: string[] = [];
  const count = Math.max(draft.stages.length, live.stages.length);
  for (let index = 0; index < count; index += 1) {
    const now = draft.stages[index];
    const before = live.stages[index];
    if (now && before && stageText(now) === stageText(before)) continue;
    if (!before) notes.push(`Stage ${index + 1} is new: ${stageText(now!)}.`);
    else if (!now) notes.push(`Stage ${index + 1} is no longer there (was ${stageText(before)}).`);
    else notes.push(`Stage ${index + 1}: ${stageText(now)} (live: ${stageText(before)}).`);
  }
  const newlySkipped = draft.skipped.filter((label) => !live.skipped.includes(label));
  const noLongerSkipped = live.skipped.filter((label) => !draft.skipped.includes(label));
  if (newlySkipped.length > 0) notes.push(`Now skipped: ${newlySkipped.join(", ")}.`);
  if (noLongerSkipped.length > 0) notes.push(`No longer skipped: ${noLongerSkipped.join(", ")}.`);
  if (draft.outcome !== live.outcome) notes.push(draft.outcome === "BLOCKED" ? "This version gets stuck where the live one doesn't." : "This version gets through where the live one gets stuck.");
  return { same: notes.length === 0, notes: notes.slice(0, 12) };
}
