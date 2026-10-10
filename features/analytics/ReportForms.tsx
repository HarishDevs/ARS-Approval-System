"use client";

import Link from "next/link";
import { useState } from "react";
import { createAlertAction, createScheduleAction, defaultViewAction, deleteViewAction, requestExportAction, saveViewAction, shareViewAction, toggleAlertAction, toggleScheduleAction, updateScheduleAction } from "@/app/users/report-actions";
import { PeoplePicker, type PersonOption } from "@/features/ui/PeoplePicker";
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
        <label className="flex h-9 items-center gap-1.5 text-label">
          <input type="checkbox" name="shared" />
          Share with everyone
        </label>
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

// v1.7.0 (B07): saved views as chips. Others' shared views show who shared
// them; only your own can be changed. Opening a view re-checks your scope.
export interface ViewChip {
  id: number;
  name: string;
  href: string;
  mine: boolean;
  shared: boolean;
  isDefault: boolean;
  ownerName: string;
}

function ChipToggle({ action, viewId, field, on, label }: { action: Parameters<typeof useActionForm>[0]; viewId: number; field: string; on: boolean; label: string }) {
  const { pending, onSubmit } = useActionForm(action);
  return (
    <form onSubmit={onSubmit} className="inline">
      <input type="hidden" name="viewId" value={viewId} />
      {!on && <input type="hidden" name={field} value="on" />}
      <button type="submit" disabled={pending} className="ml-1.5 text-caption text-ink-muted underline-offset-2 hover:text-primary-700 hover:underline">
        {label}
      </button>
    </form>
  );
}

export function SavedViews({ views }: { views: ViewChip[] }) {
  if (!views.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-label" data-testid="saved-views">
      <span className="text-ink-muted">Saved:</span>
      {views.map((view) => (
        <span key={view.id} className={`inline-flex flex-wrap items-center rounded-full border px-2.5 py-0.5 ${view.isDefault ? "border-primary-600" : "border-line"}`}>
          <Link href={view.href} className="link">
            {view.name}
          </Link>
          {view.isDefault && <span className="ml-1.5 text-caption text-primary-700">default</span>}
          {!view.mine && <span className="ml-1.5 text-caption text-ink-muted">shared by {view.ownerName}</span>}
          {view.mine && view.shared && <span className="ml-1.5 text-caption text-ink-muted">shared</span>}
          {view.mine && (
            <>
              <ChipToggle action={defaultViewAction} viewId={view.id} field="isDefault" on={view.isDefault} label={view.isDefault ? "Clear default" : "Make default"} />
              <ChipToggle action={shareViewAction} viewId={view.id} field="shared" on={view.shared} label={view.shared ? "Stop sharing" : "Share"} />
              <DeleteViewButton viewId={view.id} name={view.name} />
            </>
          )}
        </span>
      ))}
    </div>
  );
}

export interface ScheduleValues {
  id: number;
  frequency: string;
  weekday: number | null;
  monthDay: number | null;
  hourIst: number;
  format: string;
  recipients: number[];
}

// B06: create a schedule, or edit one (when `existing` is given). Extra
// recipients each get the report run with their own permissions.
export function ScheduleForm({ reportKey, query, people = [], existing }: { reportKey?: string; query?: Record<string, string>; people?: PersonOption[]; existing?: ScheduleValues }) {
  const [frequency, setFrequency] = useState(existing?.frequency ?? "WEEKLY");
  const { result, pending, onSubmit } = useActionForm(existing ? updateScheduleAction : createScheduleAction);
  const prefix = existing ? `s${existing.id}-` : "";
  return (
    <details className="text-label">
      <summary className="cursor-pointer font-semibold text-primary-600">{existing ? "Change" : "Email this to me regularly"}</summary>
      <form onSubmit={onSubmit} className="mt-2 flex flex-wrap items-end gap-3">
        {existing ? <input type="hidden" name="scheduleId" value={existing.id} /> : <input type="hidden" name="reportKey" value={reportKey} />}
        {query && hidden(query)}
        <div>
          <label htmlFor={`${prefix}frequency`} className="field-label">
            How often
          </label>
          <select id={`${prefix}frequency`} name="frequency" value={frequency} onChange={(event) => setFrequency(event.target.value)} className="field-input h-9 w-36">
            <option value="DAILY">Every day</option>
            <option value="WEEKLY">Every week</option>
            <option value="MONTHLY">Every month</option>
          </select>
        </div>
        {frequency === "WEEKLY" && (
          <div>
            <label htmlFor={`${prefix}weekday`} className="field-label">
              Day
            </label>
            <select id={`${prefix}weekday`} name="weekday" defaultValue={String(existing?.weekday ?? 1)} className="field-input h-9 w-36">
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
            <label htmlFor={`${prefix}monthDay`} className="field-label">
              Day of month
            </label>
            <input id={`${prefix}monthDay`} name="monthDay" type="number" min={1} max={28} defaultValue={existing?.monthDay ?? 1} className="field-input h-9 w-24" />
          </div>
        )}
        <div>
          <label htmlFor={`${prefix}hour`} className="field-label">
            Time (India)
          </label>
          <select id={`${prefix}hour`} name="hour" defaultValue={String(existing?.hourIst ?? 8)} className="field-input h-9 w-28">
            {Array.from({ length: 24 }, (_, hour) => (
              <option key={hour} value={hour}>
                {String(hour).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${prefix}format`} className="field-label">
            Format
          </label>
          <select id={`${prefix}format`} name="format" defaultValue={existing?.format ?? "xlsx"} className="field-input h-9 w-28">
            <option value="xlsx">Excel</option>
            <option value="csv">CSV</option>
            <option value="pdf">PDF</option>
          </select>
        </div>
        {people.length > 0 && (
          <div className="w-full max-w-xl">
            <PeoplePicker
              name="recipient"
              label="Also send to (optional)"
              options={people}
              initial={existing?.recipients}
              max={10}
              help="Each person gets it with their own permissions: anyone who can't see this report for this scope is skipped. You always get it."
            />
          </div>
        )}
        <SubmitButton pending={pending} variant="secondary" className="btn-compact">
          {existing ? "Save changes" : "Schedule"}
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
      <div>
        <label htmlFor="severity" className="field-label">
          Severity
        </label>
        <select id="severity" name="severity" defaultValue="WARNING" className="field-input h-9 w-36">
          <option value="INFO">Information</option>
          <option value="WARNING">Warning</option>
          <option value="CRITICAL">Critical</option>
        </select>
      </div>
      <div>
        <label htmlFor="channels" className="field-label">
          Tell me by
        </label>
        <select id="channels" name="channels" defaultValue="INBOX_EMAIL" className="field-input h-9 w-44">
          <option value="INBOX_EMAIL">App inbox and email</option>
          <option value="INBOX">App inbox only</option>
        </select>
      </div>
      <fieldset className="flex items-end gap-2">
        <legend className="field-label">Quiet hours (India, optional)</legend>
        <select name="quietStart" defaultValue="" aria-label="Quiet from" className="field-input h-9 w-24">
          <option value="">—</option>
          {Array.from({ length: 24 }, (_, hour) => (
            <option key={hour} value={hour}>
              {String(hour).padStart(2, "0")}:00
            </option>
          ))}
        </select>
        <span className="pb-2">to</span>
        <select name="quietEnd" defaultValue="" aria-label="Quiet until" className="field-input h-9 w-24">
          <option value="">—</option>
          {Array.from({ length: 24 }, (_, hour) => (
            <option key={hour} value={hour}>
              {String(hour).padStart(2, "0")}:00
            </option>
          ))}
        </select>
        <FieldError result={result} name="quiet" />
      </fieldset>
      <SubmitButton pending={pending || !allowed.length} variant="secondary" className="btn-compact">
        Save alert
      </SubmitButton>
      {result && (result.ok || !result.fieldErrors) && <ResultMessage result={result} />}
    </form>
  );
}

// v1.7.0 (C02): ask for a big export (up to 50,000 rows for CSV and Excel),
// made in the background and kept for 7 days.
export function BackgroundExportForm({ reportKey, query, truncated }: { reportKey: string; query: Record<string, string>; truncated: boolean }) {
  const { result, pending, onSubmit } = useActionForm(requestExportAction);
  return (
    <details className="text-label" open={truncated}>
      <summary className="cursor-pointer font-semibold text-primary-600">Large export in the background</summary>
      <form onSubmit={onSubmit} className="mt-2 flex flex-wrap items-end gap-3">
        <input type="hidden" name="reportKey" value={reportKey} />
        {hidden(query)}
        <p className="w-full text-caption text-ink-muted">
          {truncated ? "This report has more rows than the screen and direct downloads show (5,000). " : ""}Up to 50,000 rows for Excel and CSV. You&apos;re told in the app when it&apos;s ready; download it from Reports within 7 days.
        </p>
        <div>
          <label htmlFor="bg-format" className="field-label">
            Format
          </label>
          <select id="bg-format" name="format" defaultValue="xlsx" className="field-input h-9 w-28">
            <option value="xlsx">Excel</option>
            <option value="csv">CSV</option>
            <option value="pdf">PDF (5,000 rows)</option>
          </select>
        </div>
        <SubmitButton pending={pending} variant="secondary" className="btn-compact">
          Make the export
        </SubmitButton>
        <ResultMessage result={result} />
      </form>
    </details>
  );
}
