"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { GATEWAY, locate, MENU_BASE, pageHotkeys, type ClassicModule } from "@/features/shell/classic-modules";

// D-210 (owner): the Classic (Tally-style) view.
const typing = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  return !!element && (element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName));
};
// Only a dialog that is really open counts: a closed <dialog> (confirmations
// wait on the page closed, some with role="alertdialog") must not switch the
// keyboard off (owner: "keyboard controls not working in the Classic view").
const dialogOpen = () =>
  [...document.querySelectorAll('dialog, [role="dialog"], [role="alertdialog"]')].some((element) =>
    element instanceof HTMLDialogElement ? element.open : !(element as HTMLElement).hidden && !element.closest("dialog:not([open])") && element.getClientRects().length > 0,
  );

export interface MenuEntry {
  href: string;
  label: string;
  hotkey: string;
  note?: string;
}

// A keyboard menu: arrows move, Enter opens, the highlighted letter opens
// its entry. The first entry is selected on arrival.
export function ClassicMenu({ title, entries, testId }: { title: string; entries: MenuEntry[]; testId?: string }) {
  const router = useRouter();
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  useEffect(() => {
    refs.current[0]?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || typing(event.target) || dialogOpen()) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setActive((current) => {
          const next = (current + (event.key === "ArrowDown" ? 1 : entries.length - 1)) % entries.length;
          refs.current[next]?.focus();
          return next;
        });
        return;
      }
      const match = entries.findIndex((entry) => entry.hotkey && entry.hotkey === event.key.toLowerCase());
      if (match !== -1) {
        event.preventDefault();
        router.push(entries[match]!.href);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entries, router]);

  return (
    <nav aria-label={title} className="overflow-hidden rounded-md border-2 border-primary-600 bg-surface shadow-sm" data-testid={testId}>
      <h2 className="bg-primary-solid px-4 py-2 text-center text-label font-bold uppercase tracking-[0.12em] text-white">{title}</h2>
      <ul className="py-2">
        {entries.map((entry, index) => {
          const at = entry.hotkey ? entry.label.toLowerCase().indexOf(entry.hotkey) : -1;
          return (
            <li key={entry.href}>
              <Link
                ref={(element) => {
                  refs.current[index] = element;
                }}
                href={entry.href}
                onFocus={() => setActive(index)}
                aria-keyshortcuts={entry.hotkey ? entry.hotkey.toUpperCase() : undefined}
                className={`flex items-center justify-between gap-3 px-6 py-1.5 text-body outline-none ${active === index ? "bg-warning-50 font-semibold text-ink" : "text-ink hover:bg-surface-muted"}`}
              >
                <span>
                  {at === -1 ? (
                    entry.label
                  ) : (
                    <>
                      {entry.label.slice(0, at)}
                      <span className="font-bold text-danger-600 underline underline-offset-2">{entry.label[at]}</span>
                      {entry.label.slice(at + 1)}
                    </>
                  )}
                </span>
                {entry.note && <span className="text-label text-ink-muted">{entry.note}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// Under the top bar: where you are (Central Management System › module ›
// page) and the module's pages as tabs. On the module page (page 3 of the
// sketch) each tab has a highlighted letter that opens it. Esc goes one
// level up, as in Tally.
export function ClassicBar({ modules }: { modules: ClassicModule[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const { entry, page } = locate(modules, pathname);
  const up = !entry ? null : page && entry.pages.length > 1 ? entry.href : GATEWAY;
  // Letters only on the module page: other pages keep their own shortcuts.
  const onModulePage = pathname.startsWith(`${MENU_BASE}/`);
  const keys = useMemo(() => (entry && onModulePage ? pageHotkeys(entry.pages) : []), [entry, onModulePage]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || typing(event.target) || dialogOpen() || pathname === GATEWAY) return;
      if (event.key === "Escape") {
        event.preventDefault();
        router.push(up ?? GATEWAY);
        return;
      }
      const match = keys.findIndex((key) => key && key === event.key.toLowerCase());
      if (match !== -1 && entry) {
        event.preventDefault();
        router.push(entry.pages[match]!.href);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pathname, router, up, keys, entry]);
  if (pathname === GATEWAY) return null;
  return (
    <div className="border-b border-line bg-surface" data-testid="classic-bar">
      <nav aria-label="You are here" className="flex flex-wrap items-center gap-1 px-4 pt-2 text-label text-ink-muted sm:px-8">
        <Link href={GATEWAY} className="link font-semibold">
          Central Management System
        </Link>
        {entry && (
          <>
            <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
            {page && entry.pages.length > 1 ? (
              <Link href={entry.href} className="link">
                {entry.label}
              </Link>
            ) : (
              <span className="text-ink">{entry.label}</span>
            )}
          </>
        )}
        {page && entry && entry.pages.length > 1 && (
          <>
            <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
            <span className="text-ink">{page.label}</span>
          </>
        )}
        <span className="ml-auto hidden text-caption text-ink-faint sm:inline">Esc: back</span>
      </nav>
      {entry && entry.pages.length > 1 && (
        <nav aria-label={`${entry.label} pages`} className="flex gap-1 overflow-x-auto px-4 pt-2 sm:px-8" data-testid="classic-tabs">
          {entry.pages.map((item, index) => {
            const current = item.href === page?.href;
            const at = keys[index] ? item.label.toLowerCase().indexOf(keys[index]!) : -1;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={current ? "page" : undefined}
                aria-keyshortcuts={at !== -1 ? keys[index]!.toUpperCase() : undefined}
                className={`shrink-0 rounded-t-md border border-b-0 px-3 py-1.5 text-label ${current ? "border-primary-600 bg-primary-solid font-semibold text-white" : "border-line bg-surface-muted text-ink hover:bg-primary-50"}`}
              >
                {at === -1 ? (
                  item.label
                ) : (
                  <>
                    {item.label.slice(0, at)}
                    <span className="font-bold text-danger-600 underline underline-offset-2">{item.label[at]}</span>
                    {item.label.slice(at + 1)}
                  </>
                )}
                {item.count ? <span className="ml-1.5 rounded-full bg-danger-solid px-1.5 text-[length:calc(11px*var(--text-scale,1))] font-semibold text-on-solid">{item.count}</span> : null}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
