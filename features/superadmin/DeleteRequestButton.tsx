"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { deleteRequestAction } from "@/app/superadmin/requests/actions";
import { FieldError, ResultMessage, useActionForm } from "@/features/ui/form";
import { Spinner } from "@/features/ui/Spinner";

// Super Admin: delete a request with a reason (D-086, F-73). Opens in place;
// a second, red button confirms. While deleting, a spinner shows and the
// buttons are locked.
export function DeleteRequestButton({ requestId, requestNo, redirectTo }: { requestId: number; requestNo: string; redirectTo?: string }) {
  const [open, setOpen] = useState(false);
  const { result, pending, onSubmit } = useActionForm(deleteRequestAction);
  const router = useRouter();

  // From a list the row disappears on refresh; from the request page the
  // server action sends the browser to `redirectTo`.
  useEffect(() => {
    if (result?.ok) router.refresh();
  }, [result, router]);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary btn-compact border-danger-200 text-danger-600 hover:bg-danger-50">
        Delete
      </button>
    );
  }
  return (
    <form onSubmit={onSubmit} className="w-full min-w-[260px] space-y-2 rounded-md border border-danger-200 bg-danger-50 p-3 text-left" aria-label={`Delete ${requestNo}`}>
      <input type="hidden" name="requestId" value={requestId} />
      {redirectTo && <input type="hidden" name="next" value={redirectTo} />}
      <label className="block text-label font-semibold text-danger-600" htmlFor={`reason-${requestId}`}>
        Delete {requestNo}? Why?
      </label>
      <textarea id={`reason-${requestId}`} name="reason" rows={2} maxLength={500} required className="field-input h-auto py-2" placeholder="e.g. Test request raised by mistake" />
      <FieldError result={result} name="reason" />
      <p className="text-caption text-ink-muted">It disappears from every screen, queue and dashboard, and pending approvals are cancelled. The record stays in the audit log. There is no undo.</p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className="btn-compact inline-flex h-9 items-center gap-2 rounded-md bg-danger-600 px-3 text-label font-semibold text-white disabled:opacity-60">
          {pending && <Spinner />}
          {pending ? "Deleting…" : "Yes, delete"}
        </button>
        <button type="button" disabled={pending} onClick={() => setOpen(false)} className="btn-secondary btn-compact">
          Cancel
        </button>
      </div>
      {result && !result.ok && <ResultMessage result={result} />}
    </form>
  );
}
