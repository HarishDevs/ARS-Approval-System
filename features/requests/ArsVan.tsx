// D-253: the red ARS delivery van that drives along the approval road. Drawn
// in SVG (it scales cleanly at any size); the side carries the real ARS mark
// from the brand assets. Colours come from theme tokens (--van-body, …).
export function ArsVan({ width = 96, moving = false, className = "" }: { width?: number; moving?: boolean; className?: string }) {
  return (
    <svg width={width} height={(width * 52) / 96} viewBox="0 0 96 52" className={className} role="img" aria-label="ARS van">
      {moving && (
        <g stroke="var(--van-body)" strokeWidth="2.2" strokeLinecap="round" opacity="0.7">
          <line x1="0" y1="17" x2="10" y2="17" />
          <line x1="3" y1="23" x2="12" y2="23" />
          <line x1="1" y1="29" x2="9" y2="29" />
        </g>
      )}
      {/* body */}
      <path d="M14 10 a4 4 0 0 1 4 -4 h44 a4 4 0 0 1 4 4 v30 h-50 a2 2 0 0 1 -2 -2 z" fill="var(--van-body)" />
      {/* cab */}
      <path d="M66 14 h12 c3 0 5 1.6 6.4 4 l6 10 c0.8 1.4 1.6 3 1.6 4.6 v5.4 a2 2 0 0 1 -2 2 h-24 z" fill="var(--van-body)" />
      <path d="M70 18 h8.5 c1.6 0 2.8 0.8 3.6 2.2 l4.2 7.8 h-16.3 z" fill="#cfe6ff" />
      <rect x="66" y="31" width="5" height="1.6" rx="0.8" fill="var(--van-shade)" />
      {/* bumper and lights */}
      <rect x="86.5" y="35" width="6" height="3" rx="1" fill="#e5e7eb" />
      <rect x="89" y="30" width="3.5" height="2.4" rx="1" fill="#fde68a" />
      <rect x="13" y="34" width="3" height="3.2" rx="0.8" fill="#fca5a5" />
      {/* the ARS mark on the side */}
      <rect x="19" y="13" width="42" height="18" rx="3" fill="#ffffff" />
      <image href="/brand/ars-mark.svg" x="20.5" y="14.2" width="39" height="15.6" preserveAspectRatio="xMidYMid meet" />
      {/* wheels */}
      <g>
        <circle cx="28" cy="41" r="7.5" fill="#1f2937" />
        <circle cx="28" cy="41" r="3.4" fill="#d1d5db" />
        <circle cx="78" cy="41" r="7.5" fill="#1f2937" />
        <circle cx="78" cy="41" r="3.4" fill="#d1d5db" />
      </g>
    </svg>
  );
}
