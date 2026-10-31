"use client";

import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog } from "@/features/ui/Dialog";
import { APP_UPDATED_EVENT, SESSION_ENDED_EVENT, SLOW_EVENT } from "@/features/ui/form";
import { Spinner } from "@/features/ui/Spinner";

// FB-04: when the session ends (idle limit, 12-hour limit, signed out on
// another device), say so in a dialog instead of letting the next click
// fail. What is on screen stays: the person can copy it first. Drafts are
// kept on the server under their own account, so the next person on a
// shared computer can't see them.
// v1.8.0: the check runs every minute and never counts as activity. Typing,
// clicking or scrolling in the page does count: it is reported at the next
// check. Two minutes before the inactivity sign-out a warning offers "Stay
// signed in".
// v1.12.1 (owner, D-158): when the session ends, the page goes to the
// signed-out page, which says why and offers "Sign in again" (back here).
// v1.12.5 (D-164): the same check tells when ARS was published again since
// this page was made (`build`), so the page asks to be reloaded before a
// submit fails.
const CHECK_EVERY_MS = 60_000;
const WARN_SECONDS = 120;
const ACTIVITY_EVENTS = ["keydown", "pointerdown", "wheel", "touchstart", "input"] as const;

export function SessionWatch({ build }: { build: string }) {
  const [ended, setEnded] = useState(false);
  const [left, setLeft] = useState<number | null>(null); // seconds, while warning
  const pathname = usePathname();
  const lastActivity = useRef(Date.now());
  const lastReported = useRef(Date.now());
  // Ended: find out why, then go to the signed-out page.
  useEffect(() => {
    if (!ended) return;
    let cancelled = false;
    void fetch("/api/auth/status", { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<{ reason?: string | null }>) : {}))
      .catch(() => ({}) as { reason?: string | null })
      .then((body) => {
        if (cancelled) return;
        const reason = (body as { reason?: string | null }).reason ?? "unknown";
        window.location.assign(`/signed-out?reason=${encodeURIComponent(reason)}&next=${encodeURIComponent(pathname)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [ended, pathname]);
  const keepAlive = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/keep-alive", { method: "POST", cache: "no-store" });
      if (response.status === 401) setEnded(true);
      else if (response.ok) {
        lastReported.current = Date.now();
        setLeft(null);
      }
    } catch {
      // offline: the offline banner covers it
    }
  }, []);
  const check = useCallback(async () => {
    if (document.visibilityState !== "visible" || navigator.onLine === false) return;
    try {
      // Activity in the page since the last report counts on the server.
      if (lastActivity.current > lastReported.current) await keepAlive();
      const response = await fetch("/api/auth/status", { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as { signedIn?: boolean; idleSecondsLeft?: number | null; build?: string };
      if (typeof body.build === "string" && body.build !== "unknown" && build !== "unknown" && body.build !== build) window.dispatchEvent(new Event(APP_UPDATED_EVENT));
      if (body.signedIn === false) {
        setLeft(null);
        setEnded(true);
        return;
      }
      const seconds = typeof body.idleSecondsLeft === "number" ? body.idleSecondsLeft : null;
      setLeft(seconds !== null && seconds <= WARN_SECONDS ? seconds : null);
    } catch {
      // offline or a blip: the offline banner covers it
    }
  }, [keepAlive, build]);
  useEffect(() => {
    const onEnded = () => setEnded(true);
    const onActivity = () => {
      lastActivity.current = Date.now();
    };
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { passive: true });
    window.addEventListener(SESSION_ENDED_EVENT, onEnded);
    document.addEventListener("visibilitychange", check);
    const timer = setInterval(check, CHECK_EVERY_MS);
    return () => {
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity);
      window.removeEventListener(SESSION_ENDED_EVENT, onEnded);
      document.removeEventListener("visibilitychange", check);
      clearInterval(timer);
    };
  }, [check]);
  // While the warning shows, count down; at zero, ask the server again.
  useEffect(() => {
    if (left === null) return;
    if (left <= 0) {
      void check();
      return;
    }
    const tick = setTimeout(() => setLeft((value) => (value === null ? null : value - 1)), 1000);
    return () => clearTimeout(tick);
  }, [left, check]);
  const minutes = left === null ? "" : `${Math.floor(Math.max(0, left) / 60)}:${String(Math.max(0, left) % 60).padStart(2, "0")}`;
  return (
    <>
      <Dialog
        open={left !== null && !ended}
        onClose={() => void keepAlive()}
        title="Still there?"
        description={`For safety you'll be signed out in ${minutes} because there's been no activity. Anything you haven't saved stays on this page until then.`}
        size="sm"
        footer={
          <>
            <a
              href="/api/auth/logout"
              className="btn-secondary btn-compact"
              onClick={(event) => {
                event.preventDefault();
                void fetch("/api/auth/logout", { method: "POST" }).finally(() => window.location.assign("/login"));
              }}
            >
              Sign out now
            </a>
            <button type="button" className="btn-primary btn-compact" onClick={() => void keepAlive()}>
              Stay signed in
            </button>
          </>
        }
      />
    </>
  );
}

// FB-05: a visible banner while the device is offline. Nothing claims to be
// saved while it shows (forms say they couldn't reach the server).
// D-233: the browser's "online" doesn't prove ARS answers, so on the way
// back the server is asked; then "Back online" shows for a few seconds, or
// "Connected, but ARS can't be reached" stays until it answers.
type Link = "online" | "offline" | "unreachable" | "restored";
async function serverAnswers(): Promise<boolean> {
  try {
    const response = await fetch("/api/auth/status", { cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}
export function OfflineBanner() {
  const [link, setLink] = useState<Link>("online");
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const check = async (attempt = 0) => {
      if (navigator.onLine === false) return setLink("offline");
      const ok = await serverAnswers();
      if (cancelled) return;
      if (ok) {
        setLink("restored");
        timer = setTimeout(() => setLink("online"), 4000);
      } else {
        setLink("unreachable");
        // Ask again with a growing pause (5 s, 10 s … at most a minute).
        timer = setTimeout(() => void check(attempt + 1), Math.min(60_000, 5000 * 2 ** attempt));
      }
    };
    const onOffline = () => {
      clearTimeout(timer);
      setLink("offline");
    };
    const onOnline = () => {
      clearTimeout(timer);
      void check();
    };
    if (navigator.onLine === false) setLink("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);
  if (link === "online") return null;
  if (link === "restored")
    return (
      <p role="status" data-testid="back-online" className="flex items-center gap-2 border-b border-success-600/30 bg-success-50 px-4 py-2 text-label text-success-600 sm:px-8">
        <Wifi aria-hidden="true" className="h-4 w-4 shrink-0" />
        Back online. You can carry on; anything that failed while offline was not sent, so try it again.
      </p>
    );
  return (
    <p role="status" data-testid="offline-banner" className="flex items-center gap-2 border-b border-warning-600/30 bg-warning-50 px-4 py-2 text-label text-warning-600 sm:px-8">
      <WifiOff aria-hidden="true" className="h-4 w-4 shrink-0" />
      {link === "offline"
        ? "You're offline. Changes can't be sent until you're back online; what you type stays on this page."
        : "Connected, but ARS can't be reached right now. Checking again… what you type stays on this page."}
    </p>
  );
}

// D-233: a call that is still running after a few seconds says so, quietly,
// at the bottom of the screen (no percentage: the real progress isn't known).
export function SlowNetworkNotice() {
  const [slow, setSlow] = useState<Set<number>>(new Set());
  useEffect(() => {
    const onSlow = (event: Event) => {
      const { id, on } = (event as CustomEvent<{ id: number; on: boolean }>).detail;
      setSlow((current) => {
        const next = new Set(current);
        if (on) next.add(id);
        else next.delete(id);
        return next.size === current.size && [...next].every((item) => current.has(item)) ? current : next;
      });
    };
    window.addEventListener(SLOW_EVENT, onSlow);
    return () => window.removeEventListener(SLOW_EVENT, onSlow);
  }, []);
  if (!slow.size) return null;
  return (
    <p role="status" data-testid="slow-network" className="fixed bottom-4 left-1/2 z-toast flex -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-raised px-4 py-2 text-label text-ink shadow-overlay">
      <Spinner className="h-4 w-4" label="Working" />
      Still working… the connection seems slow. Please wait; don&apos;t send it again.
    </p>
  );
}

// v1.12.5 (D-164): ARS was published again while this page was open. Its
// buttons would fail until it's reloaded, so say so plainly.
export function UpdateNotice() {
  const [updated, setUpdated] = useState(false);
  useEffect(() => {
    const onUpdated = () => setUpdated(true);
    window.addEventListener(APP_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(APP_UPDATED_EVENT, onUpdated);
  }, []);
  if (!updated) return null;
  return (
    <div role="alert" data-testid="app-updated" className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-warning-600/30 bg-warning-50 px-4 py-2 text-label text-warning-600 sm:px-8">
      <RefreshCw aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">ARS has been updated. Reload this page before you submit or change anything (copy anything you typed first).</span>
      <button type="button" className="btn-primary btn-compact" onClick={() => window.location.reload()}>
        Reload page
      </button>
    </div>
  );
}
