"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
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
  WifiOff,
  X,
  XCircle,
} from "lucide-react";
import type { Checkpoint, CheckpointState, Road } from "@/server/approvals/road";
import type { Journey } from "@/server/journey/types";
import { blendRoad, documentOut, flagPos, planScenes, SCENE_MS, vanStop, type Scene, type StampMark } from "@/features/journey/controller";
import { STATE_DOT, STATE_TONE, statusText } from "@/features/journey/format";
import { ArsFactory, JourneyDocument, JourneyEnvelope, JourneyFlag, JourneyStamp, JourneyVan, ScenicBackdrop } from "@/features/journey/JourneyArt";
import { FyiActivity, WorkTaskActivity } from "@/features/journey/JourneyActivities";
import { requestStatusDisplay } from "@/features/requests/StatusPill";
import { tonePill, toneText, type StatusTone } from "@/features/ui/status-tones";
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

function DotIcon({ state, index, small = false }: { state: CheckpointState; index: number; small?: boolean }) {
  const cls = small ? "h-3 w-3" : "h-4 w-4";
  if (state === "done") return <Check className={cls} strokeWidth={3} aria-hidden="true" />;
  if (state === "rejected") return <X className={cls} strokeWidth={3} aria-hidden="true" />;
  if (state === "returned") return <RotateCcw className={cls} aria-hidden="true" />;
  if (state === "hold") return <Pause className={cls} aria-hidden="true" />;
  if (state === "blocked") return <TriangleAlert className={cls} aria-hidden="true" />;
  if (state === "skipped") return <SkipForward className={cls} aria-hidden="true" />;
  if (state === "cancelled") return <Minus className={cls} strokeWidth={3} aria-hidden="true" />;
  if (state === "current") return <span className={`${small ? "h-1.5 w-1.5" : "h-2.5 w-2.5"} rounded-full bg-white`} aria-hidden="true" />;
  return <span className="h-2 w-2 rounded-full bg-[#94a3b8]" aria-hidden="true" data-index={index} />;
}

const levelsCounted = (road: Road) => road.checkpoints.slice(1).filter((point) => point.state === "done" || point.state === "skipped").length;

// v1.48.1 (owner): the approver under each level on the road: the requester
// for the submitted point, who decided once decided, else who it waits for.
function approverLine(point: Checkpoint, index: number, requesterName: string | null | undefined): string | null {
  if (index === 0) return requesterName ?? null;
  const decided = point.people.filter((person) => person.decidedAt).map((person) => person.decidedByName ?? person.name);
  const names = [...new Set((decided.length && point.state === "done" ? decided : point.people.map((person) => person.name)).filter(Boolean))];
  if (!names.length) return null;
  return names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ");
}

// v1.48.1: the tooltip's text, also the level button's accessible name.
function tipText(point: Checkpoint, index: number, requesterName: string | null | undefined): string {
  const words = statusText(point, index);
  return [point.label, words.word, words.time, approverLine(point, index, requesterName)].filter(Boolean).join(", ");
}

function LevelTip({ point, index, requesterName }: { point: Checkpoint; index: number; requesterName: string | null | undefined }) {
  const words = statusText(point, index);
  const who = approverLine(point, index, requesterName);
  return (
    <span
      aria-hidden="true"
      className="jr-tip pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 hidden w-max min-w-[150px] max-w-[220px] -translate-x-1/2 rounded-lg border border-white/15 bg-[#0f1c31] px-3 py-2 text-center text-white shadow-xl group-hover:block group-focus-visible:block"
      data-testid="journey-tip"
    >
      <span className="block text-[12.5px] font-semibold leading-tight">{point.label}</span>
      <span className={`mt-0.5 block text-[12px] font-semibold leading-tight ${toneText(STATE_TONE[point.state])}`}>{words.word}</span>
      {words.time && <span className="block text-[11px] leading-tight text-[#cbd5e1]">{words.time}</span>}
      {who && <span className="mt-0.5 block text-[11px] font-medium leading-tight text-[#e2e8f0]" data-testid="journey-approver">{who}</span>}
    </span>
  );
}

// v1.48.1 (owner): while the card is folded, the header's free space shows
// the journey in small: the road (asphalt, lane dashes, the finished stretch
// in green), a dot per level in its status colour, the van where it is now
// and the finish flag. Decorative; the headline is read out instead.
function HeaderRoad({ points, pos, greenTo, headline }: { points: Checkpoint[]; pos: number; greenTo: number; headline: string }) {
  const total = Math.max(1, points.length);
  // Positions run from 3% to 94%, leaving room for the van's nose and the flag.
  const at = (position: number) => `${3 + (position / total) * 91}%`;
  return (
    <span className="relative block h-11 min-w-[180px] flex-1" data-testid="journey-header-track">
      <span className="sr-only">{headline}</span>
      <span aria-hidden="true">
        {/* the road */}
        <span className="absolute inset-x-0 bottom-[3px] h-[14px] overflow-hidden rounded-[4px] bg-gradient-to-b from-[#334155] via-[#1e293b] to-[#334155] shadow-inner">
          <span className="absolute inset-y-0 left-0 bg-[#15803d]/55" style={{ width: at(greenTo) }} />
          <span className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 bg-[repeating-linear-gradient(90deg,#e2e8f0_0_10px,transparent_10px_18px)] opacity-80" />
        </span>
        {/* the levels */}
        {points.map((point, index) => (
          <span
            key={point.key}
            className={`absolute bottom-[2px] grid h-4 w-4 -translate-x-1/2 place-items-center rounded-full border-2 ${STATE_DOT[point.state]}`}
            style={{ left: at(index) }}
            title={point.label}
          >
            <DotIcon state={point.state} index={index} small />
          </span>
        ))}
        {/* the finish flag */}
        <span className="absolute bottom-[8px] -translate-x-1/2 origin-bottom scale-[0.55]" style={{ left: at(total) }}>
          <JourneyFlag />
        </span>
        {/* the van */}
        <span className="absolute bottom-[12px] -translate-x-[70%] transition-[left] duration-700" style={{ left: at(pos) }}>
          <JourneyVan width={44} />
        </span>
      </span>
    </span>
  );
}

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

  // v1.48.1 (owner): no details panel on the road; a level takes you to the
  // page's Approval levels card, which shows its people and decisions.
  const choose = (index: number) => {
    void index;
    const card = document.querySelector('[data-testid="approval-levels"]');
    card?.scrollIntoView({ behavior: reduced.current ? "auto" : "smooth", block: "start" });
  };
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
        <div className={`jr-title min-w-0 ${!compact && collapsed ? "flex-none sm:max-w-[40%]" : "flex-1 basis-[180px]"}`}>
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
        {!compact && collapsed && (
          <div className="order-last flex w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
            <HeaderRoad points={points} pos={pos} greenTo={greenTo} headline={headline} />
          </div>
        )}
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
          {percentChip}
        </div>
        {/* v1.48.1 (owner): on a phone these sit in the header's top-right corner, beside the ARS mark. */}
        {!compact && (
          <div className="jr-tools flex items-center gap-2">
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
          </div>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {headline}. {display.levelsDone} of {display.levels} levels done.
      </p>

      {!collapsed && (
        <div className={`flex flex-col gap-3 ${compact ? "p-2" : "p-3 sm:p-4"}`}>
          <div className="contents">
            {/* the scenic road */}
            <div className="order-1 min-w-0 overflow-hidden rounded-xl border border-white/10 bg-[#0d1b2e]">
              <div ref={scroller} className="jr-scroll overflow-x-auto" tabIndex={0} aria-label="Approval journey road">
                <div className="jr-track relative" style={{ minWidth: Math.max((points.length + 1) * (compact ? 110 : SPACING), compact ? 300 : 420), ["--jr-min" as string]: `${(points.length + 1) * 118}px` }}>
                  <div className={`relative ${compact ? "h-[96px]" : "h-[124px]"}`}>
                    <ScenicBackdrop id={`jr${artId}`} />
                    {!compact && (
                      <div className="pointer-events-none absolute bottom-[38px] right-[2px] opacity-90">
                        <ArsFactory width={92} />
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
                          <div className="jr-cargo pointer-events-none absolute bottom-[70%] left-[2%] z-[3] h-[64px] w-[60px] origin-bottom-left scale-[0.72]" data-doc={docOut ? "out" : "in"}>
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
                        <JourneyVan width={compact ? 72 : 92} />
                      </div>

                      {/* milestones on the centre line */}
                      {points.map((point, index) => (
                        <button
                          key={point.key}
                          type="button"
                          onClick={() => choose(index)}
                          aria-label={tipText(point, index, shown.requesterName)}
                          className={`group absolute bottom-[8px] z-[3] grid h-[34px] w-[34px] -translate-x-1/2 place-items-center rounded-full border-[3px] shadow-lg outline-none transition-colors duration-500 hover:z-[6] focus-visible:z-[6] focus-visible:ring-4 focus-visible:ring-[#93c5fd] ${STATE_DOT[point.state]}`}
                          style={{ left: left(index) }}
                          data-testid="road-checkpoint"
                          data-state={point.state}
                        >
                          <DotIcon state={point.state} index={index} />
                          {/* v1.48.1 (owner): the level's details show on hover (and keyboard focus), not under the road. */}
                          {!compact && <LevelTip point={point} index={index} requesterName={shown.requesterName} />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

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

        </div>
      )}
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