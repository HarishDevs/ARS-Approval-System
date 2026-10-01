import type { InstanceStatus, NodeStatus, TaskStatus } from "@/server/engine/types";

// One vocabulary for statuses everywhere (D-017). On Hold and Changes
// Required never look complete (G-03); Rejected never looks approved (G-02).
const REQUEST: Record<InstanceStatus, { label: string; style: string }> = {
  IN_PROGRESS: { label: "In progress", style: "bg-primary-50 text-primary-600" },
  ON_HOLD: { label: "On hold", style: "bg-warning-50 text-warning-600" },
  CHANGES_REQUIRED: { label: "Changes required", style: "bg-warning-50 text-warning-600" },
  APPROVED: { label: "Approved", style: "bg-success-50 text-success-600" },
  REJECTED: { label: "Rejected", style: "bg-danger-50 text-danger-600" },
  CANCELLED: { label: "Withdrawn", style: "bg-surface-muted text-ink-muted" },
};

const STEP: Record<NodeStatus, { label: string; style: string }> = {
  WAITING: { label: "Not started", style: "bg-surface-muted text-ink-muted" },
  ACTIVE: { label: "Waiting for approval", style: "bg-primary-50 text-primary-600" },
  APPROVED: { label: "Approved", style: "bg-success-50 text-success-600" },
  REJECTED: { label: "Rejected", style: "bg-danger-50 text-danger-600" },
  SKIPPED: { label: "Skipped", style: "bg-surface-muted text-ink-muted" },
  BLOCKED: { label: "Blocked", style: "bg-danger-50 text-danger-600" },
  CANCELLED: { label: "Not needed", style: "bg-surface-muted text-ink-muted" },
};

const TASK: Record<TaskStatus, { label: string; style: string }> = {
  PENDING: { label: "Pending", style: "text-primary-600" },
  APPROVED: { label: "Approved", style: "text-success-600" },
  REJECTED: { label: "Rejected", style: "text-danger-600" },
  CHANGES_REQUESTED: { label: "Asked for changes", style: "text-warning-600" },
  NOT_REQUIRED: { label: "Not needed", style: "text-ink-faint" },
  CANCELLED: { label: "Closed", style: "text-ink-faint" },
};

export function RequestStatusPill({ status }: { status: InstanceStatus }) {
  const { label, style } = REQUEST[status];
  return <span className={`badge ${style}`}>{label}</span>;
}

export function StepStatusPill({ status }: { status: NodeStatus }) {
  const { label, style } = STEP[status];
  return <span className={`badge ${style}`}>{label}</span>;
}

export function taskStatusText(status: TaskStatus) {
  return TASK[status];
}
