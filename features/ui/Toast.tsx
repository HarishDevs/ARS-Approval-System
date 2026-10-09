"use client";

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

// Toasts (FB-03). Polite announcements for success and info, assertive for
// errors. Each has an icon and words (never colour alone), can be closed,
// and can offer one action (e.g. Undo). They don't take focus, so typing
// and keyboard navigation carry on.
export type ToastTone = "success" | "info" | "warning" | "error";
export interface ToastInput {
  tone?: ToastTone;
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void | Promise<void> };
  durationMs?: number;
}
interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

export function useToast(): (toast: ToastInput) => void {
  const context = useContext(ToastContext);
  // Outside the provider (tests, isolated renders) toasts are a no-op.
  return context ?? (() => undefined);
}

const ICON = { success: CheckCircle2, info: Info, warning: AlertTriangle, error: XCircle };
const STYLE: Record<ToastTone, string> = {
  success: "text-success-600",
  info: "text-info-600",
  warning: "text-warning-600",
  error: "text-danger-600",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => setItems((current) => current.filter((item) => item.id !== id)), []);
  const show = useCallback((toast: ToastInput) => {
    const id = next.current++;
    setItems((current) => [...current.slice(-3), { ...toast, id }]);
  }, []);
  const value = useMemo(() => show, [show]);
  const polite = items.filter((item) => item.tone !== "error");
  const assertive = items.filter((item) => item.tone === "error");
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-toast flex flex-col items-center gap-2 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:bottom-auto sm:left-auto sm:right-0 sm:top-[calc(var(--topbar,64px)+0.5rem)] sm:items-end max-md:mb-16">
        <div role="status" aria-live="polite" className="contents">
          {polite.map((item) => (
            <ToastCard key={item.id} item={item} onDismiss={dismiss} />
          ))}
        </div>
        <div role="alert" aria-live="assertive" className="contents">
          {assertive.map((item) => (
            <ToastCard key={item.id} item={item} onDismiss={dismiss} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const tone = item.tone ?? "success";
  const Icon = ICON[tone];
  const [paused, setPaused] = useState(false);
  const duration = item.durationMs ?? (item.action ? 8000 : tone === "error" ? 10000 : 5000);
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => onDismiss(item.id), duration);
    return () => clearTimeout(timer);
  }, [paused, duration, item.id, onDismiss]);
  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-line bg-raised px-4 py-3 text-label shadow-overlay motion-safe:animate-[toast-in_var(--motion-base)_var(--ease-standard)]"
    >
      <Icon aria-hidden="true" className={`mt-0.5 h-5 w-5 shrink-0 ${STYLE[tone]}`} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">{item.title}</p>
        {item.body && <p className="text-ink-muted">{item.body}</p>}
        {item.action && (
          <button
            type="button"
            className="link mt-1"
            onClick={async () => {
              onDismiss(item.id);
              await item.action?.onClick();
            }}
          >
            {item.action.label}
          </button>
        )}
      </div>
      <button type="button" onClick={() => onDismiss(item.id)} aria-label="Dismiss" className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-ink-muted hover:bg-surface-muted hover:text-ink">
        <X aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );
}
