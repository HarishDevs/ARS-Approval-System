"use client";

import { createDelegationAction, stopDelegationAction } from "@/app/users/collab-actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";

// Out of office (F-30, D-062). userId is set only when IT sets it for someone.
export function DelegationForm({ people, today, userId }: { people: { id: number; label: string }[]; today: string; userId?: number }) {
  const { result, pending, formRef, onSubmit } = useActionForm(createDelegationAction, { resetOnSuccess: true });
  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-3 px-5 py-4 sm:grid-cols-2">
      {userId && <input type="hidden" name="userId" value={userId} />}
      <div className="sm:col-span-2">
        <label htmlFor="d-delegate" className="field-label">
          Who approves while you&apos;re away
        </label>
        <select id="d-delegate" name="delegateId" defaultValue="" className="field-input">
          <option value="">Choose a person…</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.label}
            </option>
          ))}
        </select>
        <FieldError result={result} name="delegateId" />
      </div>
      <div>
        <label htmlFor="d-from" className="field-label">
          From
        </label>
        <input id="d-from" name="startsOn" type="date" defaultValue={today} min={today} className="field-input" />
      </div>
      <div>
        <label htmlFor="d-to" className="field-label">
          To (inclusive)
        </label>
        <input id="d-to" name="endsOn" type="date" min={today} className="field-input" />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="d-reason" className="field-label">
          Reason <span className="font-normal text-ink-faint">(optional)</span>
        </label>
        <input id="d-reason" name="reason" maxLength={200} placeholder="e.g. On leave" className="field-input" />
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <SubmitButton pending={pending} className="btn-compact">
          Set out of office
        </SubmitButton>
        <div className="min-w-0 flex-1">
          <ResultMessage result={result} />
        </div>
      </div>
    </form>
  );
}

export function StopDelegationButton({ delegationId }: { delegationId: number }) {
  const { result, pending, onSubmit } = useActionForm(stopDelegationAction, { confirm: "End this out-of-office now?" });
  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <input type="hidden" name="delegationId" value={delegationId} />
      <SubmitButton pending={pending} variant="secondary" className="btn-compact h-8">
        End now
      </SubmitButton>
      {result && !result.ok && <ResultMessage result={result} />}
    </form>
  );
}
