"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// v1.12.1 (owner): the dashboard and "whose numbers" are dropdowns, not a
// scrolling row of tabs and chips. Choosing one opens it straight away.
export interface PickerOption {
  value: string;
  label: string;
  href: string;
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
          defaultValue={board}
          onChange={(event) => go(boards, event.target.value)}
          className="field-input h-9 w-64 max-w-full"
          data-testid="board-picker"
        >
          {boards.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
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
