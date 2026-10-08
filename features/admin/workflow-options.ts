import "server-only";
import { listApproverOptions } from "@/lib/db/repositories/approvers.repository";
import { listDepartments } from "@/lib/db/repositories/organisation.repository";
import { listGroups, listRoleCodes } from "@/lib/db/repositories/groups.repository";
import type { BuilderOptions } from "@/features/admin/WorkflowBuilder";

// D-085: named approvers are approver-eligible people; `keep` = people already
// named in the workflow being edited, so they stay visible until changed.
export async function loadBuilderOptions(keep: readonly number[] = []): Promise<BuilderOptions> {
  const [people, roles, departments, groups] = await Promise.all([listApproverOptions(keep), listRoleCodes(), listDepartments(), listGroups()]);
  return {
    people: people.map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` })),
    roles,
    departments: departments.filter((department) => department.active).map((department) => ({ id: department.id, label: `${department.name} (${department.code})` })),
    groups: groups.filter((group) => group.active).map((group) => ({ id: group.id, label: `${group.name} (${group.members.length})` })),
  };
}
