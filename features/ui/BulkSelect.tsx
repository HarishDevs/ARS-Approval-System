"use client";

import { useEffect, useState } from "react";

// v1.49.5/v1.49.6 (owner: "select and Delete", "multiselect and action"): tick
// boxes on a server-rendered list that join one bulk-action form by its id
// (the form attribute), so the rows stay server components. Used by Super
// Admin → Requests and Admin → Users & roles.
export const ticked = (formId: string) => [...document.querySelectorAll<HTMLInputElement>(`input[form="${formId}"][name="ids"]`)];

export function clearTicks(formId: string) {
  for (const box of ticked(formId)) box.checked = false;
  document.dispatchEvent(new Event("change"));
}

// How many boxes of the form are ticked, kept up to date.
export function useTickedCount(formId: string): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const sync = () => setCount(ticked(formId).filter((box) => box.checked).length);
    sync();
    document.addEventListener("change", sync);
    return () => document.removeEventListener("change", sync);
  }, [formId]);
  return count;
}

// "Select all on this page": ticked, unticked or partly (indeterminate).
export function SelectAllBox({ formId, label, testId }: { formId: string; label: string; testId?: string }) {
  const [state, setState] = useState<"none" | "some" | "all">("none");
  useEffect(() => {
    const sync = () => {
      const list = ticked(formId);
      const on = list.filter((box) => box.checked).length;
      setState(on === 0 ? "none" : on === list.length ? "all" : "some");
    };
    sync();
    document.addEventListener("change", sync);
    return () => document.removeEventListener("change", sync);
  }, [formId]);
  return (
    <input
      type="checkbox"
      aria-label={label}
      data-testid={testId}
      className="h-4 w-4 accent-[color:var(--color-primary-600)]"
      checked={state === "all"}
      ref={(element) => {
        if (element) element.indeterminate = state === "some";
      }}
      onChange={(event) => {
        for (const box of ticked(formId)) box.checked = event.target.checked;
        document.dispatchEvent(new Event("change"));
      }}
    />
  );
}

export function RowSelectBox({ formId, value, label, testId }: { formId: string; value: number; label: string; testId?: string }) {
  return <input type="checkbox" name="ids" value={value} form={formId} aria-label={label} className="h-4 w-4 accent-[color:var(--color-primary-600)]" data-testid={testId} />;
}
