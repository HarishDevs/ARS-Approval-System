"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { deleteRequestsAction } from "@/app/superadmin/requests/actions";
import { FieldError, ResultMessage, useActionForm } from "@/features/ui/form";
import { Spinner } from "@/features/ui/Spinner";
import { clearTicks, RowSelectBox, SelectAllBox, useTickedCount } from "@/features/ui/BulkSelect";

// v1.49.5 (owner: "add select and Delete option in this Super admin"):
// a tick box on each row of Super Admin → Requests and one Delete for the
// ticked ones, with a reason, confirmed in place like the row's own Delete.
// The row boxes are server-rendered and join this form by its id.
export const BULK_FORM = "bulk-delete-requests";

// The header's "select all on this page" box.
export function SelectAllRequests() {
  return <SelectAllBox formId={BULK_FORM} label="Select all requests on this page" testId="select-all-requests" />;
}

export function RequestRowCheckbox({ requestId, requestNo }: { requestId: number; requestNo: string }) {
  return <RowSelectBox formId={BULK_FORM} value={requestId} label={`Select ${requestNo}`} testId="select-request" />;
}

export function BulkDeleteRequests() {
  const count = useTickedCount(BULK_FORM);
  const [open, setOpen] = useState(false);
  const { result, pending, onSubmit } = useActionForm(deleteRequestsAction);
  const router = useRouter();

  // After a delete the rows that went are gone; untick the rest so the count starts again.
  useEffect(() => {
    if (result?.data?.deleted) {
      setOpen(false);
      clearTicks(BULK_FORM);
      router.refresh();
    }
  }, [result, router]);
  useEffect(() => {
    if (count === 0) setOpen(false);
  }, [count]);

  const clear = () => clearTicks(BULK_FORM);

  return (
    <form id={BULK_FORM} onSubmit={onSubmit} aria-label="Delete selected requests" className="mb-3 space-y-2" data-testid="bulk-delete">
      {result && <ResultMessage result={result} />}
      {count > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface px-4 py-2" role="status">
          <span className="text-label font-semibold">{count} selected</span>
          {!open && (
            <button type="button" onClick={() => setOpen(true)} className="btn-danger-quiet btn-compact" data-testid="bulk-delete-open">
              Delete selected
            </button>
          )}
          <button type="button" onClick={clear} disabled={pending} className="btn-secondary btn-compact">
            Clear selection
          </button>
        </div>
      )}
      {open && count > 0 && (
        <div className="space-y-2 rounded-md border border-danger-200 bg-danger-50 p-3">
          <label className="block text-label font-semibold text-danger-600" htmlFor="bulk-reason">
            Delete {count} request{count === 1 ? "" : "s"}? Why?
          </label>
          <textarea id="bulk-reason" name="reason" rows={2} maxLength={500} required className="field-input h-auto py-2" placeholder="e.g. Test requests raised by mistake" />
          <FieldError result={result} name="reason" />
          <p className="text-caption text-ink-muted">They disappear from every screen, queue and dashboard, and pending approvals are cancelled. Each stays in the audit log with this reason. A request under a legal hold is skipped. There is no undo.</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending}
              className="btn-compact inline-flex h-9 items-center gap-2 rounded-md bg-danger-solid px-3 text-label font-semibold text-on-solid hover:bg-danger-solid-hover disabled:opacity-60"
              data-testid="bulk-delete-confirm"
            >
              {pending && <Spinner />}
              {pending ? "Deleting…" : `Yes, delete ${count}`}
            </button>
            <button type="button" disabled={pending} onClick={() => setOpen(false)} className="btn-secondary btn-compact">
              Cancel
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
