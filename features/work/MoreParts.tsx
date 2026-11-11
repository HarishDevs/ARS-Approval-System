"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { addFieldAction, bulkAction, digestChoiceAction, fieldValueAction, fromTemplateAction, recurrenceAction, removeFieldAction, saveTemplateAction } from "@/app/users/work/actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { useWorkCall } from "@/features/work/client";
import { FIELD_KIND_LABEL, FIELD_KINDS, recurrenceLabel, RECURRENCE_KINDS, type Recurrence } from "@/server/work/more-rules";
import { PRIVACY, PRIVACY_LABEL } from "@/server/work/access";
import { ConfirmButton } from "@/features/ui/ConfirmButton";
import { PersonSelect } from "@/features/ui/PersonSelect";

// D-218: repeating tasks, custom fields, templates, bulk actions, the inbox
// and the morning summary switch.

// ---- repeat --------------------------------------------------------------------------
const KIND_LABEL: Record<(typeof RECURRENCE_KINDS)[number], string> = { DAILY: "Days", WEEKLY: "Weeks", MONTHLY: "Months", YEARLY: "Years", AFTER_DONE: "Days after it is completed" };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function RepeatEditor({ taskId, current, canChange }: { taskId: number; current: Recurrence | null; canChange: boolean }) {
  const { call } = useWorkCall();
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<Recurrence["kind"]>(current?.kind ?? "WEEKLY");
  const [every, setEvery] = useState(current?.every ?? 1);
  const [weekdays, setWeekdays] = useState<number[]>(current?.weekdays ?? []);
  return (
    <div data-testid="repeat">
      <h3 className="field-label">Repeats</h3>
      {!editing && (
        <p className="flex flex-wrap items-center gap-2 text-label">
          {current ? recurrenceLabel(current) : "Doesn't repeat"}
          {canChange && (
            <button type="button" className="link text-caption" onClick={() => setEditing(true)}>
              {current ? "Change" : "Make it repeat"}
            </button>
          )}
          {canChange && current && (
            <button type="button" className="link text-caption" onClick={() => void call(() => recurrenceAction(taskId, null))}>
              Stop repeating
            </button>
          )}
        </p>
      )}
      {editing && (
        <div className="space-y-2 rounded-md border border-line p-3">
          <div className="flex flex-wrap items-center gap-2 text-label">
            Every
            <input
              type="number"
              min={1}
              max={365}
              value={every}
              onChange={(event) => setEvery(Math.max(1, Math.min(365, Number(event.target.value) || 1)))}
              aria-label="Every how many"
              className="field-input h-8 w-20 py-0"
            />
            <select value={kind} onChange={(event) => setKind(event.target.value as Recurrence["kind"])} aria-label="Repeat unit" className="field-input h-8 w-auto py-0">
              {RECURRENCE_KINDS.map((item) => (
                <option key={item} value={item}>
                  {KIND_LABEL[item]}
                </option>
              ))}
            </select>
          </div>
          {kind === "WEEKLY" && (
            <fieldset className="flex flex-wrap gap-2 text-caption">
              <legend className="sr-only">On these days</legend>
              {DAYS.map((name, index) => (
                <label key={name} className="flex items-center gap-1">
                  <input type="checkbox" checked={weekdays.includes(index)} onChange={(event) => setWeekdays((value) => (event.target.checked ? [...value, index] : value.filter((day) => day !== index)))} /> {name}
                </label>
              ))}
            </fieldset>
          )}
          <p className="text-caption text-ink-muted">The next task is made when this one is completed, with the same people, projects, tags and subtasks.</p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-primary btn-compact"
              onClick={() => void call(() => recurrenceAction(taskId, { kind, every, weekdays: kind === "WEEKLY" ? weekdays : [] })).then((result) => result?.ok && setEditing(false))}
            >
              Save
            </button>
            <button type="button" className="btn-secondary btn-compact" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- custom fields -------------------------------------------------------------------
export interface FieldView {
  id: number;
  name: string;
  kind: "TEXT" | "NUMBER" | "SELECT" | "DATE";
  options: string[];
}
export function FieldInput({ taskId, field, value, canChange, compact }: { taskId: number; field: FieldView; value: string; canChange: boolean; compact?: boolean }) {
  const { call } = useWorkCall();
  const save = (next: string) => {
    if (next !== value) void call(() => fieldValueAction(taskId, field.id, next), { success: false });
  };
  const size = compact ? "h-8 py-0 text-label" : "h-9";
  const label = `${field.name}`;
  if (!canChange) return <span className="text-label">{value || "—"}</span>;
  if (field.kind === "SELECT")
    return (
      <select key={value} aria-label={label} defaultValue={value} onChange={(event) => save(event.target.value)} className={`field-input ${size} w-full`}>
        <option value="">—</option>
        {field.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  return (
    <input
      key={value}
      aria-label={label}
      type={field.kind === "DATE" ? "date" : field.kind === "NUMBER" ? "number" : "text"}
      defaultValue={value}
      maxLength={500}
      onBlur={(event) => save(event.target.value)}
      onKeyDown={(event) => event.key === "Enter" && (event.target as HTMLInputElement).blur()}
      className={`field-input ${size} w-full`}
    />
  );
}

export function FieldsManager({ projectId, fields }: { projectId: number; fields: FieldView[] }) {
  const { call } = useWorkCall();
  const { result, pending, onSubmit, formRef } = useActionForm(addFieldAction, { resetOnSuccess: true });
  const [kind, setKind] = useState("TEXT");
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-line" aria-label="Fields">
        {fields.length === 0 && <li className="py-2 text-label text-ink-muted">No fields yet.</li>}
        {fields.map((field) => (
          <li key={field.id} className="flex items-center gap-3 py-2 text-label">
            <span className="flex-1">
              <span className="font-medium">{field.name}</span>{" "}
              <span className="text-ink-muted">
                · {FIELD_KIND_LABEL[field.kind]}
                {field.options.length ? `: ${field.options.join(", ")}` : ""}
              </span>
            </span>
            <ConfirmButton
              ariaLabel={`Remove field ${field.name}`}
              title={`Remove the field “${field.name}”?`}
              body="The column and its values on every task in this project are removed. This can't be undone."
              confirmLabel="Remove"
              onConfirm={() => call(() => removeFieldAction(field.id))}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-faint hover:bg-danger-50 hover:text-danger-600"
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
            </ConfirmButton>
          </li>
        ))}
      </ul>
      <form ref={formRef} onSubmit={onSubmit} className="grid gap-3 rounded-md border border-line p-3 md:grid-cols-2" aria-label="Add a field">
        <input type="hidden" name="projectId" value={projectId} />
        <div>
          <label htmlFor="field-name" className="field-label">
            Field name
          </label>
          <input id="field-name" name="name" required maxLength={60} placeholder="e.g. Plant, Cost (₹), Stage" className="field-input" />
          <FieldError result={result} name="name" />
        </div>
        <div>
          <label htmlFor="field-kind" className="field-label">
            Kind
          </label>
          <select id="field-kind" name="kind" value={kind} onChange={(event) => setKind(event.target.value)} className="field-input">
            {FIELD_KINDS.map((item) => (
              <option key={item} value={item}>
                {FIELD_KIND_LABEL[item]}
              </option>
            ))}
          </select>
        </div>
        {kind === "SELECT" && (
          <div className="md:col-span-2">
            <label htmlFor="field-options" className="field-label">
              Choices (one per line)
            </label>
            <textarea id="field-options" name="options" rows={3} className="field-input h-auto py-2" />
            <FieldError result={result} name="options" />
          </div>
        )}
        <div className="flex items-center gap-3 md:col-span-2">
          <SubmitButton pending={pending}>Add field</SubmitButton>
          <ResultMessage result={result} />
        </div>
      </form>
    </div>
  );
}

// ---- templates and copies ----------------------------------------------------------------
export function SaveTemplateForm({ projectId, name }: { projectId: number; name: string }) {
  const { result, pending, onSubmit } = useActionForm(saveTemplateAction);
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2" aria-label="Save as a template">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="min-w-56 flex-1">
        <label htmlFor="template-name" className="field-label">
          Save as a template named
        </label>
        <input id="template-name" name="name" defaultValue={`${name} (template)`} maxLength={150} className="field-input h-9" />
      </div>
      <SubmitButton pending={pending} variant="secondary">
        Save as template
      </SubmitButton>
      <div className="w-full">
        <ResultMessage result={result} />
      </div>
    </form>
  );
}

export function FromTemplateForm({ templates, copyFrom, departments, defaultName }: { templates?: { id: number; name: string }[]; copyFrom?: number; departments: { id: number; name: string }[]; defaultName?: string }) {
  const { result, pending, onSubmit } = useActionForm(fromTemplateAction);
  return (
    <form onSubmit={onSubmit} className="space-y-3" aria-label={copyFrom ? "Copy this project" : "New project from a template"}>
      {copyFrom ? (
        <input type="hidden" name="copyFrom" value={copyFrom} />
      ) : (
        <div>
          <label htmlFor="from-template" className="field-label">
            Template
          </label>
          <select id="from-template" name="templateId" required defaultValue="" className="field-input">
            <option value="" disabled>
              Choose a template…
            </option>
            {(templates ?? []).map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
          <FieldError result={result} name="templateId" />
        </div>
      )}
      <div>
        <label htmlFor={`from-name-${copyFrom ?? "t"}`} className="field-label">
          New project name
        </label>
        <input id={`from-name-${copyFrom ?? "t"}`} name="name" required minLength={2} maxLength={150} defaultValue={defaultName} className="field-input" />
        <FieldError result={result} name="name" />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label htmlFor={`from-start-${copyFrom ?? "t"}`} className="field-label">
            Starts on
          </label>
          <input id={`from-start-${copyFrom ?? "t"}`} type="date" name="start_on" className="field-input" />
          <p className="mt-1 text-caption text-ink-muted">Task dates move with it.</p>
        </div>
        <div>
          <label htmlFor={`from-privacy-${copyFrom ?? "t"}`} className="field-label">
            Who can see it
          </label>
          <select id={`from-privacy-${copyFrom ?? "t"}`} name="privacy" defaultValue="PRIVATE" className="field-input">
            {PRIVACY.map((option) => (
              <option key={option} value={option}>
                {PRIVACY_LABEL[option]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`from-department-${copyFrom ?? "t"}`} className="field-label">
            Department
          </label>
          <select id={`from-department-${copyFrom ?? "t"}`} name="department" defaultValue="" className="field-input">
            <option value="">As before</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
          <FieldError result={result} name="department" />
        </div>
      </div>
      {copyFrom && (
        <label className="flex items-center gap-2 text-label">
          <input type="checkbox" name="copyMembers" /> Copy the members too
        </label>
      )}
      <ResultMessage result={result} />
      <SubmitButton pending={pending}>{copyFrom ? "Copy project" : "Create from template"}</SubmitButton>
    </form>
  );
}

// ---- bulk actions ----------------------------------------------------------------------
export function BulkBar({ ids, clear, people, sections, projectId }: { ids: number[]; clear: () => void; people?: { id: number; label: string; detail?: string }[]; sections?: { id: number; name: string }[]; projectId?: number }) {
  const { call, pending } = useWorkCall();
  const [op, setOp] = useState("COMPLETE");
  const [value, setValue] = useState("");
  if (!ids.length) return null;
  const run = async () => {
    const payload =
      op === "ASSIGN"
        ? { assigneeId: Number(value) }
        : op === "DUE"
          ? { dueDay: value }
          : op === "PRIORITY"
            ? { priority: value }
            : op === "SECTION"
              ? { projectId, sectionId: Number(value) }
              : op === "TAG"
                ? { tag: value }
                : {};
    const result = await call((choice) => bulkAction(ids, op, { ...payload, ...(choice?.moveTo && op === "DUE" ? { dueDay: choice.moveTo } : {}), holidayOk: choice?.holidayOk }));
    if (result?.ok) {
      clear();
      setValue("");
    }
  };
  const needsValue = op !== "COMPLETE" && op !== "DELETE";
  return (
    <div role="region" aria-label="Selected tasks" className="sticky bottom-3 z-20 mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary-600/30 bg-raised px-3 py-2 shadow-lg" data-testid="bulk-bar">
      <span className="text-label font-semibold">{ids.length} selected</span>
      <select
        aria-label="Do"
        value={op}
        onChange={(event) => {
          setOp(event.target.value);
          setValue("");
        }}
        className="field-input h-8 w-auto py-0 text-label"
      >
        <option value="COMPLETE">Complete</option>
        {people && <option value="ASSIGN">Assign to</option>}
        <option value="DUE">Set due date</option>
        <option value="PRIORITY">Set priority</option>
        {sections && <option value="SECTION">Move to section</option>}
        <option value="TAG">Add tag</option>
        <option value="DELETE">Delete</option>
      </select>
      {op === "ASSIGN" && (
        <PersonSelect ariaLabel="Person" options={people ?? []} value={value ? Number(value) : null} onChange={(id) => setValue(id === null ? "" : String(id))} emptyLabel="Choose…" compact className="w-56 text-label" />
      )}
      {op === "DUE" && <input type="date" aria-label="Due date" value={value} onChange={(event) => setValue(event.target.value)} className="field-input h-8 w-40 py-0 text-label" />}
      {op === "PRIORITY" && (
        <select aria-label="Priority" value={value} onChange={(event) => setValue(event.target.value)} className="field-input h-8 w-32 py-0 text-label">
          <option value="">Choose…</option>
          <option value="URGENT">Critical</option>
          <option value="HIGH">Most Important</option>
          <option value="IMPORTANT">Important</option>
          <option value="NORMAL">Normal</option>
        </select>
      )}
      {op === "SECTION" && (
        <select aria-label="Section" value={value} onChange={(event) => setValue(event.target.value)} className="field-input h-8 w-40 py-0 text-label">
          <option value="">Choose…</option>
          {sections?.map((section) => (
            <option key={section.id} value={section.id}>
              {section.name}
            </option>
          ))}
        </select>
      )}
      {op === "TAG" && <input aria-label="Tag" value={value} onChange={(event) => setValue(event.target.value)} maxLength={60} className="field-input h-8 w-40 py-0 text-label" />}
      <button type="button" disabled={pending || (needsValue && !value)} onClick={() => void run()} className={`${op === "DELETE" ? "btn-danger" : "btn-primary"} btn-compact`}>
        Apply
      </button>
      <button type="button" onClick={clear} className="btn-secondary btn-compact">
        Clear
      </button>
    </div>
  );
}

export function DigestToggle({ on }: { on: boolean }) {
  const { call } = useWorkCall();
  const [checked, setChecked] = useState(on);
  return (
    <label className="flex items-center gap-2 text-label">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          const next = event.target.checked;
          setChecked(next);
          void call(() => digestChoiceAction(next)).then((result) => {
            if (!result?.ok) setChecked(!next);
          });
        }}
      />{" "}
      Morning summary email
    </label>
  );
}

export function StopRepeatButton({ taskId }: { taskId: number }) {
  const { call, pending } = useWorkCall();
  return (
    <button type="button" disabled={pending} className="btn-secondary btn-compact" onClick={() => void call(() => recurrenceAction(taskId, null))}>
      Stop repeating
    </button>
  );
}
