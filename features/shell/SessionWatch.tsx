"use client";

import { WifiOff } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Dialog } from "@/features/ui/Dialog";
import { SESSION_ENDED_EVENT } from "@/features/ui/form";

// FB-04: when the session ends (idle limit, 12-hour limit, signed out on
// another device), say so in a dialog instead of letting the next click
// fail. What is on screen stays: the person can copy it first. Drafts are
// kept on the server under their own account, so the next person on a
// shared computer can't see them.
const CHECK_EVERY_MS = 5 * 60_000;

export function SessionWatch() {
  const [ended, setEnded] = useState(false);
  const pathname = usePathname();
  const check = useCallback(async () => {
    if (document.visibilityState !== "visible" || navigator.onLine === false) return;
    try {
      const response = await fetch("/api/auth/status", { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as { signedIn?: boolean };
      if (body.signedIn === false) setEnded(true);
    } catch {
      // offline or a blip: the offline banner covers it
    }
  }, []);
  useEffect(() => {
    const onEnded = () => setEnded(true);
    window.addEventListener(SESSION_ENDED_EVENT, onEnded);
    document.addEventListener("visibilitychange", check);
    const timer = setInterval(check, CHECK_EVERY_MS);
    return () => {
      window.removeEventListener(SESSION_ENDED_EVENT, onEnded);
      document.removeEventListener("visibilitychange", check);
      clearInterval(timer);
    };
  }, [check]);
  const signInHref = `/login?next=${encodeURIComponent(pathname)}`;
  return (
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
