"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useFitPanel } from "@/features/ui/fit";
import { inside } from "@/features/ui/inside";

// A toolbar dropdown: a button and a panel that closes on outside clicks.
// v1.52.1 (owner): the panel opens where it is fully visible (above the button
// when there is no room below, moved in from either screen edge), and has a
// close button; a click outside or Escape still closes it.
export function Drop({ label, icon, buttonClass, panelClass = "left-0 w-56", testId, children }: { label: string; icon: React.ReactNode; buttonClass: string; panelClass?: string; testId?: string; children: React.ReactNode }) {
  const box = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [edge, setEdge] = useState<React.CSSProperties>({});
  const fit = useFitPanel(open, summary, panel);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (box.current?.open && !inside(event, box.current)) box.current.open = false;
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
  // Keep the panel inside the screen sideways.
  useLayoutEffect(() => {
    if (!open || !panel.current) {
      setEdge({});
      return;
    }
    const rect = panel.current.getBoundingClientRect();
    if (rect.left < 8) setEdge({ left: 0, right: "auto" });
    else if (rect.right > window.innerWidth - 8) setEdge({ right: 0, left: "auto" });
  }, [open]);
  return (
    <details ref={box} className="relative" data-testid={testId} onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}>
      <summary ref={summary} aria-label={label} className={`cursor-pointer list-none ${buttonClass}`}>
        {icon}
      </summary>
      <div
        ref={panel}
        className={`absolute z-30 overflow-y-auto rounded-lg border border-line bg-raised p-3 text-ink shadow-overlay ${fit.up ? "bottom-full mb-1" : "mt-1"} ${panelClass}`}
        style={{ maxHeight: fit.maxHeight, ...edge }}
      >
        <button
          type="button"
          aria-label={`Close ${label.toLowerCase()}`}
          onClick={() => {
            if (box.current) box.current.open = false;
          }}
          className="float-right -mr-1 -mt-1 ml-2 rounded p-1 text-ink-muted hover:bg-surface-muted hover:text-ink"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
        {children}
      </div>
    </details>
  );
}
