"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

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
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-page" data-testid="brand-loader">
        <div role="status" aria-live="polite" className="flex w-72 flex-col items-center gap-4 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- static SVG logo */}
          <img src="/brand/ars-green-steel.svg" alt="" width={120} height={56} className="h-14 w-auto" />
          <div>
            <p className="text-card-title font-semibold text-ink">{title}</p>
            {detail && <p className="mt-1 text-body text-ink-muted">{detail}</p>}
          </div>
          <LoaderBar />
        </div>
      </div>
    );
  }
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/15 pt-[22vh]" data-testid="classic-loader">
      <div role="status" aria-live="polite" className="w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border-2 border-primary-600 bg-surface shadow-lg">
        <p className="bg-primary-solid px-4 py-1.5 text-center text-label font-bold uppercase tracking-[0.12em] text-white">Central Management System</p>
        <div className="space-y-3 px-5 py-4 text-center">
          <p className="text-body text-ink">{title}</p>
          <LoaderBar />
        </div>
      </div>
    </div>
  );
}

function LoaderBar() {
  return (
    <span aria-hidden="true" className="relative block h-1.5 w-full overflow-hidden rounded-full bg-primary-100">
      <span className="loader-bar absolute inset-y-0 left-0 w-2/5 rounded-full bg-primary-solid" />
    </span>
  );
}
