"use client";

import { useEffect } from "react";

// D-211: puts the Classic view's text size on <html>, so every text size
// (and dialogs outside the page frame) follows it. Removed when the page
// isn't in the Classic view (e.g. after switching to Compact, or in Admin).
export const TEXT_SCALE_VAR = "--text-scale";

export function applyTextScale(scale: number | null) {
  if (typeof document === "undefined") return;
  if (scale === null || scale === 1) document.documentElement.style.removeProperty(TEXT_SCALE_VAR);
  else document.documentElement.style.setProperty(TEXT_SCALE_VAR, String(scale));
}

export function TextScale({ scale }: { scale: number | null }) {
  useEffect(() => {
    applyTextScale(scale);
    return () => applyTextScale(null);
  }, [scale]);
  return null;
}
