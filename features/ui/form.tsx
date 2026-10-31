"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/http/action-result";
import { Spinner } from "@/features/ui/Spinner";
import { ConfirmDialog } from "@/features/ui/Dialog";

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
// FB-04: the shell's session watcher listens for this and shows its dialog.
export const SESSION_ENDED_EVENT = "ars:session-ended";
function announceSessionEnded() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SESSION_ENDED_EVENT));
}
export const SESSION_ENDED = "Your session has ended. Sign in again to continue (copy anything you typed first).";
const OFFLINE = "You're offline. Check your connection, then try again — what you typed is still here.";
const UNREACHABLE = "Couldn't reach the server. Check your connection and try again — what you typed is still here.";
const TIMED_OUT = "This is taking longer than expected. It may still go through, so check before trying again.";

// v1.12.5 (D-164): every publish builds new Server Action ids, so a page
// opened before a publish can't reach the new server's actions: Next throws
// UnrecognizedActionError. That, and an error the server itself hit, used to
// show as "Couldn't reach the server" for every submit and delete until the
// page was reloaded. Now each says what happened.
export const APP_UPDATED_EVENT = "ars:app-updated";
export const APP_UPDATED = "ARS was updated since this page opened, so this didn't go through. Reload the page and try again (copy anything you typed first).";
export const UNEXPECTED = "The server sent back an unexpected answer, so this may not have gone through. Reload the page and check before trying again.";
const serverError = (reference: string) => `Something went wrong on the server, so this wasn't saved. Try again; if it keeps happening, tell IT the reference ${reference}.`;

// The plain message for an error thrown by a Server Action call, or null
// when the request never got an answer (offline, cut connection).
export function actionErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const { name, message, digest } = error as { name?: unknown; message?: unknown; digest?: unknown };
  if (name === "UnrecognizedActionError") {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(APP_UPDATED_EVENT));
    return APP_UPDATED;
  }
  if (typeof digest === "string" && /^[\w-]{1,40}$/.test(digest)) return serverError(digest);
  if (name === "TypeError" || typeof message !== "string") return null; // fetch failed
  return UNEXPECTED;
}

async function signedIn(): Promise<boolean | null> {
  try {
    const response = await fetch("/api/auth/status", { cache: "no-store" });
    if (!response.ok) return null;
    return ((await response.json()) as { signedIn?: boolean }).signedIn === true;
  } catch {
    return null;
  }
}

// D-233 (UI states): a call still running after SLOW_AFTER_MS says so
// (the shell's SlowNetworkNotice listens), well before the time limit.
// There is no percentage: the real progress isn't known.
// D-233: fired on a form once its action has saved it.
export const SAVED_EVENT = "ars:saved";
export const SLOW_EVENT = "ars:slow";
export const SLOW_AFTER_MS = 8_000;
// D-233: a refusal on a page the person may only view says so, instead of "Not found."
export const VIEW_ONLY = "This page is view-only for you, so nothing was changed.";
let slowSeq = 0;
function slowSignal(id: number, on: boolean) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(SLOW_EVENT, { detail: { id, on } }));
}

// D-233: one guarded call for every way the app runs a Server Action
// (forms, the task area's clicks, saved views…): a time limit, offline,
// ended session, view-only, app updated and server errors all answer in
// words, and slowness is announced. It never throws.
export async function guardCall<T extends ActionResult>(run: () => Promise<T>, timeoutMs = ACTION_TIMEOUT_MS): Promise<T | ActionResult> {
  const id = ++slowSeq;
  const slow = setTimeout(() => slowSignal(id, true), Math.min(SLOW_AFTER_MS, timeoutMs));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ActionResult>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, message: TIMED_OUT }), timeoutMs);
  });
  try {
    const result = await Promise.race([run(), timeout]);
    // Actions answer "Not found." to anyone they can't identify; when that
    // is because the session ended, say so (DEF-07); on a view-only page,
    // say that instead (D-233).
    if (!result.ok && result.message === "Not found.") {
      const session = await signedIn();
      if (session === false) {
        announceSessionEnded();
        return { ok: false, message: SESSION_ENDED };
      }
      if (session === true && typeof document !== "undefined" && document.querySelector('[data-testid="view-only"]')) return { ok: false, message: VIEW_ONLY };
    }
    return result;
  } catch (error) {
    const known = actionErrorMessage(error);
    if (known && known !== UNEXPECTED) return { ok: false, message: known };
    if (typeof navigator !== "undefined" && navigator.onLine === false) return { ok: false, message: OFFLINE };
    // An ended session answers with the sign-in page (unexpected too).
    if ((await signedIn()) === false) {
      announceSessionEnded();
      return { ok: false, message: SESSION_ENDED };
    }
    return { ok: false, message: known ?? UNREACHABLE };
  } finally {
    clearTimeout(timer);
    clearTimeout(slow);
    slowSignal(id, false);
  }
}

export function guardAction(action: Action, timeoutMs = ACTION_TIMEOUT_MS): Action {
  return (previous, formData) => guardCall(() => action(previous, formData), timeoutMs);
}

// A form with `confirm` asks in the page, not with window.confirm: embedded
// browsers and some managed browsers block pop-up dialogs silently, which
// made the action look dead. Render `confirmBar` inside the form.
export interface ConfirmOptions {
  resetOnSuccess?: boolean;
  confirm?: string; // what will happen, in words
  confirmTitle?: string; // e.g. "Deactivate Lee Leaver?"
  confirmLabel?: string; // the action, named (default "Yes, continue")
  confirmTone?: "primary" | "danger";
  timeoutMs?: number; // D-201: Pico Bot answers take longer than a save
  // Where to go once it is saved, instead of refreshing this page. Done here,
  // not in the caller's effect: the caller's form may be gone after the save.
  successHref?: string;
}

export function useActionForm(action: Action, options: ConfirmOptions = {}) {
  const guarded = useMemo(() => guardAction(action, options.timeoutMs), [action, options.timeoutMs]);
  // Busy state is the form's own (QA session 14): React's useActionState
  // stays "pending" until the Server Action's own request settles, so a
  // time limit could not end the spinner. One submit at a time.
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const latest = useRef<ActionResult | null>(null);
  const router = useRouter();
  function dispatch(formData: FormData) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    void guarded(latest.current, formData)
      .then((next) => {
        latest.current = next;
        setResult(next);
        // The action's revalidatePath answer doesn't always repaint a page
        // that streams behind a loading skeleton (v1.6.0 testing); ask for
        // the page again so what's shown always matches the server.
        if (next.ok && options.successHref) router.replace(options.successHref, { scroll: false });
        else if (next.ok) router.refresh();
      })
      .finally(() => {
        busy.current = false;
        setPending(false);
      });
  }
  const [awaiting, setAwaiting] = useState<FormData | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const { resetOnSuccess, confirm, confirmTitle, confirmLabel, confirmTone } = options;

  useEffect(() => {
    if (result?.ok && resetOnSuccess) formRef.current?.reset();
    // D-233: a saved form has no unsaved changes (UnsavedGuard listens).
    if (result?.ok) formRef.current?.dispatchEvent(new Event(SAVED_EVENT));
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

  // A real dialog (UI-03): focus moves into it, the page behind is inert,
  // Escape cancels and focus returns to the button that asked.
  const confirmBar = confirm ? (
    <ConfirmDialog
      open={awaiting !== null}
      title={confirmTitle ?? "Please confirm"}
      body={confirm}
      confirmLabel={confirmLabel ?? "Yes, continue"}
      tone={confirmTone ?? "primary"}
      onCancel={() => setAwaiting(null)}
      onConfirm={() => {
        const formData = awaiting;
        setAwaiting(null);
        if (formData) dispatch(formData);
      }}
    />
  ) : null;

  return { result, pending, formRef, onSubmit, confirmBar };
}

// While busy the button keeps its width (the label stays, hidden) and shows
// a spinner; a polite live region tells screen readers (DEF-05/08).
export function SubmitButton({ children, pending, variant = "primary", className = "" }: { children: React.ReactNode; pending: boolean; variant?: "primary" | "secondary"; className?: string }) {
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
    <p role={result.ok ? "status" : "alert"} className={`rounded-md border px-3 py-2 text-label ${result.ok ? "border-transparent bg-success-50 text-success-600" : "border-danger-200 bg-danger-50 text-danger-600"}`}>
      {result.message}
    </p>
  );
}

export function FieldError({ result, name }: { result: ActionResult | null; name: string }) {
  const message = result && !result.ok ? result.fieldErrors?.[name] : undefined;
  if (!message) return null;
  return (
    <p id={`${name}-error`} className="mt-1 text-caption text-danger-600">
      {message}
    </p>
  );
}
