"use client";

import { savePreferencesAction } from "@/app/users/preferences-actions";
import { ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";

export interface PreferenceRow {
  key: string;
  label: string;
  help: string;
  mandatory: boolean;
  email: boolean;
  whatsapp: boolean;
}

// #6: one row per kind of message; mandatory rows are locked on.
export function PreferencesForm({ rows }: { rows: PreferenceRow[] }) {
  const { result, pending, onSubmit } = useActionForm(savePreferencesAction);
  return (
    <form onSubmit={onSubmit} className="card">
      <ul className="divide-y divide-line">
        {rows.map((row) => (
          <li key={row.key} className="grid gap-2 px-5 py-4 sm:grid-cols-[1fr_auto]">
            <div>
              <p className="font-medium">
                {row.label}
                {row.mandatory && <span className="ml-2 badge bg-surface-muted text-ink-muted">Always on</span>}
              </p>
              <p className="text-label text-ink-muted">{row.help}</p>
            </div>
            <div className="flex items-center gap-5">
              {(["EMAIL", "WHATSAPP"] as const).map((channel) => (
                <label key={channel} className="flex items-center gap-2 text-label">
                  <input
                    type="checkbox"
                    name={`${row.key}:${channel}`}
                    defaultChecked={row.mandatory || (channel === "EMAIL" ? row.email : row.whatsapp)}
                    disabled={row.mandatory}
                    className="h-5 w-5"
                    aria-label={`${row.label} by ${channel === "EMAIL" ? "email" : "WhatsApp"}`}
                  />
                  {channel === "EMAIL" ? "Email" : "WhatsApp"}
                </label>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4">
        <SubmitButton pending={pending} className="btn-compact">
          Save choices
        </SubmitButton>
        <ResultMessage result={result} />
      </div>
    </form>
  );
}
