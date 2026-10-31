"use client";

import { Check, Link2, Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { completeAction } from "@/app/users/work/actions";
import { actionErrorMessage, guardCall, UNEXPECTED } from "@/features/ui/form";
import { useToast } from "@/features/ui/Toast";
import type { ActionResult } from "@/lib/http/action-result";
import { COPY_BLOCKED, copyText } from "@/features/ui/clipboard";

// D-215: small shared pieces of the Task & Project Management screens.

// D-217: a date that lands on a holiday comes back as `holiday`; the person
// is asked (HolidayPrompt) to keep it or move it, and the call runs again.
export interface HolidayInfo {
  day: string;
  name: string;
  suggestion: string;
  mode: "WARN" | "BLOCK";
  field: "due" | "start";
}
export type HolidayChoice = { holidayOk?: true; moveTo?: string };
const HOLIDAY_EVENT = "ars:task-holiday";
function askHoliday(info: HolidayInfo): Promise<HolidayChoice | null> {
  return new Promise((resolve) => {
    // The prompt takes the question (preventDefault); without one, nothing changes.
    const taken = !window.dispatchEvent(new CustomEvent(HOLIDAY_EVENT, { detail: { info, resolve }, cancelable: true }));
    if (!taken) resolve(null);
  });
}

// Run a server action from a click: errors become a toast; success refreshes
// the page so it shows what the server now holds.
export function useWorkCall() {
  const toast = useToast();
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  // D-233: busy while a call runs (callers disable their buttons), and every
  // call is guarded like a form: time limit, offline, ended session, slowness.
  const [running, setRunning] = useState(0);
  const pending = refreshing || running > 0;
  const call = useCallback(
    async <T extends ActionResult & { holiday?: HolidayInfo }>(run: (choice?: HolidayChoice) => Promise<T>, options: { success?: string | false } = {}): Promise<T | null> => {
      setRunning((count) => count + 1);
      try {
        let result = (await guardCall(() => run())) as T;
        if (!result.ok && result.holiday) {
          const choice = await askHoliday(result.holiday);
          if (!choice) return result;
          result = (await guardCall(() => run(choice))) as T;
        }
        if (!result.ok) {
          toast({ tone: "error", title: result.message || "Couldn't do that." });
          return result;
        }
        // D-233 (partial success): some done and some not is a warning, not a green tick.
        const partial = Number((result as { value?: { failed?: number } }).value?.failed ?? 0) > 0;
        if (partial) toast({ tone: "warning", title: result.message || "Some of them couldn't be changed." });
        else if (options.success !== false && (options.success || result.message)) toast({ tone: "success", title: options.success || result.message || "Saved." });
        startTransition(() => router.refresh());
        return result;
      } catch (error) {
        toast({ tone: "error", title: actionErrorMessage(error) ?? UNEXPECTED });
        return null;
      } finally {
        setRunning((count) => count - 1);
      }
    },
    [router, toast],
  );
  return { call, pending };
}

// The round "complete" button of every task row. Completing shows Undo.
export function TaskCheck({ taskId, done, disabled, label, size = "md" }: { taskId: number; done: boolean; disabled?: boolean; label: string; size?: "sm" | "md" }) {
  const { call } = useWorkCall();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const shown = optimistic ?? done;
  const toggle = async () => {
    if (busy || disabled) return;
    setBusy(true);
    setOptimistic(!shown);
    const result = await call(() => completeAction(taskId), { success: false });
    if (!result?.ok) setOptimistic(null);
    else if (!shown)
      toast({
        tone: "success",
        title: `Completed: ${label}`,
        action: { label: "Undo", onClick: () => void call(() => completeAction(taskId), { success: "Reopened." }) },
      });
    setBusy(false);
  };
  const box = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={shown}
      aria-label={`${shown ? "Reopen" : "Complete"} ${label}`}
      title={disabled ? "You can't complete this task" : shown ? "Reopen" : "Mark complete"}
      disabled={disabled || busy}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void toggle();
      }}
      data-testid="task-check"
      className={`flex ${box} shrink-0 items-center justify-center rounded-full border transition ${
        shown ? "border-success-600 bg-success-600 text-white" : "border-line-strong text-transparent hover:border-success-600 hover:text-success-600"
      } disabled:cursor-not-allowed disabled:opacity-60`}
    >
      <Check aria-hidden="true" className="h-3 w-3" strokeWidth={3} />
    </button>
  );
}

export const COLOR_HEX: Record<string, string> = {
  green: "#2f855a",
  blue: "#2b6cb0",
  teal: "#2c7a7b",
  amber: "#b7791f",
  red: "#c53030",
  purple: "#6b46c1",
  pink: "#b83280",
  gray: "#718096",
};
export function ProjectDot({ color, className = "h-2.5 w-2.5" }: { color: string; className?: string }) {
  return <span aria-hidden="true" className={`inline-block shrink-0 rounded-sm ${className}`} style={{ backgroundColor: COLOR_HEX[color] ?? COLOR_HEX.gray }} />;
}

// The question itself, once per page (mounted in the users layout).
export function HolidayPrompt() {
  const [ask, setAsk] = useState<{ info: HolidayInfo; resolve: (choice: HolidayChoice | null) => void } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const onAsk = (event: Event) => {
      event.preventDefault();
      setAsk((event as CustomEvent).detail);
    };
    window.addEventListener(HOLIDAY_EVENT, onAsk);
    return () => window.removeEventListener(HOLIDAY_EVENT, onAsk);
  }, []);
  useEffect(() => {
    if (ask && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [ask]);
  const answer = (choice: HolidayChoice | null) => {
    ask?.resolve(choice);
    setAsk(null);
    dialog.current?.close();
  };
  return (
    <dialog ref={dialog} aria-labelledby="holiday-title" onCancel={() => answer(null)} className="w-[calc(100%-2rem)] max-w-md rounded-xl border border-line bg-raised p-0 text-ink shadow-overlay backdrop:bg-overlay" data-testid="holiday-prompt">
      {ask && (
        <div className="space-y-3 p-5">
          <h2 id="holiday-title" className="font-semibold">
            {ask.info.day} is a holiday
          </h2>
          <p className="text-body">
            {ask.info.name}. {ask.info.mode === "BLOCK" ? "Tasks can't be dated on holidays here; choose a working day." : `Keep the ${ask.info.field === "due" ? "due" : "start"} date anyway, or move it to a working day?`}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary btn-compact" onClick={() => answer({ moveTo: ask.info.suggestion })}>
              Move to {ask.info.suggestion}
            </button>
            {ask.info.mode === "WARN" && (
              <button type="button" className="btn-secondary btn-compact" onClick={() => answer({ holidayOk: true })}>
                Keep {ask.info.day}
              </button>
            )}
            <button type="button" className="btn-secondary btn-compact" onClick={() => answer(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

// D-219: Asana's "Mark complete" button for a task's page and panel header.
export function TaskCompleteButton({ taskId, done, disabled, title }: { taskId: number; done: boolean; disabled?: boolean; title: string }) {
  const { call, pending } = useWorkCall();
  const [shown, setShown] = useState(done);
  useEffect(() => setShown(done), [done]);
  return (
    <button
      type="button"
      aria-pressed={shown}
      disabled={disabled || pending}
      title={disabled ? "You can't complete this task" : undefined}
      onClick={() => {
        const next = !shown;
        setShown(next);
        void call(() => completeAction(taskId), { success: next ? `Completed: ${title}` : "Reopened." }).then((result) => {
          if (!result?.ok) setShown(!next);
        });
      }}
      data-testid="mark-complete"
      className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-label font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
        shown ? "border-success-600 bg-success-50 text-success-600" : "border-line-strong text-ink hover:border-success-600 hover:text-success-600"
      }`}
    >
      <Check aria-hidden="true" className="h-4 w-4" strokeWidth={3} />
      {shown ? "Completed" : "Mark complete"}
    </button>
  );
}

// D-219: in Task & Project Management a task opens in the pane beside the
// list (?task=<id>, the rest of the address kept); elsewhere, its own page.
export function usePaneLink() {
  const pathname = usePathname();
  const params = useSearchParams();
  return useCallback(
    (id: number) => {
      if (!pathname.startsWith("/users/work")) return `/users/tasks/${id}`;
      const query = new URLSearchParams(params.toString());
      query.set("task", String(id));
      return `${pathname}?${query}`;
    },
    [pathname, params],
  );
}

// D-219 (catalog S-17): copy a task's link.
export function CopyLinkButton({ path, label = "Copy task link" }: { path: string; label?: string }) {
  const toast = useToast();
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() =>
        void copyText(`${window.location.origin}${path}`).then((done) => toast(done ? { tone: "success", title: "Link copied." } : { tone: "error", title: `${COPY_BLOCKED} ${window.location.origin}${path}` }))
      }
      className="rounded p-1 text-ink-muted hover:bg-surface-muted hover:text-ink"
    >
      <Link2 aria-hidden="true" className="h-4 w-4" />
    </button>
  );
}

// D-219: "+ Create task" anywhere in the Tasks area opens the left bar's dialog.
export const CREATE_TASK_EVENT = "ars:create-task";
export function CreateTaskButton({ label = "Create task" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(CREATE_TASK_EVENT))} className="btn-secondary btn-compact inline-flex items-center gap-1">
      <Plus aria-hidden="true" className="h-4 w-4" /> {label}
    </button>
  );
}
