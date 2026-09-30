import type { BuilderSpec, BuilderStep } from "@/server/workflows/builder";
import type { ApprovalNode, CompletionRule, InstanceState, NodeStatus, TaskStatus, WorkflowDefinition } from "@/server/engine/types";

// The request page's level map (S3-05b, F-14): every level and branch with
// its status and people. Pure and unit-tested. Uses the builder's stages
// when the version has them; otherwise lists approval steps in graph order.
export interface MapPerson {
  userId: number;
  name: string;
  status: TaskStatus;
  decidedByName?: string; // only when a delegate acted
  comment?: string;
  decidedAt?: string;
}

export interface MapStep {
  nodeId: string;
  label: string;
  status: NodeStatus;
  rule: string; // "All must approve", "Any one", "Any 2"
  reason?: string; // skipped / blocked reason
  people: MapPerson[];
}

export interface MapStage {
  kind: "STEP" | "PARALLEL";
  label: string;
  joinRule?: string;
  steps: MapStep[];
}

export function describeRule(rule: CompletionRule, count: number): string {
  if (rule.type === "ALL") return count > 1 ? `All ${count} must approve` : "Must approve";
  if (rule.type === "ANY_ONE") return count > 1 ? `Any one of ${count}` : "Must approve";
  return `Any ${rule.n} of ${count}`;
}

function describeJoin(rule: CompletionRule): string {
  if (rule.type === "ALL") return "All branches must finish";
  if (rule.type === "ANY_ONE") return "Any one branch is enough";
  return `Any ${rule.n} branches`;
}

const REASONS: Record<string, string> = {
  SKIP_CONDITION: "Skipped: its condition didn't apply",
  NO_APPROVER: "Skipped: nobody to approve",
  NO_ELIGIBLE_APPROVER: "Blocked: no eligible approver (IT has been told)",
  NOT_ENOUGH_APPROVERS: "Blocked: not enough approvers (IT has been told)",
  NO_MATCHING_BRANCH: "Blocked: no path matches (IT has been told)",
};

function mapStep(node: ApprovalNode, state: InstanceState, names: ReadonlyMap<number, string>): MapStep {
  const nodeState = state.nodes[node.id];
  // The step's latest round: the current one, or the round it was finished
  // in when a resubmission kept it (earlier rounds are in the timeline).
  const nodeTasks = state.tasks.filter((task) => task.nodeId === node.id);
  const latestRound = nodeTasks.reduce((max, task) => Math.max(max, task.round), 0);
  const tasks = nodeTasks.filter((task) => task.round === latestRound);
  const people: MapPerson[] = tasks.map((task) => ({
    userId: task.approverId,
    name: names.get(task.approverId) ?? `User #${task.approverId}`,
    status: task.status,
    ...(task.decidedBy && task.decidedBy !== task.approverId ? { decidedByName: names.get(task.decidedBy) ?? `User #${task.decidedBy}` } : {}),
    ...(task.comment ? { comment: task.comment } : {}),
    ...(task.decidedAt ? { decidedAt: task.decidedAt } : {}),
  }));
  const reason = nodeState?.reason ? (REASONS[nodeState.reason] ?? nodeState.reason) : undefined;
  return {
    nodeId: node.id,
    label: node.label,
    status: nodeState?.status ?? "WAITING",
    rule: describeRule(node.completion, Math.max(people.length, 1)),
    ...(reason ? { reason } : {}),
    people,
  };
}

// Approval nodes in the order a request meets them (breadth-first from Start).
function graphOrder(definition: WorkflowDefinition): ApprovalNode[] {
  const next = new Map<string, string[]>();
  for (const edge of definition.edges) next.set(edge.from, [...(next.get(edge.from) ?? []), edge.to]);
  const byId = new Map(definition.nodes.map((node) => [node.id, node]));
  const start = definition.nodes.find((node) => node.kind === "START");
  const seen = new Set<string>();
  const order: ApprovalNode[] = [];
  const queue = start ? [start.id] : [];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = byId.get(id);
    if (node?.kind === "APPROVAL") order.push(node);
    queue.push(...(next.get(id) ?? []));
  }
  return order;
}

export function buildStepMap(definition: WorkflowDefinition, state: InstanceState, spec: BuilderSpec | null, names: ReadonlyMap<number, string>): MapStage[] {
  const approvalNodes = new Map(
    definition.nodes.filter((node): node is ApprovalNode => node.kind === "APPROVAL").map((node) => [node.id, node]),
  );
  const nodeFor = (step: BuilderStep) => approvalNodes.get(`step_${step.id}`);

  if (spec) {
    const stages: MapStage[] = [];
    for (const stage of spec.stages) {
      if (stage.kind === "STEP") {
        const node = nodeFor(stage.step);
        if (node) stages.push({ kind: "STEP", label: node.label, steps: [mapStep(node, state, names)] });
      } else {
        const steps = stage.steps.map(nodeFor).filter((node): node is ApprovalNode => !!node).map((node) => mapStep(node, state, names));
        const joinRule: CompletionRule = stage.join === "ANY_N" ? { type: "ANY_N", n: stage.n ?? 1 } : { type: stage.join };
        stages.push({ kind: "PARALLEL", label: stage.label, joinRule: describeJoin(joinRule), steps });
      }
    }
    return stages;
  }
  return graphOrder(definition).map((node) => ({ kind: "STEP", label: node.label, steps: [mapStep(node, state, names)] }));
}

// Everyone the page needs a name for.
export function peopleInState(state: InstanceState): number[] {
  const ids = new Set<number>();
  for (const task of state.tasks) {
    ids.add(task.approverId);
    if (task.decidedBy) ids.add(task.decidedBy);
    if (task.onBehalfOf) ids.add(task.onBehalfOf);
  }
  return [...ids];
}
