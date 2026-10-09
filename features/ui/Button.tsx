"use client";

import Link from "next/link";
import { forwardRef } from "react";
import { Spinner } from "@/features/ui/Spinner";

// Buttons (UI-03). The look comes from the existing .btn-* classes, so older
// pages and new components match. While busy the button keeps its width
// (the label stays, hidden) and says what it is doing to screen readers.
export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "md" | "sm";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  danger: "btn-danger",
  ghost: "btn-ghost",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra = ""): string {
  return `${VARIANT[variant]} ${size === "sm" ? "btn-compact" : ""} ${extra}`.trim();
}

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: string; // e.g. "Approving…"
  icon?: React.ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", size = "md", loading = false, loadingLabel = "Working…", icon, className = "", children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${buttonClass(variant, size, className)} relative`}
      {...rest}
    >
      <span className={`inline-flex items-center gap-2 whitespace-nowrap ${loading ? "invisible" : ""}`}>
        {icon}
        {children}
      </span>
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center gap-2">
          <Spinner />
          <span className={size === "sm" ? "sr-only" : "text-label"}>{loadingLabel}</span>
        </span>
      )}
    </button>
  );
});

// A link that looks like a button.
export function ButtonLink({ href, variant = "secondary", size = "md", icon, className = "", children, ...rest }: { href: string; variant?: ButtonVariant; size?: ButtonSize; icon?: React.ReactNode; className?: string; children: React.ReactNode } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
