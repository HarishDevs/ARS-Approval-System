"use client";

import { holidayAction, saveWorkingDaysAction } from "@/app/admin/calendar/actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";

const DAY_LABEL: Record<string, string> = { SUN: "Sunday", MON: "Monday", TUE: "Tuesday", WED: "Wednesday", THU: "Thursday", FRI: "Friday", SAT: "Saturday" };

export function WorkingDaysForm({ days, selected }: { days: readonly string[]; selected: readonly string[] }) {
  const { result, pending, onSubmit } = useActionForm(saveWorkingDaysAction);
  return (
    <form onSubmit={onSubmit} className="space-y-3 px-5 py-4">
      <div className="flex flex-wrap gap-3">
        {days.map((day) => (
          <label key={day} className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-label">
            <input type="checkbox" name="day" value={day} defaultChecked={selected.includes(day)} /> {DAY_LABEL[day]}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending} className="btn-compact">
          Save working days
        </SubmitButton>
        <ResultMessage result={result} />
      </div>
    </form>
  );
}

export function AddHolidayForm() {
  const { result, pending, formRef, onSubmit } = useActionForm(holidayAction, { resetOnSuccess: true });
  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid items-start gap-3 px-5 py-4 sm:grid-cols-[180px_minmax(0,1fr)_auto]">
      <input type="hidden" name="command" value="add" />
      <div>
        <input aria-label="Date" type="date" name="date" className="field-input" />
        <FieldError result={result} name="date" />
      </div>
      <div>
        <input aria-label="Holiday name" name="name" maxLength={100} placeholder="e.g. Diwali" className="field-input" />
        <FieldError result={result} name="name" />
      </div>
      <SubmitButton pending={pending} className="btn-compact h-11">
        Add holiday
      </SubmitButton>
      {result && (result.ok || !result.fieldErrors) && (
        <div className="sm:col-span-3">
          <ResultMessage result={result} />
        </div>
      )}
    </form>
  );
}

export function RemoveHolidayButton({ date }: { date: string }) {
  const { pending, onSubmit, confirmBar } = useActionForm(holidayAction, { confirm: `Remove the holiday on ${date}? Due times already set stay as they are.` });
  return (
    <form onSubmit={onSubmit}>
      <input type="hidden" name="command" value="remove" />
      <input type="hidden" name="date" value={date} />
      <SubmitButton pending={pending} variant="secondary" className="btn-compact h-8">
        Remove
      </SubmitButton>
      {confirmBar}
    </form>
  );
}
