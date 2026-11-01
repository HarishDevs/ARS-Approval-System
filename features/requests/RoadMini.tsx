import Link from "next/link";
import { Check } from "lucide-react";
import type { MiniRoad } from "@/server/approvals/road";

// D-256: the road in a list row: the real percentage (the same calculation as
// the request page), the van's place on it, and the finished state in words.
// Opens the request's road. Never "complete" unless it is approved.
const TERMINAL: Record<"REJECTED" | "CANCELLED", string> = { REJECTED: "Rejected", CANCELLED: "Withdrawn" };

// D-273: without href it is a picture inside something that already links (a mobile card).
export function RoadMini({ road, href }: { road: MiniRoad; href?: string }) {
  const approved = road.outcome === "APPROVED";
  const stopped = road.outcome === "REJECTED" || road.outcome === "CANCELLED";
  const label = approved ? "Approved: all levels done" : stopped ? `${TERMINAL[road.outcome as "REJECTED" | "CANCELLED"]} after ${road.levelsDone} of ${road.levels} levels` : `${road.levelsDone} of ${road.levels} levels done${road.current ? `, now at ${road.current}` : ""}`;
  const inner = (
    <>
      <span className="flex items-baseline justify-between gap-2 text-caption">
        <span className={`font-semibold tabular-nums ${approved ? "text-success-600" : stopped ? "text-ink-muted" : "text-ink"}`}>{stopped ? TERMINAL[road.outcome as "REJECTED" | "CANCELLED"] : `${road.percent}%`}</span>
        <span className="truncate text-ink-muted">{approved ? "Done" : stopped ? `${road.levelsDone}/${road.levels}` : (road.current ?? "")}</span>
      </span>
      <span className="relative mt-1 block h-2 rounded-full bg-line">
        <span
          className={`absolute inset-y-0 left-0 rounded-full ${approved ? "bg-success-solid" : stopped ? (road.outcome === "REJECTED" ? "bg-danger-solid" : "bg-line-strong") : "bg-success-solid"}`}
          style={{ width: `${approved ? 100 : road.percent}%` }}
        />
        {/* the van's spot (a red dot, the ARS van in miniature) or the tick */}
        {approved ? (
          <span className="absolute -right-1 top-1/2 grid h-4 w-4 -translate-y-1/2 place-items-center rounded-full bg-success-solid text-on-solid ring-2 ring-surface">
            <Check className="h-2.5 w-2.5" strokeWidth={4} aria-hidden="true" />
          </span>
        ) : !stopped ? (
          <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-[color:var(--van-body)] ring-2 ring-surface" style={{ left: `${Math.max(4, road.percent)}%` }} aria-hidden="true" />
        ) : null}
      </span>
    </>
  );
  return href ? (
    <Link href={href} className="road-mini group block min-w-[8.5rem] rounded-md py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-primary-600" aria-label={`Progress: ${label}. Open the road.`} title={label} data-testid="road-mini">
      {inner}
    </Link>
  ) : (
    <span className="road-mini block min-w-[8.5rem] py-0.5" title={label} data-testid="road-mini">
      <span className="sr-only">Progress: {label}. </span>
      {inner}
    </span>
  );
}
