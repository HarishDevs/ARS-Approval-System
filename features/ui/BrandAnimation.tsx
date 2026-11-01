"use client";

import { useEffect, useRef, useState } from "react";
import { FailedCross, SuccessTick } from "@/features/ui/Loaders";

// v1.42.0 (owner): the animated outcomes from IconScout (free licence, see
// docs/brand/ANIMATION-REFERENCES.md), recoloured to the ARS palette and kept
// in public/animations. The light Lottie player loads only when one shows.
// Until it has loaded, if it can't, or when people turn motion off, the
// app's own SVG version stands in (the same meaning, the same size).
export type BrandAnimationName = "success" | "failed" | "task-done" | "approved" | "celebrate" | "loading";

type Player = { destroy: () => void };
// The IconScout drawings sit in the middle of a larger canvas; this scales
// them to fill the box like the icons beside them (measured on the files).
const ZOOM: Record<BrandAnimationName, number> = { success: 1.85, failed: 1.6, "task-done": 1.6, loading: 1.6, approved: 1.1, celebrate: 1.2 };

let playerLib: Promise<typeof import("lottie-web/build/player/lottie_light")> | null = null;
const cache = new Map<BrandAnimationName, Promise<unknown>>();
const load = (name: BrandAnimationName) => {
  if (!cache.has(name)) cache.set(name, fetch(`/animations/${name}.json`).then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status))))));
  return cache.get(name)!;
};

function Fallback({ name, className }: { name: BrandAnimationName; className: string }) {
  if (name === "failed") return <FailedCross className={className} />;
  if (name === "loading")
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="var(--brand-wave-2)" strokeWidth="2.5" />
        <circle cx="12" cy="12" r="9" fill="none" stroke="var(--brand-accent)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="14 43" className="brand-spin" />
      </svg>
    );
  return <SuccessTick className={className} />;
}

export function BrandAnimation({ name, className = "h-12 w-12", loop, label }: { name: BrandAnimationName; className?: string; loop?: boolean; label?: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let player: Player | null = null;
    let stopped = false;
    playerLib ??= import("lottie-web/build/player/lottie_light");
    Promise.all([playerLib, load(name)])
      .then(([lottie, data]) => {
        if (stopped || !box.current) return;
        player = lottie.default.loadAnimation({ container: box.current, renderer: "svg", loop: loop ?? name === "loading", autoplay: true, animationData: structuredClone(data) });
        setPlaying(true);
      })
      .catch(() => undefined);
    return () => {
      stopped = true;
      player?.destroy();
    };
  }, [name, loop]);
  return (
    <span className={`relative inline-grid shrink-0 place-items-center ${className}`} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} data-testid={`animation-${name}`} data-playing={playing || undefined}>
      <span ref={box} className="absolute inset-0 [&>svg]:!h-full [&>svg]:!w-full" style={{ transform: `scale(${ZOOM[name]})` }} />
      {!playing && <Fallback name={name} className="h-full w-full" />}
    </span>
  );
}
