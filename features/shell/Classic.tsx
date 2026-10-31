"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BrandLoader } from "@/features/ui/BrandLoader";
import { navigationHeld } from "@/features/ui/UnsavedGuard";
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

// D-214: the Classic loader. Anything that starts a page change in Classic
// (a click, a letter, Enter, Esc) says what is opening; ClassicBar shows the
// Tally-style box until the new page has arrived.
export const CLASSIC_LOADING_EVENT = "ars:classic-loading";
export function announceLoading(label: string) {
  window.dispatchEvent(new CustomEvent(CLASSIC_LOADING_EVENT, { detail: label }));
}

export interface MenuEntry {
  href: string;
  label: string;
  hotkey: string;
  note?: string;
  action?: "signout"; // D-214: Tally's Quit
}

async function signOut(router: ReturnType<typeof useRouter>) {
  announceLoading("Signing out…");
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
  router.replace("/login");
  router.refresh();
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
        const chosen = entries[match]!;
        if (chosen.action === "signout") return void signOut(router);
        announceLoading(`Opening ${chosen.label}…`);
        router.push(chosen.href);
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
                onClick={
                  entry.action === "signout"
                    ? (event) => {
                        event.preventDefault();
                        void signOut(router);
                      }
                    : undefined
                }
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
  const search = useSearchParams();
  const router = useRouter();
  // D-214: the Overview dashboard (/users?view=overview) is a page of its own, with a way back.
  const overview = pathname === GATEWAY && search.get("view") === "overview";
  const atGateway = pathname === GATEWAY && !overview;
  const located = locate(modules, pathname);
  const entry = overview ? (modules.find((item) => item.key === "overview") ?? null) : located.entry;
  const page = overview ? null : located.page;
  const up = !entry ? null : page && entry.pages.length > 1 ? entry.href : GATEWAY;
  // Pages outside the modules (Profile, Notifications, Help…) name themselves from their title.
  const [title, setTitle] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setTitle(document.title.replace(/\s*·\s*ARS-CMS$/, "").trim()), 50);
    return () => window.clearTimeout(timer);
  }, [pathname, search]);
  // D-214: the loader, shown after a short moment (fast pages don't flash) until the page changes.
  const [loading, setLoading] = useState<string | null>(null);
  const [showLoader, setShowLoader] = useState(false);
  const routeKey = `${pathname}?${search.toString()}`;
  useEffect(() => {
    setLoading(null);
    setShowLoader(false);
  }, [routeKey]);
  useEffect(() => {
    if (!loading) return;
    const show = window.setTimeout(() => setShowLoader(true), 150);
    // A click that turned out not to change the page doesn't leave the box up.
    const giveUp = window.setTimeout(() => setLoading(null), 12_000);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(giveUp);
    };
  }, [loading]);
  useEffect(() => {
    const onAnnounce = (event: Event) => setLoading(String((event as CustomEvent).detail || "Opening…"));
    // Seen on the way down (capture), before Next's Link takes the click over
    // (it cancels the browser's own navigation to do its own).
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.hasAttribute("download") || link.getAttribute("role") === "button" || link.getAttribute("href")?.startsWith("#")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      const label = (link.getAttribute("aria-label") || link.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60);
      // D-233: a click the page took over ("Leave without saving?") doesn't count.
      window.setTimeout(() => !navigationHeld(event) && setLoading(label ? `Opening ${label}…` : "Opening…"), 0);
    };
    window.addEventListener(CLASSIC_LOADING_EVENT, onAnnounce);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener(CLASSIC_LOADING_EVENT, onAnnounce);
      document.removeEventListener("click", onClick, true);
    };
  }, []);
  // Letters only on the module page: other pages keep their own shortcuts.
  const onModulePage = pathname.startsWith(`${MENU_BASE}/`);
  const keys = useMemo(() => (entry && onModulePage ? pageHotkeys(entry.pages) : []), [entry, onModulePage]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Esc in a text box first leaves the box (a second Esc goes back), so
      // a page that starts in a search box still has a way out.
      if (event.key === "Escape" && !event.defaultPrevented && typing(event.target) && !dialogOpen()) {
        (event.target as HTMLElement).blur();
        return;
      }
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || typing(event.target) || dialogOpen() || atGateway) return;
      if (event.key === "Escape") {
        event.preventDefault();
        const target = up ?? GATEWAY;
        announceLoading(target === GATEWAY ? "Opening Central Management System…" : `Opening ${entry?.label ?? ""}…`);
        router.push(target);
        return;
      }
      const match = keys.findIndex((key) => key && key === event.key.toLowerCase());
      if (match !== -1 && entry) {
        event.preventDefault();
        announceLoading(`Opening ${entry.pages[match]!.label}…`);
        router.push(entry.pages[match]!.href);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [atGateway, router, up, keys, entry]);
  const loader = loading && showLoader ? <BrandLoader variant="classic" title={loading} /> : null;
  if (atGateway) return loader;
  return (
    <div className="border-b border-line bg-surface" data-testid="classic-bar">
      {loader}
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
        {!entry && title && (
          <>
            <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
            <span className="text-ink" data-testid="classic-page-title">
              {title}
            </span>
          </>
        )}
        <span className="ml-auto hidden text-caption text-ink-faint sm:inline" data-testid="classic-keys">
          Enter: next field · Ctrl+A: accept · Esc: back
        </span>
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

// D-227 (owner: "in Classic mode make everything Classic, including all the
// forms and entry screens… like Tally"): Tally's entry keys on every form of
// two or more fields. Enter accepts a field and moves to the next one (the
// last moves to the form's button; Enter there submits); Ctrl+A accepts the
// whole form. Text areas keep Enter for new lines, an open suggestion list
// keeps it for picking, and search boxes and one-field forms still submit.
const FIELD = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="submit"]):not([type="button"]), select, textarea';
function fieldsOf(form: HTMLFormElement): HTMLElement[] {
  return [...form.querySelectorAll<HTMLElement>(`${FIELD}, button[type="submit"], button:not([type])`)].filter(
    (element) => !(element as HTMLInputElement).disabled && !(element as HTMLInputElement).readOnly && element.getClientRects().length > 0 && !element.closest("details:not([open])"),
  );
}
function entryForm(target: EventTarget | null): HTMLFormElement | null {
  const element = target as HTMLElement | null;
  const form = element?.closest?.("form");
  if (!form || form.getAttribute("role") === "search" || form.getAttribute("method")?.toLowerCase() === "get") return null;
  return fieldsOf(form).filter((item) => item.matches(FIELD)).length >= 2 ? form : null;
}

export function ClassicForms() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.metaKey) return;
      const target = event.target as HTMLElement;
      const form = entryForm(target);
      if (!form) return;
      if (event.ctrlKey && (event.key === "a" || event.key === "A") && !event.shiftKey) {
        event.preventDefault();
        const button = fieldsOf(form).find((item) => item.tagName === "BUTTON" && (item as HTMLButtonElement).type === "submit");
        form.requestSubmit(button as HTMLButtonElement | undefined);
        return;
      }
      if (event.key !== "Enter" || event.ctrlKey || event.shiftKey || !target.matches(FIELD) || target.tagName === "TEXTAREA" || target.getAttribute("aria-expanded") === "true") return;
      const list = fieldsOf(form);
      const next = list[list.indexOf(target) + 1];
      if (!next) return;
      event.preventDefault();
      next.focus();
      if (next instanceof HTMLInputElement && ["text", "search", "email", "tel", "url", "number"].includes(next.type)) next.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
