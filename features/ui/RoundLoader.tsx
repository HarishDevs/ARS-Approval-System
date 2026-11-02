"use client";

import { useEffect, useState } from "react";
import { DotsRingLoader, LogoSpinner } from "@/features/ui/Loaders";

// v1.49.0 (owner: "use any one of them in a random way, 1 or 2, 2 or 1"):
// each time a round loader appears it is the ring or the dotted ring, picked
// at random. The pick happens in the browser (the server can't know it), so
// the first frame keeps the space and shows nothing.
export function RoundLoader({ size = 72, label = "Loading…" }: { size?: number; label?: string }) {
  const [pick, setPick] = useState<0 | 1 | null>(null);
  useEffect(() => setPick(Math.random() < 0.5 ? 0 : 1), []);
  if (pick === null) return <span role="status" aria-label={label} className="inline-block shrink-0" style={{ width: size, height: size }} data-testid="round-loader" />;
  return (
    <span className="contents" data-testid="round-loader" data-variant={pick === 0 ? "ring" : "dots"}>
      {pick === 0 ? <LogoSpinner size={size} label={label} /> : <DotsRingLoader size={size} label={label} />}
    </span>
  );
}
