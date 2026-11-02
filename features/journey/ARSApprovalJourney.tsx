"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  Minus,
  Pause,
  PauseCircle,
  PenLine,
  RefreshCw,
  RotateCcw,
  Share2,
  SkipForward,
  TriangleAlert,
  Undo2,
  UserRound,
  WifiOff,
  X,
  XCircle,
} from "lucide-react";
import type { Checkpoint, CheckpointState, Road } from "@/server/approvals/road";
import type { Journey } from "@/server/journey/types";
import { blendRoad, documentOut, flagPos, planScenes, SCENE_MS, vanStop, type Scene, type StampMark } from "@/features/journey/controller";
import { duration, levelSubline, PERSON_WORD, STATE_DOT, STATE_TONE, statusText, when, whenDate, whenLong } from "@/features/journey/format";
import { ArsFactory, JourneyDocument, JourneyEnvelope, JourneyFlag, JourneyStamp, JourneyVan, ScenicBackdrop } from "@/features/journey/JourneyArt";
import { FyiActivity, WorkTaskActivity } from "@/features/journey/JourneyActivities";
import { requestStatusDisplay } from "@/features/requests/StatusPill";
import { STATUS_TONES, tonePill, toneText, type StatusTone } from "@/features/ui/status-tones";
import { COPY_BLOCKED, copyText } from "@/features/ui/clipboard";
import { useToast } from "@/features/ui/Toast";

// D-273 (owner's journey brief): the approval journey. The ARS van carries the
// sealed request along a road of approval points: it stops beside the point
// waiting now, the document comes out for review, a confirmed decision stamps
// it, it is folded back into the van and the van drives on; at the flag the
// road completes. Work tasks and FYI messages are activities beside the road.
//
// v1.48 (owner's journey design, "use this folder as reference and redesign
// the Approval Journey based on this image"): a dark card with a header bar
// (ARS mark, request, status, route, refresh, share), a scenic road (sky,
// mountains, trees, the ARS works at the end), a Request Status card (ring,
// levels done, request facts) and the detailed levels list beside it on wide
// screens and below it on phones, and a tinted outcome banner once final.
//
// Event-driven, never the source of truth: the server's journey (the request's
// records) is polled while the page is visible (10 s; at once on return, on
// reconnect, and on Refresh). A newer journey (event cursor, then version)
// plays the scenes between the two states (features/journey/controller.ts);
// older or repeated news is ignored; a refresh draws the current state
// without replaying. One component per request, so requests never share a van.
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
  if (state === "cancelled") return <Minus className={cls} strokeWidth={3} aria-hidden="true" />;
  if (state === "current") return <span className="h-2.5 w-2.5 rounded-full bg-white" aria-hidden="true" />;
  return <span className="h-2 w-2 rounded-full bg-[#94a3b8]" aria-hidden="true" data-index={index} />;
}

const levelsCounted = (road: Road) => road.checkpoints.slice(1).filter((point) => point.state === "done" || point.state === "skipped").length;

const percentOf = (road: Road) => {
  if (road.outcome === "APPROVED") return 100;
  return road.levels === 0 ? 0 : Math.min(99, Math.round((levelsCounted(road) / road.levels) * 100));
};

// The outcome banner (owner's design): one per final or paused state.
type Outcome = { kind: "approved" | "expired" | "rejected" | "hold" | "changes" | "withdrawn"; title: string; text: string };
const BANNER: Record<Outcome["kind"], { box: string; icon: string; Icon: typeof CheckCircle2 }> = {
  approved: { box: "border-[#22c55e]/60 bg-[#0f2f1f]", icon: "text-[#86efac]", Icon: CheckCircle2 },
  expired: { box: "border-[#64748b]/70 bg-[#1e293b]", icon: "text-[#cbd5e1]", Icon: Clock },
  rejected: { box: "border-[#ef4444]/60 bg-[#3d1518]", icon: "text-[#fca5a5]", Icon: XCircle },
  hold: { box: "border-[#f59e0b]/60 bg-[#36280c]", icon: "text-[#fcd34d]", Icon: PauseCircle },
  changes: { box: "border-[#f97316]/60 bg-[#3b220e]", icon: "text-[#fdba74]", Icon: PenLine },
  withdrawn: { box: "border-[#a78bfa]/60 bg-[#2a1f4a]", icon: "text-[#c4b5fd]", Icon: Undo2 },
};

function outcomeOf(journey: Journey, road: Road, expired: boolean): Outcome | null {
  const at = (state: CheckpointState) => road.checkpoints.find((point, index) => index > 0 && point.state === state);
  const levels = `${road.levels} level${road.levels === 1 ? "" : "s"}`;
  switch (journey.requestStatus) {
    case "APPROVED":
      return expired
        ? { kind: "expired", title: "Request Expired", text: "Approved, but past its valid-until date" }
        : { kind: "approved", title: "Request Approved", text: road.levels > 0 ? `All ${levels} completed successfully` : "Completed successfully" };
    case "REJECTED": {
      const point = at("rejected") ?? road.checkpoints[road.vanAt];
      const person = point?.people.find((item) => item.status === "REJECTED");
      const by = person ? (person.decidedByName ?? person.name) : null;
      return { kind: "rejected", title: "Request Rejected", text: `Rejected at ${point?.label ?? "a level"}${by ? ` by ${by}` : ""}` };
    }
    case "ON_HOLD":
      return { kind: "hold", title: "Request On Hold", text: `Paused at ${at("hold")?.label ?? road.checkpoints[road.vanAt]?.label ?? "a level"}, waiting for release` };
    case "CHANGES_REQUIRED":
      return { kind: "changes", title: "Changes Required", text: "Sent back to requester for updates" };
    case "CANCELLED":
      return { kind: "withdrawn", title: "Request Withdrawn", text: "Withdrawn before every level decided" };
    default:
      return null;
  }
}

export function ARSApprovalJourney({ journey: initial, serverNow, fresh = false, variant = "full" }: Props) {
  const router = useRouter();
  const toast = useToast();
  const artId = useId().replace(/:/g, "");
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
  const [refreshing, setRefreshing] = useState(false);
  const [confetti, setConfetti] = useState(false);
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
    } else if (current!.kind === "finish") reveal(next.checkpoints.length - 1);
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

  // One look at the server: "new" (played), "same" (nothing newer) or "offline".
  const check = useCallback(async (): Promise<"new" | "same" | "offline"> => {
    const response = await fetch(`/api/requests/${initial.requestId}/progress`, { cache: "no-store" }).catch(() => null);
    if (!response || response.status >= 500) {
      setOffline(true);
      return "offline";
    }
    if (!response.ok) return "same";
    setOffline(false);
    const body = (await response.json().catch(() => ({}))) as { journey?: Journey };
    const next = body.journey;
    // Only newer news, and only real changes (older or repeated news is dropped).
    if (next && next.cursor >= latest.current.cursor && next.version !== latest.current.version) {
      latest.current = { cursor: next.cursor, version: next.version, updatedAt: next.updatedAt };
      accept(next);
      router.refresh(); // the levels, actions and timeline below follow
      return "new";
    }
    return "same";
  }, [initial.requestId, accept, router]);

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
        const result = await check();
        if (stopped) return;
        wait = result === "offline" ? Math.min(MAX_BACKOFF_MS, wait * 2) : POLL_MS;
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
  }, [finished, check]);

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
  const counted = levelsCounted(display);
  const greenTo = approved ? total : Math.max(0, display.vanAt - 1);
  const idle = !scene && queue.length === 0;
  // Expiry passes with time: the server's flag, or the clock past valid-until.
  const expired = shown.expired || (shown.requestStatus === "APPROVED" && Boolean(shown.validUntil) && Date.parse(shown.validUntil!) <= now);
  const status = requestStatusDisplay(shown.requestStatus, shown.validUntil, new Date(now));
  const outcome = idle ? outcomeOf(shown, display, expired) : null;
  const headline = approved
    ? "Approved: all levels complete"
    : rejected
      ? `Rejected at ${atPoint?.label ?? "a level"}`
      : display.outcome === "CANCELLED"
        ? "Withdrawn"
        : returned
          ? "Returned to the requester for changes"
          : atPoint?.state === "hold"
            ? `On hold at ${atPoint.label}`
            : display.vanAt === 0
              ? "Request submitted"
              : `At ${atPoint?.label ?? "the next level"}`;
  const moving = scene?.kind === "drive" || scene?.kind === "seal";
  const docOut = scene ? scene.kind === "unload" || scene.kind === "stamp" : documentOut(display);
  const stampMark: StampMark | null = scene?.kind === "stamp" ? scene.mark : scene?.kind === "reload" ? lastMark.current : !scene && rejected ? "reject" : null;
  const opened = open !== null ? points[open] : null;
  const percentWord = approved ? "Completed" : rejected ? "Stopped" : display.outcome ? "Withdrawn" : "Completed";
  const ringTone: StatusTone = approved ? (expired ? "grey" : "green") : rejected ? "red" : display.outcome ? "purple" : atPoint?.state === "hold" ? "amber" : returned ? "orange" : "blue";
  const routeText = `Route: ${display.levels} level${display.levels === 1 ? "" : "s"}`;

  // Approved: confetti once per request in this browser session (never with reduced motion).
  const celebrate = !compact && outcome?.kind === "approved";
  useEffect(() => {
    if (!celebrate || reduced.current) return;
    const key = `ars-journey-confetti-${initial.requestId}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      /* storage off: once per page */
    }
    setConfetti(true);
    const timer = window.setTimeout(() => setConfetti(false), 2600);
    return () => window.clearTimeout(timer);
  }, [celebrate, initial.requestId]);

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

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    const result = await check();
    setRefreshing(false);
    if (result === "offline") toast({ tone: "warning", title: "Couldn't reach the server", body: "The journey will update when the connection is back." });
    else if (result === "same") toast({ tone: "info", title: "The journey is up to date" });
  };

  const share = async () => {
    const link = `${window.location.origin}/users/requests/${initial.requestId}`;
    const done = await copyText(link);
    if (done) toast({ tone: "success", title: "Link copied", body: `Anyone who may see ${shown.requestNo} can open it with this link.` });
    else toast({ tone: "error", title: "Couldn't copy the link", body: `${COPY_BLOCKED} ${link}` });
  };

  const choose = (index: number) => setOpen(open === index ? null : index);
  const percentChip = (
    <span className={`rounded-full px-3 py-1 text-[12px] font-bold tabular-nums ${tonePill(ringTone)}`} data-testid="road-percent">
      {approved ? "100% Completed" : rejected ? `Stopped at ${percent}%` : display.outcome ? "Withdrawn" : `${percent}% Completed`}
    </span>
  );
  const iconButton = "grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-white/15 text-[#e2e8f0] outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-[#93c5fd] sm:h-9 sm:w-9";

  return (
    <div
      className={`jr-panel relative overflow-hidden rounded-2xl border border-[#1e2d47] bg-[#0b1526] text-white shadow-lg ${hidden ? "jr-paused" : ""}`}
      data-testid="approval-road"
      data-van-at={display.vanAt}
      data-outcome={display.outcome ?? "OPEN"}
      data-scene={scene?.kind ?? "idle"}
      data-active={display.outcome ? undefined : "1"}
      data-variant={variant}
    >
      {/* the header bar */}
      <div className={`jr-head flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-white/10 ${compact ? "px-3 py-2" : "px-3 py-3 sm:px-4"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the static ARS logo */}
        <img src="/brand/ars-mark-white.svg" alt="ARS" width={compact ? 44 : 62} height={compact ? 15 : 21} className="shrink-0" />
        <span aria-hidden="true" className={`w-px shrink-0 bg-white/20 ${compact ? "h-6" : "h-9"}`} />
        <div className="min-w-0 flex-1 basis-[180px]">
          <h2 className={`font-bold leading-tight ${compact ? "text-[14px]" : "text-[17px] sm:text-[19px]"}`}>Approval Journey</h2>
          <p className={`leading-snug text-[#cbd5e1] ${compact ? "truncate text-[12px]" : "break-words text-[12.5px] sm:text-[13px]"}`}>
            <span className="font-mono">{shown.requestNo}</span>
            {shown.title && (
              <>
                <span aria-hidden="true" className="mx-1.5 text-[#94a3b8]">
                  |
                </span>
                <span>{shown.title}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {offline && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#7c2d12] px-2 py-0.5 text-[11px] font-semibold text-[#fed7aa]" role="status" data-testid="journey-offline">
              <WifiOff className="h-3 w-3" aria-hidden="true" /> Reconnecting…
            </span>
          )}
          <span className={`rounded-full px-3 py-1 text-[12px] font-bold ${status.style}`} data-testid="journey-status">
            {status.label}
          </span>
          {!compact && <span className="whitespace-nowrap text-[12px] font-medium text-[#cbd5e1]">{routeText}</span>}
          {(compact || collapsed) && percentChip}
          {!compact && (
            <>
              <button type="button" onClick={() => void refresh()} className={iconButton} aria-label="Check for updates now" title="Check for updates now" data-testid="journey-refresh" disabled={refreshing}>
                <RefreshCw className={`h-4 w-4 ${refreshing ? "motion-safe:animate-spin" : ""}`} aria-hidden="true" />
              </button>
              <button type="button" onClick={() => void share()} className={iconButton} aria-label="Copy the link to this request" title="Copy the link to this request" data-testid="journey-share">
                <Share2 className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" onClick={toggle} aria-expanded={!collapsed} className={iconButton} aria-label={collapsed ? "Show the journey" : "Hide the journey"}>
                <ChevronDown className={`h-4 w-4 transition-transform ${collapsed ? "" : "rotate-180"}`} aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {headline}. {display.levelsDone} of {display.levels} levels done.
      </p>

      {!collapsed && (
        <div className={`flex flex-col gap-3 xl:grid xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start ${compact ? "p-2" : "p-3 sm:p-4"}`}>
          <div className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-3">
            {/* the scenic road */}
            <div className="order-1 min-w-0 overflow-hidden rounded-xl border border-white/10 bg-[#0d1b2e]">
              <div ref={scroller} className="jr-scroll overflow-x-auto" tabIndex={0} aria-label="Approval journey road">
                <div className="jr-track relative" style={{ minWidth: Math.max((points.length + 1) * (compact ? 110 : SPACING), compact ? 300 : 420), ["--jr-min" as string]: `${(points.length + 1) * 118}px` }}>
                  <div className={`relative ${compact ? "h-[104px]" : "h-[176px]"}`}>
                    <ScenicBackdrop id={`jr${artId}`} />
                    {!compact && (
                      <div className="pointer-events-none absolute bottom-[38px] right-[2px] opacity-90">
                        <ArsFactory width={128} />
                      </div>
                    )}
                    <div className="absolute inset-y-0 left-[104px] right-[56px]">
                      {/* finish flag */}
                      <div className="absolute bottom-[34px] z-[1] -translate-x-1/2" style={{ left: left(total) }}>
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
                          <span className="jr-pop absolute -top-8 left-1/2 grid h-8 w-8 -translate-x-1/2 place-items-center rounded-full bg-[#16a34a] text-white shadow-lg" data-testid="road-approved-tick">
                            <Check className="h-5 w-5" strokeWidth={3.5} aria-hidden="true" />
                          </span>
                        )}
                        <JourneyVan width={compact ? 84 : 128} />
                      </div>

                      {/* milestones on the centre line */}
                      {points.map((point, index) => (
                        <button
                          key={point.key}
                          type="button"
                          onClick={() => choose(index)}
                          aria-expanded={open === index}
                          aria-label={`${point.label}: ${statusText(point, index).word}`}
                          className={`absolute bottom-[8px] z-[3] grid h-[34px] w-[34px] -translate-x-1/2 place-items-center rounded-full border-[3px] shadow-lg outline-none transition-colors duration-500 focus-visible:ring-4 focus-visible:ring-[#93c5fd] ${STATE_DOT[point.state]}`}
                          style={{ left: left(index) }}
                          data-testid="road-checkpoint"
                          data-state={point.state}
                        >
                          <DotIcon state={point.state} index={index} />
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* labels under the road: name, coloured status, time */}
                  <ol className={`relative ml-[104px] mr-[56px] ${compact ? "h-[40px]" : "h-[84px]"}`}>
                    {points.map((point, index) => {
                      const words = statusText(point, index);
                      return (
                        <li key={point.key} className="absolute top-1.5 w-[124px] -translate-x-1/2 text-center" style={{ left: left(index) }}>
                          <button type="button" onClick={() => choose(index)} className="w-full rounded px-1 text-[12.5px] font-semibold leading-tight text-[#f1f5f9] hover:bg-white/10">
                            <span className="line-clamp-2">{point.label}</span>
                          </button>
                          {!compact && (
                            <>
                              <span className={`mt-0.5 block text-[12px] font-semibold leading-tight ${toneText(STATE_TONE[point.state])}`}>
                                {words.word}
                                {point.parallel && point.people.length > 1 && <span className="font-normal text-[#cbd5e1]"> · {point.people.length} people</span>}
                              </span>
                              {words.time && <span className="block text-[11px] leading-tight text-[#cbd5e1]">{words.time}</span>}
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </div>
            </div>

            {opened && (
              <div className="order-2">
                <CheckpointDetails point={opened} index={open!} now={now} requesterName={shown.requesterName} onClose={() => setOpen(null)} />
              </div>
            )}

            {!compact && outcome && (
              <div className={`order-4 relative overflow-hidden rounded-xl border px-4 py-3 ${BANNER[outcome.kind].box}`} data-testid="journey-outcome" data-kind={outcome.kind} role="status">
                {confetti && <Confetti />}
                <div className="relative flex items-center gap-3">
                  {(() => {
                    const Icon = BANNER[outcome.kind].Icon;
                    return <Icon className={`h-8 w-8 shrink-0 ${BANNER[outcome.kind].icon}`} aria-hidden="true" />;
                  })()}
                  <div className="min-w-0">
                    <p className="text-[16px] font-bold leading-tight text-white">{outcome.title}</p>
                    <p className="text-[13px] text-[#e2e8f0]">{outcome.text}</p>
                  </div>
                </div>
              </div>
            )}

            {!compact && (shown.tasks.length > 0 || shown.fyi.length > 0) && (
              <div className="order-5 grid gap-3 md:grid-cols-2" data-testid="journey-activities">
                {shown.tasks.length > 0 && (
                  <section aria-label="Work tasks">
                    <h3 className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-[#cbd5e1]">Work tasks</h3>
                    <ul className="space-y-2">
                      {shown.tasks.map((task) => (
                        <WorkTaskActivity key={task.id} task={task} fresh={newItems.has(`t${task.id}:${task.status}`)} />
                      ))}
                    </ul>
                  </section>
                )}
                {shown.fyi.length > 0 && (
                  <section aria-label="Information shared">
                    <h3 className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-[#cbd5e1]">Information (FYI)</h3>
                    <ul className="space-y-2">
                      {shown.fyi.map((item) => (
                        <FyiActivity key={item.key} item={item} fresh={newItems.has(`f${item.key}`)} />
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}
          </div>

          {/* Owner (2 Nov 2026): a phone leaves these two cards out; the request page below has the same facts. */}
          {!compact && (
            <aside className="jr-side order-3 flex min-w-0 flex-col gap-3 xl:order-none" aria-label="Request status and levels">
              {/* Request Status */}
              <section className="rounded-xl border border-white/10 bg-[#0f1c31] p-4" aria-labelledby={`${artId}-status`}>
                <div className="flex items-center justify-between gap-2">
                  <h3 id={`${artId}-status`} className="text-[16px] font-bold">
                    Request Status
                  </h3>
                  <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold ${status.style}`}>{status.label}</span>
                </div>
                <div className="mt-3 flex items-center gap-4">
                  <div className="relative h-[104px] w-[104px] shrink-0">
                    <svg viewBox="0 0 104 104" className="h-full w-full -rotate-90" aria-hidden="true">
                      <circle cx="52" cy="52" r="44" fill="none" stroke="#1e2d47" strokeWidth="9" />
                      <circle
                        cx="52"
                        cy="52"
                        r="44"
                        fill="none"
                        stroke={STATUS_TONES[ringTone].dark.fg}
                        strokeWidth="9"
                        strokeLinecap="round"
                        strokeDasharray={`${(2 * Math.PI * 44 * percent) / 100} ${2 * Math.PI * 44}`}
                        className="motion-safe:transition-[stroke-dasharray] motion-safe:duration-700"
                      />
                    </svg>
                    <p className="absolute inset-0 grid place-content-center text-center leading-none" data-testid="road-percent">
                      <span className="block text-[24px] font-bold tabular-nums">{percent}%</span> <span className="mt-1 block text-[11px] text-[#cbd5e1]">{percentWord}</span>
                    </p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold">
                      {counted} of {display.levels} level{display.levels === 1 ? "" : "s"} completed
                    </p>
                    <span className="mt-2 block h-2 overflow-hidden rounded-full bg-[#1e2d47]" role="progressbar" aria-label="Levels completed" aria-valuemin={0} aria-valuemax={display.levels} aria-valuenow={counted}>
                      <span className="block h-full rounded-full motion-safe:transition-[width] motion-safe:duration-700" style={{ width: `${percent}%`, background: STATUS_TONES[ringTone].dark.fg }} />
                    </span>
                  </div>
                </div>
                <dl className="mt-4 divide-y divide-white/10 border-t border-white/10 text-[13px]">
                  <Fact icon={FileText} label="Request No." value={<span className="font-mono">{shown.requestNo}</span>} />
                  <Fact icon={UserRound} label="Requestor" value={shown.requesterName || "—"} />
                  <Fact icon={CalendarDays} label="Submitted On" value={whenLong(shown.submittedAt ?? points[0]?.finishedAt) ?? "—"} />
                  <Fact icon={CalendarClock} label="Valid Until" value={whenDate(shown.validUntil) ?? "—"} />
                </dl>
              </section>

              {/* Approval Levels (Detailed) */}
              <section className="rounded-xl border border-white/10 bg-[#0f1c31] p-4" aria-labelledby={`${artId}-levels`}>
                <h3 id={`${artId}-levels`} className="text-[16px] font-bold">
                  Approval Levels (Detailed)
                </h3>
                <ol className="mt-3 space-y-1">
                  {points.map((point, index) => {
                    const current = index === display.vanAt && !display.outcome && point.state !== "done";
                    const names = index === 0 ? [] : point.people.map((person) => person.name);
                    const date = point.finishedAt ? when(point.finishedAt) : point.since ? when(point.since) : null;
                    return (
                      <li key={point.key} className="relative pl-10">
                        {index < points.length - 1 && <span aria-hidden="true" className="absolute bottom-[-6px] left-[15px] top-[34px] w-[2px] bg-[#334155]" />}
                        <span aria-hidden="true" className={`absolute left-0 top-[8px] grid h-[32px] w-[32px] place-items-center rounded-full border-[3px] ${STATE_DOT[point.state].replace("jr-pulse", "")}`}>
                          <DotIcon state={point.state} index={index} />
                        </span>
                        <button
                          type="button"
                          onClick={() => choose(index)}
                          aria-expanded={open === index}
                          className={`block min-h-[44px] w-full rounded-lg border px-3 py-2 text-left outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-[#93c5fd] ${current ? "border-[#3b82f6] bg-[#13294b]" : open === index ? "border-white/25 bg-white/5" : "border-transparent"}`}
                          data-testid="journey-level"
                          data-state={point.state}
                          aria-current={current ? "step" : undefined}
                        >
                          <span className="flex items-start justify-between gap-2">
                            <span className="min-w-0 text-[13.5px] font-semibold leading-snug">{point.label}</span>
                            {date && <span className="shrink-0 text-[11.5px] tabular-nums text-[#cbd5e1]">{date}</span>}
                          </span>
                          <span className="mt-0.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                            <span className={`text-[12.5px] ${toneText(STATE_TONE[point.state])}`}>{levelSubline(point, index, shown.requesterName)}</span>
                            {names.length > 0 && (
                              <span className="inline-flex min-w-0 items-center gap-1 text-[12px] text-[#e2e8f0]">
                                <UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                <span className="truncate">{names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ")}</span>
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </section>

              <StatusGuide />
            </aside>
          )}
        </div>
      )}
    </div>
  );
}

function Fact({ icon: Icon, label, value }: { icon: typeof FileText; label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <dt className="flex shrink-0 items-center gap-2 text-[#cbd5e1]">
        <Icon className="h-4 w-4" aria-hidden="true" />
        {label}
      </dt>
      <dd className="min-w-0 break-words text-right font-semibold">{value}</dd>
    </div>
  );
}

// Approved: a short burst of confetti (once; never with reduced motion).
const CONFETTI_COLOURS = ["#f87171", "#fbbf24", "#34d399", "#60a5fa", "#c084fc", "#f472b6"];
function Confetti() {
  return (
    <span className="jr-confetti pointer-events-none absolute inset-0" aria-hidden="true">
      {Array.from({ length: 28 }, (_, index) => (
        <i
          key={index}
          style={{
            left: `${(index * 37) % 100}%`,
            background: CONFETTI_COLOURS[index % CONFETTI_COLOURS.length],
            animationDelay: `${(index % 7) * 0.12}s`,
            ["--jr-drift" as string]: `${((index % 5) - 2) * 14}px`,
          }}
        />
      ))}
    </span>
  );
}

// The three status layers (the owner's STATUS-MODEL.md), closed by default.
const GUIDE: { title: string; rows: [string, StatusTone, string][] }[] = [
  {
    title: "Request",
    rows: [
      ["In progress", "blue", "Moving through its levels"],
      ["On hold", "amber", "Paused by an approver"],
      ["Changes required", "orange", "Sent back to edit and resubmit"],
      ["Approved", "green", "Every required level approved"],
      ["Rejected", "red", "Stopped at a level"],
      ["Withdrawn", "purple", "Withdrawn by the requester or IT"],
      ["Expired", "grey", "Approved, but past its valid-until date"],
    ],
  },
  {
    title: "Level",
    rows: [
      ["Not started", "grey", "Not reached yet"],
      ["Waiting for approval", "blue", "Deciding now"],
      ["Approved", "green", "Level complete"],
      ["Rejected", "red", "Rejected at this level"],
      ["Skipped", "purple", "Not needed by a rule (e.g. DoA)"],
      ["Blocked", "orangered", "No approver found: needs IT"],
      ["Not needed", "grey", "Closed without a decision"],
    ],
  },
  {
    title: "Person",
    rows: [
      ["Pending", "blue", "Waiting for their decision"],
      ["Approved", "green", "They approved"],
      ["Rejected", "red", "They rejected"],
      ["Asked for changes", "orange", "Sent back to the requester"],
      ["Not needed", "grey", "No longer required"],
      ["Closed", "grey", "The request ended before they decided"],
      ["Done", "green", "Work finished"],
      ["Given the task", "purple", "Background work"],
      ["Told", "purple", "For information only"],
    ],
  },
];

function StatusGuide() {
  return (
    <details className="group rounded-xl border border-white/10 bg-[#0f1c31] px-4 py-2" data-testid="journey-status-guide">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 text-[14px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[#93c5fd]">
        Status guide
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-3 pb-2">
        {GUIDE.map((group) => (
          <div key={group.title}>
            <h4 className="mb-1 text-[12px] font-bold uppercase tracking-wide text-[#cbd5e1]">{group.title} status</h4>
            <ul className="space-y-1">
              {group.rows.map(([label, tone, meaning]) => (
                <li key={label} className="flex flex-wrap items-center gap-2 text-[12px] text-[#e2e8f0]">
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${tonePill(tone)}`}>{label}</span>
                  <span>{meaning}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}

// A checkpoint's details: who, when, comments; keyboard reachable from the point.
function CheckpointDetails({ point, index, now, requesterName, onClose }: { point: Checkpoint; index: number; now: number; requesterName: string; onClose: () => void }) {
  return (
    <div className="rounded-xl border border-[#334155] bg-[#111c2e] px-4 py-3 text-[#e2e8f0]" role="region" aria-label={`${point.label}: details`} data-testid="road-detail">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-white">{point.label}</p>
        <button type="button" className="min-h-[44px] px-2 text-[12px] text-[#cbd5e1] hover:text-white sm:min-h-0" onClick={onClose}>
          Close
        </button>
      </div>
      {point.rule && <p className="text-[12px] text-[#cbd5e1]">{point.rule}</p>}
      {point.reason && <p className="text-[12px] text-[#fdba74]">{point.reason}</p>}
      {index === 0 ? (
        <p className="mt-1 text-[13px]">
          Submitted {when(point.finishedAt) ?? ""}
          {requesterName ? ` by ${requesterName}` : ""}
        </p>
      ) : point.people.length === 0 ? (
        <p className="mt-1 text-[13px] text-[#cbd5e1]">Who decides here is worked out when the request reaches this level.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {point.people.map((person, personIndex) => (
            <li key={`${person.name}-${personIndex}`} className="text-[13px]">
              <span className="font-medium text-white">{person.name}</span> <span className="text-[#cbd5e1]">· {PERSON_WORD[person.status] ?? person.status.toLowerCase()}</span>
              {person.decidedByName && <span className="text-[#cbd5e1]"> (by {person.decidedByName})</span>}
              {person.decidedAt && <span className="text-[#cbd5e1]"> · {when(person.decidedAt)}</span>}
              {person.comment && <p className="mt-0.5 rounded bg-[#0b1526] px-2 py-1 text-[12px] text-[#cbd5e1]">“{person.comment}”</p>}
            </li>
          ))}
        </ul>
      )}
      {point.since && (point.state === "current" || point.state === "hold" || point.state === "blocked") && <p className="mt-2 text-[12px] text-[#cbd5e1]">Waiting {duration(point.since, null, now)}.</p>}
      {point.finishedAt && index > 0 && point.since && <p className="mt-2 text-[12px] text-[#cbd5e1]">Took {duration(point.since, point.finishedAt, now)}.</p>}
    </div>
  );
}
