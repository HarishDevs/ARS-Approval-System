"use client";

import { WifiOff } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog } from "@/features/ui/Dialog";
import { SESSION_ENDED_EVENT } from "@/features/ui/form";

// FB-04: when the session ends (idle limit, 12-hour limit, signed out on
// another device), say so in a dialog instead of letting the next click
// fail. What is on screen stays: the person can copy it first. Drafts are
// kept on the server under their own account, so the next person on a
// shared computer can't see them.
// v1.8.0: the check runs every minute and never counts as activity. Typing,
// clicking or scrolling in the page does count: it is reported at the next
// check. Two minutes before the inactivity sign-out a warning offers "Stay
// signed in". (The Super Admin has no inactivity limit: no warning.)
const CHECK_EVERY_MS = 60_000;
const WARN_SECONDS = 120;
const ACTIVITY_EVENTS = ["keydown", "pointerdown", "wheel", "touchstart", "input"] as const;

export function SessionWatch() {
  const [ended, setEnded] = useState(false);
  const [left, setLeft] = useState<number | null>(null); // seconds, while warning
  const pathname = usePathname();
  const lastActivity = useRef(Date.now());
  const lastReported = useRef(Date.now());
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
      const body = (await response.json()) as { signedIn?: boolean; idleSecondsLeft?: number | null };
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
  }, [keepAlive]);
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
  const signInHref = `/login?next=${encodeURIComponent(pathname)}`;
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
            <a href="/api/auth/logout" className="btn-secondary btn-compact" onClick={(event) => {
              event.preventDefault();
              void fetch("/api/auth/logout", { method: "POST" }).finally(() => window.location.assign("/login"));
            }}>
              Sign out now
            </a>
            <button type="button" className="btn-primary btn-compact" onClick={() => void keepAlive()}>
              Stay signed in
            </button>
          </>
        }
      />
      <Dialog
        open={ended}
        onClose={() => setEnded(false)}
        title="You were signed out"
        description="For safety you are signed out after a while without activity, or when you sign out on another device. Copy anything you typed that isn't saved, then sign in again."
        size="sm"
        footer={
          <>
            <button type="button" className="btn-secondary btn-compact" onClick={() => setEnded(false)}>
              Stay on this page
            </button>
            <a href={signInHref} className="btn-primary btn-compact">
              Sign in again
            </a>
          </>
        }
      />
    </>
  );
}

// FB-05: a visible banner while the device is offline. Nothing claims to be
// saved while it shows (forms say they couldn't reach the server).
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(navigator.onLine === false);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!offline) return null;
  return (
    <p role="status" className="flex items-center gap-2 border-b border-warning-600/30 bg-warning-50 px-4 py-2 text-label text-warning-600 sm:px-8">
      <WifiOff aria-hidden="true" className="h-4 w-4 shrink-0" />
      You&apos;re offline. Changes can&apos;t be sent until you&apos;re back online; what you type stays on this page.
    </p>
  );
}
