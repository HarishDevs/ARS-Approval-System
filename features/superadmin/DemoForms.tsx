"use client";

import { loadDemoAction, retireDemoAction, tryAsAction } from "@/app/superadmin/demo/actions";
import { ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";

// F-57 demo data controls (D-071).
export function LoadDemoForm() {
  const { result, pending, onSubmit } = useActionForm(loadDemoAction);
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <SubmitButton pending={pending} className="btn-compact">
        Load demo data
      </SubmitButton>
      <ResultMessage result={result} />
    </form>
  );
}

export function RetireDemoForm() {
  const { result, pending, onSubmit, confirmBar } = useActionForm(retireDemoAction, {
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
