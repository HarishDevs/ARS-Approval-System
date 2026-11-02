"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BrandLogoClear, CmsMark } from "@/features/ui/Brand";
import { BlueBackdrop } from "@/features/ui/BrandBackdrops";
import { BarLoader } from "@/features/ui/Loaders";
import { RoundLoader } from "@/features/ui/RoundLoader";

// D-214 (owner): custom loaders. One look for the app's own waits: the ARS
// logo, what is happening, and a sliding bar (still for people who turn
// motion off). "screen" covers the page (signing in); "classic" is the
// Classic view's Tally-style box. Screen readers hear the message once.
// It is drawn on <body>: inside an animated panel (the sign-in form slides
// in) a fixed layer would be trapped in that panel.
export function BrandLoader(props: { variant: "screen" | "classic"; title: string; detail?: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready ? createPortal(<LoaderContent {...props} />, document.body) : null;
}

function LoaderContent({ variant, title, detail }: { variant: "screen" | "classic"; title: string; detail?: string }) {
  if (variant === "screen") {
    return (
      // v1.49.0 (owner's splash reference): the logo on its own blue with the
      // light swooshes, and the bar near the bottom with what is happening.
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden px-6 text-white" data-testid="brand-loader">
        <BlueBackdrop />
        {/* The logo without its background (owner). */}
        <BrandLogoClear variant="white" className="relative h-auto w-[min(70vw,340px)]" />
        <div role="status" aria-live="polite" className="relative mt-[12vh] flex w-72 max-w-[calc(100vw-3rem)] flex-col items-center gap-3 text-center">
          <span aria-hidden="true" className="relative block h-1.5 w-full overflow-hidden rounded-full bg-white/25">
            <span className="loader-bar absolute inset-y-0 left-0 w-2/5 rounded-full bg-[#EAF3FF]" />
          </span>
          <p className="text-body font-semibold">{title}</p>
          {detail && <p className="-mt-2 text-label text-white/80">{detail}</p>}
        </div>
      </div>
    );
  }
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/15 pt-[22vh]" data-testid="classic-loader">
      <div role="status" aria-live="polite" className="w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border-2 border-primary-600 bg-surface shadow-lg">
        <p className="flex items-center justify-center gap-2 bg-primary-solid px-4 py-1.5 text-center text-label font-bold uppercase tracking-[0.12em] text-white">
          <CmsMark className="h-4 w-4" tone="white" /> Central Management System
        </p>
        {/* v1.49.0 (owner's loader reference): a round loader (the ring or the dotted ring, at random) and the bar. */}
        <div className="flex items-center gap-4 px-5 py-4">
          <span aria-hidden="true" className="contents">
            <RoundLoader size={52} label={title} />
          </span>
          <BarLoader label={title} />
        </div>
      </div>
    </div>
  );
}
