import type {
  ApproverSource,
  CompletionRule,
  Condition,
  Directory,
  EngineContext,
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowNode,
} from "@/server/engine/types";

// A small in-memory organisation for engine tests.
//   1  Requester (reports to 2)
//   2  Manager   (reports to 3)
//   3  HOD       (department 10 HOD)
//   4  Finance A, 5 Finance B, 6 Finance C (role FINANCE)
//   7  ED, 8 MD, 9 CFO
//   11 inactive user
//   12 delegate who may act for 7 (ED)
// Designation 20 "Manager": 2, 3, 4, 7. Departments: 1, 2, 3, 4 in 10; 7 in 20.
export function makeDirectory(overrides: Partial<Directory> = {}): Directory {
  const managers: Record<number, number> = { 1: 2, 2: 3 };
  const inactive = new Set([11]);
  const delegations: Record<number, number[]> = { 12: [7] };
  return {
    isActive: (id) => !inactive.has(id),
    managerOf: (id) => managers[id] ?? null,
    departmentHodOf: (id) => ([1, 2].includes(id) ? 3 : null),
    hodOfDepartment: (departmentId) => (departmentId === 10 ? 3 : null),
    usersWithRole: (code) => (code === "FINANCE" ? [4, 5, 6] : code === "EMPTY" ? [] : []),
    groupMembers: (groupId) => (groupId === 1 ? [4, 5, 6, 7] : []),
    canActFor: (actor, approver) => (delegations[actor] ?? []).includes(approver),
    usersWithDesignation: (designationId) => (designationId === 20 ? [2, 3, 4, 7] : []),
    departmentOf: (id) => ([1, 2, 3, 4].includes(id) ? 10 : id === 7 ? 20 : null),
    ...overrides,
  };
}

export function ctx(formData: EngineContext["formData"] = {}, requesterId = 1): EngineContext {
  return { requesterId, formData, now: "2026-09-28T10:00:00.000Z" };
}

export const start = (id = "start"): WorkflowNode => ({ id, kind: "START", label: "Start" });
export const end = (id = "end"): WorkflowNode => ({ id, kind: "END", label: "End" });
export const approval = (
  id: string,
  approvers: ApproverSource[],
  completion: CompletionRule = { type: "ALL" },
  extra: Partial<Extract<WorkflowNode, { kind: "APPROVAL" }>> = {},
): WorkflowNode => ({ id, kind: "APPROVAL", label: id, approvers, completion, ...extra });
export const split = (id: string): WorkflowNode => ({ id, kind: "SPLIT", label: id });
export const join = (id: string, completion: CompletionRule = { type: "ALL" }): WorkflowNode => ({ id, kind: "JOIN", label: id, completion });
export const decision = (id: string): WorkflowNode => ({ id, kind: "CONDITION", label: id });

let edgeCounter = 0;
export function edge(from: string, to: string, extra: { condition?: Condition; isDefault?: boolean; order?: number } = {}): WorkflowEdge {
  edgeCounter += 1;
  return { id: `e${edgeCounter}-${from}-${to}`, from, to, ...extra };
}

export const user = (userId: number): ApproverSource => ({ type: "USER", userId });

// start → a → b → c → end with the given nodes
export function chain(...nodes: WorkflowNode[]): WorkflowDefinition {
  const all = [start(), ...nodes, end()];
  const edges: WorkflowEdge[] = [];
  for (let i = 0; i < all.length - 1; i += 1) edges.push(edge(all[i]!.id, all[i + 1]!.id));
  return { nodes: all, edges };
}
