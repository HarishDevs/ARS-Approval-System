"use client";

import { useEffect, useRef } from "react";

// A toolbar dropdown: a button and a panel that closes on outside clicks.
export function Drop({ label, icon, buttonClass, panelClass = "left-0 w-56", testId, children }: { label: string; icon: React.ReactNode; buttonClass: string; panelClass?: string; testId?: string; children: React.ReactNode }) {
  const box = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (box.current?.open && !box.current.contains(event.target as Node)) box.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && box.current?.open) box.current.open = false;
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return (
    <details ref={box} className="relative" data-testid={testId}>
      <summary aria-label={label} className={`cursor-pointer list-none ${buttonClass}`}>
        {icon}
      </summary>
      <div className={`absolute z-30 mt-1 rounded-lg border border-line bg-raised p-3 text-ink shadow-overlay ${panelClass}`}>{children}</div>
    </details>
  );
}
