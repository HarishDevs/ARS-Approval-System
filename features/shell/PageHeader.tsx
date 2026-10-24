import { SafeText } from "@/features/ui/SafeText";
import { Hint } from "@/features/ui/Hint";

// Page title (h1) and the page's primary actions in the same bar (S9-07).
// D-179: `description` (instructions) is a hover hint next to the title;
// `meta` (facts about what is shown: a record's number, the period, the live
// version) stays visible under it.
export function PageHeader({ title, description, meta, children }: { title: string; description?: string; meta?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4" data-tour="page-header">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <h1 className="text-title font-semibold tracking-tight">{typeof title === "string" ? <SafeText text={title} /> : title}</h1>
          {description && <Hint text={description} align="start" />}
        </div>
        {meta && (
          <p className="mt-1 max-w-3xl text-label text-ink-muted">
            <SafeText text={meta} />
          </p>
        )}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

// The shared empty state (UI-03); kept here so existing imports work.
export { EmptyState } from "@/features/ui/Display";
