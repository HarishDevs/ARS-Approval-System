// v1.42.0 (owner's brand sheet): the ARS-CMS identity. The mark: a screen
// with a gear on a rounded hexagon over stacked layers (the platform's
// modules), in ARS Blue (#0053A0) to Accent Blue (#0A84FF). The lockup:
// ARS Green Steel | mark + "ARS-CMS" + "Central Management System".
// The same drawing is in public/brand/ars-cms-mark.svg (and the app icons).

// The mark alone. tone "color" on light surfaces, "white" on blue or dark ones.
export function CmsMark({ className = "h-8 w-8", tone = "color", title }: { className?: string; tone?: "color" | "white"; title?: string }) {
  const white = tone === "white";
  return (
    <svg viewBox="0 0 64 64" className={`shrink-0 ${className}`} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <path d="M7 41.5 32 54l25-12.5V47L32 59.5 7 47Z" fill={white ? "#ffffff" : "#0A84FF"} opacity={white ? 0.55 : 0.55} />
      <path d="M7 35 32 47.5 57 35v5.5L32 53 7 40.5Z" fill={white ? "#ffffff" : "#0067C7"} opacity={white ? 0.8 : 0.85} />
      <path d="M30 4.6a4.4 4.4 0 0 1 4 0l19.6 9.6A4.4 4.4 0 0 1 56 18.2v14.6a4.4 4.4 0 0 1-2.4 4L34 46.4a4.4 4.4 0 0 1-4 0l-19.6-9.6a4.4 4.4 0 0 1-2.4-4V18.2a4.4 4.4 0 0 1 2.4-4Z" fill={white ? "#ffffff" : "#0053A0"} />
      {/* the light from the top left (flat shapes, no gradient ids to clash) */}
      {!white && <path d="M30 4.6a4.4 4.4 0 0 1 4 0l19.6 9.6A4.4 4.4 0 0 1 56 18.2v3.3L8 36.2V18.2a4.4 4.4 0 0 1 2.4-4Z" fill="#2F8FFF" opacity="0.55" />}
      <g fill="none" stroke={white ? "#0053A0" : "#ffffff"} strokeLinecap="round" strokeLinejoin="round">
        <rect x="18" y="15" width="28" height="21" rx="3.5" strokeWidth="2.6" />
        <path d="M18 20.5h28" strokeWidth="1.6" opacity="0.7" />
        <circle cx="32" cy="28.3" r="3" strokeWidth="2.2" />
        <path d="M32 22.8v1.6M32 32.2v1.6M26.5 28.3h1.6M35.9 28.3h1.6M28.1 24.4l1.1 1.1M34.8 31.1l1.1 1.1M28.1 32.2l1.1-1.1M34.8 25.5l1.1-1.1" strokeWidth="2" />
      </g>
      <g fill={white ? "#0053A0" : "#ffffff"}>
        <circle cx="21.3" cy="17.8" r="0.9" />
        <circle cx="24.1" cy="17.8" r="0.9" />
      </g>
    </svg>
  );
}

// "ARS-CMS" in the brand's two blues.
export function CmsWordmark({ className = "", tone = "color" }: { className?: string; tone?: "color" | "white" }) {
  return (
    <span className={`whitespace-nowrap font-extrabold tracking-tight ${className}`}>
      <span className={tone === "white" ? "text-white" : "text-[color:var(--brand-navy)]"}>ARS-</span>
      <span className={tone === "white" ? "text-[#9fd0ff]" : "text-[color:var(--brand-accent-text)]"}>CMS</span>
    </span>
  );
}

// The full lockup. size: sm (sidebar), md (top bars), lg (sign-in, loader).
// withArs: the ARS Green Steel logo and a divider before the mark.
export function BrandLockup({ size = "md", tone = "color", withArs = true, subtitle = true }: { size?: "sm" | "md" | "lg"; tone?: "color" | "white"; withArs?: boolean; subtitle?: boolean }) {
  const s = {
    sm: { ars: "h-6", mark: "h-6 w-6", word: "text-[14px] leading-none", sub: "text-[9px]", gap: "gap-1.5", divider: "h-6" },
    md: { ars: "h-9", mark: "h-9 w-9", word: "text-[19px] leading-none", sub: "text-[10.5px]", gap: "gap-2.5", divider: "h-9" },
    lg: { ars: "h-14", mark: "h-14 w-14", word: "text-[32px] leading-none", sub: "text-[14px]", gap: "gap-4", divider: "h-14" },
  }[size];
  return (
    <span className={`inline-flex min-w-0 items-center ${s.gap}`} data-testid="brand-lockup">
      {withArs && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- static SVG logo */}
          <img src={tone === "white" ? "/brand/ars-green-steel-white.svg" : "/brand/ars-green-steel.svg"} alt="" className={`${s.ars} w-auto shrink-0`} />
          <span aria-hidden="true" className={`${s.divider} w-px shrink-0 ${tone === "white" ? "bg-white/40" : "bg-line-strong"}`} />
        </>
      )}
      <CmsMark className={s.mark} tone={tone} />
      <span className="min-w-0">
        <CmsWordmark className={`block ${s.word}`} tone={tone} />
        {subtitle && <span className={`mt-0.5 block truncate font-medium ${s.sub} ${tone === "white" ? "text-white/80" : "text-ink-muted"}`}>Central Management System</span>}
      </span>
    </span>
  );
}

// The brand's wave (the bottom of the loader, sign-in and empty pages):
// light blue swells with the red ARS swoosh.
export function BrandWave({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 1200 160" preserveAspectRatio="none" aria-hidden="true" className={`pointer-events-none ${className}`}>
      <path d="M0 96C220 40 420 150 640 110S1000 30 1200 70V160H0Z" fill="var(--brand-wave-1)" />
      <path d="M0 128C260 80 460 160 700 130S1040 80 1200 104V160H0Z" fill="var(--brand-wave-2)" />
      <path d="M560 150C760 140 980 104 1200 52" fill="none" stroke="#ED1C25" strokeWidth="5" strokeLinecap="round" />
      <path d="M520 158C740 150 990 118 1200 70" fill="none" stroke="#0053A0" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}
