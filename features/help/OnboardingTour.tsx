"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { finishTourAction } from "@/app/users/help-actions";
import type { TourStep } from "@/features/help/tour-steps";

// v1.14.0 (D-167, owner): the onboarding tour. It opens by itself once, on
// Overview, for anyone who hasn't finished or skipped it, and again from
// /users?tour=1 (Help, the account menu, the first-use card). Each step
// opens its page and highlights one part; Back / Next / Skip, ← → and Esc.
// Where it is lives in this tab (sessionStorage), so a reload carries on.
const STEP_KEY = "ars.tour.step";
const SEEN_KEY = "ars.tour.seen"; // auto-start at most once per tab
const PAD = 6;
const GAP = 12;
const CARD_WIDTH = 380;
const WAIT_MS = 3000;

function read(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    // storage blocked: the tour still works, it just won't survive a reload
  }
}

// The first match that is actually on screen (the search button exists twice).
function visibleTarget(selector: string): HTMLElement | null {
  for (const element of document.querySelectorAll<HTMLElement>(selector)) {
    const box = element.getBoundingClientRect();
    if (box.width > 0 && box.height > 0) return element;
  }
  return null;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function OnboardingTour({ steps, autoStart }: { steps: TourStep[]; autoStart: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  // "Take the tour" on Overview itself changes only the query.
  const asked = useSearchParams().get("tour") === "1";
  const [index, setIndex] = useState<number | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [cardHeight, setCardHeight] = useState(320);
  const [viewport, setViewport] = useState({ width: 1280, height: 800 });
  const target = useRef<HTMLElement | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const step = index === null ? null : (steps[index] ?? null);

  const start = useCallback((at: number) => {
    write(SEEN_KEY, "1");
    write(STEP_KEY, String(at));
    setIndex(at);
  }, []);

  const end = useCallback(() => {
    write(STEP_KEY, null);
    setIndex(null);
    setBox(null);
    target.current = null;
    void finishTourAction().catch(() => undefined);
  }, []);

  // Start: ?tour=1 (asked for), a tour already running in this tab
  // (reload), or the first visit to Overview for someone who hasn't done it.
  // One start per "?tour=1": until the address is cleaned up, Skip must not
  // start it again (seen when Home took longer to load, v1.37.0).
  const handled = useRef(false);
  useEffect(() => {
    if (!asked) handled.current = false;
  }, [asked]);
  useEffect(() => {
    if (steps.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    if (asked && params.get("tour") === "1" && !handled.current) {
      handled.current = true;
      params.delete("tour");
      const rest = params.toString();
      // Cleaned once the page has settled: a router.replace issued while the
      // link's own navigation is still finishing can be dropped (?tour=1 stays).
      const clean = rest ? `${pathname}?${rest}` : pathname;
      window.setTimeout(() => {
        if (new URLSearchParams(window.location.search).get("tour") === "1") router.replace(clean, { scroll: false });
      }, 250);
      start(0);
      return;
    }
    if (index !== null) return;
    const saved = Number(read(STEP_KEY));
    if (read(STEP_KEY) !== null && Number.isInteger(saved) && saved >= 0 && saved < steps.length) {
      setIndex(saved);
      return;
    }
    if (autoStart && pathname === "/users" && read(SEEN_KEY) === null) start(0);
  }, [asked, autoStart, index, pathname, router, start, steps.length]);

  const measure = useCallback(() => {
    setViewport({ width: window.innerWidth, height: window.innerHeight });
    const element = target.current;
    if (!element || !element.isConnected) return setBox(null);
    const rect = element.getBoundingClientRect();
    setBox({ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 });
  }, []);

  // Each step: open its page, then find the part to highlight (it may take
  // a moment to appear); without one the card shows in the middle.
  useEffect(() => {
    if (!step) return;
    setBox(null);
    target.current = null;
    if (step.path && pathname !== step.path) {
      router.push(step.path);
      return;
    }
    if (!step.target) return;
    const selector = step.target;
    const began = Date.now();
    const timer = window.setInterval(() => {
      const found = visibleTarget(selector);
      if (!found && Date.now() - began < WAIT_MS) return;
      window.clearInterval(timer);
      if (!found) return;
      target.current = found;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      found.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
      window.setTimeout(() => measure(), reduce ? 0 : 350);
    }, 100);
    return () => window.clearInterval(timer);
  }, [step, pathname, router, measure]);

  useEffect(() => {
    if (index === null) return;
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [index, measure]);

  useLayoutEffect(() => {
    if (card.current) setCardHeight(card.current.offsetHeight);
  }, [step, box, viewport.width]);

  // Focus moves to the step's title, so screen readers read it.
  useEffect(() => {
    if (step) heading.current?.focus();
  }, [step]);

  const go = useCallback(
    (next: number) => {
      if (next < 0) return;
      if (next >= steps.length) return end();
      write(STEP_KEY, String(next));
      setIndex(next);
    },
    [end, steps.length],
  );

  // Keyboard: ← → to move, Esc to leave; Tab stays inside the card.
  useEffect(() => {
    if (index === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        end();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        go(index + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        go(index - 1);
      } else if (event.key === "Tab" && card.current) {
        const items = [...card.current.querySelectorAll<HTMLElement>("button:not([disabled])")];
        if (items.length === 0) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        const active = document.activeElement;
        if (!card.current.contains(active)) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [end, go, index]);

  if (!step || index === null) return null;

  // Where the card goes: docked at the bottom on phones; otherwise below the
  // highlighted part (above it if there's no room, beside it for narrow
  // parts such as the bell), or in the middle.
  const narrow = viewport.width < 640;
  const width = Math.min(CARD_WIDTH, viewport.width - 32);
  let position: React.CSSProperties;
  if (narrow) position = { left: 16, right: 16, bottom: 16 };
  else if (!box) position = { left: (viewport.width - width) / 2, top: Math.max(16, (viewport.height - cardHeight) / 2), width };
  else {
    const left = Math.min(Math.max(16, box.left), viewport.width - width - 16);
    const below = box.top + box.height + GAP;
    const above = box.top - GAP - cardHeight;
    const top = below + cardHeight <= viewport.height - 16 ? below : above >= 16 ? above : Math.max(16, viewport.height - cardHeight - 16);
    position = { left, top, width };
  }
  const last = index === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[70]" data-testid="tour">
      {/* The page behind is dimmed and can't be clicked during the tour. */}
      {box ? (
        <div
          aria-hidden="true"
          data-testid="tour-spotlight"
          className="pointer-events-none fixed rounded-lg ring-2 ring-primary-600 transition-all duration-200 motion-reduce:transition-none"
          style={{ top: box.top, left: box.left, width: box.width, height: box.height, boxShadow: "0 0 0 9999px rgb(15 23 42 / 0.55)" }}
        />
      ) : (
        <div aria-hidden="true" className="fixed inset-0 bg-slate-900/55" />
      )}
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-intro"
        className="card fixed max-h-[calc(100dvh-32px)] overflow-y-auto p-5 shadow-xl"
        style={position}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-caption font-semibold uppercase tracking-wider text-primary-700">
            {step.section} · {index + 1} of {steps.length}
          </p>
          <button type="button" onClick={end} aria-label="Close the tour" className="-mr-2 -mt-2 rounded-md p-1.5 text-ink-muted hover:bg-surface-muted hover:text-ink">
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
          <div className="h-full rounded-full bg-primary-600 transition-all motion-reduce:transition-none" style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
        </div>
        <h2 id="tour-title" ref={heading} tabIndex={-1} className="mt-3 text-card-title font-semibold focus:outline-none">
          {step.title}
        </h2>
        <p id="tour-intro" className="mt-1.5 text-body text-ink-muted">
          {step.intro}
        </p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-label">
          {step.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={end} className="link text-label">
            {last ? "Close" : "Skip tour"}
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={() => go(index - 1)} disabled={index === 0} className="btn-secondary btn-compact">
              Back
            </button>
            <button type="button" onClick={() => go(index + 1)} className="btn-primary btn-compact">
              {last ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
