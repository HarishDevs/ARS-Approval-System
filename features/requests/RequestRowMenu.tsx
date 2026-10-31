"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MoreVertical } from "lucide-react";

// D-256: a row's actions on the request lists. Only actions that exist for
// this request and this person are offered; anything that changes it (withdraw,
// resubmit) opens the request page, where it is checked and confirmed as before.
export interface RowAction {
  label: string;
  href: string;
  tone?: "danger";
  download?: boolean;
}

export function RequestRowMenu({ title, actions }: { title: string; actions: RowAction[] }) {
  const [open, setOpen] = useState(false);
  // Rows sit in a scrolling table box, which would clip the menu: it is
  // placed on the page (fixed), under the button or above it near the bottom.
  const [spot, setSpot] = useState<{ top: number; right: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const toggle = () => {
    if (!open && box.current) {
      const rect = box.current.getBoundingClientRect();
      const height = 44 * actions.length + 12;
      setSpot({ top: rect.bottom + height > window.innerHeight ? Math.max(8, rect.top - height - 4) : rect.bottom + 4, right: Math.max(8, window.innerWidth - rect.right) });
    }
    setOpen((value) => !value);
  };
  useEffect(() => {
    if (!open) return;
    box.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    const close = (event: MouseEvent) => box.current && !box.current.contains(event.target as Node) && setOpen(false);
    const key = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    const away = () => setOpen(false); // the fixed menu would drift from its row
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", away, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", away, true);
    };
  }, [open]);
  return (
    <div ref={box} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${title}`}
        onClick={toggle}
        className="grid h-9 w-9 place-items-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink"
        data-testid="row-menu"
      >
        <MoreVertical className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className="fixed z-[var(--z-drawer)] w-56 rounded-lg border border-line bg-raised p-1 shadow-overlay" style={spot ? { top: spot.top, right: spot.right } : undefined}>
          {actions.map((action) =>
            action.download ? (
              <a key={action.label} role="menuitem" href={action.href} download className="block rounded-md px-3 py-2 text-label hover:bg-surface-muted focus:bg-surface-muted focus:outline-none" onClick={() => setOpen(false)}>
                {action.label}
              </a>
            ) : (
              <Link
                key={action.label}
                role="menuitem"
                href={action.href}
                className={`block rounded-md px-3 py-2 text-label hover:bg-surface-muted focus:bg-surface-muted focus:outline-none ${action.tone === "danger" ? "text-danger-600" : ""}`}
                onClick={() => setOpen(false)}
              >
                {action.label}
              </Link>
            ),
          )}
        </div>
      )}
    </div>
  );
}
