"use client";

import { generatePushKeysAction } from "@/app/superadmin/settings/actions";
import { ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { Hint } from "@/features/ui/Hint";

// D-252: Web Push keys. One pair for the whole app; made here, never typed.
export function PushKeysPanel({ hasKeys, devices }: { hasKeys: boolean; devices: number }) {
  const { result, pending, onSubmit } = useActionForm(generatePushKeysAction);
  return (
    <section className="card" data-testid="push-keys">
      <div className="flex items-center gap-1.5 border-b border-line px-5 py-4">
        <h2 className="font-semibold">Phone & desktop notifications</h2>
        <Hint text="Web Push with VAPID keys: no outside account is needed. The private key is stored encrypted and never leaves the server." align="start" />
      </div>
      <form onSubmit={onSubmit} className="space-y-3 px-5 py-5">
        <p className="text-label text-ink-muted">
          {hasKeys ? `Keys are set. ${devices} device${devices === 1 ? "" : "s"} registered.` : "No keys yet: people can't turn on notifications until you make them."}
        </p>
        {hasKeys && (
          <label className="flex items-center gap-2 text-label">
            <input type="checkbox" name="replace" value="yes" className="h-4 w-4" /> Replace the keys (only if the private key may have leaked)
          </label>
        )}
        <SubmitButton pending={pending} variant={hasKeys ? "secondary" : "primary"} className="btn-compact">
          {hasKeys ? "Make new keys" : "Generate keys"}
        </SubmitButton>
        <ResultMessage result={result} />
      </form>
    </section>
  );
}
