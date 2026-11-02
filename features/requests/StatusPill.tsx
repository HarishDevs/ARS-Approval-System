import type { InstanceStatus, NodeStatus, TaskStatus } from "@/server/engine/types";
import { EXPIRED_LABEL, isExpiredApproval } from "@/server/approvals/expiry-rules";
import { tonePill, toneText, type StatusTone } from "@/features/ui/status-tones";

// One vocabulary for statuses everywhere (D-017). On Hold and Changes
// Required never look complete (G-03); Rejected never looks approved (G-02).
// v1.48 (owner: "make the status colours match across all lists"): the
// colours come from one tone system (features/ui/status-tones.ts), the same
// in every list, card, phone card, the request page and the journey. One
// colour per status, following the owner's request-status strip (coordinator
// decision, 2 Nov 2026): Withdrawn purple, Expired grey, Changes required and
// its cause (Asked for changes) orange, Blocked the only orange-red.
const pill = (label: string, tone: StatusTone) => ({ label, tone, style: tonePill(tone) });

export const REQUEST_STATUS: Record<InstanceStatus, { label: string; tone: StatusTone; style: string }> = {
  IN_PROGRESS: pill("In progress", "blue"),
  ON_HOLD: pill("On hold", "amber"),
  CHANGES_REQUIRED: pill("Changes required", "orange"),
  APPROVED: pill("Approved", "green"),
  REJECTED: pill("Rejected", "red"),
  CANCELLED: pill("Withdrawn", "purple"),
};

export const STEP_STATUS: Record<NodeStatus, { label: string; tone: StatusTone; style: string }> = {
  WAITING: pill("Not started", "grey"),
  ACTIVE: pill("Waiting for approval", "blue"),
  APPROVED: pill("Approved", "green"),
  REJECTED: pill("Rejected", "red"),
  SKIPPED: pill("Skipped", "purple"),
  BLOCKED: pill("Blocked", "orangered"),
  CANCELLED: pill("Not needed", "grey"),
};

const text = (label: string, tone: StatusTone) => ({ label, tone, style: toneText(tone) });

const TASK: Record<TaskStatus, { label: string; tone: StatusTone; style: string }> = {
  PENDING: text("Pending", "blue"),
  APPROVED: text("Approved", "green"),
  REJECTED: text("Rejected", "red"),
  CHANGES_REQUESTED: text("Asked for changes", "orange"),
  NOT_REQUIRED: text("Not needed", "grey"),
  CANCELLED: text("Closed", "grey"),
};

// Person statuses outside the decision set (StepMap): told (FYI), given the
// task (background work), done (a work step finished).
export const PERSON_EXTRA = {
  TOLD: text("told", "purple"),
  ASSIGNED: text("given the task", "purple"),
  DONE: text("done", "green"),
} as const;

// "Your decision" / "Work to do" on the queue cards: waiting, so blue.
export const WAITING_STYLE = tonePill("blue");

// DR-05 (owner, 2 Nov 2026): an approved request past its valid-until date
// shows as Expired (derived; the stored status stays Approved).
export const EXPIRED_STATUS = pill(EXPIRED_LABEL, "grey");

export function requestStatusDisplay(status: InstanceStatus, validUntil?: Date | string | null, now?: Date): { label: string; tone: StatusTone; style: string } {
  return isExpiredApproval(status, validUntil, now) ? EXPIRED_STATUS : REQUEST_STATUS[status];
}

export function RequestStatusPill({ status, validUntil }: { status: InstanceStatus; validUntil?: Date | string | null }) {
  const { label, style } = requestStatusDisplay(status, validUntil);
  return <span className={`badge ${style}`}>{label}</span>;
}

export function StepStatusPill({ status }: { status: NodeStatus }) {
  const { label, style } = STEP_STATUS[status];
  return <span className={`badge ${style}`}>{label}</span>;
}

export function taskStatusText(status: TaskStatus) {
  return TASK[status];
}
