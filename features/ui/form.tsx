"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ActionResult } from "@/lib/http/action-result";
import { Spinner } from "@/features/ui/Spinner";

// Server Action forms. React 19 resets a <form action={…}> after every
// submit, which wipes what the user typed when the server returns a
// validation error. useActionForm submits through onSubmit instead, so the
// fields keep their values; a form can still ask to be cleared after a
// successful save (e.g. an "add" row, or a secret key field).
type Action = (previous: ActionResult | null, formData: FormData) => Promise<ActionResult>;

// QA session 14 (DEF-02/03/07). A Server Action that can't be reached, or
// answers with something that isn't its normal reply (an error page, a
// sign-in redirect, a cut connection), used to throw into React and replace
// the whole page with "Application error", losing what was typed. Every form
// now gets a plain message instead, keeps its fields, and never waits
// forever: after ACTION_TIMEOUT_MS it stops waiting and says the action may
// still have gone through.
export const ACTION_TIMEOUT_MS = 30_000;
export const SESSION_ENDED = "Your session has ended. Sign in again to continue (copy anything you typed first).";
const OFFLINE = "You're offline. Check your connection, then try again — what you typed is still here.";
const UNREACHABLE = "Couldn't reach the server. Check your connection and try again — what you typed is still here.";
const TIMED_OUT = "This is taking longer than expected. It may still go through, so check before trying again.";

async function signedIn(): Promise<boolean | null> {
  try {
    const response = await fetch("/api/auth/status", { cache: "no-store" });
    if (!response.ok) return null;
    return ((await response.json()) as { signedIn?: boolean }).signedIn === true;
  } catch {
    return null;
  }
}

export function guardAction(action: Action, timeoutMs = ACTION_TIMEOUT_MS): Action {
  return async (previous, formData) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<ActionResult>((resolve) => {
      timer = setTimeout(() => resolve({ ok: false, message: TIMED_OUT }), timeoutMs);
    });
    try {
      const result = await Promise.race([action(previous, formData), timeout]);
      // Actions answer "Not found." to anyone they can't identify; when that
      // is because the session ended, say so (DEF-07).
      if (!result.ok && result.message === "Not found." && (await signedIn()) === false) return { ok: false, message: SESSION_ENDED };
      return result;
    } catch {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return { ok: false, message: OFFLINE };
      return { ok: false, message: (await signedIn()) === false ? SESSION_ENDED : UNREACHABLE };
    } finally {
      clearTimeout(timer);
    }
  };
}

// A form with `confirm` asks in the page, not with window.confirm: embedded
// browsers and some managed browsers block pop-up dialogs silently, which
// made the action look dead. Render `confirmBar` inside the form.
export function useActionForm(action: Action, options: { resetOnSuccess?: boolean; confirm?: string } = {}) {
  const guarded = useMemo(() => guardAction(action), [action]);
  // Busy state is the form's own (QA session 14): React's useActionState
  // stays "pending" until the Server Action's own request settles, so a
  // time limit could not end the spinner. One submit at a time.
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const latest = useRef<ActionResult | null>(null);
  function dispatch(formData: FormData) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    void guarded(latest.current, formData)
      .then((next) => {
        latest.current = next;
        setResult(next);
      })
      .finally(() => {
        busy.current = false;
        setPending(false);
      });
  }
  const [awaiting, setAwaiting] = useState<FormData | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const { resetOnSuccess, confirm } = options;

  useEffect(() => {
    if (result?.ok && resetOnSuccess) formRef.current?.reset();
  }, [result, resetOnSuccess]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Include the pressed button's name/value (forms with several actions).
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const formData = new FormData(event.currentTarget, submitter);
    if (confirm) {
      setAwaiting(formData);
      return;
    }
    dispatch(formData);
  }

  const confirmBar = awaiting ? (
    <div role="alertdialog" aria-label="Please confirm" className="mt-2 space-y-2 rounded-md border border-warning-600/40 bg-warning-50 px-3 py-2 text-label">
      <p>{confirm}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-primary btn-compact"
          onClick={() => {
            const formData = awaiting;
            setAwaiting(null);
            dispatch(formData);
          }}
        >
          Yes, continue
        </button>
        <button type="button" className="btn-secondary btn-compact" onClick={() => setAwaiting(null)}>
          Cancel
        </button>
      </div>
    </div>
  ) : null;

  return { result, pending, formRef, onSubmit, confirmBar };
}

// While busy the button keeps its width (the label stays, hidden) and shows
// a spinner; a polite live region tells screen readers (DEF-05/08).
export function SubmitButton({
  children,
  pending,
  variant = "primary",
  className = "",
}: {
  children: React.ReactNode;
  pending: boolean;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  return (
    <>
      <button type="submit" disabled={pending} aria-busy={pending || undefined} className={`${variant === "primary" ? "btn-primary" : "btn-secondary"} relative shrink-0 ${className}`}>
        <span className={`whitespace-nowrap ${pending ? "invisible" : ""}`}>{children}</span>
        {pending && (
          <span className="absolute inset-0 flex items-center justify-center gap-1.5">
            <Spinner />
            <span className="sr-only">Working…</span>
          </span>
        )}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {pending ? "Working…" : ""}
      </span>
    </>
  );
}

export function ResultMessage({ result }: { result: ActionResult | null }) {
  if (!result?.message) return null;
  return (
    <p
      role={result.ok ? "status" : "alert"}
      className={`rounded-md border px-3 py-2 text-label ${
        result.ok ? "border-transparent bg-success-50 text-success-600" : "border-danger-200 bg-danger-50 text-danger-600"
      }`}
    >
      {result.message}
    </p>
  );
}

export function FieldError({ result, name }: { result: ActionResult | null; name: string }) {
  const message = result && !result.ok ? result.fieldErrors?.[name] : undefined;
  if (!message) return null;
  return <p className="mt-1 text-caption text-danger-600">{message}</p>;
}
