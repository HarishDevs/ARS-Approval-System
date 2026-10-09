"use client";

import { promoteCustomAction } from "@/app/admin/workflows/actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";

// IT: turn this custom approval into a reusable approval type (P5-04).
export function PromoteCustomForm({ requestId, title }: { requestId: number; title: string }) {
  const { result, pending, onSubmit } = useActionForm(promoteCustomAction);
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="requestId" value={requestId} />
      <div>
        <label htmlFor="p-name" className="field-label">
          Name
        </label>
        <input id="p-name" name="name" defaultValue={title} className="field-input" />
        <FieldError result={result} name="name" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="p-code" className="field-label">
            Code
          </label>
          <input id="p-code" name="code" placeholder="TRAVEL" className="field-input uppercase" />
          <FieldError result={result} name="code" />
        </div>
        <div>
          <label htmlFor="p-prefix" className="field-label">
            Number prefix
          </label>
          <input id="p-prefix" name="prefix" placeholder="TRV" maxLength={6} className="field-input uppercase" />
          <FieldError result={result} name="prefix" />
        </div>
      </div>
      <SubmitButton pending={pending} variant="secondary" className="btn-compact">
        Make it an approval type (draft)
      </SubmitButton>
      <ResultMessage result={result} />
    </form>
  );
}
