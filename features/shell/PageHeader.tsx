import { SafeText } from "@/features/ui/SafeText";

// Page title (h1), one line of help, and the page's primary actions in the
// same bar (S9-07).
export function PageHeader({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-title font-semibold tracking-tight">{title}</h1>
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

// Compact empty state with an icon (S9-08).
export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-dashed border-line bg-surface px-5 py-5">
      <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-muted text-ink-faint">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3 13h4l2 3h6l2-3h4" />
          <path d="M5 13 7 5h10l2 8v6H5v-6Z" />
        </svg>
      </span>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-label text-ink-muted">
          <SafeText text={body} />
        </p>
      </div>
    </div>
  );
}
