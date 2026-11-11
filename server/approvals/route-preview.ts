import "server-only";
import type { BuilderStage, BuilderStep } from "@/server/workflows/builder";
import { toSources } from "@/server/workflows/builder";
import { resolveApprovers } from "@/server/engine/engine";
import type { Directory } from "@/server/engine/types";

// v1.54.0 (owner: "when submitting, the review shows only First approval,
// Second approval and the route; show the approvers, specific people, HOD or
// whatever was chosen, for every step"): who each level of a route being
// built will go to, with the engine's own rule, for this requester.
export type StepPreview = { names: string[]; note?: string };

const SOURCE_WORDS: Record<string, string> = {
  REQUESTER_MANAGER: "your reporting manager",
  REQUESTER_MANAGERS_MANAGER: "your manager's manager",
  REQUESTER_DEPARTMENT_HOD: "your department's HOD",
  DEPARTMENT_HOD: "the department's HOD",
  ROLE: "everyone with the role",
  GROUP: "the group",
  DESIGNATION: "everyone with the designation",
  FORM_FIELD_USER: "the person chosen in the form",
  REQUESTER: "you",
};

export function allSteps(stages: readonly BuilderStage[]): BuilderStep[] {
  const out: BuilderStep[] = [];
  const walk = (list: readonly unknown[]) => {
    for (const raw of list) {
      const stage = raw as { kind: string; step?: BuilderStep; steps?: BuilderStep[]; then?: unknown[]; otherwise?: unknown[]; levels?: { step: BuilderStep }[] };
      if (stage.kind === "STEP" && stage.step) out.push(stage.step);
      else if (stage.kind === "PARALLEL") out.push(...(stage.steps ?? []));
      else if (stage.kind === "BRANCH") walk([...(stage.then ?? []), ...(stage.otherwise ?? [])]);
      else if (stage.kind === "DOA") out.push(...(stage.levels ?? []).map((level) => level.step));
    }
  };
  walk(stages);
  return out;
}

export function previewRoute(stages: readonly BuilderStage[], requesterId: number, directory: Directory, nameOf: (id: number) => string): Record<string, StepPreview> {
  const out: Record<string, StepPreview> = {};
  for (const step of allSteps(stages).slice(0, 100)) {
    const allowRequester = step.type === "WORK" || step.type === "NOTIFY";
    const ids = resolveApprovers(toSources(step.approvers), { requesterId, formData: {}, now: new Date().toISOString() }, directory, { allowRequester });
    const words = step.approvers.kind === "PEOPLE" ? undefined : SOURCE_WORDS[step.approvers.kind];
    if (step.approvers.kind === "FORM_FIELD_USER") out[step.id] = { names: [], note: "The person chosen in the form" };
    else if (!ids.length) out[step.id] = { names: [], note: words ? `Nobody found for ${words} yet` : "Nobody chosen yet" };
    else out[step.id] = { names: ids.slice(0, 20).map(nameOf), ...(words ? { note: words.charAt(0).toUpperCase() + words.slice(1) } : {}) };
  }
  return out;
}
