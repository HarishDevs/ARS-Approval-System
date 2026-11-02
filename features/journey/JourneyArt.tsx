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

// v1.48 (owner's journey design): the scene behind the road: a dusk sky,
// layered mountains, tree lines and hills. Decorative only (aria-hidden), a
// few paths, no images. It covers the track and scrolls with the road.
export function ScenicBackdrop({ id }: { id: string }) {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1000 180" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b1730" />
          <stop offset="0.45" stopColor="#25315a" />
          <stop offset="0.75" stopColor="#6b4a6b" />
          <stop offset="1" stopColor="#c0704a" />
        </linearGradient>
        <radialGradient id={`${id}-sun`} cx="0.38" cy="0.78" r="0.35">
          <stop offset="0" stopColor="#ffb36b" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffb36b" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-ground`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d3a2c" />
          <stop offset="1" stopColor="#0d1b2e" />
        </linearGradient>
      </defs>
      <rect width="1000" height="180" fill={`url(#${id}-sky)`} />
      <rect width="1000" height="180" fill={`url(#${id}-sun)`} />
      {/* a few stars */}
      <g fill="#e2e8f0" opacity="0.55">
        <circle cx="70" cy="18" r="1" />
        <circle cx="210" cy="34" r="0.8" />
        <circle cx="330" cy="12" r="1.1" />
        <circle cx="520" cy="26" r="0.8" />
        <circle cx="660" cy="10" r="1" />
        <circle cx="800" cy="30" r="0.9" />
        <circle cx="930" cy="16" r="1" />
      </g>
      {/* far mountains */}
      <path d="M0 112 L70 72 L130 96 L210 52 L290 92 L360 64 L450 100 L540 58 L620 90 L700 66 L790 98 L860 70 L940 94 L1000 80 V180 H0 Z" fill="#33406a" opacity="0.85" />
      {/* near mountains */}
      <path d="M0 128 L90 96 L170 118 L250 88 L340 122 L430 94 L520 124 L610 98 L700 126 L790 104 L880 128 L1000 100 V180 H0 Z" fill="#253154" />
      {/* hills */}
      <path d="M0 140 C120 122 220 134 330 128 S560 120 680 132 S880 124 1000 130 V180 H0 Z" fill={`url(#${id}-ground)`} />
      {/* tree lines */}
      <g fill="#10241c">
        {[18, 40, 58, 150, 168, 300, 318, 336, 470, 488, 600, 618, 760, 778, 796].map((x, index) => (
          <path key={x} d={`M${x} ${136 - (index % 3) * 3} l7 -${16 + (index % 3) * 4} l7 ${16 + (index % 3) * 4} z`} />
        ))}
        {[90, 230, 400, 540, 690, 840].map((x) => (
          <circle key={x} cx={x} cy="132" r="8" />
        ))}
      </g>
      <rect y="150" width="1000" height="30" fill="#0d1b2e" />
    </svg>
  );
}

// The ARS works at the end of the road (decorative).
export function ArsFactory({ width = 150 }: { width?: number }) {
  return (
    <svg width={width} height={(width * 70) / 150} viewBox="0 0 150 70" aria-hidden="true" focusable="false">
      <g fill="#1b2a44">
        <rect x="18" y="14" width="7" height="34" />
        <rect x="32" y="6" width="7" height="42" />
        <rect x="108" y="10" width="6" height="38" />
      </g>
      <g fill="#94a3b8" opacity="0.35">
        <circle cx="36" cy="2" r="4" />
        <circle cx="42" cy="-3" r="3" />
        <circle cx="111" cy="5" r="3.5" />
      </g>
      <path d="M8 48 V30 L28 22 V30 L48 22 V30 L68 22 V48 Z" fill="#22324f" />
      <rect x="66" y="26" width="78" height="22" fill="#2a3b5c" />
      <rect x="80" y="30" width="34" height="11" rx="2" fill="#d92d20" />
      <text x="97" y="39" textAnchor="middle" fontFamily="Inter, Arial, sans-serif" fontWeight="900" fontStyle="italic" fontSize="9" fill="#ffffff">
        ARS
      </text>
      <g fill="#fbbf24" opacity="0.8">
        <rect x="14" y="36" width="5" height="4" />
        <rect x="26" y="36" width="5" height="4" />
        <rect x="38" y="36" width="5" height="4" />
        <rect x="122" y="32" width="5" height="4" />
        <rect x="132" y="32" width="5" height="4" />
      </g>
      <rect x="0" y="48" width="150" height="3" fill="#13213a" />
    </svg>
  );
}
