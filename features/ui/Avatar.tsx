// D-230: a person's photo, or their initials when they have none.
const SIZE = {
  xs: "h-6 w-6 text-[length:calc(10px*var(--text-scale,1))]",
  sm: "h-8 w-8 text-caption",
  md: "h-10 w-10 text-label",
  lg: "h-16 w-16 text-title",
  xl: "h-24 w-24 text-[length:calc(30px*var(--text-scale,1))]",
} as const;

export function initialsFor(name: string): string {
  return (
    name
      .replace(/\s*\([^)]*\)\s*/g, " ")
      .split(/\s+/)
      .map((part) => part.replace(/[^\p{L}]/gu, "")[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

export function Avatar({ name, src, size = "sm", className = "" }: { name: string; src: string | null | undefined; size?: keyof typeof SIZE; className?: string }) {
  const box = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${SIZE[size]} ${className}`;
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- a small private photo served by the app
    <img src={src} alt="" className={`${box} object-cover`} />
  ) : (
    <span aria-hidden="true" className={`${box} bg-primary-solid font-semibold text-on-solid`}>
      {initialsFor(name)}
    </span>
  );
}
