"use client";

import { loadDemoAction, retireDemoAction, tryAsAction } from "@/app/superadmin/demo/actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { DEMO_CONFIRM_WORD } from "@/server/demo/demo-data";

// F-57 demo data controls (D-071).
// V181-A8 (AUD-25, REC-21): loading asks first and needs the typed word; the
// server also refuses it on a database already in real use.
export function LoadDemoForm() {
  const { result, pending, onSubmit, confirmBar } = useActionForm(loadDemoAction, {
    confirmTitle: "Load demo data into this database?",
    confirmLabel: "Yes, load demo data",
    confirmTone: "danger",
    confirm:
      "This adds 20 demo people, demo departments, designations and approver groups, and 12 published approval types to this database. They can be retired later but never deleted. Only do this on a new or test installation.",
  });
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block text-label font-semibold" htmlFor="demo-confirm-text">
        Type {DEMO_CONFIRM_WORD} to confirm
      </label>
      <input id="demo-confirm-text" name="confirmText" required autoComplete="off" spellCheck={false} className="field-input max-w-xs" placeholder={DEMO_CONFIRM_WORD} />
      <FieldError result={result} name="confirmText" />
      <SubmitButton pending={pending} className="btn-compact">
        Load demo data
      </SubmitButton>
      <ResultMessage result={result} />
      {confirmBar}
    </form>
  );
}

export function RetireDemoForm() {
  const { result, pending, onSubmit, confirmBar } = useActionForm(retireDemoAction, {
    confirmTitle: "Retire the demo people?",
    confirmLabel: "Yes, retire them",
    confirmTone: "danger",
    confirm: "Make every demo person inactive? Approvals still waiting with them will block until IT hands them over.",
  });
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <SubmitButton pending={pending} variant="secondary" className="btn-compact">
        Retire demo staff
      </SubmitButton>
      <ResultMessage result={result} />
      {confirmBar}
    </form>
  );
}

export function TryAsButton({ userId, name }: { userId: number; name: string }) {
  const { result, pending, onSubmit, confirmBar } = useActionForm(tryAsAction, {
    confirmTitle: `Try the app as ${name}?`,
    confirmLabel: "Yes, switch",
    confirm: `Continue as ${name}? You'll be signed out of your Super Admin session; sign in again to come back.`,
  });
  return (
    <form onSubmit={onSubmit} className="space-y-1">
      <input type="hidden" name="userId" value={userId} />
      <button type="submit" disabled={pending} className="btn-secondary btn-compact h-8">
        {pending ? "Switching…" : "Try as"}
      </button>
      {result && !result.ok && <ResultMessage result={result} />}
      {confirmBar}
    </form>
  );
}
