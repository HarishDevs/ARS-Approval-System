import type { Checkpoint, CheckpointState } from "@/server/approvals/road";

// India time, written out by hand: the server and the browser must print the
// very same text (their locale data can differ), or hydration fails.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const when = (iso?: string) => {
  if (!iso) return null;
  const ist = new Date(Date.parse(iso) + 330 * 60_000);
  const hours = ist.getUTCHours();
  return `${String(ist.getUTCDate()).padStart(2, "0")} ${MONTHS[ist.getUTCMonth()]}, ${hours % 12 || 12}:${String(ist.getUTCMinutes()).padStart(2, "0")} ${hours < 12 ? "am" : "pm"}`;
};

// `now` comes from the server for the first render, then from the browser.
export function duration(fromIso: string | undefined, toIso: string | null, now: number): string | null {
  if (!fromIso) return null;
  const minutes = Math.max(0, Math.round(((toIso ? Date.parse(toIso) : now) - Date.parse(fromIso)) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days} day${days === 1 ? "" : "s"}${hours ? ` ${hours} hr${hours === 1 ? "" : "s"}` : ""}`;
  if (hours > 0) return `${hours} hr${hours === 1 ? "" : "s"}${mins ? ` ${mins} min${mins === 1 ? "" : "s"}` : ""}`;
  return `${mins} min${mins === 1 ? "" : "s"}`;
}

export function statusText(point: Checkpoint, index: number): { word: string; time: string | null } {
  switch (point.state) {
    case "done":
      return { word: index === 0 ? "Submitted" : point.work ? "Done" : "Approved", time: when(point.finishedAt) };
    case "current":
      return { word: point.work ? "To do" : "Pending", time: point.since ? `Since ${when(point.since)}` : null };
    case "rejected":
      return { word: "Rejected", time: when(point.finishedAt) };
    case "returned":
      return { word: "Returned", time: null };
    case "hold":
      return { word: "On hold", time: point.since ? `Since ${when(point.since)}` : null };
    case "blocked":
      return { word: "Stuck: needs IT", time: point.since ? `Since ${when(point.since)}` : null };
    case "skipped":
      return { word: "Not needed", time: null };
    case "cancelled":
      return { word: "Withdrawn", time: null };
    default:
      return { word: "Waiting", time: null };
  }
}

export const PERSON_WORD: Record<string, string> = {
  PENDING: "waiting",
  APPROVED: "approved",
  REJECTED: "rejected",
  CANCELLED: "not needed",
  SKIPPED: "not needed",
  CHANGES_REQUESTED: "asked for changes",
  DELEGATED: "handed on",
};

// The brief's colour system, one for every module (on the dark journey panel).
export const STATE_DOT: Record<CheckpointState, string> = {
  done: "bg-[#22c55e] border-[#22c55e] text-white",
  current: "bg-[#2563eb] border-[#93c5fd] text-white jr-pulse",
  waiting: "bg-[#1e293b] border-[#475569] text-[#cbd5e1]",
  rejected: "bg-[#dc2626] border-[#dc2626] text-white",
  returned: "bg-[#f97316] border-[#f97316] text-white",
  hold: "bg-[#f59e0b] border-[#f59e0b] text-[#1f2937]",
  blocked: "bg-[#f97316] border-[#f97316] text-white",
  skipped: "bg-[#334155] border-[#475569] text-[#94a3b8]",
  cancelled: "bg-[#334155] border-[#334155] text-[#94a3b8]",
};

export const STATE_PILL: Record<CheckpointState, string> = {
  done: "bg-[#14532d] text-[#bbf7d0]",
  current: "bg-[#1e3a8a] text-[#bfdbfe]",
  waiting: "bg-[#1e293b] text-[#cbd5e1]",
  rejected: "bg-[#7f1d1d] text-[#fecaca]",
  returned: "bg-[#7c2d12] text-[#fed7aa]",
  hold: "bg-[#78350f] text-[#fde68a]",
  blocked: "bg-[#7c2d12] text-[#fed7aa]",
  skipped: "bg-[#1e293b] text-[#94a3b8]",
  cancelled: "bg-[#1e293b] text-[#94a3b8]",
};
