// D-273 (owner's journey brief): the journey's illustrations, in SVG so they
// stay crisp at any size. Moving parts carry classes the CSS animates
// (styles/globals.css, "jr-"): the rear door (.jr-door), the wheels
// (.jr-wheel), the body on its springs (.jr-body).
import type { StampMark } from "@/features/journey/controller";

// The ARS delivery van, side view, facing right (the way the road runs).
export function JourneyVan({ width = 132 }: { width?: number }) {
  return (
    <svg width={width} height={(width * 84) / 160} viewBox="0 0 160 84" role="img" aria-label="ARS delivery van" className="jr-van overflow-visible">
      <defs>
        <linearGradient id="jr-van-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ef4434" />
          <stop offset="0.7" stopColor="#d92d20" />
          <stop offset="1" stopColor="#a31d14" />
        </linearGradient>
        <linearGradient id="jr-van-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#dbeafe" />
          <stop offset="1" stopColor="#93c5fd" />
        </linearGradient>
      </defs>
      {/* speed lines while driving */}
      <g className="jr-speed" stroke="#f87171" strokeWidth="2.4" strokeLinecap="round">
        <line x1="-22" y1="24" x2="-6" y2="24" />
        <line x1="-30" y1="33" x2="-10" y2="33" />
        <line x1="-20" y1="42" x2="-6" y2="42" />
      </g>
      <ellipse cx="82" cy="78" rx="70" ry="4" fill="#000" opacity="0.35" />
      <g className="jr-body">
        {/* the open cargo bay, seen when the rear door swings out */}
        <rect x="8" y="12" width="10" height="50" rx="2" fill="#1f2937" />
        {/* cargo body */}
        <path d="M12 10 a6 6 0 0 1 6 -6 h88 v60 h-90 a4 4 0 0 1 -4 -4 z" fill="url(#jr-van-body)" />
        {/* cab */}
        <path d="M106 18 h24 c5 0 8 2 10.5 6 l10 16 c1.4 2.2 2.5 4.6 2.5 7.4 v10.6 a4 4 0 0 1 -4 4 h-43 z" fill="url(#jr-van-body)" />
        <path d="M112 23 h17 c2.6 0 4.4 1.2 5.8 3.4 l7.4 12.6 h-30.2 z" fill="url(#jr-van-glass)" />
        <line x1="106" y1="18" x2="106" y2="64" stroke="#7f1d1d" strokeWidth="1.2" />
        <rect x="114" y="44" width="8" height="2.2" rx="1.1" fill="#7f1d1d" />
        {/* the ARS mark on the side */}
        <rect x="22" y="14" width="76" height="30" rx="5" fill="#ffffff" opacity="0.08" />
        <text x="60" y="38" textAnchor="middle" fontFamily="Inter, Arial, sans-serif" fontWeight="900" fontStyle="italic" fontSize="25" fill="#ffffff" letterSpacing="1">
          ARS
        </text>
        <path d="M22 50 h82" stroke="#ffffff" strokeWidth="2.5" opacity="0.85" />
        {/* lights and bumpers */}
        <rect x="148" y="50" width="7" height="5" rx="2" fill="#e5e7eb" />
        <rect x="149" y="42" width="5" height="4" rx="1.5" fill="#fde68a" />
        <rect x="8" y="52" width="6" height="5" rx="1.5" fill="#d1d5db" />
        <rect x="11" y="14" width="3" height="8" rx="1" fill="#fca5a5" />
        {/* the rear door: hinged at the back edge, swings out */}
        <g className="jr-door">
          <rect x="12" y="6" width="9" height="56" rx="2" fill="#c0261b" stroke="#7f1d1d" strokeWidth="0.8" />
          <rect x="16" y="30" width="3" height="7" rx="1.2" fill="#e5e7eb" />
        </g>
      </g>
      {/* wheels */}
      {[38, 126].map((cx) => (
        <g key={cx} transform={`translate(${cx} 64)`}>
          <circle r="13" fill="#111827" />
          <g className="jr-wheel">
            <circle r="7.5" fill="#9ca3af" />
            <circle r="2.6" fill="#374151" />
            {[0, 60, 120, 180, 240, 300].map((angle) => (
              <rect key={angle} x="-0.9" y="-7" width="1.8" height="4.5" fill="#4b5563" transform={`rotate(${angle})`} />
            ))}
          </g>
        </g>
      ))}
    </svg>
  );
}

// The sealed envelope (white, red security seal).
export function JourneyEnvelope({ width = 46 }: { width?: number }) {
  return (
    <svg width={width} height={(width * 32) / 46} viewBox="0 0 46 32" aria-hidden="true">
      <rect x="1" y="1" width="44" height="30" rx="3" fill="#f8fafc" stroke="#cbd5e1" />
      <path d="M2 3 L23 19 L44 3" fill="none" stroke="#cbd5e1" strokeWidth="1.5" />
      <path d="M2 30 L17 16 M44 30 L29 16" fill="none" stroke="#e2e8f0" strokeWidth="1.2" />
      <circle cx="23" cy="18" r="5.5" fill="#d92d20" />
      <path d="M20.5 18 h5 M23 15.5 v5" stroke="#fecaca" strokeWidth="1.2" />
    </svg>
  );
}

// The request as a document (unfolded for review).
export function JourneyDocument({ width = 40 }: { width?: number }) {
  return (
    <svg width={width} height={(width * 50) / 40} viewBox="0 0 40 50" aria-hidden="true">
      <path d="M2 2 h26 l10 10 v36 h-36 z" fill="#ffffff" stroke="#cbd5e1" />
      <path d="M28 2 v10 h10" fill="#e2e8f0" stroke="#cbd5e1" />
      {[18, 24, 30, 36].map((y) => (
        <line key={y} x1="7" y1={y} x2={y === 36 ? 22 : 33} y2={y} stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
      ))}
      <rect x="7" y="8" width="14" height="5" rx="1" fill="#2563eb" opacity="0.8" />
    </svg>
  );
}

const STAMP = {
  approve: { fill: "#16a34a", path: "M8 15.5 l5 5 l10 -11" },
  reject: { fill: "#dc2626", path: "M10 10 l12 12 M22 10 l-12 12" },
  return: { fill: "#f97316", path: "M21 12 a7 7 0 1 0 1.5 7 M21 7 v5 h-5" },
} as const;

// The decision's stamp on the document.
export function JourneyStamp({ mark, size = 30 }: { mark: StampMark; size?: number }) {
  const stamp = STAMP[mark];
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill={stamp.fill} stroke="#ffffff" strokeWidth="2" />
      <path d={stamp.path} fill="none" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// The chequered finish flag.
export function JourneyFlag() {
  return (
    <svg width="30" height="40" viewBox="0 0 34 44" aria-hidden="true">
      <line x1="4" y1="2" x2="4" y2="44" stroke="#e2e8f0" strokeWidth="2.5" />
      {[0, 1, 2, 3].map((row) =>
        [0, 1, 2, 3, 4].map((col) => <rect key={`${row}-${col}`} x={5 + col * 5.6} y={3 + row * 4.2} width="5.6" height="4.2" fill={(row + col) % 2 ? "#ffffff" : "#0f172a"} />),
      )}
    </svg>
  );
}
