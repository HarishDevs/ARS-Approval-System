import { StopDelegationButton } from "@/features/requests/DelegationForms";
import type { DelegationItem } from "@/lib/db/repositories/collab.repository";
import { SafeText } from "@/features/ui/SafeText";

const STATE_STYLE: Record<DelegationItem["state"], { label: string; style: string }> = {
  ACTIVE: { label: "Active", style: "bg-success-50 text-success-600" },
  UPCOMING: { label: "Upcoming", style: "bg-primary-50 text-primary-600" },
  PAST: { label: "Finished", style: "bg-surface-muted text-ink-muted" },
  ENDED: { label: "Ended early", style: "bg-surface-muted text-ink-muted" },
};

// Shows both directions: who covers for this person, and whom they cover.
export function DelegationList({ items, personId, canEnd }: { items: DelegationItem[]; personId: number; canEnd: boolean }) {
  if (items.length === 0) return <p className="px-5 py-4 text-label text-ink-muted">No out-of-office set.</p>;
  return (
    <ul className="divide-y divide-line">
      {items.map((item) => {
        const state = STATE_STYLE[item.state];
        const mine = item.userId === personId;
        return (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-label">
            <div>
              <p className="font-medium">
                {item.delegateName} covers for {item.userName}
              </p>
              <p className="text-caption text-ink-muted">
                {item.startsOn} to {item.endsOn}
                {item.reason ? <SafeText text={` · ${item.reason}`} /> : ""}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`badge ${state.style}`}>{state.label}</span>
              {canEnd && mine && (item.state === "ACTIVE" || item.state === "UPCOMING") && <StopDelegationButton delegationId={item.id} />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
