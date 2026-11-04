"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Search } from "lucide-react";

// v1.50.0 (owner: "link request should be searchable based on the access"):
// type a number or words of the title; the list shows only requests the
// person can see (the same rule as search and the request page, through
// /api/me/quick), and picking one fills the number the link action checks again.
type Found = { id: number; requestNo: string; title: string; status: string };

export function RequestLinkPicker({ name, excludeId }: { name: string; excludeId: number }) {
  const [text, setText] = useState("");
  const [chosen, setChosen] = useState<Found | null>(null);
  const [items, setItems] = useState<Found[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chosen || text.trim().length < 2) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/me/quick?q=${encodeURIComponent(text.trim())}`, { signal: controller.signal, cache: "no-store" });
        const data = response.ok ? ((await response.json()) as { items?: Found[] }) : { items: [] };
        setItems((data.items ?? []).filter((item) => item.id !== excludeId));
        setActive(0);
        setOpen(true);
      } catch {
        /* aborted or offline: keep the list as it was */
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [text, chosen, excludeId]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pick = (item: Found) => {
    setChosen(item);
    setText(`${item.requestNo} · ${item.title}`);
    setOpen(false);
  };

  return (
    <div ref={box} className="relative">
      <input type="hidden" name={name} value={chosen?.requestNo ?? text.trim()} />
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        <input
          id="link-no"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          value={text}
          onChange={(event) => {
            setChosen(null);
            setText(event.target.value);
          }}
          onFocus={() => items.length > 0 && !chosen && setOpen(true)}
          onKeyDown={(event) => {
            if (!open || items.length === 0) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setActive((current) => (current + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length);
            } else if (event.key === "Enter") {
              event.preventDefault();
              pick(items[active]!);
            } else if (event.key === "Escape") setOpen(false);
          }}
          placeholder="Number or title"
          className="field-input w-full pl-9"
          data-testid="link-search"
        />
      </div>
      {open && (
        <ul id={listId} role="listbox" aria-label="Requests you can link" className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-line bg-raised py-1 shadow-card">
          {loading && items.length === 0 ? (
            <li className="px-3 py-2 text-label text-ink-muted">Searching…</li>
          ) : items.length === 0 ? (
            <li className="px-3 py-2 text-label text-ink-muted">No request you can see matches.</li>
          ) : (
            items.map((item, index) => (
              <li
                key={item.id}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(item);
                }}
                onMouseEnter={() => setActive(index)}
                className={`cursor-pointer px-3 py-2 text-label ${index === active ? "bg-primary-50" : ""}`}
              >
                <span className="font-mono text-caption text-ink-muted">{item.requestNo}</span> <span className="font-medium text-ink">{item.title}</span> <span className="text-caption text-ink-muted">· {item.status}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
