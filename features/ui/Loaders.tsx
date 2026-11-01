import { CmsMark } from "@/features/ui/Brand";
import { BrandAnimation } from "@/features/ui/BrandAnimation";

// v1.42.0 (owner's "Application Loading & Skeleton System" sheet): the
// loaders and the animated outcomes, in the brand's blues. Each one says
// what is happening in words (screen readers hear it once); the motion is
// decoration and stops for people who turn motion off (globals.css).

// The logo spinner: a blue arc turning round the ARS-CMS mark.
export function LogoSpinner({ size = 72, label = "Loading…" }: { size?: number; label?: string }) {
  return (
    <span role="status" aria-label={label} className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }} data-testid="logo-spinner">
      <svg viewBox="0 0 48 48" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <circle cx="24" cy="24" r="21" fill="none" stroke="var(--brand-wave-2)" strokeWidth="3" />
        <circle cx="24" cy="24" r="21" fill="none" stroke="var(--brand-accent)" strokeWidth="3" strokeLinecap="round" strokeDasharray="44 132" className="brand-spin" />
      </svg>
      <CmsMark className="h-[52%] w-[52%]" />
    </span>
  );
}

// Three dots, for a part of a page that is loading.
export function DotsLoader({ label = "Loading…", showLabel = true }: { label?: string; showLabel?: boolean }) {
  return (
    <span role="status" className="inline-flex flex-col items-center gap-2 text-label text-ink-muted" data-testid="dots-loader">
      <span className="flex gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((dot) => (
          <span key={dot} className="brand-dot h-2.5 w-2.5 rounded-full bg-[color:var(--brand-accent)]" style={{ animationDelay: `${dot * 0.15}s` }} />
        ))}
      </span>
      <span className={showLabel ? "" : "sr-only"}>{label}</span>
    </span>
  );
}

// A long job with a known share done.
export function CircularProgress({ value, label = "Processing…", size = 88 }: { value: number; label?: string; size?: number }) {
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  const circumference = 2 * Math.PI * 20;
  return (
    <span className="inline-flex flex-col items-center gap-2" data-testid="circular-progress">
      <span className="relative grid place-items-center" style={{ width: size, height: size }} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <svg viewBox="0 0 48 48" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="24" cy="24" r="20" fill="none" stroke="var(--brand-wave-2)" strokeWidth="4" />
          <circle cx="24" cy="24" r="20" fill="none" stroke="var(--brand-accent)" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(percent / 100) * circumference} ${circumference}`} className="motion-safe:transition-[stroke-dasharray] motion-safe:duration-500" />
        </svg>
        <span className="text-title font-bold tabular-nums">{percent}%</span>
      </span>
      <span className="text-label text-ink-muted">{label}</span>
    </span>
  );
}

// Files on their way up.
export function UploadProgress({ value, label = "Uploading…" }: { value: number | null; label?: string }) {
  const percent = value === null ? null : Math.max(0, Math.min(100, Math.round(value)));
  return (
    <span className="flex w-full max-w-xs flex-col items-center gap-2" data-testid="upload-progress">
      <svg viewBox="0 0 24 24" className="h-9 w-9 text-[color:var(--brand-accent-text)]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 9.5" />
        <path d="M12 12v8M8.8 15.2 12 12l3.2 3.2" className="brand-rise" />
      </svg>
      <span className="relative block h-2 w-full overflow-hidden rounded-full bg-[color:var(--brand-wave-2)]" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined}>
        {percent === null ? (
          <span className="loader-bar absolute inset-y-0 left-0 w-2/5 rounded-full bg-[color:var(--brand-accent)]" />
        ) : (
          <span className="absolute inset-y-0 left-0 rounded-full bg-[color:var(--brand-accent)] motion-safe:transition-[width] motion-safe:duration-300" style={{ width: `${percent}%` }} />
        )}
      </span>
      <span className="text-label text-ink-muted">
        {label}
        {percent !== null && ` ${percent}%`}
      </span>
    </span>
  );
}

// A multi-step flow: done, current, still to come.
export function StepLoader({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex w-full items-start" data-testid="step-loader">
      {steps.map((step, index) => {
        const done = index < current;
        const now = index === current;
        return (
          <li key={step} className="flex flex-1 flex-col items-center gap-1.5 text-center" aria-current={now ? "step" : undefined}>
            <span className="relative flex w-full items-center">
              <span className={`h-0.5 flex-1 ${index === 0 ? "opacity-0" : done || now ? "bg-[color:var(--brand-accent)]" : "bg-line"}`} />
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${done ? "bg-[color:var(--brand-accent)] text-white" : now ? "border-[3px] border-[color:var(--brand-accent)] bg-surface" : "bg-line"}`}>
                {done ? (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                ) : now ? (
                  <span className="brand-pulse h-2.5 w-2.5 rounded-full bg-[color:var(--brand-accent)]" />
                ) : null}
              </span>
              <span className={`h-0.5 flex-1 ${index === steps.length - 1 ? "opacity-0" : done ? "bg-[color:var(--brand-accent)]" : "bg-line"}`} />
            </span>
            <span className={`text-label ${now ? "font-semibold text-[color:var(--brand-accent-text)]" : "text-ink-muted"}`}>{step}</span>
          </li>
        );
      })}
    </ol>
  );
}

// "Loading data… This won't take long." for an area fetching its contents.
export function LoadingState({ title = "Loading data…", body = "This won't take long." }: { title?: string; body?: string }) {
  return (
    <div role="status" className="flex flex-col items-center px-4 py-8 text-center" data-testid="loading-state">
      <span className="relative mb-3 grid h-20 w-24 place-items-center" aria-hidden="true">
        <span className="absolute inset-x-0 bottom-1 h-12 rounded-full bg-[color:var(--brand-wave-1)]" />
        <span className="relative grid h-14 w-11 place-items-center rounded-md border border-line bg-surface shadow-card">
          <span className="block space-y-1">
            <span className="block h-1 w-6 rounded bg-[color:var(--brand-wave-2)]" />
            <span className="block h-1 w-5 rounded bg-[color:var(--brand-wave-2)]" />
            <span className="block h-1 w-6 rounded bg-[color:var(--brand-wave-2)]" />
          </span>
        </span>
        <span className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-surface">
          <BrandAnimation name="loading" className="h-8 w-8" />
        </span>
      </span>
      <p className="font-semibold">{title}</p>
      <p className="text-label text-ink-muted">{body}</p>
    </div>
  );
}

// ---- Animated outcomes -------------------------------------------------------
// A circle draws itself, then the tick (or cross). Used for a finished task,
// a submitted request, a recorded decision and a failed action.

export function SuccessTick({ className = "h-12 w-12", label }: { className?: string; label?: string }) {
  return (
    <svg viewBox="0 0 52 52" className={`brand-pop shrink-0 ${className}`} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} data-testid="success-tick">
      <circle cx="26" cy="26" r="24" fill="var(--color-success-solid)" className="brand-fill" />
      <circle cx="26" cy="26" r="24" fill="none" stroke="var(--color-success-solid)" strokeWidth="3" className="brand-draw-circle" />
      <path d="m15 27 7.5 7.5L38 19" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" className="brand-draw-tick" />
    </svg>
  );
}

// The task checkbox's own tick, for the moment a task is completed.
export function TaskDoneTick({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`brand-pop shrink-0 ${className}`} aria-hidden="true" data-testid="task-done-tick">
      <circle cx="12" cy="12" r="11" fill="var(--color-success-solid)" />
      <path d="m7 12.5 3.2 3.2L17 9" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="brand-draw-tick" />
    </svg>
  );
}

export function FailedCross({ className = "h-12 w-12", label }: { className?: string; label?: string }) {
  return (
    <svg viewBox="0 0 52 52" className={`brand-shake shrink-0 ${className}`} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} data-testid="failed-cross">
      <circle cx="26" cy="26" r="24" fill="var(--color-error-solid, #c81e1e)" className="brand-fill" />
      <circle cx="26" cy="26" r="24" fill="none" stroke="var(--color-error-solid, #c81e1e)" strokeWidth="3" className="brand-draw-circle" />
      <path d="M18 18l16 16M34 18 18 34" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" className="brand-draw-tick" />
    </svg>
  );
}

export function WarningPulse({ className = "h-12 w-12", label }: { className?: string; label?: string }) {
  return (
    <svg viewBox="0 0 52 52" className={`brand-pop shrink-0 ${className}`} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <circle cx="26" cy="26" r="24" fill="var(--color-warning-solid)" className="brand-pulse-ring" />
      <path d="M26 14v15" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
      <circle cx="26" cy="37" r="2.8" fill="#fff" />
    </svg>
  );
}
