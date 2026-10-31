"use client";

import { useEffect } from "react";
import { CLIENT_KIND_COOKIE } from "@/lib/session/daily";
import { captureInstallEvents, isStandalone, isTouchDevice } from "@/features/pwa/browser";
import { InstallInvite } from "@/features/pwa/InstallInvite";

// D-250, D-251: on every page. Registers the service worker (a new build
// gets a new worker and cache), tells the server what this browser is (the
// installed app, or a touch phone or tablet: for the daily session), and
// listens for the browser's install offer.
export function PwaBoot({ build }: { build: string }) {
  useEffect(() => {
    const kind = isStandalone() ? "app" : isTouchDevice() ? "handheld" : "";
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = kind ? `${CLIENT_KIND_COOKIE}=${kind}; Path=/; Max-Age=31536000; SameSite=Lax${secure}` : `${CLIENT_KIND_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;

    const stop = captureInstallEvents();
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(build)}`, { scope: "/" }).catch(() => undefined);
    }
    return stop;
  }, [build]);
  return <InstallInvite />;
}
