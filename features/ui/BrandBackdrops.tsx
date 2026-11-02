// v1.49.0 (owner's phone splash and sign-in references): the two brand
// backgrounds. BlueBackdrop is the splash (the logo's own blue with light
// swooshes): the full-screen loader and the sign-in brand panel.
// SkylineBackdrop is the sign-in: a pale blue page with a city skyline and
// the red and blue ARS swooshes along the bottom. Both are decoration only.

export function BlueBackdrop({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden bg-[linear-gradient(165deg,#0A72D9_0%,#004B8D_58%,#003566_100%)] ${className}`} data-testid="blue-backdrop">
      <svg viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <defs>
          <radialGradient id="bb-glow" cx="50%" cy="38%" r="55%">
            <stop offset="0%" stopColor="#5fb0ff" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#5fb0ff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="400" height="800" fill="url(#bb-glow)" />
        <path d="M-40 150C80 60 220 30 440 70" fill="none" stroke="#fff" strokeOpacity="0.28" strokeWidth="3" />
        <path d="M-40 175C90 95 230 70 440 105" fill="none" stroke="#9fd0ff" strokeOpacity="0.22" strokeWidth="10" />
        <path d="M-40 690C120 650 260 610 440 520" fill="none" stroke="#fff" strokeOpacity="0.3" strokeWidth="3" />
        <path d="M-40 730C130 700 280 660 440 575" fill="none" stroke="#9fd0ff" strokeOpacity="0.2" strokeWidth="14" />
      </svg>
    </div>
  );
}

// The skyline: plain blocks in the brand's light blues (no real buildings).
const TOWERS: [number, number, number][] = [
  // x, width, height
  [0, 46, 70], [40, 30, 110], [66, 40, 86], [100, 26, 140], [122, 44, 96], [160, 34, 176], [190, 50, 120],
  [236, 28, 150], [260, 44, 104], [300, 36, 188], [332, 48, 128], [376, 30, 160], [402, 52, 92], [450, 36, 136],
  [482, 46, 170], [524, 30, 112], [550, 50, 146], [596, 34, 98], [626, 44, 180], [666, 30, 120], [692, 54, 150],
  [742, 36, 90], [774, 46, 132], [816, 32, 166], [844, 56, 108], [896, 40, 142], [932, 68, 84],
];

export function SkylineBackdrop({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden bg-[linear-gradient(180deg,var(--color-surface)_0%,var(--brand-wave-1)_100%)] ${className}`} data-testid="skyline-backdrop">
      <svg viewBox="0 0 1000 260" preserveAspectRatio="xMidYMax slice" className="absolute inset-x-0 bottom-0 h-40 w-full sm:h-48">
        {TOWERS.map(([x, w, h], index) => (
          <rect key={x} x={x} y={260 - h - 40} width={w} height={h + 40} fill={index % 3 === 1 ? "var(--brand-wave-2)" : "var(--skyline-tower)"} />
        ))}
        {TOWERS.filter((_, index) => index % 2 === 0).map(([x, w, h]) =>
          Array.from({ length: Math.floor(h / 22) }, (_, row) => (
            <rect key={`${x}-${row}`} x={x + 6} y={260 - h - 28 + row * 22} width={w - 12} height="5" rx="1" fill="var(--color-surface)" opacity="0.55" />
          )),
        )}
        <path d="M0 260V214C220 196 420 236 640 214S880 170 1000 176V260Z" fill="#004B8D" />
        <path d="M0 250C260 214 520 240 760 206S940 168 1000 160" fill="none" stroke="#E30613" strokeWidth="7" strokeLinecap="round" />
        <path d="M0 260C280 232 540 252 780 224S950 190 1000 186" fill="none" stroke="#0A72D9" strokeWidth="6" strokeLinecap="round" />
      </svg>
    </div>
  );
}
