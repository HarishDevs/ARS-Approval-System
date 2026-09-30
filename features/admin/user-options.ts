import "server-only";
import { listDepartments, listDesignations } from "@/lib/db/repositories/organisation.repository";
import { listActiveUserOptions } from "@/lib/db/repositories/admin-users.repository";
import type { Option } from "@/features/admin/UserForm";

// Picker options for the user form: active departments, designations and people.
export async function loadUserFormOptions(excludeUserId?: number): Promise<{ departments: Option[]; designations: Option[]; managers: Option[] }> {
  const [departments, designations, people] = await Promise.all([listDepartments(), listDesignations(), listActiveUserOptions()]);
  return {
    departments: departments.filter((item) => item.active).map((item) => ({ id: item.id, label: `${item.name} (${item.code})` })),
    designations: designations.filter((item) => item.active).map((item) => ({ id: item.id, label: item.name })),
    managers: people.filter((person) => person.id !== excludeUserId).map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` })),
  };
}
