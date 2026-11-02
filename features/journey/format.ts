import type { Checkpoint, CheckpointState } from "@/server/approvals/road";
import type { StatusTone } from "@/features/ui/status-tones";

// India time, written out by hand: the server and the browser must print the
// very same text (their locale data can differ), or hydration fails.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const when = (iso?: string) => {
  if (!iso) return null;
  const ist = new Date(Date.parse(iso) + 330 * 60_000);
  const hours = ist.getUTCHours();
  return `${String(ist.getUTCDate()).padStart(2, "0")} ${MONTHS[ist.getUTCMonth()]}, ${hours % 12 || 12}:${String(ist.getUTCMinutes()).padStart(2, "0")} ${hours < 12 ? "am" : "pm"}`;
};

// "01 Nov 2026" and "01 Nov 2026, 10:30 pm" (the Request Status card).
export const whenDate = (iso?: string | null) => {
  if (!iso) return null;
  const ist = new Date(Date.parse(iso) + 330 * 60_000);
  return `${String(ist.getUTCDate()).padStart(2, "0")} ${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}`;
};
export const whenLong = (iso?: string | null) => {
  if (!iso) return null;
  return `${whenDate(iso)}, ${when(iso)!.split(", ")[1]}`;
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
      return { word: point.work ? "To do" : "Waiting for approval", time: point.since ? `Since ${when(point.since)}` : null };
    case "rejected":
      return { word: "Rejected", time: when(point.finishedAt) };
    case "returned":
      return { word: "Changes required", time: null };
    case "hold":
      return { word: "On hold", time: point.since ? `Since ${when(point.since)}` : null };
    case "blocked":
      return { word: "Stuck: needs IT", time: point.since ? `Since ${when(point.since)}` : null };
    case "skipped":
      return { word: "Skipped", time: null };
    case "cancelled":
      return { word: "Withdrawn", time: null };
    default:
      return { word: "Pending", time: null };
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

// v1.48 (owner's journey design): the status word's tone (the shared status
// colours, features/ui/status-tones.ts): one colour per status everywhere.
export const STATE_TONE: Record<CheckpointState, StatusTone> = {
  done: "green",
  current: "blue",
  waiting: "grey",
  rejected: "red",
  returned: "orange",
  hold: "amber",
  blocked: "orangered",
  skipped: "purple",
  cancelled: "purple",
};

// The milestones on the road and in the levels list (on the dark journey card).
export const STATE_DOT: Record<CheckpointState, string> = {
  done: "bg-[#16a34a] border-[#4ade80] text-white jr-glow-green",
  current: "bg-[#2563eb] border-[#bfdbfe] text-white jr-pulse",
  waiting: "bg-[#1e293b] border-[#64748b] text-[#94a3b8]",
  rejected: "bg-[#dc2626] border-[#fca5a5] text-white",
  returned: "bg-[#ea580c] border-[#fdba74] text-white",
  hold: "bg-[#f59e0b] border-[#fde68a] text-[#1f2937]",
  blocked: "bg-[#c2410c] border-[#ffa284] text-white",
  skipped: "bg-[#7c3aed] border-[#c4b5fd] text-white",
  cancelled: "bg-[#6d28d9] border-[#c4b5fd] text-white",
};

// Who decided a level, in a few words ("Approved by R. Suresh").
export function levelSubline(point: Checkpoint, index: number, requesterName: string): string {
  const decider = (status: string) => {
    const person = point.people.find((item) => item.status === status);
    return person ? (person.decidedByName ?? person.name) : null;
  };
  if (index === 0) return requesterName ? `by ${requesterName}` : "Submitted";
  switch (point.state) {
    case "done": {
      const by = decider("APPROVED");
      return point.work ? (by ? `Done by ${by}` : "Done") : by ? `Approved by ${by}` : "Approved";
    }
    case "current":
      return point.work ? "Waiting for the work" : "Waiting for approval";
    case "rejected": {
      const by = decider("REJECTED");
      return by ? `Rejected by ${by}` : "Rejected";
    }
    case "returned": {
      const by = decider("CHANGES_REQUESTED");
      return by ? `Changes asked by ${by}` : "Sent back for changes";
    }
    case "hold":
      return "On hold";
    case "blocked":
      return "Stuck: needs IT";
    case "skipped":
      return "Skipped (not needed)";
    case "cancelled":
      return "Withdrawn";
    default:
      return "Pending";
  }
}
