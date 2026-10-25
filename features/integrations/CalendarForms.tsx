"use client";

import { saveCalendarConfigAction } from "@/app/superadmin/integrations/google-calendar/actions";
import { ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { Hint } from "@/features/ui/Hint";
import type { ActionResult } from "@/lib/http/action-result";
import type { CalendarConfig } from "@/server/calendar/config";

type Action = (previous: ActionResult | null, formData: FormData) => Promise<ActionResult>;

// One button that runs a server command (test, enable, retry, revoke …),
// with an optional confirmation for the ones that change or remove things.
export function CommandButton({
  action,
  fields,
  label,
  variant = "secondary",
  confirm,
  confirmLabel,
  danger = false,
  showResult = true,
}: {
  action: Action;
  fields: Record<string, string | number>;
  label: string;
  variant?: "primary" | "secondary";
  confirm?: string;
  confirmLabel?: string;
  danger?: boolean;
  showResult?: boolean;
}) {
  const { result, pending, onSubmit, confirmBar } = useActionForm(action, confirm ? { confirm, confirmTitle: label, confirmLabel: confirmLabel ?? label, confirmTone: danger ? "danger" : "primary" } : {});
  return (
    <form onSubmit={onSubmit} className="inline-flex flex-col gap-2">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <SubmitButton pending={pending} variant={variant} className="btn-compact">
        {label}
      </SubmitButton>
      {showResult && <ResultMessage result={result} />}
      {confirmBar}
    </form>
  );
}

const SELECTS: { name: keyof CalendarConfig; label: string; options: [string, string][]; help?: string }[] = [
  { name: "direction", label: "Sync direction", options: [["TWO_WAY", "Two-way (recommended)"], ["ARS_TO_GOOGLE", "ARS → Google only"], ["GOOGLE_TO_ARS", "Google → ARS only"]] },
  { name: "calendarPolicy", label: "Default calendar", options: [["PRIMARY", "The person's primary calendar"], ["PERSON_CHOOSES", "Primary until the person chooses"]] },
  { name: "privacy", label: "Event privacy", options: [["PRIVATE", "Private (only the calendar owner sees details)"], ["CALENDAR_DEFAULT", "The calendar's default"]] },
  {
    name: "conflictPolicy",
    label: "When a personal entry changed in both places",
    options: [["MANUAL", "Ask the person to review (recommended)"], ["LATEST", "Keep the most recent change"], ["ARS_WINS", "Keep the ARS version"], ["GOOGLE_WINS", "Keep the Google version"]],
    help: "Approval, task and information dates always follow ARS.",
  },
  { name: "arsDeletion", label: "When an ARS record leaves the calendar (decided, completed, cancelled)", options: [["DELETE_EVENT", "Remove its Google event"], ["KEEP_EVENT", "Keep the Google event, stop updating it"]] },
  { name: "googleDeletion", label: "When someone deletes an ARS event in Google", options: [["UNLINK", "Stop syncing that record (the record itself is unchanged)"], ["RECREATE", "Put the event back"]] },
];

export function CalendarConfigForm({ clientId, hasSecret, config }: { clientId: string | null; hasSecret: boolean; config: CalendarConfig }) {
  const { result, pending, onSubmit } = useActionForm(saveCalendarConfigAction);
  const box = (name: string, label: string, checked: boolean, help?: string) => (
    <label className="flex items-start gap-2 text-label">
      <input type="checkbox" name={name} defaultChecked={checked} className="mt-0.5 h-4 w-4" />
      <span>{label}</span>
      {help && <Hint text={help} align="start" />}
    </label>
  );
  return (
    <form onSubmit={onSubmit} className="space-y-6" aria-label="Google Calendar set-up">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-body font-semibold">OAuth client (Google Cloud Console)</legend>
        <label className="text-label">
          Client ID
          <input name="clientId" defaultValue={clientId ?? ""} autoComplete="off" spellCheck={false} className="field-input mt-1 w-full" placeholder="1234567890-abc.apps.googleusercontent.com" />
        </label>
        <label className="text-label">
          Client secret
          <input name="clientSecret" type="password" autoComplete="new-password" spellCheck={false} className="field-input mt-1 w-full" placeholder={hasSecret ? "Saved (hidden). Type a new one to replace it." : "Paste the client secret"} />
        </label>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-body font-semibold">Who and what</legend>
        {box("allowConnections", "People may connect their own Google Calendar", config.allowConnections)}
        {box("allowCalendarChoice", "People may choose which of their calendars to use", config.allowCalendarChoice)}
        <p className="pt-2 text-label font-semibold">Put on people&apos;s calendars</p>
        {box("approvalDue", "Approvals waiting on them, by due time", config.modules.approvalDue)}
        {box("neededBy", "Their own requests, by the “needed by” date", config.modules.neededBy)}
        {box("taskDue", "Tasks assigned to them, by due time", config.modules.taskDue)}
        {box("infoEvents", "Information of types marked “Show on calendars”, on its effective date", config.modules.infoEvents)}
        {box("personal", "Their personal calendar entries (both ways)", config.modules.personal)}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-body font-semibold">Policies</legend>
        {SELECTS.map((select) => (
          <label key={select.name} className="text-label">
            {select.label}
            {select.help && <Hint text={select.help} align="start" className="ml-1" />}
            <select name={select.name} defaultValue={String(config[select.name])} className="field-input mt-1 w-full">
              {select.options.map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </label>
        ))}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 flex items-center gap-1.5 text-body font-semibold">
          Event text
          <Hint text="Use {kind} (e.g. Approval due), {ref} (the request, task or information number) and {link}. {title} adds the record's title: leave it out to keep confidential subjects out of Google." align="start" />
        </legend>
        <label className="text-label">
          Title template
          <input name="titleTemplate" defaultValue={config.titleTemplate} maxLength={120} className="field-input mt-1 w-full" />
        </label>
        <label className="text-label">
          Description template
          <input name="descriptionTemplate" defaultValue={config.descriptionTemplate} maxLength={500} className="field-input mt-1 w-full" />
        </label>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-body font-semibold">Timing</legend>
        <label className="text-label">
          Time zone
          <input name="timezone" defaultValue={config.timezone} className="field-input mt-1 w-full" />
        </label>
        <label className="text-label">
          Reconcile every (minutes)
          <input name="intervalMinutes" type="number" min={5} max={1440} defaultValue={config.intervalMinutes} className="field-input mt-1 w-full" />
        </label>
        <label className="text-label">
          Retries before a sync is marked failed
          <input name="retryMax" type="number" min={1} max={10} defaultValue={config.retryMax} className="field-input mt-1 w-full" />
        </label>
        <label className="text-label">
          Bring in Google events from the last (days)
          <input name="importWindowDays" type="number" min={1} max={365} defaultValue={config.importWindowDays} className="field-input mt-1 w-full" />
        </label>
        <div className="sm:col-span-2">{box("alertOnFailure", "Alert the Super Admin when a sync fails every retry", config.alertOnFailure)}</div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending}>Save configuration</SubmitButton>
        <div className="min-w-0 flex-1">
          <ResultMessage result={result} />
        </div>
      </div>
    </form>
  );
}
