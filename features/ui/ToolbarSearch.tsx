"use client";

import { Search } from "lucide-react";
import { useState } from "react";

// D-228 (Asana's toolbar): Search is an icon until it is used; a search in
// use stays open. Inside the list's GET form, so Enter applies it with the
// other choices.
export function ToolbarSearch({ id, name, defaultValue, placeholder }: { id: string; name: string; defaultValue: string; placeholder: string }) {
  const [open, setOpen] = useState(Boolean(defaultValue));
  const [focus, setFocus] = useState(false);
  if (!open)
    return (
      <button
        type="button"
        aria-label="Search"
        className="tb-btn"
        onClick={() => {
          setFocus(true);
          setOpen(true);
        }}
      >
        <Search aria-hidden="true" className="h-4 w-4" />
      </button>
    );
  return (
    <span className="relative">
      <Search aria-hidden="true" className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
      <input
        id={id}
        type="search"
        name={name}
        aria-label="Search"
        autoFocus={focus}
        defaultValue={defaultValue}
        placeholder={placeholder}
        onBlur={(event) => !event.currentTarget.value && !defaultValue && setOpen(false)}
        className="field-input h-7 w-48 pl-8 text-label sm:w-64"
      />
    </span>
  );
}
