"use client";

import { departmentHolidayAction, holidayTasksAction, saveTaskExtrasAction, saveTaskHolidaySettingsAction } from "@/app/admin/task-holidays/actions";
import type { DigestSettings, RecurrenceSettings } from "@/server/work/more-rules";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
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

// D-218: the morning summary and repeating tasks.
export function TaskExtrasForm({ digest, recurrence }: { digest: DigestSettings; recurrence: RecurrenceSettings }) {
  const { result, pending, onSubmit } = useActionForm(saveTaskExtrasAction);
  return (
    <form onSubmit={onSubmit} className="space-y-4 px-5 py-4" aria-label="Morning summary and repeating tasks">
      <fieldset className="space-y-2">
        <legend className="field-label">Morning summary</legend>
        <label className="flex items-center gap-2 text-body">
          <input type="checkbox" name="digestEnabled" defaultChecked={digest.enabled} /> Send each person a summary of their overdue, due-today and new tasks (in-app and email)
        </label>
        <label className="flex items-center gap-2 text-body">
          From
          <select name="digestHour" defaultValue={digest.hour} className="field-input h-8 w-auto py-0" aria-label="Summary hour">
            {[5, 6, 7, 8, 9, 10, 11, 12].map((hour) => (
              <option key={hour} value={hour}>
                {hour}:00
              </option>
            ))}
          </select>
          India time
        </label>
        <label className="flex items-center gap-2 text-body">
          <input type="checkbox" name="digestWorkingDays" defaultChecked={digest.workingDaysOnly} /> Only on working days (not on holidays or weekly offs)
        </label>
        <p className="text-caption text-ink-muted">Nobody gets an empty summary; anyone can switch theirs off in My Tasks.</p>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="field-label">Repeating tasks</legend>
        <label className="flex items-center gap-2 text-body">
          <input type="checkbox" name="recurrenceEnabled" defaultChecked={recurrence.enabled} /> People may make tasks repeat (daily, weekly, monthly, yearly, or some days after completion)
        </label>
        <label className="flex items-center gap-2 text-body">
          <input type="checkbox" name="recurrenceSkipHolidays" defaultChecked={recurrence.skipHolidays} /> The next one never falls on a holiday (it moves to the next working day)
        </label>
      </fieldset>
      <ResultMessage result={result} />
      <SubmitButton pending={pending}>Save</SubmitButton>
    </form>
  );
}

export function DepartmentHolidayForm({ departments }: { departments: { id: number; name: string }[] }) {
  const { result, pending, onSubmit, formRef } = useActionForm(departmentHolidayAction, { resetOnSuccess: true });
  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-3 px-5 py-4 md:grid-cols-2" aria-label="Add a department holiday">
      <input type="hidden" name="command" value="add" />
      <div>
        <label htmlFor="dept-holiday-department" className="field-label">
          Department
        </label>
        <select id="dept-holiday-department" name="department" required defaultValue="" className="field-input">
          <option value="" disabled>
            Choose…
          </option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
        <FieldError result={result} name="department" />
      </div>
      <div>
        <label htmlFor="dept-holiday-date" className="field-label">
          Date
        </label>
        <input id="dept-holiday-date" type="date" name="date" required className="field-input" />
        <FieldError result={result} name="date" />
      </div>
      <div className="md:col-span-2">
        <label htmlFor="dept-holiday-name" className="field-label">
          Name
        </label>
        <input id="dept-holiday-name" name="name" required minLength={2} maxLength={100} placeholder="e.g. Plant maintenance shutdown" className="field-input" />
        <FieldError result={result} name="name" />
      </div>
      <div className="md:col-span-2 flex items-center gap-3">
        <SubmitButton pending={pending}>Add department holiday</SubmitButton>
        <ResultMessage result={result} />
      </div>
    </form>
  );
}

export function RemoveDepartmentHolidayButton({ departmentId, date }: { departmentId: number; date: string }) {
  const { result, pending, onSubmit } = useActionForm(departmentHolidayAction);
  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <input type="hidden" name="command" value="remove" />
      <input type="hidden" name="department" value={departmentId} />
      <input type="hidden" name="date" value={date} />
      <button type="submit" disabled={pending} className="btn-secondary btn-compact">
        Remove
      </button>
      {result && !result.ok && <ResultMessage result={result} />}
    </form>
  );
}
