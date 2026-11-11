"use client";

import { handoverAction } from "@/app/admin/users/actions";
import { useState } from "react";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { PersonSelect } from "@/features/ui/PersonSelect";
import type { Option } from "@/features/admin/UserForm";

// F-16: required before deactivating someone with pending approvals.
// #12: suggests the eligible people with the fewest approvals waiting.
export function HandoverForm({ id, name, pending, people, suggestions = [] }: { id: number; name: string; pending: number; people: Option[]; suggestions?: (Option & { pending: number })[] }) {
  const { result, pending: busy, formRef, onSubmit, confirmBar } = useActionForm(handoverAction, { confirm: `${name}'s ${pending} pending approval(s) go to the person you chose, with a fresh response time.`, confirmTitle: "Hand over approvals?", confirmLabel: "Yes, hand over" });
  const [toUser, setToUser] = useState<number | null>(null);
  const choose = (personId: number) => setToUser(personId);
  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-2 px-5 py-4">
      <input type="hidden" name="id" value={id} />
      <p className="font-medium">Hand over pending approvals</p>
      <p className="text-label text-ink-muted">
        {pending === 0 ? "Nothing is waiting on this person." : `${pending} approval${pending === 1 ? " is" : "s are"} waiting on ${name}. Move them before deactivating.`}
      </p>
      {pending > 0 && (
        <>
          <PersonSelect name="toUserId" ariaLabel="New approver" options={people} value={toUser} onChange={setToUser} emptyLabel="Move them to…" />
          <FieldError result={result} name="toUserId" />
          {suggestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-caption">
              <span className="text-ink-muted">Fewest waiting:</span>
              {suggestions.map((person) => (
                <button key={person.id} type="button" className="badge bg-surface-muted text-ink hover:bg-line" onClick={() => choose(person.id)}>
                  {person.label} · {person.pending} waiting
                </button>
              ))}
            </div>
          )}
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
