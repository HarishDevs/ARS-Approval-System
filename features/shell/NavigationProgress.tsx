"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { navigationHeld } from "@/features/ui/UnsavedGuard";

// D-233 (UI states: loading; Doherty threshold). Every page change says it
// heard the click: a thin bar slides along the top until the new page is
// there. It appears only after 150 ms (fast pages show nothing) and never
// claims a percentage: the real progress isn't known. Page skeletons stay
// only on read-only pages (KNOWN_ISSUES V6-D06), so this covers the rest.
export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [started, setStarted] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);
  const routeKey = `${pathname}?${search.toString()}`;

  useEffect(() => {
    setStarted(null);
    setVisible(false);
  }, [routeKey]);

  useEffect(() => {
    if (started === null) return;
    const show = window.setTimeout(() => setVisible(true), 150);
    // A click that didn't change the page doesn't leave the bar running.
    const giveUp = window.setTimeout(() => setStarted(null), 15_000);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(giveUp);
    };
  }, [started]);

  useEffect(() => {
    // Seen on the way down (capture); a click the unsaved-changes guard held
    // back ("Leave without saving?") doesn't count.
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.hasAttribute("download") || link.getAttribute("href")?.startsWith("#")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      window.setTimeout(() => !navigationHeld(event) && setStarted(Date.now()), 0);
    };
    const onPop = () => setStarted(Date.now());
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  if (!visible || started === null) return null;
  return (
    <div role="progressbar" aria-label="Loading the page" aria-busy="true" data-testid="nav-progress" className="fixed inset-x-0 top-0 z-palette h-0.5 overflow-hidden bg-primary-50">
      <div className="loader-bar h-full w-1/3 bg-primary-solid" />
    </div>
  );
}
