"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

// A dropdown menu (UI-03): a button with aria-haspopup, items reachable
// with the arrow keys, Escape closes and returns focus to the button.
export interface MenuItem {
  label: string;
  href?: string;
  onSelect?: () => void;
  icon?: React.ReactNode;
  tone?: "default" | "danger";
}

export function Menu({ label, trigger, items, align = "right" }: { label: string; trigger: React.ReactNode; items: MenuItem[]; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const first = box.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus();
    const onClick = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const entries = [...(box.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const index = entries.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      setOpen(false);
      button.current?.focus();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      entries[(index + 1) % entries.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      entries[(index - 1 + entries.length) % entries.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      entries[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      entries.at(-1)?.focus();
    }
  };

  const itemClass = (tone: MenuItem["tone"]) => `flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-label hover:bg-surface-muted focus:bg-surface-muted focus:outline-none ${tone === "danger" ? "text-danger-600" : "text-ink"}`;
  return (
    <div ref={box} className="relative" onKeyDown={onKeyDown}>
      <button ref={button} type="button" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} aria-label={label} onClick={() => setOpen((value) => !value)} className="btn-ghost btn-compact">
        {trigger}
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label={label} className={`absolute z-drawer mt-1 min-w-48 rounded-lg border border-line bg-raised p-1 shadow-overlay ${align === "right" ? "right-0" : "left-0"}`}>
          {items.map((item) =>
            item.href ? (
              <Link key={item.label} role="menuitem" tabIndex={-1} href={item.href} className={itemClass(item.tone)} onClick={() => setOpen(false)}>
                {item.icon}
                {item.label}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={itemClass(item.tone)}
                onClick={() => {
                  setOpen(false);
                  item.onSelect?.();
                }}
              >
                {item.icon}
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
