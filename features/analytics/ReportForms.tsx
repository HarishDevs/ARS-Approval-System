"use client";

import { useState } from "react";
import { createAlertAction, createScheduleAction, deleteViewAction, saveViewAction, toggleAlertAction, toggleScheduleAction } from "@/app/users/report-actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";

// Saved views, schedules and alerts (Addendum A, D-123).
const hidden = (query: Record<string, string>) => Object.entries(query).map(([key, value]) => <input key={key} type="hidden" name={`q_${key}`} value={value} />);

export function SaveViewForm({ target, query }: { target: string; query: Record<string, string> }) {
  const { result, pending, formRef, onSubmit } = useActionForm(saveViewAction, { resetOnSuccess: true });
  return (
    <details className="text-label">
      <summary className="cursor-pointer font-semibold text-primary-600">Save these filters</summary>
      <form ref={formRef} onSubmit={onSubmit} className="mt-2 flex flex-wrap items-start gap-2">
        <input type="hidden" name="target" value={target} />
        {hidden(query)}
        <div>
          <label htmlFor={`view-${target}`} className="sr-only">
            View name
          </label>
          <input id={`view-${target}`} name="viewName" maxLength={80} placeholder="e.g. Purchase, this quarter" className="field-input h-9 w-56" />
          <FieldError result={result} name="viewName" />
        </div>
        <SubmitButton pending={pending} variant="secondary" className="btn-compact">
          Save view
        </SubmitButton>
        {result && (result.ok || !result.fieldErrors) && <ResultMessage result={result} />}
      </form>
    </details>
  );
}

export function DeleteViewButton({ viewId, name }: { viewId: number; name: string }) {
  const { pending, onSubmit } = useActionForm(deleteViewAction);
  return (
    <form onSubmit={onSubmit} className="inline">
      <input type="hidden" name="viewId" value={viewId} />
      <button type="submit" disabled={pending} aria-label={`Delete view ${name}`} className="ml-1 text-caption text-ink-muted hover:text-danger-600">
        ×
      </button>
    </form>
  );
}

export function ScheduleForm({ reportKey, query }: { reportKey: string; query: Record<string, string> }) {
  const [frequency, setFrequency] = useState("WEEKLY");
  const { result, pending, onSubmit } = useActionForm(createScheduleAction);
  return (
    <details className="text-label">
      <summary className="cursor-pointer font-semibold text-primary-600">Email this to me regularly</summary>
      <form onSubmit={onSubmit} className="mt-2 flex flex-wrap items-end gap-3">
        <input type="hidden" name="reportKey" value={reportKey} />
        {hidden(query)}
        <div>
          <label htmlFor="frequency" className="field-label">
            How often
          </label>
          <select id="frequency" name="frequency" value={frequency} onChange={(event) => setFrequency(event.target.value)} className="field-input h-9 w-36">
            <option value="DAILY">Every day</option>
            <option value="WEEKLY">Every week</option>
            <option value="MONTHLY">Every month</option>
          </select>
        </div>
        {frequency === "WEEKLY" && (
          <div>
            <label htmlFor="weekday" className="field-label">
              Day
            </label>
            <select id="weekday" name="weekday" defaultValue="1" className="field-input h-9 w-36">
              {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day, index) => (
                <option key={day} value={index + 1}>
                  {day}
                </option>
              ))}
            </select>
          </div>
        )}
        {frequency === "MONTHLY" && (
          <div>
            <label htmlFor="monthDay" className="field-label">
              Day of month
            </label>
            <input id="monthDay" name="monthDay" type="number" min={1} max={28} defaultValue={1} className="field-input h-9 w-24" />
          </div>
        )}
        <div>
          <label htmlFor="hour" className="field-label">
            Time (India)
          </label>
          <select id="hour" name="hour" defaultValue="8" className="field-input h-9 w-28">
            {Array.from({ length: 24 }, (_, hour) => (
              <option key={hour} value={hour}>
                {String(hour).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="format" className="field-label">
            Format
          </label>
          <select id="format" name="format" defaultValue="xlsx" className="field-input h-9 w-28">
            <option value="xlsx">Excel</option>
            <option value="csv">CSV</option>
            <option value="pdf">PDF</option>
          </select>
        </div>
        <SubmitButton pending={pending} variant="secondary" className="btn-compact">
          Schedule
        </SubmitButton>
        <ResultMessage result={result} />
      </form>
    </details>
  );
}

export function ToggleForm({ kind, id, active, label }: { kind: "schedule" | "alert"; id: number; active: boolean; label: string }) {
  const { result, pending, onSubmit } = useActionForm(kind === "schedule" ? toggleScheduleAction : toggleAlertAction);
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name={kind === "schedule" ? "scheduleId" : "ruleId"} value={id} />
      {!active && <input type="hidden" name="active" value="on" />}
      <SubmitButton pending={pending} variant="secondary" className="btn-compact">
        {active ? `Switch off ${label}` : `Switch on ${label}`}
      </SubmitButton>
      {result && !result.ok && <ResultMessage result={result} />}
    </form>
  );
}

export function AlertForm({ scopes, metrics }: { scopes: { kind: string; label: string }[]; metrics: { key: string; label: string; scopes: string[]; needsDays?: boolean }[] }) {
  const [metric, setMetric] = useState(metrics[0]?.key ?? "");
  const chosen = metrics.find((item) => item.key === metric);
  const allowed = scopes.filter((scope) => chosen?.scopes.includes(scope.kind));
  const { result, pending, formRef, onSubmit } = useActionForm(createAlertAction, { resetOnSuccess: true });
  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-wrap items-end gap-3 text-label">
      <div>
        <label htmlFor="metric" className="field-label">
          Tell me when
        </label>
        <select id="metric" name="metric" value={metric} onChange={(event) => setMetric(event.target.value)} className="field-input h-9 w-72">
          {metrics.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </select>
        <FieldError result={result} name="metric" />
      </div>
      {chosen?.needsDays && (
        <div>
          <label htmlFor="days" className="field-label">
            N (days)
          </label>
          <input id="days" name="days" type="number" min={1} max={90} defaultValue={3} className="field-input h-9 w-20" />
          <FieldError result={result} name="days" />
        </div>
      )}
      <div>
        <label htmlFor="alert-scope" className="field-label">
          For
        </label>
        <select id="alert-scope" name="scope" className="field-input h-9 w-48">
          {allowed.map((scope) => (
            <option key={scope.kind} value={scope.kind}>
              {scope.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="threshold" className="field-label">
          reaches
        </label>
        <input id="threshold" name="threshold" type="number" min={1} defaultValue={5} className="field-input h-9 w-24" />
        <FieldError result={result} name="threshold" />
      </div>
      <SubmitButton pending={pending || !allowed.length} variant="secondary" className="btn-compact">
        Save alert
      </SubmitButton>
      {result && (result.ok || !result.fieldErrors) && <ResultMessage result={result} />}
    </form>
  );
}
