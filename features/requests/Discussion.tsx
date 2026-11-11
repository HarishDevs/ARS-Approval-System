"use client";

import { commentAction } from "@/app/users/collab-actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { Hint } from "@/features/ui/Hint";
import { RichEditor } from "@/features/ui/RichEditor";

// F-15: comments can't be edited or deleted; they are part of the history.
export function CommentForm({ requestId, people = [] }: { requestId: number; people?: { loginId: string; name: string; departmentName?: string | null }[] }) {
  const { result, pending, formRef, onSubmit } = useActionForm(commentAction, { resetOnSuccess: true });
  // #9: a mention is "@UserID" in the text; v1.52.2 (owner): the box formats
  // like an email body, and @ followed by a name picks the person.
  const mentionable = people.map((person, index) => ({ id: index + 1, label: `${person.name} - ${person.loginId}`, name: person.name, detail: person.departmentName ?? undefined, token: `@${person.loginId}` }));
  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-2">
      <input type="hidden" name="requestId" value={requestId} />
      <RichEditor name="body" label="Add a comment" placeholder="Add a comment or @mention someone on this request" people={mentionable} maxLength={2000} />
      <FieldError result={result} name="body" />
      <div className="flex items-center gap-3">
        <SubmitButton pending={pending} variant="secondary" className="btn-compact">
          Post comment
        </SubmitButton>
        <Hint text="Type @ and a name to notify someone. Only people who can already see this request are told." align="start" />
        {result && (result.ok || !result.fieldErrors) && <ResultMessage result={result} />}
      </div>
    </form>
  );
}
