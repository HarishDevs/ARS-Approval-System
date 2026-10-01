"use client";

import { commentAction } from "@/app/users/collab-actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";

// F-15: comments can't be edited or deleted; they are part of the history.
export function CommentForm({ requestId }: { requestId: number }) {
  const { result, pending, formRef, onSubmit } = useActionForm(commentAction, { resetOnSuccess: true });
  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-2">
      <input type="hidden" name="requestId" value={requestId} />
      <textarea name="body" rows={3} maxLength={2000} aria-label="Add a comment" placeholder="Add a comment for everyone on this request…" className="field-input h-auto py-2.5" />
      <FieldError result={result} name="body" />
      <div className="flex items-center gap-3">
        <SubmitButton pending={pending} variant="secondary" className="btn-compact">
          Post comment
        </SubmitButton>
        {result && !result.ok && !result.fieldErrors && <ResultMessage result={result} />}
      </div>
    </form>
  );
}
