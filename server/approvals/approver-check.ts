import "server-only";
import { approverStatuses } from "@/lib/db/repositories/approvers.repository";
import { ineligibleChoices } from "@/server/approvals/approver-rules";
import type { Queryable } from "@/lib/db/client";

// One person chosen as an approver (group member, HOD, reporting manager,
// delegate). null = fine; otherwise the reason to show (D-085). The value
// already saved (`previous`) stays valid.
export async function checkChosenApprover(id: number | null, previous: number | null = null, db?: Queryable): Promise<string | null> {
  if (id === null || id === previous) return null;
  const problems = ineligibleChoices([id], [], await approverStatuses([id], db));
  return problems[0] ?? null;
}
