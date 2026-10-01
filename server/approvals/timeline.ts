import type { TimelineEvent } from "@/lib/db/repositories/approvals.repository";

// One plain sentence per timeline event (F-14). Pure and unit-tested.
// Internal bookkeeping events return null and are not shown.
export function describeEvent(event: TimelineEvent, labelOf: (nodeId: string) => string, nameOf: (userId: number) => string): string | null {
  switch (event.type) {
    case "SUBMITTED":
      return `Submitted as ${event.requestNo}`;
    case "TASK_CREATED":
      return `Sent to ${nameOf(event.approverId)} for "${labelOf(event.nodeId)}"`;
    case "TASK_DECIDED": {
      if (event.decision === "REQUEST_CHANGES") return null; // CHANGES_REQUESTED carries the reason
      const verb = event.decision === "APPROVE" ? "Approved" : "Rejected";
      const who = event.onBehalfOf ? `${nameOf(event.actorId)} for ${nameOf(event.onBehalfOf)}` : nameOf(event.actorId);
      return `${verb} by ${who} at "${labelOf(event.nodeId)}"`;
    }
    case "NODE_APPROVED":
      return `"${labelOf(event.nodeId)}" complete`;
    case "NODE_SKIPPED":
      return `"${labelOf(event.nodeId)}" skipped (${event.reason === "SKIP_CONDITION" ? "its condition didn't apply" : "nobody to approve"})`;
    case "NODE_BLOCKED":
      return `"${labelOf(event.nodeId)}" is blocked: ${event.reason === "NO_MATCHING_BRANCH" ? "no path matches" : "no eligible approver"}. IT has been told.`;
    case "TASKS_CLOSED":
      return event.status === "NOT_REQUIRED" ? `Other approvers at "${labelOf(event.nodeId)}" no longer needed` : null;
    case "INSTANCE_APPROVED":
      return "Fully approved";
    case "INSTANCE_REJECTED":
      return `Rejected by ${nameOf(event.actorId)}: ${event.comment}`;
    case "CHANGES_REQUESTED":
      return `${nameOf(event.actorId)} asked for changes: ${event.comment}`;
    case "PUT_ON_HOLD":
      return `Put on hold by ${nameOf(event.actorId)}${event.reason ? `: ${event.reason}` : ""}`;
    case "RESUMED":
      return `Resumed by ${nameOf(event.actorId)}`;
    case "RESUBMITTED":
      return `Resubmitted (round ${event.round})`;
    case "TASK_REASSIGNED":
      return `"${labelOf(event.nodeId)}" handed over from ${nameOf(event.fromId)} to ${nameOf(event.toId)} by ${nameOf(event.actorId)}`;
    case "WITHDRAWN":
      return `Withdrawn by ${nameOf(event.actorId)}${event.reason ? `: ${event.reason}` : ""}`;
    case "REOPENED":
      return `Reopened by ${nameOf(event.actorId)} (round ${event.round}): ${event.reason}`;
    case "BRANCH_TAKEN":
    case "NODE_ACTIVATED":
      return null;
    default:
      return null;
  }
}
