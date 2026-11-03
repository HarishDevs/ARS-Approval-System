import Link from "next/link";
import { FileCheck2 } from "lucide-react";

export type TaskApproval = { requestId: number; requestNo: string; workStep: boolean; linked?: boolean } | null | undefined;

// v1.42.1 (owner: "task created from approval should be highlighted and mapped
// with approval unique number"): a task that comes from an approval request
// shows the request's number, linking to it. A request's work step (D-269) is
// also highlighted in lists (the approval-task row class, globals.css).
export function ApprovalBadge({ approval, size = "md" }: { approval: TaskApproval; size?: "sm" | "md" }) {
  if (!approval) return null;
  return (
    <Link
      href={`/users/requests/${approval.requestId}`}
      title={approval.workStep ? `Work step of approval ${approval.requestNo}: open the request` : approval.linked ? `Task from approval ${approval.requestNo}: open the request` : `Linked to approval ${approval.requestNo}: open the request`}
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border border-primary-600/30 bg-primary-50 font-semibold text-primary-700 hover:border-primary-600 ${size === "sm" ? "px-1.5 py-0 text-[11px]" : "px-2 py-0.5 text-caption"}`}
      data-testid="approval-badge"
    >
      <FileCheck2 aria-hidden="true" className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      <span className="sr-only">{approval.workStep ? "Work step of approval" : "Approval"} </span>
      {approval.requestNo}
    </Link>
  );
}

// The row class for a request's work step: a tinted row with a blue left edge.
// D-273: tasks handed out by a background work step are highlighted too.
export const approvalRowClass = (approval: TaskApproval) => (approval?.workStep || approval?.linked ? "approval-task" : "");
