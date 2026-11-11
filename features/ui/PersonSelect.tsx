"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { useFitPanel } from "@/features/ui/fit";
import { inside } from "@/features/ui/inside";

// v1.52.1 (owner: "wherever we select a name the format is Name - Employee
// code with the department below; the dropdown opens where it is clearly
// visible, with a close option, and clicking outside closes it"): one person
// from a list, typed to search. Drop-in for a native <select> of people:
// with `name` it sends the chosen id (or "" for none) like a select would;
// `onChange` gets the id (or null).
export interface PersonChoice {
  id: number;
  label: string; // "Name - Code"
  detail?: string; // department
}

export function PersonSelect({
  name,
  options,
  value,
  defaultValue = null,
  onChange,
  placeholder = "Choose a person…",
  emptyLabel,
  ariaLabel,
  id,
  disabled = false,
  required = false,
  className = "",
  compact = false,
  testId,
  ariaInvalid,
  ariaDescribedBy,
  floating = false,
}: {
  name?: string;
  options: PersonChoice[];
  value?: number | null;
  defaultValue?: number | null;
  onChange?: (id: number | null) => void;
  placeholder?: string;
  emptyLabel?: string; // e.g. "Anyone": offered as the first choice, meaning none
  ariaLabel?: string;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  compact?: boolean;
  testId?: string;
  ariaInvalid?: boolean; // a form error: marked (data-invalid) and linked by ariaDescribedBy
  ariaDescribedBy?: string;
  floating?: boolean; // inside a scrolling table: the list floats over the page instead of being clipped
}) {
  const auto = useId();
  const buttonId = id ?? `${auto}-button`;
  const [own, setOwn] = useState<number | null>(defaultValue);
  const chosen = value === undefined ? own : value;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const fit = useFitPanel(open, box, panel);
  // Floating: placed on the screen beside the button, following it on scroll.
  const [spot, setSpot] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    if (!open || !floating) return;
    const measure = () => setSpot(box.current?.getBoundingClientRect() ?? null);
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, floating]);
  const place: CSSProperties =
    floating && spot
      ? {
          position: "fixed",
          width: Math.max(spot.width, 256),
          left: fit.right ? undefined : spot.left,
          right: fit.right ? window.innerWidth - spot.right : undefined,
          top: fit.up ? undefined : spot.bottom + 4,
          bottom: fit.up ? window.innerHeight - spot.top + 4 : undefined,
        }
      : {};
  const byId = useMemo(() => new Map(options.map((option) => [option.id, option])), [options]);
  const current = chosen === null ? null : (byId.get(chosen) ?? null);
  const matches = useMemo(() => {
    const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return options.filter((option) => words.every((word) => `${option.label} ${option.detail ?? ""}`.toLowerCase().includes(word))).slice(0, 50);
  }, [options, query]);
  const rows: (PersonChoice | null)[] = emptyLabel !== undefined && !query.trim() ? [null, ...matches] : matches;

  const choose = (option: PersonChoice | null) => {
    const next = option?.id ?? null;
    if (value === undefined) setOwn(next);
    onChange?.(next);
    setOpen(false);
    setQuery("");
  };

  // Like a native select, an uncontrolled choice goes back to its default
  // when its form is reset (e.g. after a successful submit).
  useEffect(() => {
    const form = box.current?.closest("form");
    if (!form || value !== undefined) return;
    const reset = () => setOwn(defaultValue);
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [value, defaultValue]);

  // Closes on a click outside and on Escape.
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (box.current && !inside(event, box.current)) setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);
  useEffect(() => {
    if (open) {
      setActive(0);
      window.setTimeout(() => search.current?.focus(), 0);
    }
  }, [open]);

  return (
    <div ref={box} className={`relative ${className}`} data-testid={testId}>
      {name !== undefined && <input type="hidden" name={name} value={chosen ?? ""} required={required} />}
      <button
        type="button"
        id={buttonId}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-invalid={ariaInvalid || undefined}
        aria-describedby={ariaDescribedBy}
        aria-label={ariaLabel ? `${ariaLabel}: ${current ? current.label : (emptyLabel ?? placeholder)}` : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={`field-input flex w-full items-center justify-between gap-2 text-left ${compact ? "h-9 py-1" : "h-auto min-h-[2.75rem] py-1.5"} ${ariaInvalid ? "border-danger-600" : ""} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <span className="min-w-0">
          <span className={`block truncate ${current ? "" : "text-ink-muted"}`}>{current ? current.label : (emptyLabel ?? placeholder)}</span>
          {current?.detail && !compact && <span className="block truncate text-caption text-ink-muted">{current.detail}</span>}
        </span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-muted" />
      </button>
      {open && (
        <div
          ref={panel}
          className={`z-[70] rounded-lg border border-line bg-raised shadow-overlay ${floating ? "" : `absolute w-full min-w-[16rem] ${fit.up ? "bottom-full mb-1" : "top-full mt-1"} ${fit.right ? "right-0" : "left-0"}`}`}
          style={{ maxHeight: fit.maxHeight, ...place }}
          data-testid={testId ? `${testId}-panel` : undefined}
        >
          <div className="flex items-center gap-2 border-b border-line px-2 py-1.5">
            <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-muted" />
            <input
              ref={search}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActive((index) => Math.min(index + 1, Math.max(rows.length - 1, 0)));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((index) => Math.max(index - 1, 0));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  if (rows[active] !== undefined) choose(rows[active] ?? null);
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  setOpen(false);
                }
              }}
              placeholder="Type a name, code or department"
              aria-label="Search people"
              role="combobox"
              aria-expanded="true"
              aria-controls={`${auto}-list`}
              className="min-w-0 flex-1 bg-transparent py-1 text-label outline-none"
            />
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded p-1 text-ink-muted hover:bg-surface-muted hover:text-ink">
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
          <ul id={`${auto}-list`} role="listbox" aria-label="People" className="overflow-y-auto py-1" style={{ maxHeight: Math.max(100, fit.maxHeight - 48) }}>
            {rows.length === 0 ? (
              <li className="px-3 py-2 text-label text-ink-muted">Nobody matches.</li>
            ) : (
              rows.map((option, index) => (
                <li
                  key={option ? option.id : "none"}
                  role="option"
                  aria-selected={option ? option.id === chosen : chosen === null}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(option);
                  }}
                  onMouseEnter={() => setActive(index)}
                  className={`cursor-pointer px-3 py-1.5 ${index === active ? "bg-primary-50 text-primary-700" : ""}`}
                >
                  {option ? (
                    <>
                      <span className="block text-label">{option.label}</span>
                      {option.detail && <span className="block text-caption text-ink-muted">{option.detail}</span>}
                    </>
                  ) : (
                    <span className="block text-label text-ink-muted">{emptyLabel}</span>
                  )}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
