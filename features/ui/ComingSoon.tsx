import { Lock } from "lucide-react";

// D-307 (owner): a module the person hasn't been given yet is shown as a
// blurred card marked "Coming soon": they see that it exists, never what is in
// it, and can't open it. (A page set to Hidden in Page access is not shown at
// all; this is only for modules not given.) Nothing real is rendered under
// the blur: the lines are placeholders, so no data reaches the browser.
export function ComingSoonCard({ title, body, className = "", lines = 3, testId }: { title: string; body?: string; className?: string; lines?: number; testId?: string }) {
  return (
    <section
      aria-label={`${title}: coming soon`}
      data-testid={testId ?? "coming-soon"}
      data-coming-soon={title}
      className={`card relative min-w-0 select-none overflow-hidden px-4 py-4 sm:px-5 ${className}`}
    >
      <div aria-hidden="true" className="pointer-events-none blur-[3px]">
        <p className="font-semibold text-ink">{title}</p>
        <div className="mt-3 space-y-2">
          {Array.from({ length: lines }, (_, index) => (
            <div key={index} className="flex items-center gap-3">
              <span className="h-3 w-3 shrink-0 rounded-full bg-primary-200" />
              <span className="h-2.5 rounded bg-line-strong" style={{ width: `${82 - index * 14}%` }} />
            </div>
          ))}
        </div>
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-surface/55 px-4 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-raised px-3 py-1 text-label font-semibold text-ink shadow-card">
          <Lock aria-hidden="true" className="h-3.5 w-3.5" /> {title}: coming soon
        </span>
        {body && <span className="text-caption text-ink-muted">{body}</span>}
      </div>
    </section>
  );
}

// A tab or choice of a module not given yet: shown, locked, not a link.
export function ComingSoonChip({ label, className = "" }: { label: string; className?: string }) {
  return (
    <span
      aria-disabled="true"
      title={`${label}: coming soon`}
      data-coming-soon={label}
      className={`inline-flex cursor-not-allowed select-none items-center gap-1 rounded-md px-3 py-1.5 text-label font-medium text-ink-faint ${className}`}
    >
      <Lock aria-hidden="true" className="h-3.5 w-3.5" />
      <span className="blur-[0.6px]">{label}</span>
      <span className="sr-only">: coming soon</span>
      <span aria-hidden="true" className="rounded bg-surface-muted px-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
        Soon
      </span>
    </span>
  );
}

// A project's name for someone without the Projects module: plain text with a
// lock, never a link (D-307: "name only, no link").
export function LockedProjectName({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span title="Projects: coming soon" data-locked-project className={`inline-flex min-w-0 items-center gap-1 text-ink-muted ${className}`}>
      <Lock aria-hidden="true" className="h-3 w-3 shrink-0" />
      <span className="truncate">{name}</span>
    </span>
  );
}
