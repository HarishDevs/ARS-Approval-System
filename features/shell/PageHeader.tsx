import { SafeText } from "@/features/ui/SafeText";

// Page title (h1), one line of help, and the page's primary actions in the
// same bar (S9-07).
export function PageHeader({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4" data-tour="page-header">
      <div className="min-w-0">
        <h1 className="text-title font-semibold tracking-tight">{typeof title === "string" ? <SafeText text={title} /> : title}</h1>
        {description && (
          <p className="mt-1.5 max-w-3xl text-ink-muted">
            <SafeText text={description} />
          </p>
        )}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

// The shared empty state (UI-03); kept here so existing imports work.
export { EmptyState } from "@/features/ui/Display";
