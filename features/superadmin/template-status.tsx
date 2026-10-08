import type { TemplateVersion } from "@/lib/db/repositories/whatsapp.repository";

// One plain status for an event's WhatsApp template (F-42b).
export function versionStatus(version: TemplateVersion): { label: string; tone: "success" | "warning" | "danger" | "muted" } {
  if (version.status === "RETIRED") return { label: "Replaced", tone: "muted" };
  if (version.status === "ACTIVE" && version.approvalStatus === "APPROVED") return { label: "Live", tone: "success" };
  if (version.approvalStatus === "REJECTED") return { label: "Rejected by Meta", tone: "danger" };
  if (version.providerStatus && ["PAUSED", "DISABLED"].includes(version.providerStatus)) return { label: `${version.providerStatus.toLowerCase()} by Meta`, tone: "danger" };
  if (version.submittedAt) return { label: "Waiting for Meta", tone: "warning" };
  return { label: "Draft, not sent", tone: "muted" };
}

const TONE = {
  success: "bg-success-50 text-success-600",
  warning: "bg-warning-50 text-warning-600",
  danger: "bg-danger-50 text-danger-600",
  muted: "bg-surface-muted text-ink-muted",
};

export function StatusBadge({ version }: { version: TemplateVersion | null }) {
  if (!version) return <span className={`badge ${TONE.muted}`}>Not created</span>;
  const status = versionStatus(version);
  return <span className={`badge ${TONE[status.tone]}`}>{status.label}</span>;
}
