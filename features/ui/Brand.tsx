import { APP_BRANDING } from "@/lib/branding";

// Nov 2026 (owner's approved logo): the ARS GREEN STEEL CMS identity. The
// images come from public/branding/ (made only from the owner's master PNG;
// see lib/branding.ts). The earlier drawn mark (public/brand/ars-cms-mark.svg)
// stays on disk for old emails and records but is no longer used.

// The square app icon (rounded blue tile with ARS / GREEN STEEL / CMS), for
// square or tiny places. tone is kept for callers: the icon carries its own
// blue, so it reads on light, blue and dark surfaces alike.
export function CmsMark({ className = "h-8 w-8", title }: { className?: string; tone?: "color" | "white"; title?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static brand icon
    <img
      src={APP_BRANDING.icon}
      alt={title ?? ""}
      aria-hidden={title ? undefined : true}
      width={192}
      height={192}
      draggable={false}
      className={`shrink-0 object-contain ${className}`}
    />
  );
}

// "ARS CMS", the app's name, in the brand's two blues.
export function CmsWordmark({ className = "", tone = "color" }: { className?: string; tone?: "color" | "white" }) {
  return (
    <span className={`whitespace-nowrap font-extrabold tracking-tight ${className}`}>
      <span className={tone === "white" ? "text-white" : "text-[color:var(--brand-navy)]"}>ARS </span>
      <span className={tone === "white" ? "text-[#9fd0ff]" : "text-[color:var(--brand-accent-text)]"}>CMS</span>
    </span>
  );
}

// The full 3:2 logo on its own blue background (the approved look), at a height.
export function BrandLogo({ className = "h-10", large = false }: { className?: string; large?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static brand logo
    <img
      src={large ? APP_BRANDING.logo : APP_BRANDING.logoSmall}
      alt={APP_BRANDING.logoAlt}
      width={large ? 480 : 192}
      height={large ? 320 : 128}
      draggable={false}
      className={`aspect-[3/2] w-auto shrink-0 rounded-[6px] ${className}`}
    />
  );
}

// v1.49.0 (owner: "use that logo without background"): the logo with no
// background. white: white lettering (blue or dark surfaces); horizontal: the
// one-line ARS | GREEN STEEL CMS in white; auto: navy lettering on a light
// theme and white lettering on a dark theme (globals.css .brand-on-light/-dark).
export function BrandLogoClear({ variant, className = "" }: { variant: "white" | "horizontal" | "auto"; className?: string }) {
  if (variant === "auto") {
    return (
      <span className={`inline-block ${className}`} data-testid="brand-logo-clear">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand logo */}
        <img src={APP_BRANDING.logoLightClear} alt={APP_BRANDING.logoAlt} width={223} height={186} draggable={false} className="brand-on-light h-full w-auto" />
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand logo */}
        <img src={APP_BRANDING.logoClear} alt="" aria-hidden="true" width={850} height={602} draggable={false} className="brand-on-dark h-full w-auto" />
      </span>
    );
  }
  const horizontal = variant === "horizontal";
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static brand logo
    <img
      src={horizontal ? APP_BRANDING.logoHorizontalClear : APP_BRANDING.logoClear}
      alt={APP_BRANDING.logoAlt}
      width={horizontal ? 365 : 850}
      height={horizontal ? 74 : 602}
      draggable={false}
      className={`shrink-0 ${className}`}
      data-testid="brand-logo-clear"
    />
  );
}

// The header lockup (owner's brand sheet "App Header Examples"): the logo, a
// divider, then "ARS CMS" (and GREEN STEEL under it when subtitle is on).
// size: sm (sidebar, menu), md (top bars, public pages, sign-in), lg (loader).
// withArs: the logo and the divider before the name.
export function BrandLockup({ size = "md", tone = "color", withArs = true, subtitle = true }: { size?: "sm" | "md" | "lg"; tone?: "color" | "white"; withArs?: boolean; subtitle?: boolean }) {
  const s = {
    sm: { logo: "h-8", word: "text-[15px] leading-none", sub: "text-[9px]", gap: "gap-2", divider: "h-6" },
    md: { logo: "h-10", word: "text-[19px] leading-none", sub: "text-[10.5px]", gap: "gap-2.5", divider: "h-8" },
    lg: { logo: "h-16", word: "text-[32px] leading-none", sub: "text-[14px]", gap: "gap-4", divider: "h-12" },
  }[size];
  return (
    <span className={`inline-flex min-w-0 items-center ${s.gap}`} data-testid="brand-lockup">
      {withArs && (
        <>
          <BrandLogo className={s.logo} large={size === "lg"} />
          <span aria-hidden="true" className={`${s.divider} w-px shrink-0 ${tone === "white" ? "bg-white/40" : "bg-line-strong"}`} />
        </>
      )}
      <span className="min-w-0">
        <CmsWordmark className={`block ${s.word}`} tone={tone} />
        {subtitle && <span className={`mt-1 block truncate font-semibold uppercase tracking-[0.12em] ${s.sub} ${tone === "white" ? "text-white/80" : "text-ink-muted"}`}>{APP_BRANDING.subtitle}</span>}
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
