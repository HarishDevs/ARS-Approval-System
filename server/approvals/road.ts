// D-253 (owner: "TMT Road-Style Live Approval Progress Tracker"): the road
// on the request page and the small road in lists. Pure and unit-tested; it
// reads only the level map the request page already builds (step-map.ts), so
// the road can never disagree with the levels shown below it.
import type { MapStage, MapStep } from "@/server/approvals/step-map";
import type { InstanceState } from "@/server/engine/types";

export type CheckpointState = "done" | "current" | "waiting" | "rejected" | "returned" | "hold" | "blocked" | "skipped" | "cancelled";

export interface RoadPerson {
  name: string;
  status: string; // PENDING, APPROVED, REJECTED, …
  decidedAt?: string;
  comment?: string;
  decidedByName?: string;
}

export interface Checkpoint {
  key: string;
  label: string;
  state: CheckpointState;
  parallel: boolean; // several steps (or approvers) at one level
  rule?: string;
  reason?: string;
  people: RoadPerson[];
  finishedAt?: string;
  since?: string; // waiting since
  work?: boolean; // a work step (a task to do), not a decision
}

export interface Road {
  checkpoints: Checkpoint[]; // [0] = "Request submitted"
  vanAt: number; // index of the checkpoint the van stands at
  levelsDone: number;
  levels: number; // approval levels (the submitted point isn't one)
  percent: number; // levelsDone / levels, rounded
  outcome: "APPROVED" | "REJECTED" | "CANCELLED" | null;
  version: string; // changes whenever anything shown changes
}

// The route actually taken: a choice contributes the stages of its path
// taken; while undecided, one checkpoint stands for it. FYI-only levels
// are left out (they never hold a request up).
function routeStages(stages: readonly MapStage[]): MapStage[] {
  const out: MapStage[] = [];
  for (const stage of stages) {
    if (stage.kind === "CHOICE") {
      const taken = stage.paths?.find((path) => path.taken === true);
      if (taken) out.push(...routeStages(taken.stages));
      else if (stage.paths?.some((path) => path.taken === null) && stage.paths.some((path) => path.stages.length > 0)) out.push({ kind: "STEP", label: stage.label, steps: [] });
      continue;
    }
    const steps = stage.steps.filter((step) => !step.notTaken);
    if (steps.length > 0 && steps.every((step) => step.type === "NOTIFY")) continue;
    out.push({ ...stage, steps: steps.filter((step) => step.type !== "NOTIFY") });
  }
  return out;
}

const latest = (values: (string | undefined)[]) => values.filter((value): value is string => Boolean(value)).sort().at(-1);
const earliest = (values: (string | undefined)[]) => values.filter((value): value is string => Boolean(value)).sort()[0];

function stageState(steps: readonly MapStep[]): CheckpointState {
  if (!steps.length) return "waiting";
  if (steps.some((step) => step.status === "REJECTED")) return "rejected";
  if (steps.some((step) => step.status === "CANCELLED")) return "cancelled";
  if (steps.some((step) => step.status === "BLOCKED")) return "blocked";
  if (steps.some((step) => step.status === "ACTIVE")) return "current";
  if (steps.every((step) => step.status === "SKIPPED")) return "skipped";
  if (steps.every((step) => step.status === "APPROVED" || step.status === "SKIPPED")) return "done";
  return "waiting";
}

export function buildRoad(stages: readonly MapStage[], input: { status: InstanceState["status"]; submittedAt?: string | null; closedAt?: string | null; holdSince?: string | null }): Road {
  const route = routeStages(stages);
  const checkpoints: Checkpoint[] = [
    { key: "submitted", label: "Request submitted", state: "done", parallel: false, people: [], ...(input.submittedAt ? { finishedAt: input.submittedAt } : {}) },
  ];
  route.forEach((stage, index) => {
    const steps = stage.steps;
    const people = steps.flatMap((step) =>
      step.people.filter((person) => person.status !== "TOLD").map((person) => ({
        name: person.name,
        status: person.status,
        ...(person.decidedAt ? { decidedAt: person.decidedAt } : {}),
        ...(person.comment ? { comment: person.comment } : {}),
        ...(person.decidedByName ? { decidedByName: person.decidedByName } : {}),
      })),
    );
    const state = stageState(steps);
    checkpoints.push({
      key: `${index}-${stage.label}`,
      label: stage.label,
      state,
      parallel: stage.kind === "PARALLEL" || people.length > 1,
      ...(stage.joinRule ?? steps[0]?.rule ? { rule: stage.joinRule ?? steps[0]!.rule } : {}),
      ...(steps.find((step) => step.reason)?.reason ? { reason: steps.find((step) => step.reason)!.reason } : {}),
      people,
      ...(state === "done" || state === "rejected" ? { finishedAt: latest([...steps.map((step) => step.completedAt), ...people.map((person) => person.decidedAt)]) } : {}),
      ...(state === "current" || state === "blocked" ? { since: earliest(steps.map((step) => step.activatedAt)) } : {}),
      ...(steps.length > 0 && steps.every((step) => step.type === "WORK") ? { work: true } : {}),
    });
  });

  const levels = checkpoints.length - 1;
  const levelsDone = checkpoints.slice(1).filter((point) => point.state === "done" || point.state === "skipped").length;
  // Where the request stands: the first level not finished.
  let vanAt = checkpoints.findIndex((point, index) => index > 0 && point.state !== "done" && point.state !== "skipped");
  if (vanAt === -1) vanAt = checkpoints.length - 1;

  let outcome: Road["outcome"] = null;
  if (input.status === "APPROVED") {
    outcome = "APPROVED";
    vanAt = checkpoints.length - 1;
  } else if (input.status === "REJECTED") {
    outcome = "REJECTED";
    const stopped = checkpoints.findIndex((point) => point.state === "rejected");
    if (stopped > 0) vanAt = stopped;
    else checkpoints[vanAt] = { ...checkpoints[vanAt]!, state: "rejected" };
  } else if (input.status === "CANCELLED") {
    outcome = "CANCELLED";
    for (let index = 1; index < checkpoints.length; index += 1) {
      const point = checkpoints[index]!;
      if (point.state !== "done" && point.state !== "skipped" && point.state !== "rejected") checkpoints[index] = { ...point, state: "cancelled" };
    }
  } else if (vanAt > 0 && input.status === "CHANGES_REQUIRED") {
    checkpoints[vanAt] = { ...checkpoints[vanAt]!, state: "returned" };
  } else if (vanAt > 0 && input.status === "ON_HOLD") {
    checkpoints[vanAt] = { ...checkpoints[vanAt]!, state: "hold", ...(input.holdSince ? { since: input.holdSince } : {}) };
  }
  // Never "complete" unless the request really is approved.
  const percent = levels === 0 ? (outcome === "APPROVED" ? 100 : 0) : outcome === "APPROVED" ? 100 : Math.min(99, Math.round((levelsDone / levels) * 100));
  const version = [input.status, vanAt, ...checkpoints.map((point) => `${point.state}:${point.people.map((person) => person.status).join(",")}`)].join("|");
  return { checkpoints, vanAt, levelsDone, levels, percent, outcome, version };
}

// The small road in lists: just what the list needs.
export interface MiniRoad {
  percent: number;
  levelsDone: number;
  levels: number;
  current: string | null;
  outcome: Road["outcome"];
  state: CheckpointState;
}

export function miniRoad(road: Road): MiniRoad {
  const at = road.checkpoints[road.vanAt];
  return { percent: road.percent, levelsDone: road.levelsDone, levels: road.levels, current: road.outcome ? null : (at?.label ?? null), outcome: road.outcome, state: at?.state ?? "waiting" };
}
