"use client";

import { backupNowAction } from "@/app/superadmin/actions";
import { ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";

export function BackupNowButton() {
  const { result, pending, onSubmit } = useActionForm(backupNowAction);
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <SubmitButton pending={pending} variant="secondary" className="btn-compact">
        Back up now
      </SubmitButton>
      <ResultMessage result={result} />
    </form>
  );
}
