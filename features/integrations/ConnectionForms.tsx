"use client";

import { connectionCommandAction } from "@/app/users/calendar-actions";
import { ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";

// v1.11.0: the person's own Google Calendar connection (Profile → Calendar).
export function CalendarChoiceForm({ calendars, current }: { calendars: { id: string; summary: string; primary?: boolean }[]; current: string | null }) {
  const { result, pending, onSubmit } = useActionForm(connectionCommandAction);
  const selected = calendars.find((calendar) => calendar.id === current || (calendar.primary && current === "primary"))?.id ?? "";
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="command" value="calendar" />
      <label className="min-w-0 text-label">
        Sync with
        <select name="calendarId" defaultValue={selected} className="field-input mt-1 block w-full max-w-xs">
          {calendars.map((calendar) => (
            <option key={calendar.id} value={calendar.id}>
              {calendar.summary}
              {calendar.primary ? " (primary)" : ""}
            </option>
          ))}
        </select>
      </label>
      <SubmitButton pending={pending} variant="secondary" className="btn-compact">
        Use this calendar
      </SubmitButton>
      <ResultMessage result={result} />
    </form>
  );
}

export function DisconnectForm() {
  const { result, pending, onSubmit, confirmBar } = useActionForm(connectionCommandAction, {
    confirm: "Syncing stops and ARS's access to your Google account is revoked. Your ARS approvals, tasks and information aren't changed.",
    confirmTitle: "Disconnect Google Calendar?",
    confirmLabel: "Disconnect",
    confirmTone: "danger",
  });
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="command" value="disconnect" />
      <label className="flex items-center gap-2 text-label">
        <input type="checkbox" name="removeEvents" className="h-4 w-4" />
        Also remove the events ARS added to my Google Calendar
      </label>
      <SubmitButton pending={pending} variant="secondary" className="btn-compact">
        Disconnect Google Account
      </SubmitButton>
      <ResultMessage result={result} />
      {confirmBar}
    </form>
  );
}
