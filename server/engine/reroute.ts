import { evaluateCondition } from "@/server/engine/conditions";
import type { FormData, WorkflowDefinition, WorkflowEdge, WorkflowNode } from "@/server/engine/types";

// DR-09 (owner, 2 Nov 2026; audit REC-02): which steps' routing outcome the
// new values of a resubmit change, so the request restarts from the
// earliest of them rather than from the beginning (D-147). Pure.
//   - an approval step whose skip rule (incl. a DoA band) now answers differently;
//   - a choice step that now takes another path;
//   - an approval step whose approver comes from a person field that changed (D-246).
// `added` / `removed` are the approval steps now on / no longer on the route,
// for the history entry approvers see.
export interface ReroutePlan {
  changed: boolean;
  affectedNodeIds: string[];
  added: string[];
  removed: string[];
  approverChanged: string[];
}

function chosenEdge(edges: readonly WorkflowEdge[], formData: FormData): WorkflowEdge | undefined {
  const sorted = [...edges].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return sorted.find((edge) => !edge.isDefault && edge.condition && evaluateCondition(edge.condition, formData)) ?? sorted.find((edge) => edge.isDefault);
}

const skips = (node: WorkflowNode, formData: FormData) => node.kind === "APPROVAL" && Boolean(node.skipIf) && evaluateCondition(node.skipIf!, formData);

// The approval steps the values route through (skip rules and choices only;
// who resolves as approver is not known here).
export function routedSteps(definition: WorkflowDefinition, formData: FormData): string[] {
  const nodes = new Map(definition.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, WorkflowEdge[]>();
  for (const edge of definition.edges) outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge]);
  const start = definition.nodes.find((node) => node.kind === "START");
  const seen = new Set<string>();
  const steps: string[] = [];
  const stack = start ? [start.id] : [];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = nodes.get(id);
    if (!node) continue;
    if (node.kind === "APPROVAL" && !skips(node, formData)) steps.push(id);
    const edges = outgoing.get(id) ?? [];
    if (node.kind === "CONDITION") {
      const edge = chosenEdge(edges, formData);
      if (edge) stack.push(edge.to);
    } else {
      for (const edge of edges) stack.push(edge.to);
    }
  }
  const order = new Map(definition.nodes.map((node, index) => [node.id, index]));
  return steps.sort((a, b) => order.get(a)! - order.get(b)!);
}

export function planReroute(definition: WorkflowDefinition, before: FormData, after: FormData): ReroutePlan {
  const affected: string[] = [];
  const approverChanged: string[] = [];
  for (const node of definition.nodes) {
    if (node.kind === "APPROVAL") {
      if (node.skipIf && evaluateCondition(node.skipIf, before) !== evaluateCondition(node.skipIf, after)) affected.push(node.id);
      const fields = node.approvers.flatMap((source) => (source.type === "FORM_FIELD_USER" ? [source.fieldKey] : []));
      if (fields.some((key) => String(before[key] ?? "") !== String(after[key] ?? ""))) {
        approverChanged.push(node.id);
        if (!affected.includes(node.id)) affected.push(node.id);
      }
    } else if (node.kind === "CONDITION") {
      const edges = definition.edges.filter((edge) => edge.from === node.id);
      if (chosenEdge(edges, before)?.id !== chosenEdge(edges, after)?.id) affected.push(node.id);
    }
  }
  const was = routedSteps(definition, before);
  const now = routedSteps(definition, after);
  return {
    changed: affected.length > 0,
    affectedNodeIds: affected,
    added: now.filter((id) => !was.includes(id)),
    removed: was.filter((id) => !now.includes(id)),
    approverChanged: approverChanged.filter((id) => now.includes(id)),
  };
}
