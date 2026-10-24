"use client";

import { syncSalesforceAction, testProviderAction } from "@/app/superadmin/ai/actions";
import { ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";

// D-169: Super Admin AI tools.
export function ProviderTestButton({ provider, label }: { provider: string; label: string }) {
  const { result, pending, onSubmit } = useActionForm(testProviderAction);
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <input type="hidden" name="provider" value={provider} />
      <SubmitButton pending={pending} variant="secondary" className="btn-compact">
        Test {label}
      </SubmitButton>
      <ResultMessage result={result} />
    </form>
  );
}

export function SyncNowButton() {
  const { result, pending, onSubmit } = useActionForm(async () => syncSalesforceAction());
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <SubmitButton pending={pending} variant="secondary" className="btn-compact">
        Sync Salesforce now
      </SubmitButton>
      <ResultMessage result={result} />
    </form>
  );
}
