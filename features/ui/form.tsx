"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import type { ActionResult } from "@/lib/http/action-result";

// Server Action forms. React 19 resets a <form action={…}> after every
// submit, which wipes what the user typed when the server returns a
// validation error. useActionForm submits through onSubmit instead, so the
// fields keep their values; a form can still ask to be cleared after a
// successful save (e.g. an "add" row, or a secret key field).
type Action = (previous: ActionResult | null, formData: FormData) => Promise<ActionResult>;

export function useActionForm(action: Action, options: { resetOnSuccess?: boolean; confirm?: string } = {}) {
  const [result, dispatch, pending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  const { resetOnSuccess, confirm } = options;

  useEffect(() => {
    if (result?.ok && resetOnSuccess) formRef.current?.reset();
  }, [result, resetOnSuccess]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirm && !window.confirm(confirm)) return;
    // Include the pressed button's name/value (forms with several actions).
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => dispatch(formData));
  }

  return { result, pending, formRef, onSubmit };
}

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
    <button type="submit" disabled={pending} className={`${variant === "primary" ? "btn-primary" : "btn-secondary"} ${className}`}>
      {pending ? "Working…" : children}
    </button>
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
