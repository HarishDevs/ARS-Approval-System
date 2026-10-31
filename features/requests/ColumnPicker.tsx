"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Columns3 } from "lucide-react";
import { saveListColumnsAction } from "@/app/users/list-actions";

// D-256: show or hide a request list's columns (kept on the account).
export function ColumnPicker({ list, available, shown }: { list: string; available: { key: string; label: string }[]; shown: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState(shown);
  const [pending, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => setChosen(shown), [shown]);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => box.current && !box.current.contains(event.target as Node) && setOpen(false);
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
          <p className="mb-2 text-caption text-ink-muted">The request is always shown.</p>
          <ul className="space-y-1.5">
            {available.map((column) => (
              <li key={column.key}>
                <label className="flex items-center gap-2 text-label">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={chosen.includes(column.key)}
                    disabled={pending}
                    onChange={(event) =>
                      save(event.target.checked ? available.map((item) => item.key).filter((key) => key === column.key || chosen.includes(key)) : chosen.filter((key) => key !== column.key))
                    }
                  />
                  {column.label}
                </label>
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
