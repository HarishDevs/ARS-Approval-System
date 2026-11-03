"use client";

import { useId, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { Hint } from "@/features/ui/Hint";

// Pick several people (v1.6.1 collaborators). Type to search by name or
// user id, choose with the mouse or the arrow keys and Enter; each chosen
// person is a chip with a remove button. Sends one hidden input per person
// (when it has a name). v1.8.0: can also be controlled (value + onChange),
// e.g. the workflow step editor's "Specific people".
export interface PersonOption {
  id: number;
  label: string;
  detail?: string; // D-255: designation and department, shown and searched
}

// Initials for the round badge beside a name ("Asha Rao (asha)" -> "AR").
const initialsOf = (label: string) =>
  label
    .replace(/\(.*?\)/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

export function PeoplePicker({
  name,
  options,
  label,
  help,
  max = 20,
  initial = [],
  invalid,
  value,
  onChange,
}: {
  name?: string;
  options: PersonOption[];
  label: string;
  help?: string;
  max?: number;
  initial?: number[];
  invalid?: boolean;
  value?: number[];
  onChange?: (ids: number[]) => void;
}) {
  const id = useId();
  const [own, setOwn] = useState<number[]>(initial);
  const chosen = value ?? own;
  const setChosen = (update: (current: number[]) => number[]) => {
    const next = update(chosen);
    if (onChange) onChange(next);
    if (value === undefined) setOwn(next);
  };
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const byId = useMemo(() => new Map(options.map((option) => [option.id, option])), [options]);
  const matches = useMemo(() => {
    const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return options.filter((option) => !chosen.includes(option.id) && words.every((word) => `${option.label} ${option.detail ?? ""}`.toLowerCase().includes(word))).slice(0, 8);
  }, [options, chosen, query]);
  const full = chosen.length >= max;
  const add = (option: PersonOption) => {
    if (full) return;
    setChosen((current) => [...current, option.id]);
    setQuery("");
    setActive(0);
    input.current?.focus();
  };
  const remove = (personId: number) => {
    setChosen((current) => current.filter((value) => value !== personId));
    input.current?.focus();
  };
  const listId = `${id}-list`;
  const showList = open && query.trim().length > 0 && !full;

  return (
    <div>
      <label htmlFor={`${id}-input`} className="field-label">
        {label}
      </label>
      {chosen.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2" aria-label={`${label}: chosen`}>
          {chosen.map((personId) => (
            <li key={personId} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-muted py-0.5 pl-1 pr-1 text-label" title={byId.get(personId)?.detail}>
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary-solid text-[10px] font-semibold text-on-solid" aria-hidden="true">
                {initialsOf(byId.get(personId)?.label ?? "?")}
              </span>
              {byId.get(personId)?.label ?? `#${personId}`}
              <button type="button" onClick={() => remove(personId)} aria-label={`Remove ${byId.get(personId)?.label ?? personId}`} className="flex h-7 w-7 items-center justify-center rounded-full text-ink-muted hover:text-danger-600">
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
              {name && <input type="hidden" name={name} value={personId} />}
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <input
          ref={input}
          id={`${id}-input`}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && matches[active] ? `${id}-opt-${matches[active].id}` : undefined}
          aria-describedby={`${id}-help`}
          aria-invalid={invalid || undefined}
          value={query}
          disabled={full}
          placeholder={full ? `${max} people chosen (the most allowed)` : "Type a name or user id"}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((value) => Math.min(value + 1, Math.max(matches.length - 1, 0)));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((value) => Math.max(value - 1, 0));
            } else if (event.key === "Enter") {
              // Never submit the form from the search box.
              event.preventDefault();
              if (showList && matches[active]) add(matches[active]);
            } else if (event.key === "Escape") setOpen(false);
            else if (event.key === "Backspace" && !query && chosen.length) remove(chosen[chosen.length - 1]!);
          }}
          className="field-input"
        />
        {showList && (
          <ul id={listId} role="listbox" aria-label={`${label}: matches`} className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-line bg-raised py-1 shadow-card">
            {matches.length === 0 ? (
              <li className="px-3 py-2 text-label text-ink-muted">Nobody matches.</li>
            ) : (
              matches.map((option, index) => (
                <li
                  key={option.id}
                  id={`${id}-opt-${option.id}`}
                  role="option"
                  aria-selected={index === active}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    add(option);
                  }}
                  onMouseEnter={() => setActive(index)}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-label ${index === active ? "bg-primary-50 text-primary-700" : ""}`}
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary-50 text-[11px] font-semibold text-primary-700" aria-hidden="true">
                    {initialsOf(option.label)}
                  </span>
                  <span className="min-w-0">
                    <span className="block">{option.label}</span>
                    {option.detail && <span className="block truncate text-caption text-ink-muted">{option.detail}</span>}
                  </span>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
      {/* D-179: the caller's explanation is a hover hint; the limit and the count stay visible. */}
      <p className="mt-1 flex items-center gap-1.5 text-caption text-ink-muted">
        <span id={`${id}-help`}>
          Up to {max} {max === 1 ? "person" : "people"}.{chosen.length > 0 && ` ${chosen.length} chosen.`}
        </span>
        <Hint text={help} align="start" />
      </p>
    </div>
  );
}
