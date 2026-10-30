"use client";

import { holidayTasksAction, saveTaskHolidaySettingsAction } from "@/app/admin/task-holidays/actions";
import { ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { HOLIDAY_MODE_LABEL, HOLIDAY_MODES, type HolidaySettings } from "@/server/work/holidays";

// D-217: Admin → Task holidays.
export function TaskHolidaySettingsForm({ settings }: { settings: HolidaySettings }) {
  const { result, pending, onSubmit } = useActionForm(saveTaskHolidaySettingsAction);
  const box = (name: keyof HolidaySettings, label: string, hint: string) => (
    <label className="flex items-start gap-2 text-body">
      <input type="checkbox" name={name} defaultChecked={Boolean(settings[name])} className="mt-1" />
      <span>
        {label}
        <span className="block text-caption text-ink-muted">{hint}</span>
      </span>
    </label>
  );
  return (
    <form onSubmit={onSubmit} className="space-y-5 px-5 py-4" aria-label="Task holiday settings">
      <fieldset>
        <legend className="field-label">When a task&apos;s date falls on a holiday</legend>
        <div className="space-y-1.5">
          {HOLIDAY_MODES.map((mode) => (
            <label key={mode} className="flex items-center gap-2 text-body">
              <input type="radio" name="mode" value={mode} defaultChecked={settings.mode === mode} />
              {HOLIDAY_MODE_LABEL[mode]}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="field-label">The working day offered instead</legend>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-body">
            <input type="radio" name="suggest" value="NEXT" defaultChecked={settings.suggest === "NEXT"} /> The next working day
          </label>
          <label className="flex items-center gap-2 text-body">
            <input type="radio" name="suggest" value="PREVIOUS" defaultChecked={settings.suggest === "PREVIOUS"} /> The working day before
          </label>
        </div>
      </fieldset>
      <div className="space-y-3">
        {box("weeklyOff", "Weekly offs count as holidays", "Days that aren't working days in the Working calendar (for example Sunday) are treated like holidays.")}
        {box("checkStart", "Check start dates too", "Not only due dates: a start date on a holiday gets the same warning.")}
        {box("holdReminders", "No task reminders on holidays", "Due-soon and overdue reminders wait for the next working day.")}
        {box("showOnCalendars", "Show holidays on task calendars and timelines", "Holidays are shaded with their name in project and My Tasks calendars.")}
        {box("notifyNewHoliday", "Tell people when a new holiday lands on their tasks", "When IT adds a holiday, the assignees of open tasks due that day are told, so they can keep or move them.")}
      </div>
      <ResultMessage result={result} />
      <SubmitButton pending={pending}>Save</SubmitButton>
    </form>
  );
}

export function HolidayTasksButtons({ date, count }: { date: string; count: number }) {
  const { result, pending, onSubmit } = useActionForm(holidayTasksAction);
  if (count === 0) return <span className="text-caption text-ink-muted">No open tasks due</span>;
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2" aria-label={`Tasks due on ${date}`}>
      <input type="hidden" name="date" value={date} />
      <button type="submit" name="command" value="NEXT" disabled={pending} className="btn-secondary btn-compact">
        Move to next working day
      </button>
      <button type="submit" name="command" value="PREVIOUS" disabled={pending} className="btn-secondary btn-compact">
        Move to day before
      </button>
      <button type="submit" name="command" value="TELL" disabled={pending} className="btn-secondary btn-compact">
        Tell the assignees
      </button>
      <ResultMessage result={result} />
    </form>
  );
}
