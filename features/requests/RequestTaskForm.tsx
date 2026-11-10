"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { requestTaskAction } from "@/app/users/work/actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";

// v1.50.3 (owner: "custom request also needs follow-up management from the
// linked tasks"): add a follow-up task from the request page. It is linked to
// the request, appears in this card and in the person's Task Management; the
// server checks the request, the Task module and who may be assigned.
const PRIORITIES: [string, string][] = [
  ["URGENT", "Critical"],
  ["HIGH", "Most Important"],
  ["IMPORTANT", "Important"],
  ["NORMAL", "Normal"],
];

export function RequestTaskForm({ requestId, people, meId }: { requestId: number; people: { id: number; label: string }[]; meId: number }) {
  const [open, setOpen] = useState(false);
  const { result, pending, formRef, onSubmit } = useActionForm(requestTaskAction, { resetOnSuccess: true });
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary btn-compact mt-3 inline-flex items-center gap-1.5" data-testid="add-request-task">
        <Plus aria-hidden="true" className="h-4 w-4" />
        Add a follow-up task
      </button>
    );
  }
  return (
    <form ref={formRef} onSubmit={onSubmit} className="mt-3 space-y-3 rounded-md border border-line p-3" aria-label="Add a follow-up task" data-testid="request-task-form">
      <input type="hidden" name="requestId" value={requestId} />
      <div>
        <label htmlFor="rt-title" className="field-label">
          Task
        </label>
        <input id="rt-title" name="title" required maxLength={200} placeholder="What needs doing" className="field-input" />
        <FieldError result={result} name="title" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="rt-assignee" className="field-label">
            Assign to
          </label>
          <select id="rt-assignee" name="assigneeId" defaultValue={String(meId)} className="field-input">
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.id === meId ? `Me (${person.label})` : person.label}
              </option>
            ))}
          </select>
          <FieldError result={result} name="assignee" />
        </div>
        <div>
          <label htmlFor="rt-priority" className="field-label">
            Priority
          </label>
          <select id="rt-priority" name="priority" defaultValue="NORMAL" className="field-input">
            {PRIORITIES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="rt-due" className="field-label">
            Due date <span className="font-normal text-ink-muted">(optional)</span>
          </label>
          <input id="rt-due" name="dueDay" type="date" className="field-input" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pending={pending} className="btn-compact">
          Add task
        </SubmitButton>
        <button type="button" onClick={() => setOpen(false)} disabled={pending} className="btn-secondary btn-compact">
          Close
        </button>
      </div>
      <ResultMessage result={result} />
    </form>
  );
}
