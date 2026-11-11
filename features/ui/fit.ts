"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

// v1.52.1 (owner: "the dropdown should open wherever it will be clearly
// visible"): where a dropdown panel fits. Below its button when there is
// room, else above; aligned to the right edge when it would run off the
// screen; never taller than the space it has. Measured on open and again on
// scroll and resize.
export interface Fit {
  up: boolean;
  right: boolean;
  maxHeight: number;
}

export function useFitPanel(open: boolean, anchor: RefObject<HTMLElement | null>, panel: RefObject<HTMLElement | null>): Fit {
  const [fit, setFit] = useState<Fit>({ up: false, right: false, maxHeight: 320 });
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const box = anchor.current?.getBoundingClientRect();
      const element = panel.current;
      if (!box || !element) return;
      const margin = 12;
      const below = window.innerHeight - box.bottom - margin;
      const above = box.top - margin;
      const wanted = Math.min(element.scrollHeight, 420);
      const up = wanted > below && above > below;
      const right = box.left + element.offsetWidth > window.innerWidth - 8 && box.right - element.offsetWidth >= 8;
      setFit((current) => {
        const next = { up, right, maxHeight: Math.max(140, Math.floor(up ? above : below)) };
        return current.up === next.up && current.right === next.right && current.maxHeight === next.maxHeight ? current : next;
      });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, anchor, panel]);
  return fit;
}
