"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, CalendarClock, Check, CheckCircle2, Clock, Hourglass, Pause, RotateCcw, SkipForward, TriangleAlert, X } from "lucide-react";
import { ArsVan } from "@/features/requests/ArsVan";
import type { Checkpoint, CheckpointState, Road } from "@/server/approvals/road";

// D-253 (owner's reference image): the approval journey as a road. The van
// stands at the level waiting now and drives on when a level finishes; the
// road behind it is green. Built from the server's road (the same level map
// as below it), refreshed every 20 seconds while the page is visible; old or
// repeated news never moves the van back.
const POLL_MS = 20_000;
const SPACING = 130; // px per checkpoint when the road needs to scroll

// India time, written out by hand: the server and the browser must print the
// very same text (their locale data can differ), or hydration fails.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const when = (iso?: string) => {
  if (!iso) return null;
  const ist = new Date(Date.parse(iso) + 330 * 60_000);
  const hours = ist.getUTCHours();
  return `${String(ist.getUTCDate()).padStart(2, "0")} ${MONTHS[ist.getUTCMonth()]}, ${hours % 12 || 12}:${String(ist.getUTCMinutes()).padStart(2, "0")} ${hours < 12 ? "am" : "pm"}`;
};

// `now` comes from the server for the first render, then from the browser.
function duration(fromIso: string | undefined, toIso: string | null, now: number): string | null {
  if (!fromIso) return null;
  const minutes = Math.max(0, Math.round(((toIso ? Date.parse(toIso) : now) - Date.parse(fromIso)) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days} day${days === 1 ? "" : "s"}${hours ? ` ${hours} hr${hours === 1 ? "" : "s"}` : ""}`;
  if (hours > 0) return `${hours} hr${hours === 1 ? "" : "s"}${mins ? ` ${mins} min${mins === 1 ? "" : "s"}` : ""}`;
  return `${mins} min${mins === 1 ? "" : "s"}`;
}

const DOT: Record<CheckpointState, string> = {
  done: "bg-success-solid text-on-solid border-success-solid",
  current: "bg-primary-solid text-on-solid border-primary-100 ring-4 ring-primary-600/30",
  waiting: "bg-surface text-ink-muted border-line-strong",
  rejected: "bg-danger-solid text-on-solid border-danger-solid",
  returned: "bg-warning-solid text-on-solid border-warning-solid",
  hold: "bg-warning-solid text-on-solid border-warning-solid",
  blocked: "bg-warning-solid text-on-solid border-warning-solid",
  skipped: "bg-surface-muted text-ink-muted border-line-strong",
  cancelled: "bg-surface-muted text-ink-faint border-line",
};

const PILL: Record<CheckpointState, string> = {
  done: "bg-success-50 text-success-600",
  current: "bg-primary-50 text-primary-700",
  waiting: "bg-surface-muted text-ink-muted",
  rejected: "bg-danger-50 text-danger-600",
  returned: "bg-warning-50 text-warning-600",
  hold: "bg-warning-50 text-warning-600",
  blocked: "bg-warning-50 text-warning-600",
  skipped: "bg-surface-muted text-ink-muted",
  cancelled: "bg-surface-muted text-ink-faint",
};

function DotIcon({ state, index }: { state: CheckpointState; index: number }) {
  const cls = "h-4 w-4";
  if (state === "done") return <Check className={cls} strokeWidth={3} aria-hidden="true" />;
  if (state === "rejected") return <X className={cls} strokeWidth={3} aria-hidden="true" />;
  if (state === "returned") return <RotateCcw className={cls} aria-hidden="true" />;
  if (state === "hold") return <Pause className={cls} aria-hidden="true" />;
  if (state === "blocked") return <TriangleAlert className={cls} aria-hidden="true" />;
  if (state === "skipped") return <SkipForward className={cls} aria-hidden="true" />;
  if (state === "current") return <span className="h-2.5 w-2.5 rounded-full bg-on-solid" aria-hidden="true" />;
  return <span className="text-caption font-semibold">{index}</span>;
}

function statusText(point: Checkpoint, index: number): { word: string; time: string | null } {
  switch (point.state) {
    case "done":
      return { word: index === 0 ? "Submitted" : point.work ? "Done" : "Approved", time: when(point.finishedAt) };
    case "current":
      return { word: point.work ? "To do" : "Pending", time: point.since ? `Since ${when(point.since)}` : null };
    case "rejected":
      return { word: "Rejected", time: when(point.finishedAt) };
    case "returned":
      return { word: "Changes asked", time: null };
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

const PERSON_WORD: Record<string, string> = { PENDING: "waiting", APPROVED: "approved", REJECTED: "rejected", CANCELLED: "not needed", SKIPPED: "not needed", CHANGES_REQUESTED: "asked for changes", DELEGATED: "handed on" };

export function ApprovalRoad({ requestId, initial, initialUpdatedAt, serverNow }: { requestId: number; initial: Road; initialUpdatedAt: string; serverNow: string }) {
  const [now, setNow] = useState(() => Date.parse(serverNow));
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const router = useRouter();
  const [road, setRoad] = useState(initial);
  const [moving, setMoving] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const latest = useRef({ updatedAt: initialUpdatedAt, version: initial.version });
  const scroller = useRef<HTMLDivElement>(null);

  // Server-rendered changes (after the person's own decision) come in as props.
  useEffect(() => {
    if (Date.parse(initialUpdatedAt) >= Date.parse(latest.current.updatedAt) && initial.version !== latest.current.version) {
      latest.current = { updatedAt: initialUpdatedAt, version: initial.version };
      setRoad((previous) => {
        if (initial.vanAt > previous.vanAt) setMoving(true);
        return initial;
      });
    }
  }, [initial, initialUpdatedAt]);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (document.visibilityState !== "visible" || road.outcome) return;
      const response = await fetch(`/api/requests/${requestId}/progress`, { cache: "no-store" }).catch(() => null);
      if (!response?.ok || stopped) return;
      const body = (await response.json()) as { road: Road; updatedAt: string };
      // Only newer news, and only real changes.
      if (Date.parse(body.updatedAt) < Date.parse(latest.current.updatedAt) || body.road.version === latest.current.version) return;
      latest.current = { updatedAt: body.updatedAt, version: body.road.version };
      setRoad((previous) => {
        if (body.road.vanAt > previous.vanAt || (body.road.outcome && !previous.outcome)) setMoving(true);
        return body.road;
      });
      router.refresh(); // the levels, actions and timeline below follow
    };
    const timer = window.setInterval(() => void tick(), POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [requestId, road.outcome, router]);

  useEffect(() => {
    if (!moving) return;
    const timer = window.setTimeout(() => setMoving(false), 1400);
    return () => window.clearTimeout(timer);
  }, [moving]);

  // Keep the van in view on a scrolling road (phones, long routes).
  useEffect(() => {
    const box = scroller.current;
    if (!box || box.scrollWidth <= box.clientWidth) return;
    const stop = road.outcome === "APPROVED" || road.vanAt === 0 ? road.vanAt : road.vanAt - 0.5;
    const target = (stop / Math.max(1, road.checkpoints.length - 1)) * (box.scrollWidth - 96) - box.clientWidth / 2 + 48;
    box.scrollTo({ left: Math.max(0, target), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [road.vanAt, road.checkpoints.length, road.outcome]);

  const points = road.checkpoints;
  const last = points.length - 1;
  const at = (index: number) => (last === 0 ? 50 : (index / last) * 100);
  // D-263 (owner): while a level waits, the van is on its way: halfway between
  // the last finished point and the waiting one. It drives onto a point only
  // once that level is approved; fully approved, it reaches the flag. The green
  // road is only what is finished.
  const arrived = road.outcome === "APPROVED" || road.vanAt === 0;
  const vanStop = arrived ? road.vanAt : road.vanAt - 0.5;
  const vanLeft = at(vanStop);
  const greenTo = road.outcome === "APPROVED" ? 100 : at(Math.max(0, road.vanAt - 1));
  const approved = road.outcome === "APPROVED";
  const submitted = points[0]?.finishedAt;
  const closed = road.outcome ? (points.map((point) => point.finishedAt).filter(Boolean).sort().at(-1) ?? null) : null;
  const lastUpdate = points.flatMap((point) => [point.finishedAt, point.since]).filter((value): value is string => Boolean(value)).sort().at(-1);
  const opened = open !== null ? points[open] : null;
  const headline = approved ? "Approved" : road.outcome === "REJECTED" ? "Rejected" : road.outcome === "CANCELLED" ? "Withdrawn" : `At ${points[road.vanAt]?.label ?? "the start"}`;

  return (
    <div className="mx-auto mb-4 max-w-4xl" data-testid="approval-road" data-van-at={road.vanAt} data-outcome={road.outcome ?? "OPEN"}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-label font-semibold" aria-live="polite">
          {headline}
          <span className="sr-only">
            . {road.levelsDone} of {road.levels} levels done.
          </span>
        </p>
        <span
          className={`rounded-full px-3 py-1 text-label font-semibold tabular-nums ${approved ? "bg-success-solid text-on-solid" : road.outcome === "REJECTED" ? "bg-danger-solid text-on-solid" : road.outcome ? "bg-surface-muted text-ink-muted" : "bg-success-50 text-success-600"}`}
          data-testid="road-percent"
        >
          {approved ? "100% Completed" : road.outcome === "REJECTED" ? `Stopped at ${road.percent}%` : road.outcome ? "Withdrawn" : `${road.percent}% Completed`}
        </span>
      </div>

      <div ref={scroller} className="scroll-hint -mx-2 overflow-x-auto px-2 pb-2" tabIndex={0} aria-label="Approval road">
        <div className="relative" style={{ minWidth: Math.max(points.length * SPACING + 60, 340) }}>
          {/* The road: 96px of sky for the van, the road, then the labels. */}
          <div className="relative mx-[64px] h-[124px]">
            {/* finish flag */}
            <svg className="absolute bottom-[52px]" style={{ left: "calc(100% + 22px)" }} width="28" height="33" viewBox="0 0 34 40" aria-hidden="true">
              <line x1="4" y1="2" x2="4" y2="40" stroke="var(--color-text-primary)" strokeWidth="2.5" />
              {[0, 1, 2, 3].map((row) =>
                [0, 1, 2, 3, 4].map((col) => <rect key={`${row}-${col}`} x={5 + col * 5.6} y={3 + row * 4.2} width="5.6" height="4.2" fill={(row + col) % 2 ? "#ffffff" : "#111827"} stroke="#111827" strokeWidth="0.3" />),
              )}
            </svg>
            {/* road surface */}
            <div className="absolute inset-x-[-24px] bottom-[34px] h-[18px] overflow-hidden rounded-full border border-[color:var(--road-edge)] bg-[color:var(--road-surface)]">
              <div className="absolute inset-y-0 left-0 rounded-full bg-[color:var(--road-done)] motion-safe:transition-[width] motion-safe:duration-[1200ms] motion-safe:ease-in-out" style={{ width: `calc(24px + (100% - 48px) * ${greenTo / 100})` }} />
              <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 bg-[repeating-linear-gradient(90deg,var(--road-lane)_0_18px,transparent_18px_34px)]" />
            </div>
            {/* the van */}
            <div
              className="absolute bottom-[47px] z-[2] -translate-x-1/2 motion-safe:transition-[left] motion-safe:duration-[1200ms] motion-safe:ease-in-out"
              style={{ left: `${vanLeft}%` }}
              data-testid="road-van"
            >
              {approved && (
                <span className="absolute -top-9 left-1/2 grid h-9 w-9 -translate-x-1/2 place-items-center rounded-full bg-success-solid text-on-solid shadow-card motion-safe:animate-[pop_400ms_ease-out]" data-testid="road-approved-tick">
                  <Check className="h-5 w-5" strokeWidth={3.5} aria-hidden="true" />
                </span>
              )}
              <ArsVan width={72} moving={moving} />
            </div>
            {/* checkpoints */}
            {points.map((point, index) => (
              <button
                key={point.key}
                type="button"
                onClick={() => setOpen(open === index ? null : index)}
                aria-expanded={open === index}
                aria-label={`${point.label}: ${statusText(point, index).word}`}
                className={`absolute bottom-[27px] z-[3] grid h-8 w-8 -translate-x-1/2 place-items-center rounded-full border-[3px] shadow-card outline-none focus-visible:ring-4 focus-visible:ring-primary-600/50 ${DOT[point.state]}`}
                style={{ left: `${at(index)}%` }}
                data-testid="road-checkpoint"
                data-state={point.state}
              >
                <DotIcon state={point.state} index={index} />
              </button>
            ))}
          </div>
          {/* labels */}
          <ol className="relative mx-[64px] h-[80px]">
            {points.map((point, index) => {
              const status = statusText(point, index);
              return (
                <li key={point.key} className="absolute top-0 w-[120px] -translate-x-1/2 text-center" style={{ left: `${at(index)}%` }}>
                  <button type="button" onClick={() => setOpen(open === index ? null : index)} className="w-full rounded-md px-1 py-0.5 hover:bg-surface-muted">
                    <span className="line-clamp-2 text-label font-semibold leading-tight">{point.label}</span>
                    {point.parallel && <span className="block text-caption text-ink-muted">{point.people.length} people</span>}
                  </button>
                  <span className={`mt-1 inline-block rounded-md px-2 py-0.5 text-caption font-medium leading-tight ${PILL[point.state]}`}>
                    {status.word}
                    {status.time && <span className="block font-normal">{status.time}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {opened && (
        <div className="mt-2 rounded-md border border-line bg-surface-muted/60 px-4 py-3" role="region" aria-label={`${opened.label}: details`} data-testid="road-detail">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">{opened.label}</p>
            <button type="button" className="text-label text-ink-muted hover:text-ink" onClick={() => setOpen(null)}>
              Close
            </button>
          </div>
          {opened.rule && <p className="text-caption text-ink-muted">{opened.rule}</p>}
          {opened.reason && <p className="text-caption text-warning-600">{opened.reason}</p>}
          {open === 0 ? (
            <p className="mt-1 text-label">Submitted {when(opened.finishedAt) ?? ""}</p>
          ) : opened.people.length === 0 ? (
            <p className="mt-1 text-label text-ink-muted">Who decides here is worked out when the request reaches this level.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {opened.people.map((person, index) => (
                <li key={`${person.name}-${index}`} className="text-label">
                  <span className="font-medium">{person.name}</span> <span className="text-ink-muted">· {PERSON_WORD[person.status] ?? person.status.toLowerCase()}</span>
                  {person.decidedByName && <span className="text-ink-muted"> (by {person.decidedByName})</span>}
                  {person.decidedAt && <span className="text-ink-muted"> · {when(person.decidedAt)}</span>}
                  {person.comment && <p className="mt-0.5 rounded bg-surface px-2 py-1 text-caption text-ink-muted">“{person.comment}”</p>}
                </li>
              ))}
            </ul>
          )}
          {opened.since && opened.state === "current" && <p className="mt-2 text-caption text-ink-muted">Waiting {duration(opened.since, null, now)}.</p>}
        </div>
      )}

      {/* summary */}
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
    </div>
  );
}
