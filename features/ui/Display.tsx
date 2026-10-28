import Link from "next/link";
import { ChevronRight, Inbox } from "lucide-react";
import { SafeText } from "@/features/ui/SafeText";

// Display components (UI-03). Server-friendly: no client state.
export type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

const TONE: Record<Tone, string> = {
  neutral: "bg-surface-muted text-ink-muted",
  primary: "bg-primary-50 text-primary-700",
  success: "bg-success-50 text-success-600",
  warning: "bg-warning-50 text-warning-600",
  danger: "bg-danger-50 text-danger-600",
  info: "bg-info-50 text-info-600",
};

// Text always says what the colour means (never colour alone).
export function Badge({ tone = "neutral", icon, children, className = "" }: { tone?: Tone; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <span className={`badge gap-1 ${TONE[tone]} ${className}`}>
      {icon}
      {children}
    </span>
  );
}

export function initials(name: string): string {
  return (
    name
      .replace(/\s*\([^)]*\)\s*/g, " ")
      .trim()
      .split(/\s+/)
      .map((part) => part.replace(/[^\p{L}]/gu, "")[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

// Decorative by default: the name is always written next to it.
export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-full bg-primary-50 font-semibold text-primary-700 ${size === "sm" ? "h-6 w-6 text-[length:calc(10px*var(--text-scale,1))]" : "h-8 w-8 text-caption"}`}>
      {initials(name)}
    </span>
  );
}

export function Card({ title, actions, children, className = "", bodyClassName = "", id }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; bodyClassName?: string; id?: string }) {
  return (
    <section className={`card ${className}`} aria-labelledby={title && id ? `${id}-title` : undefined}>
      {title && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
          <h2 id={id ? `${id}-title` : undefined} className="font-semibold">
            {title}
          </h2>
          {actions}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

// Every empty list says what it means and what to do next (UI-03).
export function EmptyState({ title, body, icon, action }: { title: string; body?: string; icon?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-line bg-surface px-5 py-5 sm:flex-row sm:items-center">
      <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-muted text-ink-faint">
        {icon ?? <Inbox className="h-5 w-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        {body && (
          <p className="text-label text-ink-muted">
            <SafeText text={body} />
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

export function Breadcrumbs({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3 text-label">
      <ol className="flex flex-wrap items-center gap-1 text-ink-muted">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-1">
            {index > 0 && <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 text-ink-faint" />}
            {item.href && index < items.length - 1 ? (
              <Link href={item.href} className="hover:text-ink hover:underline">
                {item.label}
              </Link>
            ) : (
              <span aria-current={index === items.length - 1 ? "page" : undefined} className="max-w-[16rem] truncate text-ink">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Progress({ value, max, label }: { value: number; max: number; label: string }) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className="h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div className="h-full rounded-full bg-primary-600 transition-[width] duration-slow ease-standard" style={{ width: `${percent}%` }} />
    </div>
  );
}

// A hover/focus hint for an icon-only control. The text is also its
// accessible description, so it isn't hidden from screen readers.
export function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-toast mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-ink px-2 py-1 text-caption text-surface opacity-0 shadow-overlay transition-opacity duration-fast group-focus-within:opacity-100 group-hover:opacity-100">
        {text}
      </span>
    </span>
  );
}

// Page-number paging with plain links (works without JavaScript).
export function Pagination({ page, pages, hrefFor }: { page: number; pages: number; hrefFor: (page: number) => string }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-3 text-label">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className="link" rel="prev">
          ← Newer
        </Link>
      ) : (
        <span />
      )}
      <span className="text-ink-muted">
        Page {page} of {pages}
      </span>
      {page < pages ? (
        <Link href={hrefFor(page + 1)} className="link" rel="next">
          Older →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
