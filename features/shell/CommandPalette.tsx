"use client";

import { ArrowRight, FileText, History, Keyboard, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { SHORTCUTS, isTyping } from "@/features/shell/shortcuts";
import { Hint } from "@/features/ui/Hint";

// WS-03 command palette (Ctrl+K / ⌘K): go to a page, or to a request by
// number or title. Requests come from the access-checked quick search; an
// empty box shows the recently viewed ones. A combobox with a listbox:
// arrows move, Enter opens, Escape closes. "?" shows the shortcut list.
export interface PaletteLink {
  href: string;
  label: string;
  group: string;
}
type Option = { key: string; href: string; label: string; detail?: string; group: string; kind: "page" | "request" };

export function CommandPalette({ pages }: { pages: PaletteLink[] }) {
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [requests, setRequests] = useState<{ kind: string; items: { id: number; requestNo: string; title: string; status: string }[] }>({ kind: "recent", items: [] });
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const dialog = useRef<HTMLDialogElement>(null);
  const helpDialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const listId = useId();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      } else if (event.key === "?" && !isTyping(event.target) && !document.querySelector("dialog[open]")) {
        event.preventDefault();
        setHelp(true);
      }
    };
    const onOpen = () => setOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("ars:open-palette", onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("ars:open-palette", onOpen);
    };
  }, []);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) {
      node.showModal();
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => input.current?.focus());
    } else if (!open && node.open) node.close();
  }, [open]);
  useEffect(() => {
    const node = helpDialog.current;
    if (!node) return;
    if (help && !node.open) node.showModal();
    else if (!help && node.open) node.close();
  }, [help]);

  // Requests: debounced, the latest answer wins.
  useEffect(() => {
    if (!open) return;
    // Results for the previous text must never be picked by Enter.
    setRequests({ kind: query.trim().length >= 2 ? "search" : "recent", items: [] });
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState("loading");
      try {
        const response = await fetch(`/api/me/quick?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        setRequests(await response.json());
        setState("idle");
      } catch (error) {
        if ((error as Error).name !== "AbortError") setState("error");
      }
    }, query.trim().length >= 2 ? 250 : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  const options: Option[] = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const pageOptions = pages
      .filter((page) => words.every((word) => `${page.label} ${page.group}`.toLowerCase().includes(word)))
      .slice(0, 8)
      .map((page) => ({ key: `p:${page.href}`, href: page.href, label: page.label, group: page.group, kind: "page" as const }));
    const requestOptions = requests.items.map((item) => ({
      key: `r:${item.id}`,
      href: `/users/requests/${item.id}`,
      label: `${item.requestNo}: ${item.title}`,
      detail: item.status,
      group: requests.kind === "search" ? "Requests" : "Recently viewed",
      kind: "request" as const,
    }));
    return [...requestOptions, ...pageOptions];
  }, [pages, query, requests]);

  useEffect(() => setActive(0), [query]);
  const go = useCallback(
    (option: Option | undefined) => {
      if (!option) return;
      setOpen(false);
      router.push(option.href);
    },
    [router],
  );
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(options.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(options[active]);
    }
  };

  let lastGroup = "";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-9 items-center gap-2 rounded-md border border-line bg-surface-muted px-3 text-label text-ink-muted hover:text-ink sm:inline-flex"
        aria-keyshortcuts="Control+K"
        data-tour="search"
      >
        <Search aria-hidden="true" className="h-4 w-4" />
        Go to…
        <kbd className="rounded border border-line bg-surface px-1.5 text-[11px]">Ctrl K</kbd>
      </button>
      <button type="button" onClick={() => setOpen(true)} aria-label="Go to a page or request" data-tour="search" className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface-muted hover:text-ink sm:hidden">
        <Search aria-hidden="true" className="h-5 w-5" />
      </button>
      <dialog
        ref={dialog}
        aria-label="Go to a page or request"
        onClose={() => setOpen(false)}
        onClick={(event) => event.target === dialog.current && setOpen(false)}
        className="z-palette mt-[10vh] w-[calc(100%-2rem)] max-w-xl rounded-xl border border-line bg-raised p-0 text-ink shadow-overlay backdrop:bg-overlay"
      >
        {open && (
          <div onKeyDown={onKeyDown}>
            <div className="flex items-center gap-2 border-b border-line px-4">
              <Search aria-hidden="true" className="h-4 w-4 text-ink-faint" />
              <input
                ref={input}
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={options[active] ? `${listId}-${active}` : undefined}
                aria-label="Type a page, a request number or a title"
                placeholder="Type a page, a request number or a title…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-12 w-full bg-transparent text-body focus:outline-none"
              />
              <kbd className="rounded border border-line px-1.5 text-[11px] text-ink-muted">Esc</kbd>
            </div>
            <ul id={listId} role="listbox" aria-label="Results" className="max-h-[50vh] overflow-y-auto p-2">
              {options.map((option, index) => {
                const heading = option.group !== lastGroup ? option.group : null;
                lastGroup = option.group;
                return (
                  <li key={option.key} role="presentation">
                    {heading && <p className="px-2 pb-1 pt-2 text-caption font-semibold uppercase tracking-wider text-ink-faint">{heading}</p>}
                    <div
                      id={`${listId}-${index}`}
                      role="option"
                      aria-selected={index === active}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => go(option)}
                      className={`flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-label ${index === active ? "bg-primary-50 text-primary-700" : "text-ink"}`}
                    >
                      {option.kind === "request" ? (
                        option.group === "Recently viewed" ? <History aria-hidden="true" className="h-4 w-4 shrink-0" /> : <FileText aria-hidden="true" className="h-4 w-4 shrink-0" />
                      ) : (
                        <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      {option.detail && <span className="shrink-0 text-caption text-ink-muted">{option.detail}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
            <p role="status" className="border-t border-line px-4 py-2 text-caption text-ink-muted">
              {state === "loading"
                ? "Searching…"
                : state === "error"
                  ? "Couldn't search right now; pages still work."
                  : options.length === 0
                    ? "Nothing matches. Try a request number like PUR-2026-000123."
                    : `${options.length} result${options.length === 1 ? "" : "s"}. Arrows to move, Enter to open.`}
              <button type="button" className="link float-right inline-flex items-center gap-1" onClick={() => setHelp(true)}>
                <Keyboard aria-hidden="true" className="h-3.5 w-3.5" />
                Shortcuts
              </button>
            </p>
          </div>
        )}
      </dialog>
      <dialog ref={helpDialog} aria-labelledby={`${listId}-help`} onClose={() => setHelp(false)} onClick={(event) => event.target === helpDialog.current && setHelp(false)} className="z-palette w-[calc(100%-2rem)] max-w-md rounded-xl border border-line bg-raised p-0 text-ink shadow-overlay backdrop:bg-overlay">
        {help && (
          <div className="p-5">
            <h2 id={`${listId}-help`} className="flex items-center gap-1.5 font-semibold">
              Keyboard shortcuts
              <Hint text="They never fire while you type in a field." align="start" />
            </h2>
            <dl className="mt-3 divide-y divide-line text-label">
              {SHORTCUTS.map((item) => (
                <div key={item.keys} className="flex items-center justify-between gap-4 py-2">
                  <dt>
                    <kbd className="rounded border border-line bg-surface-muted px-1.5 py-0.5 text-caption">{item.keys}</kbd>
                  </dt>
                  <dd className="text-right text-ink-muted">{item.what}</dd>
                </div>
              ))}
            </dl>
            <button type="button" className="btn-secondary btn-compact mt-4" onClick={() => setHelp(false)}>
              Close
            </button>
          </div>
        )}
      </dialog>
    </>
  );
}
