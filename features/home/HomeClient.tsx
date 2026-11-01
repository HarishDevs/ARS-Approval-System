"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarDays, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/features/ui/Dialog";
import { discardDraftAction } from "@/app/users/draft-actions";

// D-265: Home's small client parts: the period picker, the workload chart's
// hover, and a quiet refresh while the page is open.

const OPTIONS: [string, string][] = [
  ["today", "Today"],
  ["week", "This week"],
  ["month", "This month"],
  ["30d", "Last 30 days"],
  ["custom", "Custom period"],
];

// The period travels in the address (?period=, ?from=, ?to=) with the rest kept.
export function PeriodPicker({
  value,
  from,
  to,
  base,
  options = OPTIONS,
  label = "Period",
}: {
  value: string;
  from: string;
  to: string;
  base: Record<string, string>;
  options?: [string, string][];
  label?: string;
}) {
  const router = useRouter();
  const [custom, setCustom] = useState(value === "custom");
  const go = (query: Record<string, string>) => router.push(`/users?${new URLSearchParams({ ...base, ...query })}`, { scroll: false });
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="period-picker">
      <label className="relative inline-flex items-center">
        <span className="sr-only">{label}</span>
        <CalendarDays aria-hidden="true" className="pointer-events-none absolute left-2.5 h-4 w-4 text-ink-muted" />
        <select
          value={custom ? "custom" : value}
          onChange={(event) => {
            const next = event.target.value;
            if (next === "custom") setCustom(true);
            else {
              setCustom(false);
              go({ period: next });
            }
          }}
          className="field-input h-9 w-auto py-0 pl-8 pr-8 text-label font-medium"
        >
          {options.map(([key, text]) => (
            <option key={key} value={key}>
              {text}
            </option>
          ))}
        </select>
      </label>
      {custom && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            go({ period: "custom", from: String(data.get("from") ?? ""), to: String(data.get("to") ?? "") });
          }}
        >
          <label className="text-caption text-ink-muted">
            From <input type="date" name="from" defaultValue={from} required className="field-input ml-1 h-9 w-auto text-label" />
          </label>
          <label className="text-caption text-ink-muted">
            To <input type="date" name="to" defaultValue={to} required className="field-input ml-1 h-9 w-auto text-label" />
          </label>
          <button type="submit" className="btn-secondary btn-compact">
            Show
          </button>
        </form>
      )}
    </div>
  );
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Two series per day (assigned, completed) on one axis; a tooltip on hover or
// tap; a table for screen readers.
export function WorkloadChart({ assigned, completed, caption }: { assigned: number[]; completed: number[]; caption: string }) {
  const [active, setActive] = useState<number | null>(null);
  const top = Math.max(1, ...assigned, ...completed);
  const step = top <= 4 ? 1 : top <= 10 ? 2 : Math.ceil(top / 5);
  const max = Math.ceil(top / step) * step;
  const ticks = Array.from({ length: max / step + 1 }, (_, index) => max - index * step);
  const empty = assigned.every((value) => value === 0) && completed.every((value) => value === 0);
  return (
    <figure data-testid="workload-chart">
      <div className="mb-2 flex flex-wrap justify-end gap-4 text-caption text-ink-muted" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--chart-assigned)]" /> Assigned
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--chart-completed)]" /> Completed
        </span>
      </div>
      <div className="relative flex h-48 gap-2" aria-hidden="true">
        <div className="flex flex-col justify-between pb-6 text-right text-caption tabular-nums text-ink-faint">
          {ticks.map((tick) => (
            <span key={tick} className="leading-none">
              {tick}
            </span>
          ))}
        </div>
        <div className="relative flex-1">
          <div className="absolute inset-x-0 bottom-6 top-0 flex flex-col justify-between">
            {ticks.map((tick) => (
              <span key={tick} className="block border-t border-line/70" />
            ))}
          </div>
          <div className="absolute inset-x-0 bottom-6 top-0 grid grid-cols-7 gap-1">
            {DAYS.map((day, index) => (
              <button
                key={day}
                type="button"
                tabIndex={-1}
                onMouseEnter={() => setActive(index)}
                onMouseLeave={() => setActive(null)}
                onClick={() => setActive(active === index ? null : index)}
                className={`relative flex items-end justify-center gap-[2px] rounded-t ${active === index ? "bg-surface-muted/70" : ""}`}
              >
                <span className="w-[38%] max-w-5 rounded-t bg-[color:var(--chart-assigned)]" style={{ height: `${(assigned[index]! / max) * 100}%`, minHeight: assigned[index] ? 2 : 0 }} />
                <span className="w-[38%] max-w-5 rounded-t bg-[color:var(--chart-completed)]" style={{ height: `${(completed[index]! / max) * 100}%`, minHeight: completed[index] ? 2 : 0 }} />
                {active === index && (
                  <span className="absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-raised px-2 py-1 text-left text-caption text-ink shadow-overlay">
                    <span className="block font-semibold">{day}</span>
                    Assigned {assigned[index]} · Completed {completed[index]}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="absolute inset-x-0 bottom-0 grid h-6 grid-cols-7 gap-1 text-center text-caption text-ink-muted">
            {DAYS.map((day) => (
              <span key={day} className="pt-1.5">
                {day}
              </span>
            ))}
          </div>
        </div>
      </div>
      {empty && <p className="mt-2 text-center text-caption text-ink-muted">Nothing assigned or completed in this period.</p>}
      {/* A table grows to its content, so it hides inside a div (no sideways scroll on phones). */}
      <div className="sr-only">
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Assigned</th>
              <th scope="col">Completed</th>
            </tr>
          </thead>
          <tbody>
            {DAYS.map((day, index) => (
              <tr key={day}>
                <th scope="row">{day}</th>
                <td>{assigned[index]}</td>
                <td>{completed[index]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
    </figure>
  );
}

// New assignments, decisions and completions show up without a reload: the
// page's data is asked for again every minute while it's visible (and when
// it comes back into view). Only the server data is refreshed, not the page.
export function QuietRefresh({ everyMs = 60_000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    let last = Date.now();
    const tick = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < everyMs - 1000) return;
      last = Date.now();
      router.refresh();
    };
    const timer = window.setInterval(tick, everyMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [everyMs, router]);
  return null;
}

// Your drafts: delete one from Home (asks first; the same action as Discard draft on its form).
export function DeleteDraftButton({ draftKey, title }: { draftKey: string; title: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAsking(true)}
        disabled={busy}
        aria-label={`Delete draft ${title}`}
        className="grid h-8 w-8 place-items-center rounded-md text-ink-muted hover:bg-danger-50 hover:text-danger-600"
      >
        <Trash2 aria-hidden="true" className="h-4 w-4" />
      </button>
      <ConfirmDialog
        open={asking}
        title="Delete this draft?"
        body={`"${title}" and everything typed in it is removed. This can't be undone.`}
        confirmLabel="Delete draft"
        tone="danger"
        onCancel={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false);
          setBusy(true);
          void discardDraftAction({ key: draftKey })
            .then(() => router.refresh())
            .finally(() => setBusy(false));
        }}
      />
    </>
  );
}
