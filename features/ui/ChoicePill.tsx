import type { CSSProperties, ReactNode } from "react";
import { BUILT_IN_PRIORITY_COLOR, OPTION_COLOR_SWATCH, isOptionColor, type OptionColor } from "@/server/forms/option-colors";

// v1.47.0 (owner, 2 Nov 2026): one way to show a choice value. With a
// colour it is a pill (light background, readable text, both themes; the
// colours come from OPTION_COLOR_SWATCH via CSS variables, see
// .choice-pill in styles/globals.css). Without one it is plain text.
export function choicePillStyle(color: OptionColor): CSSProperties {
  const swatch = OPTION_COLOR_SWATCH[color];
  return { "--pill-bg": swatch.light.bg, "--pill-fg": swatch.light.fg, "--pill-bg-dark": swatch.dark.bg, "--pill-fg-dark": swatch.dark.fg } as CSSProperties;
}

export function ChoicePill({ label, color, className = "", title }: { label: ReactNode; color?: string | null; className?: string; title?: string }) {
  if (!isOptionColor(color)) return <span className={className || undefined} title={title}>{label}</span>;
  return (
    <span className={`choice-pill ${className}`} data-color={color} style={choicePillStyle(color)} title={title}>
      {label}
    </span>
  );
}

// Several values (a multi-select), each with its own colour.
export function ChoicePills({ values }: { values: readonly { label: string; color: string | null }[] }) {
  if (values.length === 0) return <span className="text-ink-faint">—</span>;
  if (values.every((value) => !value.color)) return <span>{values.map((value) => value.label).join(", ")}</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {values.map((value) => (
        <ChoicePill key={value.label} label={value.label} color={value.color} />
      ))}
    </span>
  );
}

// A request's priority in a list cell: the pill, "Hidden" when the field
// is confidential for this viewer, or "—" when the request has none.
export function PriorityPill({ priority }: { priority: { label: string; color: string | null; hidden?: boolean } | null | undefined }) {
  if (!priority) return <span className="text-ink-faint">—</span>;
  if (priority.hidden) return <span className="text-caption text-ink-muted">Hidden</span>;
  return <ChoicePill label={priority.label} color={priority.color} className="whitespace-nowrap text-caption" />;
}

// v1.47.0 (owner: "add priority here"): the Priority beside a request's
// title. Without a colour it is a plain outlined chip.
export function RequestPriorityBadge({ priority }: { priority: { label: string; color: string | null } }) {
  return (
    <span className="shrink-0 text-caption" data-testid="request-priority" title="Priority">
      <span className="sr-only">Priority: </span>
      {isOptionColor(priority.color) ? (
        <ChoicePill label={priority.label} color={priority.color} />
      ) : (
        <span className="inline-flex rounded-full border border-line px-2 py-px font-semibold text-ink-muted">{priority.label}</span>
      )}
    </span>
  );
}

// v1.47.0 (owner: "add Priority in all possible tables"): a task's (or an
// information item's) built-in priority as the same pill: Urgent red, High
// orange, Low grey; Normal shows nothing unless `showNormal`.
export function TaskPriorityPill({ priority, showNormal = false }: { priority: string; showNormal?: boolean }) {
  const label = priority.charAt(0) + priority.slice(1).toLowerCase();
  const color = BUILT_IN_PRIORITY_COLOR[priority] ?? null;
  if (!color && !showNormal) return null;
  return <ChoicePill label={label} color={color} className="whitespace-nowrap text-caption" title={`Priority: ${label}`} />;
}
