"use client";

import { addFilesAction } from "@/app/users/actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { ACCEPT_ATTRIBUTE } from "@/server/attachments/files";

// F-18: anyone who can see an open request can add files; files are never
// removed, so the history stays complete.
export function AddFilesForm({ requestId }: { requestId: number }) {
  const { result, pending, formRef, onSubmit } = useActionForm(addFilesAction, { resetOnSuccess: true });
  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-2">
      <input type="hidden" name="requestId" value={requestId} />
      <input name="attachments" type="file" multiple accept={ACCEPT_ATTRIBUTE} aria-label="Choose files to attach" className="block w-full text-label file:mr-3 file:rounded-md file:border-0 file:bg-surface-muted file:px-3 file:py-2" />
      <FieldError result={result} name="attachments" />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending} variant="secondary" className="btn-compact">
          Attach
        </SubmitButton>
        {result && (result.ok || !result.fieldErrors) && <ResultMessage result={result} />}
      </div>
      <p className="text-caption text-ink-muted">Up to 5 files of 10 MB at a time. Attached files can&apos;t be removed.</p>
    </form>
  );
}
