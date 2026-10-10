import type { WorkflowDefinition, WorkflowEdge, WorkflowNode } from "@/server/engine";
import type { FormField } from "@/server/forms/fields";

// Workflow version comparison (unified prompt: version diff, FN7 input).
// Pure: steps, routes and form fields added, removed or changed between two
// versions, in plain words.
export interface DiffItem {
  id: string;
  label: string;
}
export interface ChangedItem extends DiffItem {
  changes: string[];
}
export interface Section {
  added: DiffItem[];
  removed: DiffItem[];
  changed: ChangedItem[];
}
export interface VersionDiff {
  steps: Section;
  routes: Section;
  fields: Section;
  same: boolean;
}

const NODE_WORDS: Record<string, string> = {
  label: "name",
  kind: "step type",
  approvers: "approvers",
  completion: "completion rule",
  skipIf: "skip rule",
  onNoApprover: "what happens when nobody can approve",
  slaHours: "response time",
  mode: "approval or work setting",
  recipients: "who is told",
  note: "note",
};
const FIELD_WORDS: Record<string, string> = {
  label: "label",
  type: "type",
  required: "required",
  options: "choices",
  showIf: "show rule",
  requiredIf: "required rule",
  formula: "formula",
  min: "minimum",
  max: "maximum",
  maxLength: "maximum length",
  decimals: "decimals",
  defaultValue: "default",
  source: "list",
  help: "help text",
  neededBy: "needed-by setting",
};

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function changedKeys(before: Record<string, unknown>, after: Record<string, unknown>, words: Record<string, string>, skip: readonly string[] = []): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out: string[] = [];
  for (const key of keys) {
    if (skip.includes(key) || same(before[key], after[key])) continue;
    const word = words[key] ?? key;
    if (key === "label") out.push(`renamed from "${String(before.label ?? "")}" to "${String(after.label ?? "")}"`);
    else if (key === "required") out.push(after.required ? "now required" : "no longer required");
    else out.push(`${word} changed`);
  }
  return [...new Set(out)];
}

function section<T>(before: readonly T[], after: readonly T[], idOf: (item: T) => string, labelOf: (item: T) => string, changesOf: (a: T, b: T) => string[]): Section {
  const beforeMap = new Map(before.map((item) => [idOf(item), item]));
  const afterMap = new Map(after.map((item) => [idOf(item), item]));
  const out: Section = { added: [], removed: [], changed: [] };
  for (const [id, item] of afterMap) if (!beforeMap.has(id)) out.added.push({ id, label: labelOf(item) });
  for (const [id, item] of beforeMap) {
    const next = afterMap.get(id);
    if (!next) out.removed.push({ id, label: labelOf(item) });
    else {
      const changes = changesOf(item, next);
      if (changes.length) out.changed.push({ id, label: labelOf(next), changes });
    }
  }
  return out;
}

export function diffVersions(before: { definition: WorkflowDefinition; form: readonly FormField[] }, after: { definition: WorkflowDefinition; form: readonly FormField[] }): VersionDiff {
  const nodeLabel = (definition: WorkflowDefinition) => (id: string) => definition.nodes.find((node) => node.id === id)?.label ?? id;
  const routeLabel = (definition: WorkflowDefinition) => (edge: WorkflowEdge) => `${nodeLabel(definition)(edge.from)} → ${nodeLabel(definition)(edge.to)}`;
  const steps = section<WorkflowNode>(
    before.definition.nodes,
    after.definition.nodes,
    (node) => node.id,
    (node) => node.label,
    (a, b) => changedKeys(a as unknown as Record<string, unknown>, b as unknown as Record<string, unknown>, NODE_WORDS, ["id"]),
  );
  const routes = section<WorkflowEdge>(
    before.definition.edges,
    after.definition.edges,
    (edge) => edge.id,
    routeLabel(after.definition),
    (a, b) => {
      const out: string[] = [];
      if (a.from !== b.from || a.to !== b.to) out.push(`now ${routeLabel(after.definition)(b)} (was ${routeLabel(before.definition)(a)})`);
      if (!same(a.condition, b.condition)) out.push("condition changed");
      if (Boolean(a.isDefault) !== Boolean(b.isDefault)) out.push(b.isDefault ? "now the default route" : "no longer the default route");
      if ((a.order ?? 0) !== (b.order ?? 0)) out.push("checked in a different order");
      return out;
    },
  );
  routes.added = routes.added.map((item) => ({ ...item, label: routeLabel(after.definition)(after.definition.edges.find((edge) => edge.id === item.id)!) }));
  routes.removed = routes.removed.map((item) => ({ ...item, label: routeLabel(before.definition)(before.definition.edges.find((edge) => edge.id === item.id)!) }));
  const fields = section<FormField>(
    before.form,
    after.form,
    (field) => field.key,
    (field) => field.label,
    (a, b) => changedKeys(a as unknown as Record<string, unknown>, b as unknown as Record<string, unknown>, FIELD_WORDS, ["key"]),
  );
  const empty = (s: Section) => !s.added.length && !s.removed.length && !s.changed.length;
  return { steps, routes, fields, same: empty(steps) && empty(routes) && empty(fields) };
}
