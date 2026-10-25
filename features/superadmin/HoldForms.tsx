"use client";

import { createHoldAction, releaseHoldAction } from "@/app/superadmin/retention/actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { Hint } from "@/features/ui/Hint";

// FN10 legal hold forms (Super Admin).
export function CreateHoldForm() {
  const { result, pending, formRef, onSubmit } = useActionForm(createHoldAction, { resetOnSuccess: true });
  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor="f-reference" className="field-label">
          Matter reference
        </label>
        <input id="f-reference" name="reference" maxLength={80} className="field-input" placeholder="e.g. Audit FY25 / Vendor dispute 12" />
        <FieldError result={result} name="reference" />
      </div>
      <div>
        <div className="flex items-center gap-1">
          <label htmlFor="f-ownerLogin" className="field-label">
            Hold owner (user id)
          </label>
          <Hint text="Who answers for this hold." align="start" />
        </div>
        <input id="f-ownerLogin" name="ownerLogin" maxLength={60} className="field-input" />
        <FieldError result={result} name="ownerLogin" />
      </div>
      <div>
        <label htmlFor="f-scopeType" className="field-label">
          Covers
        </label>
        <select id="f-scopeType" name="scopeType" defaultValue="REQUEST" className="field-input">
          <option value="REQUEST">One request (its number)</option>
          <option value="REQUESTER">Everything a person raised (their user id)</option>
          <option value="WORKFLOW">Every request of an approval type (its code)</option>
        </select>
      </div>
      <div>
        <label htmlFor="f-scope" className="field-label">
          Request number, user id or type code
        </label>
        <input id="f-scope" name="scope" maxLength={60} className="field-input" placeholder="e.g. PUR-2026-000123" />
        <FieldError result={result} name="scope" />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="f-reason" className="field-label">
          Why
        </label>
        <textarea id="f-reason" name="reason" rows={2} maxLength={500} className="field-input h-auto py-2" />
        <FieldError result={result} name="reason" />
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <SubmitButton pending={pending} className="btn-compact">
          Place hold
        </SubmitButton>
        {result && (result.ok || !result.fieldErrors) && <ResultMessage result={result} />}
      </div>
    </form>
  );
}

export function ReleaseHoldForm({ holdId, reference }: { holdId: number; reference: string }) {
  const { result, pending, onSubmit, confirmBar } = useActionForm(releaseHoldAction, { confirmTitle: `Release the hold "${reference}"?`, confirm: "The records it covers can be deleted again by the Super Admin. This is recorded.", confirmLabel: "Release", confirmTone: "danger" });
  return (
    <details className="text-label">
      <summary className="cursor-pointer text-primary-600">Release</summary>
      <form onSubmit={onSubmit} className="mt-2 flex flex-wrap items-start gap-2">
        {confirmBar}
        <input type="hidden" name="holdId" value={holdId} />
        <div>
          <label htmlFor={`release-${holdId}`} className="sr-only">
            Why can the hold {reference} be released?
          </label>
          <input id={`release-${holdId}`} name="releaseReason" maxLength={500} placeholder="Why it can be released" className="field-input h-9 w-72" />
          <FieldError result={result} name="releaseReason" />
        </div>
        <SubmitButton pending={pending} variant="secondary" className="btn-compact">
          Release hold
        </SubmitButton>
        {result && (result.ok || !result.fieldErrors) && <ResultMessage result={result} />}
      </form>
    </details>
  );
}
