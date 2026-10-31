"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// D-258: a table's box now scrolls by itself (globals.css). A scrolling box
// must be reachable by keyboard (WCAG 2.1.1; axe "scrollable-region-focusable"),
// so each one that scrolls and has nothing focusable inside becomes a named,
// focusable region. Re-checked when the page or the window changes.
const SELECTOR = ":is(.overflow-x-auto, .overflow-auto):has(> table)";
const FOCUSABLE = "a[href], button, input, select, textarea, [tabindex]";

function mark() {
  document.querySelectorAll<HTMLElement>(SELECTOR).forEach((box) => {
    const scrolls = box.scrollHeight > box.clientHeight + 1 || box.scrollWidth > box.clientWidth + 1;
    if (!scrolls || box.hasAttribute("tabindex") || box.querySelector(FOCUSABLE)) return;
    box.tabIndex = 0;
    if (!box.getAttribute("role")) box.setAttribute("role", "region");
    if (!box.getAttribute("aria-label")) box.setAttribute("aria-label", "Scrollable table");
  });
}

export function ScrollRegions() {
  const pathname = usePathname();
  useEffect(() => {
    mark();
    const late = window.setTimeout(mark, 500);
    let timer = 0;
    const again = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(mark, 200);
    };
    window.addEventListener("resize", again);
    return () => {
      window.clearTimeout(late);
      window.clearTimeout(timer);
      window.removeEventListener("resize", again);
    };
  }, [pathname]);
  return null;
}
