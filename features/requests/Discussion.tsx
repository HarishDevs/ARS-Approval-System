"use client";

import { commentAction } from "@/app/users/collab-actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { Hint } from "@/features/ui/Hint";

// F-15: comments can't be edited or deleted; they are part of the history.
export function CommentForm({ requestId, people = [] }: { requestId: number; people?: { loginId: string; name: string }[] }) {
  const { result, pending, formRef, onSubmit } = useActionForm(commentAction, { resetOnSuccess: true });
  // #9: a tap adds "@UserID " to the comment.
  const mention = (loginId: string) => {
    const box = formRef.current?.elements.namedItem("body");
    if (!(box instanceof HTMLTextAreaElement)) return;
    box.value = `${box.value}${box.value && !/\s$/.test(box.value) ? " " : ""}@${loginId} `;
    box.focus();
  };
  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-2">
      <input type="hidden" name="requestId" value={requestId} />
      <textarea name="body" rows={3} maxLength={2000} aria-label="Add a comment" placeholder="Add a comment…" className="field-input h-auto py-2.5" />
      <FieldError result={result} name="body" />
      {people.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-caption">
          <span className="text-ink-muted">Mention:</span>
          {people.map((person) => (
            <button key={person.loginId} type="button" className="badge bg-surface-muted text-ink hover:bg-line" onClick={() => mention(person.loginId)} aria-label={`Mention ${person.name}`}>
              @{person.loginId} · {person.name}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3">
        <SubmitButton pending={pending} variant="secondary" className="btn-compact">
          Post comment
        </SubmitButton>
        <Hint text="Type @ and a User ID to notify someone. Only people who can already see this request are told." align="start" />
        {result && (result.ok || !result.fieldErrors) && <ResultMessage result={result} />}
      </div>
    </form>
  );
}
