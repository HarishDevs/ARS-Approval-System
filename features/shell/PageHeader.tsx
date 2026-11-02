import { SafeText } from "@/features/ui/SafeText";
import { Hint } from "@/features/ui/Hint";
import type { LucideIcon } from "lucide-react";

// Page title (h1) and the page's primary actions in the same bar (S9-07).
// D-179: `description` (instructions) is a hover hint next to the title;
// `meta` (facts about what is shown: a record's number, the period, the live
// version) stays visible under it.
// D-257 (owner's redesign): an optional icon tile beside the title (Compact
// view only; the Classic view keeps its plain title bar).
export function PageHeader({ title, description, meta, icon: Icon, children, badge }: { title: string; description?: string; meta?: string; icon?: LucideIcon; children?: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4" data-tour="page-header">
      <div className="flex min-w-0 items-center gap-3">
        {Icon && (
          <span className="page-icon grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-line bg-primary-50 text-primary-700 shadow-card" aria-hidden="true">
            <Icon className="h-6 w-6" />
          </span>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h1 className="text-title font-semibold tracking-tight">{typeof title === "string" ? <SafeText text={title} /> : title}</h1>
            {description && <Hint text={description} align="start" />}
            {/* v1.47.0: e.g. the request's Priority pill, beside the title. */}
            {badge}
          </div>
          {meta && (
            <p className="mt-1 max-w-3xl text-label text-ink-muted">
              <SafeText text={meta} />
            </p>
          )}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

// The shared empty state (UI-03); kept here so existing imports work.
export { EmptyState } from "@/features/ui/Display";
