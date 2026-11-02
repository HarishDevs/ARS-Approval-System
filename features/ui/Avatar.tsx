import { APP_BRANDING } from "@/lib/branding";

// D-230: a person's photo, or their initials when they have none.
// v1.49.0 (owner): when the person's role is known (approver given), the
// default is the brand's circular icon: blue for approvers, white for users.
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

export function defaultAvatar(approver: boolean): string {
  return approver ? APP_BRANDING.avatarApprover : APP_BRANDING.avatarUser;
}

export function Avatar({ name, src, size = "sm", className = "", approver }: { name: string; src: string | null | undefined; size?: keyof typeof SIZE; className?: string; approver?: boolean }) {
  const box = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${SIZE[size]} ${className}`;
  const shown = src || (approver === undefined ? null : defaultAvatar(approver));
  return shown ? (
    // eslint-disable-next-line @next/next/no-img-element -- a small private photo served by the app
    <img src={shown} alt="" className={`${box} object-cover ${src ? "" : "ring-1 ring-line"}`} data-default-avatar={src ? undefined : approver ? "approver" : "user"} />
  ) : (
    <span aria-hidden="true" className={`${box} bg-primary-solid font-semibold text-on-solid`}>
      {initialsFor(name)}
    </span>
  );
}
