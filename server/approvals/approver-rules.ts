import type { WorkflowDefinition } from "@/server/engine/types";

// Who can be chosen as an approver (S11-03, D-085, F-72). Pure.
// Eligible = active, not break-glass, and the designation is ticked as an
// approver. The rule applies when someone is *chosen* (a named workflow
// step, a group member, a HOD, a reporting manager, a delegate, a
// requester's pick in a person field that feeds an approver step). A choice
// that was already saved stays valid until it is changed, so existing data
// never breaks when a designation is unticked.
export interface ApproverStatus {
  id: number;
  name: string;
  active: boolean;
  isBreakGlass: boolean;
  designation: string | null;
  designationIsApprover: boolean;
}

export function isApproverEligible(person: Pick<ApproverStatus, "active" | "isBreakGlass" | "designationIsApprover">): boolean {
  return person.active && !person.isBreakGlass && person.designationIsApprover;
}

export function whyNotApprover(person: ApproverStatus | undefined): string {
  if (!person) return "This person no longer exists.";
  if (!person.active) return `${person.name} is inactive.`;
  if (person.isBreakGlass) return "The break-glass account can't be an approver.";
  if (!person.designation) return `${person.name} has no designation, so can't be an approver. Give them a designation ticked as Approver.`;
  return `${person.name} isn't an approver: the designation ${person.designation} isn't ticked as Approver (Admin → Departments → Designations).`;
}

// Messages for the newly chosen people who aren't eligible. `previous` are
// the ids that were already saved (they stay valid).
export function ineligibleChoices(chosen: Iterable<number>, previous: Iterable<number>, statuses: ReadonlyMap<number, ApproverStatus>): string[] {
  const before = new Set(previous);
  const problems: string[] = [];
  for (const id of new Set(chosen)) {
    if (before.has(id)) continue;
    const status = statuses.get(id);
    if (!status || !isApproverEligible(status)) problems.push(whyNotApprover(status));
  }
  return problems;
}

// People named directly in a workflow (USER sources).
export function namedApprovers(definition: Pick<WorkflowDefinition, "nodes">): number[] {
  const ids = new Set<number>();
  for (const node of definition.nodes) {
    if (!("approvers" in node)) continue;
    for (const source of node.approvers) if (source.type === "USER") ids.add(source.userId);
  }
  return [...ids];
}

// Person fields the requester fills in that decide an approver.
export function approverFieldKeys(definition: Pick<WorkflowDefinition, "nodes">): string[] {
  const keys = new Set<string>();
  for (const node of definition.nodes) {
    if (!("approvers" in node)) continue;
    for (const source of node.approvers) if (source.type === "FORM_FIELD_USER") keys.add(source.fieldKey);
  }
  return [...keys];
}
