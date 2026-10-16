"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SideNav, type NavItem } from "@/features/shell/SideNav";

// Below 768 px the sidebar is hidden; this button opens it as a drawer
// (S9-04). Closes on a page change, Escape or a tap outside.
// WEB-03 (v1.10.0): focus moves into the drawer when it opens, Tab stays
// inside it, and focus returns to the menu button when it closes. The logo
// links to the space's first page (WEB-17); the list scrolls on short screens.
export function MobileNav({ items, spaceLabel, home, collapsible = false }: { items: NavItem[]; spaceLabel: string; home: string; collapsible?: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const opener = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      closeButton.current?.focus();
    } else if (wasOpen.current) {
      wasOpen.current = false;
      opener.current?.focus();
    }
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key !== "Tab" || !panel.current) return;
      const focusable = Array.from(panel.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")).filter((element) => element.offsetParent !== null);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button ref={opener} type="button" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} className="flex h-11 w-11 items-center justify-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Menu">
          <div ref={panel} className="flex h-dvh w-72 max-w-[85vw] flex-col bg-surface shadow-xl">
            <div className="flex h-topbar shrink-0 items-center justify-between border-b border-line px-4">
              <Link href={home} aria-label={`ARS Green Steel: ${spaceLabel} home`} className="rounded-md">
                {/* eslint-disable-next-line @next/next/no-img-element -- static SVG logo */}
                <img src="/brand/ars-green-steel.svg" alt="" width={68} height={32} className="h-8 w-auto" />
              </Link>
              <button ref={closeButton} type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="flex h-11 w-11 items-center justify-center rounded-md text-ink-muted hover:bg-surface-muted">
                ✕
              </button>
            </div>
            <p className="shrink-0 px-6 pt-3 text-caption font-semibold uppercase tracking-wider text-ink-faint">{spaceLabel}</p>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <SideNav items={items} collapsible={collapsible} />
            </div>
          </div>
          {/* The dimmed area: a tap closes the menu (the ✕ button is the keyboard way). */}
          <button type="button" aria-hidden="true" tabIndex={-1} onClick={() => setOpen(false)} className="flex-1 bg-black/30" />
        </div>
      )}
    </div>
  );
}
