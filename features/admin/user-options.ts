import "server-only";
import { listDepartments, listDesignations } from "@/lib/db/repositories/organisation.repository";
import { listApproverOptions } from "@/lib/db/repositories/approvers.repository";
import type { Option } from "@/features/admin/UserForm";

// Picker options for the user form: active departments, designations, and
// managers who are approvers (D-085; the current manager stays listed).
export async function loadUserFormOptions(excludeUserId?: number, currentManagerId?: number | null): Promise<{ departments: Option[]; designations: Option[]; managers: Option[] }> {
  const [departments, designations, people] = await Promise.all([listDepartments(), listDesignations(), listApproverOptions([currentManagerId])]);
  return {
    departments: departments.filter((item) => item.active).map((item) => ({ id: item.id, label: `${item.name} (${item.code})` })),
    designations: designations.filter((item) => item.active).map((item) => ({ id: item.id, label: item.isApprover ? `${item.name} (approver)` : item.name })),
    managers: people.filter((person) => person.id !== excludeUserId).map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` })),
  };
}
