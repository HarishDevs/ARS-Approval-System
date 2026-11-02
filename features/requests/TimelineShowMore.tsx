"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

// v1.49 (owner, 2 Nov 2026): "Timeline should show last 3 in a desc order;
// if they click show more it should show the rest as a scroll bar". The
// events arrive rendered on the server, newest first; this only shows the
// latest few, or every one inside a scrolling box (newest still on top).
export function TimelineShowMore({ shown, rest }: { shown: ReactNode[]; rest: ReactNode[] }) {
  const [open, setOpen] = useState(false);
  const boxId = useId();
  return (
    <>
      {open ? (
        // Focusable so a keyboard can scroll it (axe: scrollable-region-focusable).
        <div id={boxId} role="group" aria-label="Full history, newest first" tabIndex={0} className="request-timeline-scroll max-h-72 overflow-y-auto pr-1" data-testid="timeline-scroll">
          <ol className="space-y-3">
            {shown}
            {rest}
          </ol>
        </div>
      ) : (
        <ol id={boxId} className="space-y-3">
          {shown}
        </ol>
      )}
      {rest.length > 0 && (
        <button type="button" aria-expanded={open} aria-controls={boxId} onClick={() => setOpen((value) => !value)} className="btn-secondary btn-compact mt-3 inline-flex items-center gap-1.5" data-testid="timeline-more">
          {open ? <ChevronUp aria-hidden="true" className="h-4 w-4" /> : <ChevronDown aria-hidden="true" className="h-4 w-4" />}
          {open ? "Show less" : `Show more (${rest.length})`}
        </button>
      )}
    </>
  );
}
