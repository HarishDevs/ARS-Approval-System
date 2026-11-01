"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Pause, RotateCcw, SkipForward, TriangleAlert, WifiOff, X } from "lucide-react";
import type { Checkpoint, CheckpointState, Road } from "@/server/approvals/road";
import type { Journey } from "@/server/journey/types";
import { blendRoad, documentOut, flagPos, planScenes, SCENE_MS, vanStop, type Scene, type StampMark } from "@/features/journey/controller";
import { duration, PERSON_WORD, STATE_DOT, STATE_PILL, statusText, when } from "@/features/journey/format";
import { JourneyDocument, JourneyEnvelope, JourneyFlag, JourneyStamp, JourneyVan } from "@/features/journey/JourneyArt";
import { FyiActivity, WorkTaskActivity } from "@/features/journey/JourneyActivities";

// D-273 (owner's journey brief): the approval journey. The ARS van carries the
// sealed request along a road of approval points: it stops beside the point
// waiting now, the document comes out for review, a confirmed decision stamps
// it, it is folded back into the van and the van drives on; at the flag the
// road completes. Work tasks and FYI messages are activities beside the road.
//
// Event-driven, never the source of truth: the server's journey (the request's
// records) is polled while the page is visible (10 s; at once on return and on
// reconnect). A newer journey (event cursor, then version) plays the scenes
// between the two states (features/journey/controller.ts); older or repeated
// news is ignored; a refresh draws the current state without replaying. One
// component per request, so several requests never share a van.
const POLL_MS = 10_000;
const MAX_BACKOFF_MS = 60_000;
const SPACING = 150; // px per checkpoint once the road needs to scroll

type Props = {
  journey: Journey;
  serverNow: string;
  fresh?: boolean; // just submitted: play the sealing once
  variant?: "full" | "compact";
};

function DotIcon({ state, index }: { state: CheckpointState; index: number }) {
  const cls = "h-4 w-4";
  if (state === "done") return <Check className={cls} strokeWidth={3} aria-hidden="true" />;
  if (state === "rejected") return <X className={cls} strokeWidth={3} aria-hidden="true" />;
  if (state === "returned") return <RotateCcw className={cls} aria-hidden="true" />;
  if (state === "hold") return <Pause className={cls} aria-hidden="true" />;
  if (state === "blocked") return <TriangleAlert className={cls} aria-hidden="true" />;
  if (state === "skipped") return <SkipForward className={cls} aria-hidden="true" />;
  if (state === "current") return <span className="h-2.5 w-2.5 rounded-full bg-white" aria-hidden="true" />;
  return <span className="text-[12px] font-bold">{index}</span>;
}

const percentOf = (road: Road) => {
  if (road.outcome === "APPROVED") return 100;
  const done = road.checkpoints.slice(1).filter((point) => point.state === "done" || point.state === "skipped").length;
  return road.levels === 0 ? 0 : Math.min(99, Math.round((done / road.levels) * 100));
};

export function ARSApprovalJourney({ journey: initial, serverNow, fresh = false, variant = "full" }: Props) {
  const router = useRouter();
  const compact = variant === "compact";
  const [now, setNow] = useState(() => Date.parse(serverNow));
  const [shown, setShown] = useState<Journey>(initial); // the newest confirmed journey
  const [display, setDisplay] = useState<Road>(initial.road); // what the road draws (blended while scenes play)
  const [pos, setPos] = useState(() => (fresh ? 0 : vanStop(initial.road)));
  const [scene, setScene] = useState<Scene | null>(null);
  const [queue, setQueue] = useState<Scene[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [offline, setOffline] = useState(false);
  const [newItems, setNewItems] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState(false);
  const latest = useRef({ cursor: initial.cursor, version: initial.version, updatedAt: initial.updatedAt });
  const previousRoad = useRef<Road>(initial.road);
  const upTo = useRef(Number.POSITIVE_INFINITY);
  const scroller = useRef<HTMLDivElement>(null);
  const reduced = useRef(false);
  const lastMark = useRef<StampMark>("approve");

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    try {
      setCollapsed(window.localStorage.getItem("ars-journey-collapsed") === "1");
    } catch {
      /* private mode: open */
    }
    return () => window.clearInterval(timer);
  }, []);

  // A confirmed newer journey: plan its scenes (or jump, when motion is off or the tab is hidden).
  const accept = useCallback((next: Journey, first = false) => {
    const previous = first ? null : previousRoad.current;
    const scenes = reduced.current || document.visibilityState !== "visible" ? [] : planScenes(previous, next.road, { fresh: first });
    setShown((before) => {
      const known = new Set([...before.tasks.map((task) => `t${task.id}:${task.status}`), ...before.fyi.map((item) => `f${item.key}`)]);
      if (!first) setNewItems(new Set([...next.tasks.map((task) => `t${task.id}:${task.status}`), ...next.fyi.map((item) => `f${item.key}`)].filter((key) => !known.has(key))));
      return next;
    });
    if (scenes.length === 0) {
      upTo.current = Number.POSITIVE_INFINITY;
      setDisplay(next.road);
      setPos(vanStop(next.road));
    } else {
      upTo.current = previous ? Math.max(0, previous.vanAt - 1) : 0;
      setDisplay(previous ? blendRoad(previous, next.road, upTo.current) : blendRoad({ ...next.road, checkpoints: next.road.checkpoints.map((point, index) => (index === 0 ? point : { ...point, state: "waiting" as const })) }, next.road, 0));
      setQueue(scenes);
    }
    previousRoad.current = next.road;
  }, []);

  // Just submitted: the sealing plays once per request, not on every refresh.
  useEffect(() => {
    if (!fresh || compact) return;
    const key = `ars-journey-sealed-${initial.requestId}`;
    try {
      if (window.sessionStorage.getItem(key)) {
        setPos(vanStop(initial.road));
        return;
      }
      window.sessionStorage.setItem(key, "1");
    } catch {
      /* storage off: play it */
    }
    accept(initial, true);
  }, [fresh, compact, initial, accept]);

  // The scene player: one scene at a time; the road reveals a point's new state when the van deals with it.
  useEffect(() => {
    if (queue.length === 0) return;
    const [current, ...rest] = queue;
    const next = previousRoad.current;
    const reveal = (index: number) => {
      upTo.current = Math.max(upTo.current, index);
      setDisplay((road) => (upTo.current >= next.checkpoints.length - 1 ? next : blendRoad(road, next, upTo.current)));
    };
    if (current!.kind === "drive") {
      setPos(current!.to);
      reveal(Math.min(next.checkpoints.length - 1, Math.ceil(current!.to)));
    } else if (current!.kind === "stamp") {
      lastMark.current = current!.mark;
      reveal(current!.at);
    }
    else if (current!.kind === "finish") reveal(next.checkpoints.length - 1);
    setScene(current!);
    const timer = window.setTimeout(() => {
      setScene(null);
      setQueue(rest);
      if (rest.length === 0) {
        upTo.current = Number.POSITIVE_INFINITY;
        setDisplay(next);
      }
    }, SCENE_MS[current!.kind]);
    return () => window.clearTimeout(timer);
  }, [queue]);

  // Server-rendered changes (after the person's own decision) come in as props.
  useEffect(() => {
    if (initial.cursor < latest.current.cursor || initial.version === latest.current.version) return;
    latest.current = { cursor: initial.cursor, version: initial.version, updatedAt: initial.updatedAt };
    accept(initial);
  }, [initial, accept]);

  // Live updates: poll while visible; back off while the network is down.
  const finished = shown.road.outcome !== null && shown.tasks.every((task) => task.status === "COMPLETED" || task.status === "CANCELLED") && shown.fyi.every((item) => item.status !== "PENDING");
  useEffect(() => {
    if (finished) return;
    let stopped = false;
    let timer = 0;
    let wait = POLL_MS;
    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === "visible") {
        const response = await fetch(`/api/requests/${initial.requestId}/progress`, { cache: "no-store" }).catch(() => null);
        if (stopped) return;
        if (!response || response.status >= 500) {
          setOffline(true);
          wait = Math.min(MAX_BACKOFF_MS, wait * 2);
        } else if (response.ok) {
          setOffline(false);
          wait = POLL_MS;
          const body = (await response.json()) as { journey?: Journey };
          const next = body.journey;
          // Only newer news, and only real changes (older or repeated news is dropped).
          if (next && next.cursor >= latest.current.cursor && next.version !== latest.current.version) {
            latest.current = { cursor: next.cursor, version: next.version, updatedAt: next.updatedAt };
            accept(next);
            router.refresh(); // the levels, actions and timeline below follow
          }
        }
      }
      timer = window.setTimeout(() => void tick(), wait);
    };
    timer = window.setTimeout(() => void tick(), POLL_MS);
    const now = () => {
      window.clearTimeout(timer);
      wait = POLL_MS;
      void tick();
    };
    const onVisible = () => {
      setHidden(document.visibilityState !== "visible");
      if (document.visibilityState === "visible") now();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", now);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", now);
    };
  }, [initial.requestId, finished, accept, router]);

  // Keep the van in view on a scrolling road (phones, long routes).
  const total = flagPos(display);
  const scrolledOnce = useRef(false);
  useEffect(() => {
    const box = scroller.current;
    if (!box || box.scrollWidth <= box.clientWidth) return;
    const target = (pos / total) * (box.scrollWidth - 160) - box.clientWidth / 2 + 104;
    // The first time straight there (a smooth scroll can be cut short while the page settles).
    box.scrollTo({ left: Math.max(0, target), behavior: reduced.current || !scrolledOnce.current ? "auto" : "smooth" });
    scrolledOnce.current = true;
  }, [pos, total, collapsed]);

  const points = display.checkpoints;
  const left = (position: number) => `${(position / total) * 100}%`;
  const approved = display.outcome === "APPROVED";
  const rejected = display.outcome === "REJECTED";
  const atPoint = points[display.vanAt];
  const returned = atPoint?.state === "returned";
  const percent = percentOf(display);
  const greenTo = approved ? total : Math.max(0, display.vanAt - 1);
  const headline = approved
    ? "Approved: all levels complete"
    : rejected
      ? `Rejected at ${atPoint?.label ?? "a level"}`
      : display.outcome === "CANCELLED"
        ? "Withdrawn"
        : returned
          ? "Returned to the requester for changes"
          : display.vanAt === 0
            ? "Request submitted"
            : `At ${atPoint?.label ?? "the next level"}`;
  const moving = scene?.kind === "drive" || scene?.kind === "seal";
  const docOut = scene ? scene.kind === "unload" || scene.kind === "stamp" : documentOut(display);
  const stampMark: StampMark | null = scene?.kind === "stamp" ? scene.mark : scene?.kind === "reload" ? lastMark.current : !scene && rejected ? "reject" : null;
  const opened = open !== null ? points[open] : null;

  const toggle = () => {
    setCollapsed((value) => {
      try {
        window.localStorage.setItem("ars-journey-collapsed", value ? "0" : "1");
      } catch {
        /* fine */
      }
      return !value;
    });
  };

  return (
    <div
      className={`jr-panel rounded-xl bg-[#0b1526] text-white ${hidden ? "jr-paused" : ""} ${compact ? "p-3" : "p-4"}`}
      data-testid="approval-road"
      data-van-at={display.vanAt}
      data-outcome={display.outcome ?? "OPEN"}
      data-scene={scene?.kind ?? "idle"}
      data-active={display.outcome ? undefined : "1"}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[15px] font-bold">Approval levels</p>
          <p className="text-[12px] text-[#cbd5e1]" aria-live="polite">
            {headline}
            <span className="sr-only">
              . {display.levelsDone} of {display.levels} levels done.
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {offline && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#7c2d12] px-2 py-0.5 text-[11px] font-semibold text-[#fed7aa]" role="status" data-testid="journey-offline">
              <WifiOff className="h-3 w-3" aria-hidden="true" /> Reconnecting…
            </span>
          )}
          <span
            className={`rounded-full px-3 py-1 text-[12px] font-bold tabular-nums ${approved ? "bg-[#15803d] text-white" : rejected ? "bg-[#b91c1c] text-white" : display.outcome ? "bg-[#334155] text-[#cbd5e1]" : "bg-[#14532d] text-[#bbf7d0]"}`}
            data-testid="road-percent"
          >
            {approved ? "100% Completed" : rejected ? `Stopped at ${percent}%` : display.outcome ? "Withdrawn" : `${percent}% Completed`}
          </span>
          {!compact && (
            <button type="button" onClick={toggle} aria-expanded={!collapsed} className="grid h-8 w-8 place-items-center rounded-full text-[#cbd5e1] hover:bg-white/10" aria-label={collapsed ? "Show the journey" : "Hide the journey"}>
              <ChevronDown className={`h-4 w-4 transition-transform ${collapsed ? "" : "rotate-180"}`} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <>
          <div ref={scroller} className="jr-scroll -mx-2 overflow-x-auto px-2 pb-1" tabIndex={0} aria-label="Approval journey">
            <div className="relative jr-track" style={{ minWidth: Math.max((points.length + 1) * (compact ? 110 : SPACING), compact ? 300 : 420), ["--jr-min" as string]: `${(points.length + 1) * 118}px` }}>
              {/* the scene: sky for the van and the document, then the road */}
              <div className={`relative ml-[104px] mr-[56px] ${compact ? "h-[96px]" : "h-[150px]"}`}>
                {/* finish flag */}
                <div className="absolute bottom-[34px] -translate-x-1/2" style={{ left: left(total) }}>
                  <JourneyFlag />
                </div>
                {/* the road: asphalt, two lane edges, moving centre dashes, the finished stretch in green */}
                <div className="jr-road absolute inset-x-[-40px] bottom-[10px] h-[30px] overflow-hidden rounded-md" data-moving={moving ? "1" : undefined}>
                  <div
                    className="absolute inset-y-0 left-0 bg-[#15803d]/45 motion-safe:transition-[width] motion-safe:duration-[1200ms]"
                    style={{ width: `calc(40px + (100% - 80px) * ${greenTo / total})` }}
                  />
                  <div className="absolute inset-x-0 top-[3px] h-[2px] bg-[#e2e8f0]/70" />
                  <div className="absolute inset-x-0 bottom-[3px] h-[2px] bg-[#e2e8f0]/70" />
                  <div className="jr-dashes absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2" />
                </div>

                {/* the van, with the document and envelope it carries */}
                <div
                  className="jr-vanwrap absolute bottom-[22px] z-[2] -translate-x-[78%]"
                  style={{ left: left(pos), transitionDuration: scene?.kind === "drive" ? `${SCENE_MS.drive}ms` : "0ms" }}
                  data-testid="road-van"
                  data-moving={moving ? "1" : undefined}
                  data-door={scene?.kind === "unload" || scene?.kind === "reload" || scene?.kind === "seal" || (docOut && !scene) ? "open" : "closed"}
                >
                  {!compact && (
                    <div className="jr-cargo pointer-events-none absolute bottom-[70%] left-[2%] z-[3] h-[64px] w-[60px]" data-doc={docOut ? "out" : "in"}>
                      <span className="jr-env absolute bottom-0 left-0">
                        <JourneyEnvelope />
                      </span>
                      <span className="jr-doc absolute bottom-0 left-[6px]" data-testid={docOut ? "journey-document" : undefined}>
                        <JourneyDocument />
                        {stampMark && (
                          <span className="jr-stamp absolute -right-3 -top-2" data-testid="journey-stamp" data-mark={stampMark}>
                            <JourneyStamp mark={stampMark} />
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                  {approved && !scene && (
                    <span className="absolute -top-8 left-1/2 grid h-8 w-8 -translate-x-1/2 place-items-center rounded-full bg-[#16a34a] text-white shadow-lg jr-pop" data-testid="road-approved-tick">
                      <Check className="h-5 w-5" strokeWidth={3.5} aria-hidden="true" />
                    </span>
                  )}
                  <JourneyVan width={compact ? 84 : 128} />
                </div>

                {/* checkpoints on the centre line */}
                {points.map((point, index) => (
                  <button
                    key={point.key}
                    type="button"
                    onClick={() => setOpen(open === index ? null : index)}
                    aria-expanded={open === index}
                    aria-label={`${point.label}: ${statusText(point, index).word}`}
                    className={`absolute bottom-[10px] z-[3] grid h-[30px] w-[30px] -translate-x-1/2 place-items-center rounded-full border-[3px] shadow-lg outline-none transition-colors duration-500 focus-visible:ring-4 focus-visible:ring-[#60a5fa] ${STATE_DOT[point.state]}`}
                    style={{ left: left(index) }}
                    data-testid="road-checkpoint"
                    data-state={point.state}
                  >
                    <DotIcon state={point.state} index={index} />
                  </button>
                ))}
              </div>
              {/* labels under the road */}
              <ol className={`relative ml-[104px] mr-[56px] ${compact ? "h-[44px]" : "h-[78px]"}`}>
                {points.map((point, index) => {
                  const status = statusText(point, index);
                  return (
                    <li key={point.key} className="absolute top-1 w-[124px] -translate-x-1/2 text-center" style={{ left: left(index) }}>
                      <button type="button" onClick={() => setOpen(open === index ? null : index)} className="w-full rounded px-1 text-[12px] font-semibold leading-tight text-[#e2e8f0] hover:bg-white/10">
                        <span className="line-clamp-2">{point.label}</span>
                        {point.parallel && <span className="block text-[11px] font-normal text-[#94a3b8]">{point.people.length} people</span>}
                      </button>
                      {!compact && (
                        <span className={`mt-1 inline-block rounded px-2 py-0.5 text-[11px] font-medium leading-tight transition-colors duration-500 ${STATE_PILL[point.state]}`}>
                          {status.word}
                          {status.time && <span className="block font-normal">{status.time}</span>}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>

          {opened && <CheckpointDetails point={opened} index={open!} now={now} onClose={() => setOpen(null)} />}

          {!compact && (shown.tasks.length > 0 || shown.fyi.length > 0) && (
            <div className="mt-3 grid gap-3 md:grid-cols-2" data-testid="journey-activities">
              {shown.tasks.length > 0 && (
                <section aria-label="Work tasks">
                  <h3 className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-[#94a3b8]">Work tasks</h3>
                  <ul className="space-y-2">
                    {shown.tasks.map((task) => (
                      <WorkTaskActivity key={task.id} task={task} fresh={newItems.has(`t${task.id}:${task.status}`)} />
                    ))}
                  </ul>
                </section>
              )}
              {shown.fyi.length > 0 && (
                <section aria-label="Information shared">
                  <h3 className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-[#94a3b8]">Information (FYI)</h3>
                  <ul className="space-y-2">
                    {shown.fyi.map((item) => (
                      <FyiActivity key={item.key} item={item} fresh={newItems.has(`f${item.key}`)} />
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// A checkpoint's details: who, when, comments; keyboard reachable from the point.
function CheckpointDetails({ point, index, now, onClose }: { point: Checkpoint; index: number; now: number; onClose: () => void }) {
  return (
    <div className="mt-2 rounded-lg border border-[#334155] bg-[#111c2e] px-4 py-3 text-[#e2e8f0]" role="region" aria-label={`${point.label}: details`} data-testid="road-detail">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-white">{point.label}</p>
        <button type="button" className="text-[12px] text-[#94a3b8] hover:text-white" onClick={onClose}>
          Close
        </button>
      </div>
      {point.rule && <p className="text-[12px] text-[#94a3b8]">{point.rule}</p>}
      {point.reason && <p className="text-[12px] text-[#fdba74]">{point.reason}</p>}
      {index === 0 ? (
        <p className="mt-1 text-[13px]">Submitted {when(point.finishedAt) ?? ""}</p>
      ) : point.people.length === 0 ? (
        <p className="mt-1 text-[13px] text-[#94a3b8]">Who decides here is worked out when the request reaches this level.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {point.people.map((person, personIndex) => (
            <li key={`${person.name}-${personIndex}`} className="text-[13px]">
              <span className="font-medium text-white">{person.name}</span> <span className="text-[#94a3b8]">· {PERSON_WORD[person.status] ?? person.status.toLowerCase()}</span>
              {person.decidedByName && <span className="text-[#94a3b8]"> (by {person.decidedByName})</span>}
              {person.decidedAt && <span className="text-[#94a3b8]"> · {when(person.decidedAt)}</span>}
              {person.comment && <p className="mt-0.5 rounded bg-[#0b1526] px-2 py-1 text-[12px] text-[#cbd5e1]">“{person.comment}”</p>}
            </li>
          ))}
        </ul>
      )}
      {point.since && (point.state === "current" || point.state === "hold" || point.state === "blocked") && <p className="mt-2 text-[12px] text-[#94a3b8]">Waiting {duration(point.since, null, now)}.</p>}
      {point.finishedAt && index > 0 && point.since && <p className="mt-2 text-[12px] text-[#94a3b8]">Took {duration(point.since, point.finishedAt, now)}.</p>}
    </div>
  );
}
