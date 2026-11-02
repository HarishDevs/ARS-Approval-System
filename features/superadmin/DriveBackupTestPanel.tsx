"use client";

import { testDriveBackupAction } from "@/app/superadmin/settings/actions";
import { ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { Hint } from "@/features/ui/Hint";

// DR-08: Test the saved Google Drive backup settings. Reads the folder's
// details as the service account; never uploads anything.
export function DriveBackupTestPanel({ configured }: { configured: boolean }) {
  const { result, pending, onSubmit } = useActionForm(testDriveBackupAction);
  return (
    <section className="card" data-testid="gdrive-backup-test">
      <div className="flex items-center gap-1.5 border-b border-line px-5 py-4">
        <h2 className="font-semibold">Google Drive backup</h2>
        <Hint text="Signs in as the service account and checks it may add files to the folder. Uses the saved settings; no data is uploaded." align="start" />
      </div>
      <form onSubmit={onSubmit} className="space-y-3 px-5 py-5">
        <p className="text-label text-ink-muted">{configured ? "Key and folder are saved." : "Save the service-account key and the folder id first."}</p>
        <SubmitButton pending={pending} variant="secondary" className="btn-compact">
          Test
        </SubmitButton>
        <ResultMessage result={result} />
      </form>
    </section>
  );
}
