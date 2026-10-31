"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// D-258 (owner: "every page should fit in one open window in analytics; if it
// exceeds the window then create pages"): the board's sections are measured
// in the browser and packed, in order, into pages that fit the window below
// this point. A page bar (named after the sections) moves between them. When
// everything fits, there is no page bar and nothing is hidden. Measured again
// when the window size changes.
const PAGER_HEIGHT = 64;
// "Show all on one page": the person's choice, kept on this device.
const ALL_KEY = "ars.fitPages.all";
const readAll = () => {
  try {
    return window.localStorage.getItem(ALL_KEY) === "1";
  } catch {
    return false;
  }
};

export function FitPages({ children, label = "Analytics" }: { children: React.ReactNode; label?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<number[][]>([]);
  const [page, setPage] = useState(0);
  const [titles, setTitles] = useState<string[]>([]);
  const [all, setAll] = useState(false);
  useEffect(() => setAll(readAll()), []);
  const choose = (value: boolean) => {
    setAll(value);
    try {
      window.localStorage.setItem(ALL_KEY, value ? "1" : "0");
    } catch {
      // private mode: for this page only
    }
  };

  const measure = useCallback(() => {
    const root = box.current;
    if (!root) return;
    const items = [...root.children] as HTMLElement[];
    items.forEach((item) => item.removeAttribute("hidden"));
    const top = root.getBoundingClientRect().top + window.scrollY;
    const room = Math.max(320, window.innerHeight - Math.min(top, 260) - PAGER_HEIGHT - 24);
    const heightOf = (item: HTMLElement) => {
      const style = window.getComputedStyle(item);
      return item.offsetHeight + parseFloat(style.marginTop || "0") + parseFloat(style.marginBottom || "0");
    };
    // A heading stays with what follows it (never the last thing on a page).
    const units: { indexes: number[]; height: number }[] = [];
    items.forEach((item, index) => {
      const previous = units[units.length - 1];
      const glued = previous && /^H[1-6]$/.test(items[previous.indexes[previous.indexes.length - 1]!]!.tagName);
      if (glued) {
        previous.indexes.push(index);
        previous.height += heightOf(item);
      } else units.push({ indexes: [index], height: heightOf(item) });
    });
    const packed: number[][] = [];
    let current: number[] = [];
    let used = 0;
    for (const unit of units) {
      if (current.length && used + unit.height > room) {
        packed.push(current);
        current = [];
        used = 0;
      }
      current.push(...unit.indexes);
      used += unit.height;
    }
    if (current.length) packed.push(current);
    setPages(packed);
    const nameOf = (item: HTMLElement | undefined) => item?.getAttribute("aria-label") || (item && /^H[1-6]$/.test(item.tagName) ? item.textContent?.trim() : "") || "";
    setTitles(packed.map((group) => group.map((index) => nameOf(items[index])).filter(Boolean).slice(0, 2).join(" · ") || "Page"));
    setPage((value) => Math.min(value, Math.max(0, packed.length - 1)));
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure, children]);

  useEffect(() => {
    let timer = 0;
    const again = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(measure, 150);
    };
    window.addEventListener("resize", again);
    window.addEventListener("orientationchange", again);
    // Charts may draw a moment later: measure once more when they have.
    const late = window.setTimeout(measure, 400);
    return () => {
      window.removeEventListener("resize", again);
      window.removeEventListener("orientationchange", again);
      window.clearTimeout(timer);
      window.clearTimeout(late);
    };
  }, [measure]);

  // Show only this page's sections (or everything, when chosen).
  useLayoutEffect(() => {
    const root = box.current;
    if (!root || pages.length <= 1) return;
    const shown = new Set(pages[page] ?? []);
    ([...root.children] as HTMLElement[]).forEach((item, index) => {
      if (all || shown.has(index)) item.removeAttribute("hidden");
      else item.setAttribute("hidden", "");
    });
  }, [pages, page, all]);

  const go = (next: number) => {
    setPage(next);
    box.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  return (
    <div className="fit-pages">
      {pages.length > 1 && all && (
        <p className="mb-4 flex justify-end">
          <button type="button" className="btn-ghost btn-compact" onClick={() => choose(false)}>
            Show in pages
          </button>
        </p>
      )}
      {pages.length > 1 && !all && (
        <nav aria-label={`${label}: pages`} className="sticky top-16 z-[var(--z-sticky)] mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-raised/95 px-3 py-2 shadow-card backdrop-blur" data-testid="fit-pages">
          <span className="text-caption text-ink-muted">
            Page {page + 1} of {pages.length}
          </span>
          <span className="scroll-hint flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {pages.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => go(index)}
                aria-current={index === page ? "page" : undefined}
                title={titles[index]}
                className={`max-w-[14rem] shrink-0 truncate rounded-md px-2.5 py-1 text-label ${index === page ? "bg-primary-solid font-semibold text-on-solid" : "hover:bg-surface-muted"}`}
              >
                {titles[index] && titles[index] !== "Page" ? titles[index] : `Page ${index + 1}`}
              </button>
            ))}
          </span>
          <span className="flex gap-1">
            <button type="button" className="btn-ghost btn-compact" disabled={page === 0} onClick={() => go(page - 1)} aria-label="Previous page">
              ←
            </button>
            <button type="button" className="btn-ghost btn-compact" disabled={page === pages.length - 1} onClick={() => go(page + 1)} aria-label="Next page">
              →
            </button>
            <button type="button" className="btn-ghost btn-compact" onClick={() => choose(true)}>
              Show all
            </button>
          </span>
        </nav>
      )}
      <div ref={box}>{children}</div>
    </div>
  );
}
