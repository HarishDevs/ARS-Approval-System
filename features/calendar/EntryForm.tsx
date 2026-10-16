"use client";

import { useState } from "react";
import { saveCalendarItemAction } from "@/app/users/calendar-actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";

export interface EntryValues {
  itemId?: number;
  title: string;
  notes: string;
  allDay: boolean;
  date: string;
  endDate: string;
  start: string;
  end: string;
}

// v1.11.0: a personal calendar entry (times in India time). It syncs to
// Google Calendar when the person has connected it.
export function EntryForm({ values, submitLabel }: { values: EntryValues; submitLabel: string }) {
  const { result, pending, onSubmit, formRef } = useActionForm(saveCalendarItemAction, { resetOnSuccess: values.itemId === undefined });
  const [allDay, setAllDay] = useState(values.allDay);
  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label={values.itemId ? "Edit entry" : "New entry"}>
      {values.itemId !== undefined && <input type="hidden" name="itemId" value={values.itemId} />}
      <label className="text-label sm:col-span-2">
        Title
        <input name="title" required maxLength={200} defaultValue={values.title} className="field-input mt-1 w-full" />
        <FieldError result={result} name="title" />
      </label>
      <label className="flex items-center gap-2 text-label sm:col-span-2">
        <input type="checkbox" name="allDay" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} className="h-4 w-4" />
        All day
      </label>
      <label className="text-label">
        {allDay ? "From" : "Date"}
        <input name="date" type="date" required defaultValue={values.date} className="field-input mt-1 w-full" />
        <FieldError result={result} name="date" />
      </label>
      {allDay ? (
        <label className="text-label">
          To (optional)
          <input name="endDate" type="date" defaultValue={values.endDate} className="field-input mt-1 w-full" />
          <FieldError result={result} name="endDate" />
        </label>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <label className="text-label">
            Starts
            <input name="start" type="time" defaultValue={values.start} className="field-input mt-1 w-full" />
            <FieldError result={result} name="start" />
          </label>
          <label className="text-label">
            Ends
            <input name="end" type="time" defaultValue={values.end} className="field-input mt-1 w-full" />
            <FieldError result={result} name="end" />
          </label>
        </div>
      )}
      <label className="text-label sm:col-span-2">
        Notes (optional)
        <textarea name="notes" rows={2} maxLength={2000} defaultValue={values.notes} className="field-input mt-1 w-full" />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
        <ResultMessage result={result} />
      </div>
    </form>
  );
}
