import { collectFields, isGroup } from "@/server/engine/conditions";
import type { ApproverSource, Comparison, Condition, WorkflowDefinition, WorkflowEdge, WorkflowNode } from "@/server/engine/types";

// Workflow validator (P3-04, F-50). Runs before a workflow is published and
// on every custom approval before submission (P5-03). Errors block; warnings
// are shown. Built to catch, among others, the Asana defects:
//   G-08 impossible conditions ("Nature is A AND Nature is B")
//   G-09 approver sources that can never match (unknown role / user / field)
// Reject / hold / changes-requested are handled uniformly by the engine at
// every level, so the Finance Internal level-2 gap (G-10) cannot recur.

export interface ValidationIssue {
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

// Optional knowledge about the organisation and the form, so sources and
// fields can be checked (G-09).
export interface ValidationContext {
  knownRoleCodes?: readonly string[];
  knownUserIds?: readonly number[];
  knownDepartmentIds?: readonly number[];
  knownGroupIds?: readonly number[];
  knownDesignationIds?: readonly number[];
  formFieldKeys?: readonly string[];
}

const VALUE_OPERATORS = new Set(["EQ", "NEQ", "GT", "GTE", "LT", "LTE", "IN", "NOT_IN", "CONTAINS"]);
const NUMERIC_OPERATORS = new Set(["GT", "GTE", "LT", "LTE"]);

export function validateWorkflow(definition: WorkflowDefinition, context: ValidationContext = {}): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const nodes = new Map<string, WorkflowNode>();

  for (const node of definition.nodes) {
    if (!node.id) errors.push({ code: "NODE_ID_MISSING", message: "A step has no id." });
    else if (nodes.has(node.id)) errors.push({ code: "NODE_ID_DUPLICATE", message: `Step id "${node.id}" is used twice.`, nodeId: node.id });
    else nodes.set(node.id, node);
  }

  const outgoing = new Map<string, WorkflowEdge[]>();
  const incoming = new Map<string, WorkflowEdge[]>();
  for (const node of nodes.values()) {
    outgoing.set(node.id, []);
    incoming.set(node.id, []);
  }
  const edgeIds = new Set<string>();
  for (const edge of definition.edges) {
    if (edgeIds.has(edge.id)) errors.push({ code: "EDGE_ID_DUPLICATE", message: `Connection id "${edge.id}" is used twice.`, edgeId: edge.id });
    edgeIds.add(edge.id);
    if (!nodes.has(edge.from) || !nodes.has(edge.to)) {
      errors.push({ code: "EDGE_DANGLING", message: "A connection points to a step that doesn't exist.", edgeId: edge.id });
      continue;
    }
    if (edge.from === edge.to) {
      errors.push({ code: "EDGE_SELF_LOOP", message: "A step can't connect to itself.", edgeId: edge.id });
      continue;
    }
    outgoing.get(edge.from)!.push(edge);
    incoming.get(edge.to)!.push(edge);
  }

  const starts = [...nodes.values()].filter((node) => node.kind === "START");
  const ends = [...nodes.values()].filter((node) => node.kind === "END");
  if (starts.length !== 1) errors.push({ code: "START_COUNT", message: "A workflow needs exactly one Start." });
  if (ends.length === 0) errors.push({ code: "END_MISSING", message: "A workflow needs an End." });
  if (![...nodes.values()].some((node) => node.kind === "APPROVAL" && node.mode !== "WORK")) {
    errors.push({ code: "NO_APPROVAL_STEP", message: "A workflow needs at least one approval step." });
  }

  for (const node of nodes.values()) {
    const outs = outgoing.get(node.id)!;
    const ins = incoming.get(node.id)!;
    const where = { nodeId: node.id };
    switch (node.kind) {
      case "START":
        if (ins.length > 0) errors.push({ code: "START_HAS_INCOMING", message: "Nothing can lead into Start.", ...where });
        if (outs.length !== 1) errors.push({ code: "START_OUTGOING", message: "Start must lead to exactly one step.", ...where });
        break;
      case "END":
        if (outs.length > 0) errors.push({ code: "END_HAS_OUTGOING", message: "End can't lead anywhere.", ...where });
        break;
      case "APPROVAL":
        validateApprovalNode(node, errors, warnings, context);
        if (outs.length !== 1) errors.push({ code: "APPROVAL_OUTGOING", message: `"${node.label}" must lead to exactly one next step.`, ...where });
        if (node.skipIf) validateCondition(node.skipIf, node.id, undefined, errors, warnings, context);
        break;
      case "NOTIFY":
        if (!node.recipients.length) errors.push({ code: "NOTIFY_RECIPIENTS_MISSING", message: `"${node.label}" tells nobody. Pick who to inform.`, ...where });
        node.recipients.forEach((source) => checkSource(source, node.label, where, errors, context));
        if (outs.length !== 1) errors.push({ code: "NOTIFY_OUTGOING", message: `"${node.label}" must lead to exactly one next step.`, ...where });
        break;
      case "SPLIT":
        if (outs.length < 2) errors.push({ code: "SPLIT_BRANCHES", message: `"${node.label}" needs at least two parallel branches.`, ...where });
        break;
      case "JOIN": {
        if (ins.length < 2) errors.push({ code: "JOIN_INCOMING", message: `"${node.label}" must bring together at least two branches.`, ...where });
        if (outs.length !== 1) errors.push({ code: "JOIN_OUTGOING", message: `"${node.label}" must lead to exactly one next step.`, ...where });
        if (node.completion.type === "ANY_N") {
          if (node.completion.n < 1) errors.push({ code: "JOIN_N_INVALID", message: `"${node.label}" needs a number of branches of 1 or more.`, ...where });
          else if (node.completion.n > ins.length) {
            errors.push({ code: "JOIN_N_TOO_HIGH", message: `"${node.label}" waits for ${node.completion.n} branches but only ${ins.length} lead into it.`, ...where });
          }
        }
        break;
      }
      case "CONDITION": {
        const defaults = outs.filter((edge) => edge.isDefault);
        if (outs.length < 2) warnings.push({ code: "CONDITION_SINGLE_PATH", message: `"${node.label}" has only one path, so it decides nothing.`, ...where });
        if (defaults.length !== 1) {
          errors.push({ code: "CONDITION_DEFAULT", message: `"${node.label}" needs exactly one "otherwise" path.`, ...where });
        }
        for (const edge of outs) {
          if (edge.isDefault) {
            if (edge.condition) warnings.push({ code: "DEFAULT_HAS_CONDITION", message: "The \"otherwise\" path ignores its condition.", edgeId: edge.id });
            continue;
          }
          if (!edge.condition) errors.push({ code: "EDGE_CONDITION_MISSING", message: `A path from "${node.label}" has no condition.`, edgeId: edge.id });
          else validateCondition(edge.condition, node.id, edge.id, errors, warnings, context);
        }
        break;
      }
    }
    if (node.kind !== "CONDITION") {
      for (const edge of outs) {
        if (edge.condition || edge.isDefault) {
          warnings.push({ code: "CONDITION_IGNORED", message: "Conditions only apply to paths leaving a decision step.", edgeId: edge.id });
        }
      }
    }
  }

  // Structure: everything reachable from Start, every step can reach an
  // End, and no cycles (resubmission is handled by the engine, not loops).
  const start = starts[0];
  if (start && errors.every((issue) => issue.code !== "EDGE_DANGLING")) {
    const reachable = walk(start.id, (id) => outgoing.get(id)!.map((edge) => edge.to));
    for (const node of nodes.values()) {
      if (!reachable.has(node.id)) warnings.push({ code: "UNREACHABLE", message: `"${node.label}" can never be reached.`, nodeId: node.id });
    }
    const canFinish = new Set<string>();
    for (const end of ends) walk(end.id, (id) => incoming.get(id)!.map((edge) => edge.from)).forEach((id) => canFinish.add(id));
    for (const id of reachable) {
      if (!canFinish.has(id)) errors.push({ code: "DEAD_END", message: `"${nodes.get(id)!.label}" never reaches End.`, nodeId: id });
    }
    const cycle = findCycle([...nodes.keys()], (id) => outgoing.get(id)!.map((edge) => edge.to));
    if (cycle) errors.push({ code: "CYCLE", message: "The workflow loops back on itself.", nodeId: cycle });

    // Parallel branches should come back together before End.
    for (const node of nodes.values()) {
      if (node.kind !== "SPLIT") continue;
      for (const edge of outgoing.get(node.id)!) {
        if (reachesEndWithoutJoin(edge.to, outgoing, nodes)) {
          warnings.push({ code: "SPLIT_NOT_JOINED", message: `A branch after "${node.label}" reaches End without joining the others.`, edgeId: edge.id });
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateApprovalNode(
  node: Extract<WorkflowNode, { kind: "APPROVAL" }>,
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
  context: ValidationContext,
): void {
  const where = { nodeId: node.id };
  if (!node.approvers.length) {
    errors.push({ code: "APPROVERS_MISSING", message: `"${node.label}" has no approver.`, ...where });
    return;
  }
  const userIds = new Set<number>();
  let onlyUsers = true;
  for (const source of node.approvers) {
    if (source.type === "USER") {
      if (userIds.has(source.userId)) warnings.push({ code: "APPROVER_DUPLICATE", message: `"${node.label}" lists the same person twice.`, ...where });
      userIds.add(source.userId);
    } else {
      onlyUsers = false;
    }
    // No self-approval: the requester can only be given work, never a decision.
    if (source.type === "REQUESTER" && node.mode !== "WORK") {
      errors.push({ code: "APPROVER_IS_REQUESTER", message: `"${node.label}": the requester can't approve their own request. Make it a work step, or pick someone else.`, ...where });
    }
    checkSource(source, node.label, where, errors, context);
  }
  // D-273: only a work step can run in the background.
  if (node.background && node.mode !== "WORK") {
    errors.push({ code: "BACKGROUND_NOT_WORK", message: `"${node.label}": only a work step can let the request move on without waiting.`, ...where });
  }
  if (node.completion.type === "ANY_N") {
    if (node.completion.n < 1) errors.push({ code: "ANY_N_INVALID", message: `"${node.label}" needs a number of approvals of 1 or more.`, ...where });
    else if (onlyUsers && node.completion.n > userIds.size) {
      errors.push({ code: "ANY_N_TOO_HIGH", message: `"${node.label}" needs ${node.completion.n} approvals but only ${userIds.size} people are listed.`, ...where });
    } else if (node.completion.n === 1) {
      warnings.push({ code: "ANY_N_IS_ANY_ONE", message: `"${node.label}": "any 1" is the same as "any one".`, ...where });
    }
  }
}

// Whether a source can ever match anybody (G-09).
function checkSource(source: ApproverSource, label: string, where: { nodeId: string }, errors: ValidationIssue[], context: ValidationContext): void {
  switch (source.type) {
    case "USER":
      if (context.knownUserIds && !context.knownUserIds.includes(source.userId)) {
        errors.push({ code: "APPROVER_UNKNOWN_USER", message: `"${label}" names a person who doesn't exist or is inactive.`, ...where });
      }
      break;
    case "ROLE":
      if (context.knownRoleCodes && !context.knownRoleCodes.includes(source.roleCode)) {
        errors.push({ code: "APPROVER_UNKNOWN_ROLE", message: `"${label}" uses role "${source.roleCode}", which doesn't exist.`, ...where });
      }
      break;
    case "DEPARTMENT_HOD":
      if (context.knownDepartmentIds && !context.knownDepartmentIds.includes(source.departmentId)) {
        errors.push({ code: "APPROVER_UNKNOWN_DEPARTMENT", message: `"${label}" uses a department that doesn't exist.`, ...where });
      }
      break;
    case "GROUP":
      if (context.knownGroupIds && !context.knownGroupIds.includes(source.groupId)) {
        errors.push({ code: "APPROVER_UNKNOWN_GROUP", message: `"${label}" uses a group that doesn't exist.`, ...where });
      }
      break;
    case "DESIGNATION":
      if (context.knownDesignationIds && !context.knownDesignationIds.includes(source.designationId)) {
        errors.push({ code: "APPROVER_UNKNOWN_DESIGNATION", message: `"${label}" uses a designation that doesn't exist or isn't active.`, ...where });
      }
      break;
    case "FORM_FIELD_USER":
      if (context.formFieldKeys && !context.formFieldKeys.includes(source.fieldKey)) {
        errors.push({ code: "APPROVER_UNKNOWN_FIELD", message: `"${label}" reads the approver from field "${source.fieldKey}", which isn't on the form.`, ...where });
      }
      break;
    default:
      break;
  }
}

function validateCondition(
  condition: Condition,
  nodeId: string,
  edgeId: string | undefined,
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
  context: ValidationContext,
): void {
  const where = { nodeId, edgeId };
  if (isGroup(condition)) {
    if (!condition.conditions.length) {
      errors.push({ code: "CONDITION_EMPTY", message: "A condition group is empty.", ...where });
      return;
    }
    condition.conditions.forEach((child) => validateCondition(child, nodeId, edgeId, errors, warnings, context));
    if (condition.op === "AND") {
      const conflict = findAndConflict(condition.conditions.filter((child): child is Comparison => !isGroup(child)));
      if (conflict) errors.push({ code: "CONDITION_IMPOSSIBLE", message: conflict, ...where });
    }
    return;
  }
  if (!condition.field) errors.push({ code: "CONDITION_FIELD_MISSING", message: "A condition has no field.", ...where });
  if (VALUE_OPERATORS.has(condition.operator) && (condition.value === undefined || condition.value === "")) {
    errors.push({ code: "CONDITION_VALUE_MISSING", message: `The condition on "${condition.field}" has no value.`, ...where });
  }
  // "More / less" compares numbers, or dates written YYYY-MM-DD (S12-04).
  if (NUMERIC_OPERATORS.has(condition.operator) && typeof condition.value !== "number" && !(typeof condition.value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(condition.value))) {
    errors.push({ code: "CONDITION_VALUE_NOT_NUMBER", message: `The condition on "${condition.field}" needs a number or a date.`, ...where });
  }
  if ((condition.operator === "IN" || condition.operator === "NOT_IN") && !Array.isArray(condition.value)) {
    errors.push({ code: "CONDITION_VALUE_NOT_LIST", message: `The condition on "${condition.field}" needs a list of values.`, ...where });
  }
  if (context.formFieldKeys) {
    for (const field of collectFields(condition)) {
      if (!context.formFieldKeys.includes(field)) {
        errors.push({ code: "CONDITION_UNKNOWN_FIELD", message: `The condition uses "${field}", which isn't on the form.`, ...where });
      }
    }
  }
}

// G-08: comparisons joined by AND that can never all be true.
function findAndConflict(comparisons: Comparison[]): string | null {
  const byField = new Map<string, Comparison[]>();
  for (const comparison of comparisons) {
    const list = byField.get(comparison.field) ?? [];
    list.push(comparison);
    byField.set(comparison.field, list);
  }
  for (const [field, list] of byField) {
    const equalities = list.filter((c) => c.operator === "EQ").map((c) => String(c.value).trim().toLowerCase());
    if (new Set(equalities).size > 1) {
      return `"${field}" can't equal two different values at once. Use OR instead of AND.`;
    }
    const eq = equalities[0];
    if (eq !== undefined && list.some((c) => c.operator === "NEQ" && String(c.value).trim().toLowerCase() === eq)) {
      return `"${field}" can't be equal and not equal to the same value.`;
    }
    let low = -Infinity;
    let lowInclusive = true;
    let high = Infinity;
    let highInclusive = true;
    for (const c of list) {
      if (typeof c.value !== "number") continue;
      if ((c.operator === "GT" || c.operator === "GTE") && c.value >= low) {
        lowInclusive = c.value === low ? lowInclusive && c.operator === "GTE" : c.operator === "GTE";
        low = c.value;
      }
      if ((c.operator === "LT" || c.operator === "LTE") && c.value <= high) {
        highInclusive = c.value === high ? highInclusive && c.operator === "LTE" : c.operator === "LTE";
        high = c.value;
      }
    }
    if (low > high || (low === high && !(lowInclusive && highInclusive))) {
      return `No value of "${field}" can meet all of these limits.`;
    }
  }
  return null;
}

function walk(startId: string, next: (id: string) => string[]): Set<string> {
  const seen = new Set<string>([startId]);
  const stack = [startId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const target of next(id)) {
      if (!seen.has(target)) {
        seen.add(target);
        stack.push(target);
      }
    }
  }
  return seen;
}

function findCycle(ids: string[], next: (id: string) => string[]): string | null {
  const state = new Map<string, 1 | 2>();
  const visit = (id: string): string | null => {
    state.set(id, 1);
    for (const target of next(id)) {
      const s = state.get(target);
      if (s === 1) return target;
      if (s === undefined) {
        const found = visit(target);
        if (found) return found;
      }
    }
    state.set(id, 2);
    return null;
  };
  for (const id of ids) {
    if (!state.has(id)) {
      const found = visit(id);
      if (found) return found;
    }
  }
  return null;
}

function reachesEndWithoutJoin(
  fromId: string,
  outgoing: Map<string, WorkflowEdge[]>,
  nodes: Map<string, WorkflowNode>,
): boolean {
  const seen = new Set<string>();
  const stack = [fromId];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = nodes.get(id);
    if (!node || node.kind === "JOIN") continue;
    if (node.kind === "END") return true;
    for (const edge of outgoing.get(id) ?? []) stack.push(edge.to);
  }
  return false;
}
