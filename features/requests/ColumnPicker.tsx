"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Columns3 } from "lucide-react";
import { saveListColumnsAction } from "@/app/users/list-actions";
import { inside } from "@/features/ui/inside";

// D-256: show or hide a request list's columns (kept on the account).
// v1.52.3: and their order (also by dragging a column title).
const moved = (list: string[], key: string, by: number) => {
  const at = list.indexOf(key);
  const next = [...list];
  next.splice(at, 1);
  next.splice(Math.max(0, Math.min(next.length, at + by)), 0, key);
  return next;
};
export function ColumnPicker({ list, available, shown }: { list: string; available: { key: string; label: string }[]; shown: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState(shown);
  const [pending, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => setChosen(shown), [shown]);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => box.current && !inside(event, box.current) && setOpen(false);
    const key = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  const save = (next: string[]) => {
    setChosen(next);
    start(async () => {
      await saveListColumnsAction(list, next);
      router.refresh();
    });
  };
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        className="btn-secondary btn-compact inline-flex items-center gap-1.5"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        data-testid="column-picker"
      >
        <Columns3 className="h-4 w-4" aria-hidden="true" /> Columns
      </button>
      {open && (
        <div className="absolute right-0 z-[var(--z-sticky)] mt-1 w-60 rounded-lg border border-line bg-raised p-3 shadow-overlay" role="group" aria-label="Columns">
          <p className="mb-2 text-caption text-ink-muted">The request is always shown. Drag a column title in the table, or use ↑ ↓, to change the order.</p>
          <ul className="space-y-1.5">
            {/* v1.52.3: shown columns in the person's order (move them up or down), then the hidden ones. */}
            {[...chosen.map((key) => available.find((item) => item.key === key)).filter((item): item is { key: string; label: string } => Boolean(item)), ...available.filter((item) => !chosen.includes(item.key))].map((column) => (
              <li key={column.key} className="flex items-center gap-1">
                <label className="flex flex-1 items-center gap-2 text-label">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={chosen.includes(column.key)}
                    disabled={pending}
                    onChange={(event) => save(event.target.checked ? [...chosen, column.key] : chosen.filter((key) => key !== column.key))}
                  />
                  {column.label}
                </label>
                {chosen.includes(column.key) && (
                  <>
                    <button type="button" disabled={pending || chosen.indexOf(column.key) === 0} onClick={() => save(moved(chosen, column.key, -1))} aria-label={`Move ${column.label} left`} className="rounded px-1 text-ink-muted hover:bg-surface-muted disabled:opacity-30">
                      ↑
                    </button>
                    <button type="button" disabled={pending || chosen.indexOf(column.key) === chosen.length - 1} onClick={() => save(moved(chosen, column.key, 1))} aria-label={`Move ${column.label} right`} className="rounded px-1 text-ink-muted hover:bg-surface-muted disabled:opacity-30">
                      ↓
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="link mt-3 text-label"
            disabled={pending}
            onClick={() => {
              save(available.map((item) => item.key));
              setOpen(false);
            }}
          >
            Reset to all columns
          </button>
        </div>
      )}
    </div>
  );
}
