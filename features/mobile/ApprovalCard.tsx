import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SafeText } from "@/features/ui/SafeText";
import { RoadMini } from "@/features/requests/RoadMini";
import { RequestPriorityBadge } from "@/features/ui/ChoicePill";
import type { MiniRoad } from "@/server/approvals/road";

// v1.43.0 (owner's mobile brief §4): one approval as a card. The whole card
// opens the request; deciding happens there (the sticky bar), never on a card.
export interface ApprovalCardData {
  href: string;
  title: string;
  requestNo: string;
  type?: string | null;
  requester?: string | null;
  department?: string | null;
  amount?: string | null;
  approver?: string | null;
  submitted?: string | null;
  waiting?: string | null;
  priority?: { label: string; tone: "red" | "amber" } | null; // how urgent the step is (Overdue, Due soon)
  requestPriority?: { label: string; color: string | null } | null; // v1.47.0: the request's Priority field
  status: { label: string; className: string };
  road?: MiniRoad | null; // D-273: the request's journey in small
}

const TONE = { red: "bg-[color:var(--m-red)] text-white", amber: "bg-warning-50 text-warning-600" } as const;

export function ApprovalCard({ card, compact = false }: { card: ApprovalCardData; compact?: boolean }) {
  // v1.45.0 (Manage view → Compact mode): one row, as Asana's compact list.
  if (compact)
    return (
      <Link href={card.href} className="flex min-h-[60px] items-center gap-3 border-b border-line px-4 py-2 active:bg-surface-muted" data-testid="m-approval-card">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px]">
            <SafeText text={card.title} />
          </span>
          <span className="block truncate font-mono text-[12px] text-ink-muted">
            {card.requestNo}
            {card.requester ? ` · ${card.requester}` : ""}
          </span>
        </span>
        {card.requestPriority && <RequestPriorityBadge priority={card.requestPriority} />}
        {card.priority ? (
          <span className={`shrink-0 rounded-md px-2 py-1 text-[12px] font-bold ${TONE[card.priority.tone]}`}>{card.priority.label}</span>
        ) : (
          <span className={`badge shrink-0 ${card.status.className}`}>{card.status.label}</span>
        )}
      </Link>
    );
  const facts: [string, string | null | undefined][] = [
    ["Requested by", [card.requester, card.department].filter(Boolean).join(" · ") || null],
    ["Type", card.type],
    ["Amount", card.amount],
    ["With", card.approver],
    ["Submitted", card.submitted],
    ["Waiting", card.waiting],
  ];
  return (
    <Link href={card.href} className="mob-card block p-4 active:bg-surface-muted" data-testid="m-approval-card">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[12px] font-semibold text-ink-muted">{card.requestNo}</p>
          <p className="mt-0.5 line-clamp-2 text-[16px] font-bold leading-snug">
            <SafeText text={card.title} />
          </p>
        </div>
        <ChevronRight aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-ink-faint" />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[13px]">
        {facts
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label} className={label === "Requested by" ? "col-span-2" : undefined}>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
              <dd className="truncate font-medium">{value}</dd>
            </div>
          ))}
      </dl>
      {card.road && (
        <div className="mt-3">
          <RoadMini road={card.road} />
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={`badge ${card.status.className}`}>{card.status.label}</span>
        {card.requestPriority && <RequestPriorityBadge priority={card.requestPriority} />}
        {card.priority && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${TONE[card.priority.tone]}`}>{card.priority.label}</span>}
      </div>
    </Link>
  );
}

// "3 h", "2 d 4 h": how long something has waited.
export function waitedFor(since: Date, now: number): string {
  const minutes = Math.max(0, Math.floor((now - since.getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${days} d ${hours % 24} h` : `${days} d`;
}
