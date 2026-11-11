"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// v1.12.1 (owner): the dashboard and "whose numbers" are dropdowns, not a
// scrolling row of tabs and chips. Choosing one opens it straight away.
export interface PickerOption {
  value: string;
  label: string;
  href: string;
  // D-307: a dashboard of a module not given yet: listed, not openable.
  disabled?: boolean;
}

export function AnalyticsPicker({
  boards,
  board,
  scopes,
  scope,
}: {
  boards: PickerOption[];
  board: string;
  scopes: PickerOption[];
  scope: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  // D-206: this picker stays mounted while the page changes, so "Opening…"
  // ends when the chosen dashboard or scope has arrived.
  useEffect(() => setPending(false), [board, scope]);
  const go = (options: PickerOption[], value: string) => {
    const target = options.find((option) => option.value === value);
    if (!target) return;
    setPending(true);
    router.push(target.href);
  };
  return (
    <div
      className="card mb-4 flex flex-wrap items-end gap-3 px-4 py-3"
      aria-busy={pending || undefined}
    >
      <div className="min-w-0">
        <label htmlFor="analytics-board" className="field-label">
          Dashboard
        </label>
        <select
          id="analytics-board"
          key={board}
          defaultValue={board}
          onChange={(event) => go(boards, event.target.value)}
          className="field-input h-9 w-64 max-w-full"
          data-testid="board-picker"
        >
          {boards.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.disabled ? `${option.label} (coming soon)` : option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-0">
        <label htmlFor="analytics-scope" className="field-label">
          Whose numbers
        </label>
        <select
          id="analytics-scope"
          key={scope}
          defaultValue={scope}
          onChange={(event) => go(scopes, event.target.value)}
          className="field-input h-9 w-56 max-w-full"
          data-testid="scope-picker"
        >
          {scopes.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {pending && (
        <span className="pb-2 text-caption text-ink-muted">Opening…</span>
      )}
    </div>
  );
}
