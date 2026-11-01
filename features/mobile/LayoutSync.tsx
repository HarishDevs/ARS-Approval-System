"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LAYOUT_COOKIE, MOBILE_MAX_WIDTH, type LayoutMode } from "@/lib/ui/layout";

// v1.43.0: tells the server which layout this window needs (below 768 px:
// mobile). When the window crosses the line (resized, turned), the cookie
// changes and the page's data is asked for again in the right layout.
export function LayoutSync({ current }: { current: LayoutMode }) {
  const router = useRouter();
  useEffect(() => {
    let timer = 0;
    const check = () => {
      const wanted: LayoutMode = window.innerWidth <= MOBILE_MAX_WIDTH ? "mobile" : "desktop";
      const saved = document.cookie.match(new RegExp(`(?:^|; )${LAYOUT_COOKIE}=([^;]*)`))?.[1];
      if (saved !== wanted) document.cookie = `${LAYOUT_COOKIE}=${wanted}; path=/; max-age=31536000; samesite=lax`;
      if (wanted !== current) router.refresh();
    };
    check();
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(check, 250);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [current, router]);
  return null;
}
