"use client";

import { disconnectSalesforceAction, syncSalesforceAction, testProviderAction, testSalesforceAction } from "@/app/superadmin/ai/actions";
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

// D-172: Salesforce connection controls.
export function SalesforceTestButton() {
  const { result, pending, onSubmit } = useActionForm(async () => testSalesforceAction());
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <SubmitButton pending={pending} variant="secondary" className="btn-compact">
        Test connection
      </SubmitButton>
      <ResultMessage result={result} />
    </form>
  );
}

export function SalesforceDisconnectButton() {
  const { result, pending, onSubmit, confirmBar } = useActionForm(async () => disconnectSalesforceAction(), {
    confirm: "Pico Bot stops reading Salesforce at once. The token is revoked at Salesforce and deleted here.",
    confirmTitle: "Disconnect Salesforce?",
    confirmLabel: "Yes, disconnect",
    confirmTone: "danger",
  });
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <SubmitButton pending={pending} variant="secondary" className="btn-compact text-danger-600">
        Disconnect
      </SubmitButton>
      {confirmBar}
      <ResultMessage result={result} />
    </form>
  );
}
