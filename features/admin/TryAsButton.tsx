"use client";

import { useState } from "react";
import { Check, Copy, Eye } from "lucide-react";
import { tryAsLinkAction } from "@/app/admin/users/actions";
import { ResultMessage, useActionForm } from "@/features/ui/form";
import { Hint } from "@/features/ui/Hint";

// D-185: "Try as" on a person's page. It makes a one-time link to open in a
// private window (the admin's own session stays as it is); the session it
// opens is view-only.
export function TryAsButton({ userId }: { userId: number }) {
  const { result, pending, onSubmit } = useActionForm(tryAsLinkAction);
  const [copied, setCopied] = useState(false);
  const url = result?.ok && typeof result.data?.url === "string" ? result.data.url : null;
  return (
    <div className="relative">
      <form onSubmit={onSubmit} className="flex items-center gap-1">
        <input type="hidden" name="id" value={userId} />
        <button type="submit" disabled={pending} className="btn-secondary btn-compact">
          <Eye aria-hidden="true" className="h-4 w-4" /> {pending ? "Preparing…" : "Try as"}
        </button>
        <Hint text="See the app exactly as this person does, view-only, in a private window. Your own session stays signed in." align="end" />
      </form>
      {result && !result.ok && <ResultMessage result={result} />}
      {url && (
        <div className="absolute right-0 z-drawer mt-2 w-[min(26rem,90vw)] space-y-2 rounded-lg border border-line bg-raised p-3 text-label shadow-overlay" role="dialog" aria-label="Try as link">
          <p className="font-medium">Open this link in a private window</p>
          <p className="text-ink-muted">Ctrl + Shift + N (Chrome, Edge) or Ctrl + Shift + P (Firefox), then paste. It works once, within 5 minutes.</p>
          <div className="flex gap-2">
            <input readOnly value={url} aria-label="Try as link" className="field-input h-9 flex-1 text-caption" onFocus={(event) => event.currentTarget.select()} />
            <button
              type="button"
              className="btn-primary btn-compact"
              onClick={() => {
                void navigator.clipboard?.writeText(url).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
            >
              {copied ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />} {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
