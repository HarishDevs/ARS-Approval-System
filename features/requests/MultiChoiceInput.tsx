"use client";

import { useState } from "react";

// v1.9.0: a multi-select field. Tick boxes for the options; the ticked ones
// travel as one hidden JSON list, so the server reads one value per field
// like every other field (and checks each against the options again).
export function parseMulti(value: string): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return value.split(/,\s*/).filter(Boolean);
  }
}

export function MultiChoiceInput({ id, name, options, defaultValue, describedBy, invalid }: { id: string; name: string; options: readonly string[]; defaultValue: string; describedBy?: string; invalid?: boolean }) {
  const [picked, setPicked] = useState<string[]>(() => parseMulti(defaultValue).filter((option) => options.includes(option)));
  return (
    <div id={id} role="group" aria-labelledby={`${id}-label`} aria-describedby={describedBy} data-invalid={invalid || undefined} className="flex flex-wrap gap-x-5 gap-y-2">
      <input type="hidden" name={name} value={picked.length ? JSON.stringify(picked) : ""} />
      {options.map((option) => (
        <label key={option} className="flex items-center gap-2 text-label">
          <input
            type="checkbox"
            value={option}
            data-multi={name}
            checked={picked.includes(option)}
            onChange={(event) => {
              const next = event.target.checked ? [...picked, option] : picked.filter((item) => item !== option);
              setPicked(options.filter((item) => next.includes(item)));
            }}
          />
          {option}
        </label>
      ))}
    </div>
  );
}
