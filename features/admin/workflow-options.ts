import "server-only";
import { listActiveUserOptions } from "@/lib/db/repositories/admin-users.repository";
import { listDepartments } from "@/lib/db/repositories/organisation.repository";
import { listGroups, listRoleCodes } from "@/lib/db/repositories/groups.repository";
import type { BuilderOptions } from "@/features/admin/WorkflowBuilder";

export async function loadBuilderOptions(): Promise<BuilderOptions> {
  const [people, roles, departments, groups] = await Promise.all([listActiveUserOptions(), listRoleCodes(), listDepartments(), listGroups()]);
  return {
    people: people.map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` })),
    roles,
    departments: departments.filter((department) => department.active).map((department) => ({ id: department.id, label: `${department.name} (${department.code})` })),
    groups: groups.filter((group) => group.active).map((group) => ({ id: group.id, label: `${group.name} (${group.members.length})` })),
  };
}
