"use client";

import { Star, Trash2 } from "lucide-react";
import { deleteTaskAction, saveSearchAction, savedSearchCommand } from "@/app/users/work/actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { useWorkCall } from "@/features/work/client";
import { ConfirmButton } from "@/features/ui/ConfirmButton";

// D-215: saving a task search, and a saved search's star and delete.
export function SaveSearchForm({ query }: { query: string }) {
  const { result, pending, onSubmit, formRef } = useActionForm(saveSearchAction, { resetOnSuccess: true });
  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-2" aria-label="Save this search">
      <input type="hidden" name="query" value={query} />
      <label htmlFor="search-name" className="field-label">
        Save this search as
      </label>
      <div className="flex gap-2">
        <input id="search-name" name="name" required minLength={2} maxLength={80} className="field-input h-9" />
        <SubmitButton pending={pending} variant="secondary">
          Save
        </SubmitButton>
      </div>
      <FieldError result={result} name="name" />
      <ResultMessage result={result} />
    </form>
  );
}

export function SavedSearchButtons({ id, name, starred }: { id: number; name: string; starred: boolean }) {
  const { call } = useWorkCall();
  return (
    <span className="flex shrink-0 items-center">
      <button type="button" aria-pressed={starred} aria-label={`${starred ? "Unstar" : "Star"} ${name}`} onClick={() => void call(() => savedSearchCommand(id, "STAR"), { success: false })} className={`rounded p-1 ${starred ? "text-warning-600" : "text-ink-faint hover:text-warning-600"}`}>
        <Star aria-hidden="true" className="h-3.5 w-3.5" fill={starred ? "currentColor" : "none"} />
      </button>
      <ConfirmButton ariaLabel={`Delete ${name}`} title={`Delete the saved search “${name}”?`} body="Only the saved search goes; no task changes." onConfirm={() => call(() => savedSearchCommand(id, "DELETE"))} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-faint hover:bg-danger-50 hover:text-danger-600">
        <Trash2 aria-hidden="true" className="h-4 w-4" />
      </ConfirmButton>
    </span>
  );
}

export function RestoreTaskButton({ taskId }: { taskId: number }) {
  const { call, pending } = useWorkCall();
  return (
    <button type="button" disabled={pending} className="btn-secondary btn-compact" onClick={() => void call(() => deleteTaskAction(taskId, true))}>
      Restore
    </button>
  );
}
