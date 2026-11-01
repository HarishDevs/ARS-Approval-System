"use client";

import { useEffect, useState } from "react";
import { BarChart3, CalendarClock, CheckCircle2, Clock, Hourglass } from "lucide-react";
import type { Road } from "@/server/approvals/road";
import { duration, when } from "@/features/journey/format";

// D-253: the road's figures in the request page's Approval levels card. The
// road itself is drawn by the approval journey (D-273, features/journey).
// The road's figures: progress, levels done and left, time in process, last update.
function RoadSummary({ road, now }: { road: Road; now: number }) {
  const points = road.checkpoints;
  const submitted = points[0]?.finishedAt;
  const closed = road.outcome
    ? (points
        .map((point) => point.finishedAt)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null)
    : null;
  const lastUpdate = points
    .flatMap((point) => [point.finishedAt, point.since])
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 rounded-md border border-line px-4 py-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="road-summary">
      <div className="col-span-2 sm:col-span-3 lg:col-span-1">
        <dt className="flex items-center gap-1.5 text-caption text-ink-muted">
          <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" /> Progress
        </dt>
        <dd className="mt-1 flex items-center gap-2">
          <span className="text-title font-semibold tabular-nums text-success-600">{road.percent}%</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Levels done" aria-valuemin={0} aria-valuemax={road.levels} aria-valuenow={road.levelsDone}>
            <span className="block h-full rounded-full bg-success-solid motion-safe:transition-[width] motion-safe:duration-700" style={{ width: `${road.percent}%` }} />
          </span>
        </dd>
      </div>
      <div>
        <dt className="flex items-center gap-1.5 text-caption text-ink-muted">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Completed
        </dt>
        <dd className="mt-1 font-semibold tabular-nums">
          {road.levelsDone} of {road.levels}
        </dd>
      </div>
      <div>
        <dt className="flex items-center gap-1.5 text-caption text-ink-muted">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" /> Remaining
        </dt>
        <dd className="mt-1 font-semibold tabular-nums">{road.outcome ? "—" : road.levels - road.levelsDone}</dd>
      </div>
      <div>
        <dt className="flex items-center gap-1.5 text-caption text-ink-muted">
          <Hourglass className="h-3.5 w-3.5" aria-hidden="true" /> Time in process
        </dt>
        <dd className="mt-1 font-semibold">{duration(submitted, closed, now) ?? "—"}</dd>
      </div>
      <div>
        <dt className="flex items-center gap-1.5 text-caption text-ink-muted">
          <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> Last update
        </dt>
        <dd className="mt-1 font-semibold">{when(lastUpdate) ?? "—"}</dd>
      </div>
    </dl>
  );
}

// For a server page: the figures alone, the clock from the server first.
export function RoadSummaryCard({ road, serverNow }: { road: Road; serverNow: string }) {
  const [now, setNow] = useState(() => Date.parse(serverNow));
  useEffect(() => setNow(Date.now()), []);
  return <RoadSummary road={road} now={now} />;
}
