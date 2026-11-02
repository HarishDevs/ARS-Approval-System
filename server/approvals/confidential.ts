import "server-only";
import { findWorkflowVersion, type RequestRecord } from "@/lib/db/repositories/approvals.repository";
import { activeDelegatorsFor } from "@/lib/db/repositories/collab.repository";
import { isConfidential } from "@/server/forms/fields";

// A8 / QA-SEC-01 (v1.42.1): who sees a request's confidential values (and
// the files of its confidential fields): the requester, IT, and anyone who
// holds or decided a step on it (or covers a pending one today). Collaborators,
// people asked for advice and FYI recipients see the request without them.
// One rule for the request page, the file download and the timeline.
// The part of the rule that holds for every request: IT and the Super Admin
// (PB-34: the Records register uses it, as it lists every request).
export const rolesSeeConfidential = (roles: readonly string[]) => roles.includes("IT_ADMIN") || roles.includes("SUPER_ADMIN");

export async function canSeeConfidential(request: Pick<RequestRecord, "requesterId" | "state">, viewer: { id: number; roles: readonly string[] }): Promise<boolean> {
  if (request.requesterId === viewer.id || rolesSeeConfidential(viewer.roles)) return true;
  const tasks = request.state.tasks;
  if (tasks.some((task) => task.approverId === viewer.id || task.decidedBy === viewer.id)) return true;
  const delegators = await activeDelegatorsFor(viewer.id);
  return tasks.some((task) => task.status === "PENDING" && delegators.has(task.approverId));
}

// The keys of the confidential fields on the request's form version.
export async function confidentialKeys(workflowVersionId: number): Promise<Set<string>> {
  const version = await findWorkflowVersion(workflowVersionId);
  return new Set((version?.form ?? []).filter(isConfidential).map((field) => field.key));
}
