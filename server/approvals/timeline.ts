import type { TimelineEvent } from "@/lib/db/repositories/approvals.repository";

// One plain sentence per timeline event (F-14). Pure and unit-tested.
// Internal bookkeeping events return null and are not shown.
export function describeEvent(event: TimelineEvent, labelOf: (nodeId: string) => string, nameOf: (userId: number) => string, isWork?: (nodeId: string) => boolean): string | null {
  switch (event.type) {
    case "SUBMITTED":
      return `Submitted as ${event.requestNo}`;
    case "ATTACHMENTS_ADDED":
      return `${nameOf(event.actorId)} attached ${event.names.join(", ")}`;
    case "TASK_CREATED":
      return `Sent to ${nameOf(event.approverId)} for "${labelOf(event.nodeId)}"`;
    case "TASK_DECIDED": {
      if (event.decision === "REQUEST_CHANGES") return null; // CHANGES_REQUESTED carries the reason
      const verb = event.decision === "APPROVE" ? (isWork?.(event.nodeId) ? "Marked done" : "Approved") : "Rejected";
      const who = event.onBehalfOf ? `${nameOf(event.actorId)} for ${nameOf(event.onBehalfOf)}` : nameOf(event.actorId);
      return `${verb} by ${who} at "${labelOf(event.nodeId)}"`;
    }
    case "NODE_APPROVED":
      return `"${labelOf(event.nodeId)}" complete`;
    case "NODE_SKIPPED":
      return `"${labelOf(event.nodeId)}" skipped (${event.reason === "SKIP_CONDITION" ? "its condition didn't apply" : event.reason === "SKIPPED_BY_IT" ? "by IT" : "nobody to approve"})`;
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
      return event.byApprover
        ? `${nameOf(event.actorId)} passed "${labelOf(event.nodeId)}" to ${nameOf(event.toId)}${event.reason ? `: ${event.reason}` : ""}`
        : `"${labelOf(event.nodeId)}" handed over from ${nameOf(event.fromId)} to ${nameOf(event.toId)} by ${nameOf(event.actorId)}`;
    case "RECALLED":
      return `Recalled by ${nameOf(event.actorId)} to change it: ${event.reason}`;
    case "INFO_REQUESTED":
      return `${nameOf(event.actorId)} asked a question at "${labelOf(event.nodeId)}": ${event.question}`;
    case "INFO_ANSWERED":
      return `${nameOf(event.actorId)} answered: ${event.answer}`;
    case "CONSULTED":
      return `${nameOf(event.actorId)} asked ${nameOf(event.consulteeId)} for advice: ${event.question}`;
    case "CONSULT_ANSWERED":
      return `${nameOf(event.actorId)} gave advice: ${event.answer}`;
    case "WITHDRAWN":
      return `Withdrawn by ${nameOf(event.actorId)}${event.reason ? `: ${event.reason}` : ""}`;
    case "REOPENED":
      return `Reopened by ${nameOf(event.actorId)} (round ${event.round}): ${event.reason}`;
    case "WORK_ASSIGNED":
      return `"${labelOf(event.nodeId)}": given to ${event.userIds.map(nameOf).join(", ")} as tasks (the request doesn't wait for them)`;
    case "NOTIFIED":
      return event.userIds.length ? `"${labelOf(event.nodeId)}": ${event.userIds.map(nameOf).join(", ")} told for information` : `"${labelOf(event.nodeId)}": nobody to tell`;
    case "BLOCK_RESOLVED": {
      const how =
        event.action === "ASSIGN" ? `given to ${(event.userIds ?? []).map(nameOf).join(", ")}` : event.action === "SKIP" ? "skipped" : event.action === "RETRY" ? "tried again" : "sent down a chosen path";
      return `"${labelOf(event.nodeId)}" ${how} by ${nameOf(event.actorId)}: ${event.reason}`;
    }
    case "DELETED":
      return `Removed by ${nameOf(event.actorId)}: ${event.reason}`;
    case "VERSION_MIGRATED":
      return `Moved from workflow version ${event.fromVersionNo} to version ${event.toVersionNo} by ${nameOf(event.actorId)}`;
    case "COLLABORATORS_ADDED":
      return `${nameOf(event.actorId)} added ${event.userIds.map(nameOf).join(", ")} as collaborator${event.userIds.length === 1 ? "" : "s"}`;
    case "COLLABORATOR_REMOVED":
      return event.userId === event.actorId ? `${nameOf(event.actorId)} stopped following this request` : `${nameOf(event.actorId)} removed ${nameOf(event.userId)} as a collaborator`;
    case "BRANCH_TAKEN":
    case "NODE_ACTIVATED":
      return null;
    default:
      return null;
  }
}

// RD-01: what kind of moment each event is, for its icon and colour. The
// words always come from describeEvent; the kind only adds the picture.
export type TimelineKind = "submit" | "file" | "assign" | "approve" | "reject" | "changes" | "step" | "skip" | "block" | "hold" | "resume" | "resubmit" | "handover" | "withdraw" | "done" | "info" | "admin";

export function eventKind(event: TimelineEvent): TimelineKind {
  switch (event.type) {
    case "SUBMITTED":
      return "submit";
    case "ATTACHMENTS_ADDED":
      return "file";
    case "TASK_CREATED":
      return "assign";
    case "TASK_DECIDED":
      return event.decision === "REJECT" ? "reject" : "approve";
    case "NODE_APPROVED":
      return "step";
    case "NODE_SKIPPED":
      return "skip";
    case "NODE_BLOCKED":
      return "block";
    case "INSTANCE_APPROVED":
      return "done";
    case "INSTANCE_REJECTED":
      return "reject";
    case "CHANGES_REQUESTED":
      return "changes";
    case "PUT_ON_HOLD":
      return "hold";
    case "RESUMED":
      return "resume";
    case "RESUBMITTED":
    case "REOPENED":
      return "resubmit";
    case "TASK_REASSIGNED":
      return "handover";
    case "RECALLED":
      return "withdraw";
    case "INFO_REQUESTED":
      return "hold";
    case "INFO_ANSWERED":
      return "resume";
    case "CONSULTED":
    case "CONSULT_ANSWERED":
      return "info";
    case "WITHDRAWN":
      return "withdraw";
    case "BLOCK_RESOLVED":
    case "DELETED":
    case "VERSION_MIGRATED":
      return "admin";
    case "COLLABORATORS_ADDED":
    case "COLLABORATOR_REMOVED":
      return "info";
    default:
      return "info";
  }
}

// "2 h ago" style, against a given now (pure; server-rendered).
export function relativeTime(at: Date, now: Date): string {
  const seconds = Math.round((now.getTime() - at.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return days === 1 ? "yesterday" : `${days} days ago`;
  const months = Math.round(days / 30);
  return months < 12 ? `${months} month${months === 1 ? "" : "s"} ago` : `${Math.round(months / 12)} year${months < 24 ? "" : "s"} ago`;
}

// The India date a moment falls on, for grouping by day.
export function indiaDay(at: Date): string {
  return new Date(at.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}
