"use client";

import { handoverAction } from "@/app/admin/users/actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import type { Option } from "@/features/admin/UserForm";

// F-16: required before deactivating someone with pending approvals.
export function HandoverForm({ id, name, pending, people }: { id: number; name: string; pending: number; people: Option[] }) {
  const { result, pending: busy, onSubmit, confirmBar } = useActionForm(handoverAction, { confirm: `Move ${name}'s ${pending} pending approval(s)?` });
  return (
    <form onSubmit={onSubmit} className="space-y-2 px-5 py-4">
      <input type="hidden" name="id" value={id} />
      <p className="font-medium">Hand over pending approvals</p>
      <p className="text-label text-ink-muted">
        {pending === 0 ? "Nothing is waiting on this person." : `${pending} approval${pending === 1 ? " is" : "s are"} waiting on ${name}. Move them before deactivating.`}
      </p>
      {pending > 0 && (
        <>
          <select name="toUserId" defaultValue="" aria-label="New approver" className="field-input">
            <option value="">Move them to…</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.label}
              </option>
            ))}
          </select>
          <FieldError result={result} name="toUserId" />
          <SubmitButton pending={busy} variant="secondary" className="btn-compact">
            Hand over
          </SubmitButton>
        </>
      )}
      <ResultMessage result={result} />
      {confirmBar}
    </form>
  );
}
