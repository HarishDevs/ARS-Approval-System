"use client";

import { disconnectSalesforceAction, syncSalesforceAction, testProviderAction, testSalesforceAction } from "@/app/superadmin/ai/actions";
import { useState } from "react";
import { guardAction, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import type { ActionResult } from "@/lib/http/action-result";

// D-169: Super Admin AI tools.
// D-240: a button, not a form: it sits inside the one AI settings form.
export function ProviderTestButton({ provider, label }: { provider: string; label: string }) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, setPending] = useState(false);
  const run = async () => {
    setPending(true);
    try {
      const data = new FormData();
      data.set("provider", provider);
      setResult(await guardAction(testProviderAction)(null, data));
    } finally {
      setPending(false);
    }
  };
  return (
    <span className="space-y-2">
      <button type="button" onClick={() => void run()} disabled={pending} className="btn-secondary btn-compact">
        {pending ? "Testing…" : `Test ${label}`}
      </button>
      <ResultMessage result={result} />
    </span>
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
