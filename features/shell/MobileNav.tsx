"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SideNav, type NavItem } from "@/features/shell/SideNav";

// Below 768 px the sidebar is hidden; this button opens it as a drawer
// (S9-04). Closes on a page change, Escape or a tap outside.
export function MobileNav({ items, spaceLabel, collapsible = false }: { items: NavItem[]; spaceLabel: string; collapsible?: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} className="flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="flex w-72 max-w-[85vw] flex-col bg-surface shadow-xl">
            <div className="flex h-topbar items-center justify-between border-b border-line px-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- static SVG logo */}
              <img src="/brand/ars-green-steel.svg" alt="ARS Green Steel" className="h-8 w-auto" />
              <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-muted">
                ✕
              </button>
            </div>
            <p className="px-6 pt-3 text-caption font-semibold uppercase tracking-wider text-ink-faint">{spaceLabel}</p>
            <SideNav items={items} collapsible={collapsible} />
          </div>
          <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="flex-1 bg-black/30" />
        </div>
      )}
    </div>
  );
}
