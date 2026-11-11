"use client";

import { addFilesAction } from "@/app/users/actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { Hint } from "@/features/ui/Hint";
import { ACCEPT_ATTRIBUTE } from "@/server/attachments/files";
import { FileListInput } from "@/features/ui/FileListInput";

// F-18: anyone who can see an open request can add files; files are never
// removed, so the history stays complete.
export function AddFilesForm({ requestId }: { requestId: number }) {
  const { result, pending, formRef, onSubmit } = useActionForm(addFilesAction, { resetOnSuccess: true });
  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-2">
      <input type="hidden" name="requestId" value={requestId} />
      <FileListInput name="attachments" accept={ACCEPT_ATTRIBUTE} ariaLabel="Choose files to attach" maxFiles={5} />
      <FieldError result={result} name="attachments" />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending} variant="secondary" className="btn-compact">
          Attach
        </SubmitButton>
        <Hint text="Up to 5 files of 10 MB at a time. Attached files can't be removed." align="start" />
        {result && (result.ok || !result.fieldErrors) && <ResultMessage result={result} />}
      </div>
    </form>
  );
}
