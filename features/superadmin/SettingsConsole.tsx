"use client";

import { Search, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

// D-240 (Configuration Studio: the settings console): one way through every
// setting. Categories down the side (unsaved ones marked), a search across all
// of them, and each category with its own Save, which keeps the server's
// per-group transaction (saveSettingsGroup), history and audit. Searching only
// hides settings; what was typed stays until it is saved or the page is left.
interface Console {
  query: string;
  setDirty: (id: string, dirty: boolean) => void;
}
const ConsoleContext = createContext<Console | null>(null);
export const useSettingsConsole = () => useContext(ConsoleContext);

// Does a setting match the search? Its name, its explanation or its key.
export function settingMatches(query: string, ...texts: (string | null | undefined)[]): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = texts.filter(Boolean).join(" ").toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export function SettingsConsole({ sections, children }: { sections: { id: string; title: string; keywords: string }[]; children: React.ReactNode }) {
  const [query, setQuery] = useState("");
  const [dirty, setDirtyState] = useState<Set<string>>(new Set());
  const setDirty = useCallback(
    (id: string, on: boolean) =>
      setDirtyState((current) => {
        if (current.has(id) === on) return current;
        const next = new Set(current);
        if (on) next.add(id);
        else next.delete(id);
        return next;
      }),
    [],
  );
  const value = useMemo(() => ({ query, setDirty }), [query, setDirty]);
  const shown = sections.filter((section) => settingMatches(query, section.keywords));
  return (
    <ConsoleContext.Provider value={value}>
      <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]" data-testid="settings-console">
        <nav aria-label="Setting categories" className="lg:sticky lg:top-20 lg:self-start">
          <label htmlFor="settings-search" className="sr-only">
            Find a setting
          </label>
          <div className="relative mb-3">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input id="settings-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a setting" className="field-input pl-9" />
            {query && (
              <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-muted hover:bg-surface-muted">
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <ul className="flex gap-1 overflow-x-auto lg:flex-col">
            {sections.map((section) => {
              const hit = shown.includes(section);
              return (
                <li key={section.id}>
                  <a href={`#${section.id}`} className={`flex items-center justify-between gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-label hover:bg-surface-muted ${hit ? "text-ink" : "text-ink-faint"}`}>
                    {section.title}
                    {dirty.has(section.id) && (
                      <span className="rounded-full bg-warning-50 px-1.5 text-caption font-semibold text-warning-600" title="Changes not saved yet">
                        Unsaved
                      </span>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="min-w-0 space-y-6">
          {query && shown.length === 0 && (
            <p role="status" className="card px-5 py-4 text-label text-ink-muted">
              No setting matches “{query}”.{" "}
              <button type="button" className="link" onClick={() => setQuery("")}>
                Clear search
              </button>
            </p>
          )}
          {children}
        </div>
      </div>
    </ConsoleContext.Provider>
  );
}
