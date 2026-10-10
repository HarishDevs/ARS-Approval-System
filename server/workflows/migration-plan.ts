import type { InstanceState, InstanceStatus, WorkflowDefinition, WorkflowNode } from "@/server/engine";
import type { FormField } from "@/server/forms/fields";

// FN7 migration assistant: can an open request move from its workflow
// version to another one? Pure and unit-tested. Completed decisions are
// never touched: a request moves only when every step it has reached exists
// in the target (same id, or an explicit mapping) with the same kind.
export type Verdict = "COMPATIBLE" | "WARNINGS" | "MANUAL" | "BLOCKED";

export const VERDICT_LABEL: Record<Verdict, string> = {
  COMPATIBLE: "Compatible",
  WARNINGS: "Compatible with warnings",
  MANUAL: "Needs manual review",
  BLOCKED: "Can't be moved safely",
};

export interface MigrationCheck {
  verdict: Verdict;
  reasons: string[];
  unmapped: { id: string; label: string; kind: WorkflowNode["kind"] }[]; // reached steps missing in the target
  currentSteps: string[]; // labels of the steps waiting now
}

export type StepMapping = Readonly<Record<string, string>>; // source node id → target node id

const OPEN: readonly InstanceStatus[] = ["IN_PROGRESS", "ON_HOLD", "CHANGES_REQUIRED"];

export function checkMigration(input: {
  source: { id: number; definition: WorkflowDefinition; form: readonly FormField[] };
  target: { id: number; definition: WorkflowDefinition; form: readonly FormField[] };
  request: { status: InstanceStatus; state: InstanceState; formData: Record<string, unknown> };
  mapping?: StepMapping;
}): MigrationCheck {
  const { source, target, request } = input;
  const mapping = input.mapping ?? {};
  const reasons: string[] = [];
  const warnings: string[] = [];
  const unmapped: MigrationCheck["unmapped"] = [];
  const sourceNode = new Map(source.definition.nodes.map((node) => [node.id, node]));
  const targetNode = new Map(target.definition.nodes.map((node) => [node.id, node]));
  const targetEdges = new Set(target.definition.edges.map((edge) => edge.id));
  const currentSteps = Object.entries(request.state.nodes)
    .filter(([, node]) => node.status === "ACTIVE" || node.status === "BLOCKED")
    .map(([id]) => sourceNode.get(id)?.label ?? id);

  if (source.id === target.id) return { verdict: "BLOCKED", reasons: ["It already uses this version."], unmapped, currentSteps };
  if (!OPEN.includes(request.status)) return { verdict: "BLOCKED", reasons: ["It is finished; finished requests keep their version."], unmapped, currentSteps };

  let blocked = false;
  // Every step the request has reached (anything but WAITING) must exist.
  for (const [id, nodeState] of Object.entries(request.state.nodes)) {
    if (nodeState.status === "WAITING") continue;
    const from = sourceNode.get(id);
    const toId = mapping[id] ?? id;
    const to = targetNode.get(toId);
    if (!to) {
      unmapped.push({ id, label: from?.label ?? id, kind: from?.kind ?? "APPROVAL" });
      continue;
    }
    if (from && from.kind !== to.kind) {
      blocked = true;
      reasons.push(`"${from.label}" is a ${from.kind.toLowerCase()} step here but "${to.label}" is a ${to.kind.toLowerCase()} step in the target.`);
      continue;
    }
    if (nodeState.status === "ACTIVE" && from && to && to.kind === "APPROVAL" && from.kind === "APPROVAL") {
      if (JSON.stringify(from.approvers) !== JSON.stringify(to.approvers)) warnings.push(`"${to.label}" (waiting now) has different approvers in the target. People already asked keep their tasks; the new list applies to new tasks.`);
      if (JSON.stringify(from.completion) !== JSON.stringify(to.completion)) warnings.push(`"${to.label}" (waiting now) completes by a different rule in the target; the new rule decides when it is done.`);
    }
  }
  // Mapped targets must not collide (two reached steps onto one).
  const usedTargets = new Map<string, string>();
  for (const [id, nodeState] of Object.entries(request.state.nodes)) {
    if (nodeState.status === "WAITING") continue;
    const toId = mapping[id] ?? id;
    const other = usedTargets.get(toId);
    if (other && other !== id) {
      blocked = true;
      reasons.push(`Two reached steps would become the same step "${targetNode.get(toId)?.label ?? toId}".`);
    }
    usedTargets.set(toId, id);
  }
  // A parallel join part-way through keeps the routes that have arrived.
  for (const [joinId, edgeIds] of Object.entries(request.state.joins ?? {})) {
    if (!edgeIds.length) continue;
    const missing = edgeIds.filter((edgeId) => !targetEdges.has(edgeId));
    if (missing.length || !targetNode.has(mapping[joinId] ?? joinId)) {
      blocked = true;
      reasons.push(`Parallel branches are part-way through "${sourceNode.get(joinId)?.label ?? joinId}" and the target changes how they join.`);
    }
  }
  // New steps placed before where the request is now won't run for it.
  const reached = new Set(Object.entries(request.state.nodes).filter(([, node]) => node.status !== "WAITING").map(([nodeId]) => mapping[nodeId] ?? nodeId));
  const active = Object.entries(request.state.nodes).filter(([, node]) => node.status === "ACTIVE" || node.status === "BLOCKED").map(([nodeId]) => mapping[nodeId] ?? nodeId);
  const upstream = new Set<string>();
  const queue = [...active];
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of target.definition.edges) if (edge.to === current && !upstream.has(edge.from)) {
      upstream.add(edge.from);
      queue.push(edge.from);
    }
  }
  for (const nodeId of upstream) {
    const node = targetNode.get(nodeId);
    if (node && !reached.has(nodeId) && (node.kind === "APPROVAL" || node.kind === "NOTIFY")) warnings.push(`"${node.label}" comes before where this request is now, so it won't run for this request.`);
  }
  // New required fields this request has no value for.
  const known = new Set(source.form.map((field) => field.key));
  for (const field of target.form) {
    if (field.type === "SECTION" || field.type === "CALC" || !field.required) continue;
    const value = request.formData[field.key];
    if (value === undefined || value === null || value === "") warnings.push(`"${field.label}" is ${known.has(field.key) ? "now required" : "a new required field"} and this request has no value; later steps that use it may route differently.`);
  }

  if (blocked) return { verdict: "BLOCKED", reasons, unmapped, currentSteps };
  if (unmapped.length) {
    return { verdict: "MANUAL", reasons: [...unmapped.map((step) => `"${step.label}" has been reached but isn't in the target. Choose which step it becomes.`), ...warnings], unmapped, currentSteps };
  }
  return { verdict: warnings.length ? "WARNINGS" : "COMPATIBLE", reasons: warnings, unmapped, currentSteps };
}

// Rename mapped step ids everywhere the state refers to them, and line the
// step list up with the target (the engine keeps an entry for every step):
// steps only in the target start as WAITING, and unreached steps the target
// no longer has are dropped. Decisions, tasks, holds and rounds stay.
export function remapState(state: InstanceState, mapping: StepMapping, target?: WorkflowDefinition): InstanceState {
  const id = (value: string) => mapping[value] ?? value;
  if (!Object.keys(mapping).length && !target) return state;
  const next: InstanceState = JSON.parse(JSON.stringify(state)) as InstanceState;
  next.nodes = Object.fromEntries(Object.entries(state.nodes).map(([key, value]) => [id(key), value]));
  if (target) {
    const ids = new Set(target.nodes.map((node) => node.id));
    for (const [key, value] of Object.entries(next.nodes)) if (!ids.has(key) && value.status === "WAITING") delete next.nodes[key];
    for (const node of target.nodes) next.nodes[node.id] ??= { status: "WAITING" };
  }
  next.tasks = state.tasks.map((task) => ({ ...task, nodeId: id(task.nodeId) }));
  next.joins = Object.fromEntries(Object.entries(state.joins ?? {}).map(([key, value]) => [id(key), value]));
  if (state.hold) next.hold = { ...state.hold, nodeId: id(state.hold.nodeId) };
  if (state.changesRequested) next.changesRequested = { ...state.changesRequested, nodeId: id(state.changesRequested.nodeId), openNodeIds: state.changesRequested.openNodeIds.map(id) };
  return next;
}

// Mapping is only allowed onto a target step of the same kind.
export function cleanMapping(raw: Record<string, string>, source: WorkflowDefinition, target: WorkflowDefinition): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [from, to] of Object.entries(raw)) {
    const a = source.nodes.find((node) => node.id === from);
    const b = target.nodes.find((node) => node.id === to);
    if (a && b && a.kind === b.kind && !target.nodes.some((node) => node.id === from)) out[from] = to;
  }
  return out;
}
