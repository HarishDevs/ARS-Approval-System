"use client";

import { saveSettingsAction } from "@/app/superadmin/settings/actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import type { DisplaySetting } from "@/server/settings/resolve";

// One settings group (F-52). Secrets never reach the browser: the field
// starts empty, shows only Configured / Not configured, and a blank value
// keeps the stored key.
export function SettingsGroupForm({ group, title, description, settings }: { group: string; title: string; description: string; settings: DisplaySetting[] }) {
  // Cleared after a save so a typed key never lingers in the field.
  const { result, pending, formRef, onSubmit } = useActionForm(saveSettingsAction, { resetOnSuccess: true });

  return (
    <form ref={formRef} onSubmit={onSubmit} className="card">
      <input type="hidden" name="group" value={group} />
      <div className="border-b border-line px-5 py-4">
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-0.5 text-label text-ink-muted">{description}</p>
      </div>
      <div className="grid gap-5 px-5 py-5 sm:grid-cols-2">
        {settings.map((setting) => (
          <div key={setting.key} className={setting.encrypted ? "sm:col-span-2" : undefined}>
            <label htmlFor={setting.key} className="field-label flex items-center justify-between gap-2">
              <span>{setting.label}</span>
              {setting.encrypted && (
                <span className={`badge ${setting.status === "CONFIGURED" ? "bg-success-50 text-success-600" : "bg-warning-50 text-warning-600"}`}>
                  {setting.status === "CONFIGURED" ? "Configured" : "Not configured"}
                </span>
              )}
            </label>
            {setting.encrypted ? (
              <>
                <input
                  id={setting.key}
                  name={setting.key}
                  type="password"
                  autoComplete="new-password"
                  spellCheck={false}
                  placeholder={setting.status === "CONFIGURED" ? "Leave blank to keep the current key" : "Paste the key"}
                  className="field-input"
                />
                {setting.status === "CONFIGURED" && (
                  <label className="mt-2 flex items-center gap-2 text-label text-ink-muted">
                    <input type="checkbox" name={`${setting.key}__clear`} className="h-4 w-4" /> Remove this key
                  </label>
                )}
              </>
            ) : (
              <input
                id={setting.key}
                name={setting.key}
                type={setting.valueType === "NUMBER" ? "number" : "text"}
                defaultValue={setting.value ?? ""}
                className="field-input"
              />
            )}
            <FieldError result={result} name={setting.key} />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4">
        <SubmitButton pending={pending} className="btn-compact">Save {title.toLowerCase()}</SubmitButton>
        <div className="min-w-0 flex-1">
          <ResultMessage result={result} />
        </div>
      </div>
    </form>
  );
}
