import { decide, startInstance } from "@/server/engine/engine";
import type { CompletionRule, Directory, EngineContext, EngineEvent, InstanceState, WorkflowDefinition } from "@/server/engine/types";

// Test mode (P3-05, F-50): walks a workflow as if every approver said yes,
// and reports each stage in order, so the IT team can check a workflow with
// sample values ("Amount ₹12,50,000") before publishing.
export interface SimulatedStep {
  nodeId: string;
  label: string;
  approverIds: number[];
  completion: CompletionRule;
}

export interface SimulationResult {
  outcome: "APPROVED" | "BLOCKED";
  stages: SimulatedStep[][]; // steps in one stage run in parallel
  skipped: { nodeId: string; label: string; reason: string }[];
  blocked: { nodeId: string; label: string; reason: string }[];
  branches: { nodeId: string; edgeId: string; isDefault: boolean }[];
}

const MAX_STAGES = 200;

export function simulate(definition: WorkflowDefinition, context: EngineContext, directory: Directory): SimulationResult {
  const labels = new Map(definition.nodes.map((node) => [node.id, node]));
  const result: SimulationResult = { outcome: "APPROVED", stages: [], skipped: [], blocked: [], branches: [] };

  const record = (events: EngineEvent[]) => {
    for (const event of events) {
      if (event.type === "NODE_SKIPPED") result.skipped.push({ nodeId: event.nodeId, label: labels.get(event.nodeId)?.label ?? event.nodeId, reason: event.reason });
      if (event.type === "NODE_BLOCKED") result.blocked.push({ nodeId: event.nodeId, label: labels.get(event.nodeId)?.label ?? event.nodeId, reason: event.reason });
      if (event.type === "BRANCH_TAKEN") result.branches.push({ nodeId: event.nodeId, edgeId: event.edgeId, isDefault: event.isDefault });
    }
  };

  // Simulation directory: delegation off, everyone decides for themselves.
  const simDirectory: Directory = { ...directory, canActFor: () => false };
  let { state, events } = startInstance(definition, context, simDirectory);
  record(events);

  for (let guard = 0; guard < MAX_STAGES && state.status === "IN_PROGRESS"; guard += 1) {
    const open = openApprovalSteps(state, definition);
    if (open.length === 0) {
      result.outcome = "BLOCKED";
      break;
    }
    result.stages.push(open);
    for (const step of open) {
      const needed = step.completion.type === "ALL" ? step.approverIds.length : step.completion.type === "ANY_ONE" ? 1 : step.completion.n;
      const pending = state.tasks.filter((task) => task.nodeId === step.nodeId && task.round === state.round && task.status === "PENDING");
      for (const task of pending.slice(0, needed)) {
        if (state.status !== "IN_PROGRESS") break;
        const current = state.tasks.find((candidate) => candidate.id === task.id);
        if (!current || current.status !== "PENDING") continue;
        ({ state, events } = decide(definition, state, { taskId: task.id, actorId: task.approverId, decision: "APPROVE" }, context, simDirectory));
        record(events);
      }
    }
  }
  if (state.status !== "APPROVED") result.outcome = "BLOCKED";
  return result;
}

function openApprovalSteps(state: InstanceState, definition: WorkflowDefinition): SimulatedStep[] {
  const steps: SimulatedStep[] = [];
  for (const node of definition.nodes) {
    if (node.kind !== "APPROVAL" || state.nodes[node.id]?.status !== "ACTIVE") continue;
    const approverIds = state.tasks
      .filter((task) => task.nodeId === node.id && task.round === state.round && task.status === "PENDING")
      .map((task) => task.approverId);
    steps.push({ nodeId: node.id, label: node.label, approverIds, completion: node.completion });
  }
  return steps;
}
