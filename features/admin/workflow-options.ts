import "server-only";
import { loadFieldLookups } from "@/lib/db/repositories/lookups.repository";
import { listApproverOptions } from "@/lib/db/repositories/approvers.repository";
import { listDepartments, listDesignations } from "@/lib/db/repositories/organisation.repository";
import { listGroups, listRoleCodes } from "@/lib/db/repositories/groups.repository";
import { listActiveUserOptions } from "@/lib/db/repositories/admin-users.repository";
import type { BuilderOptions } from "@/features/admin/WorkflowBuilder";

// D-085: named approvers are approver-eligible people; `keep` = people already
// named in the workflow being edited, so they stay visible until changed.
export async function loadBuilderOptions(keep: readonly number[] = []): Promise<BuilderOptions> {
  const [people, roles, departments, groups, lookups, designations, anyone] = await Promise.all([listApproverOptions(keep), listRoleCodes(), listDepartments(), listGroups(), loadFieldLookups(), listDesignations(), listActiveUserOptions()]);
  return {
    people: people.map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` })),
    // v1.8.0: work tasks and FYIs can name anyone active.
    anyone: anyone.map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` })),
    roles,
    departments: departments.filter((department) => department.active).map((department) => ({ id: department.id, label: `${department.name} (${department.code})` })),
    groups: groups.filter((group) => group.active).map((group) => ({ id: group.id, label: `${group.name} (${group.members.length})` })),
    // Approval steps take approver designations only (D-085); work and FYI any.
    designations: designations.filter((designation) => designation.active).map((designation) => ({ id: designation.id, label: designation.name, approver: designation.isApprover })),
    lookups,
  };
}
