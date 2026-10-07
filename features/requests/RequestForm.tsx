"use client";

import { resubmitAction, submitRequestAction } from "@/app/users/actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import type { FormField } from "@/server/forms/fields";
import { ACCEPT_ATTRIBUTE } from "@/server/attachments/files";

// Raise a request, or edit and resubmit one (F-14). The server re-checks
// every field against the workflow version's form (D-055).
export function RequestForm({
  mode,
  workflowId,
  requestId,
  fields,
  people,
  initial,
  initialTitle,
}: {
  mode: "submit" | "resubmit";
  workflowId?: number;
  requestId?: number;
  fields: FormField[];
  people: { id: number; label: string }[];
  initial?: Record<string, string>;
  initialTitle?: string;
}) {
  const { result, pending, onSubmit } = useActionForm(mode === "submit" ? submitRequestAction : resubmitAction);

  return (
    <form onSubmit={onSubmit} className="card">
      {workflowId && <input type="hidden" name="workflowId" value={workflowId} />}
      {requestId && <input type="hidden" name="requestId" value={requestId} />}
      <div className="space-y-5 px-5 py-5">
        {mode === "submit" && (
          <div>
            <label htmlFor="title" className="field-label">
              Title
            </label>
            <input id="title" name="title" defaultValue={initialTitle ?? ""} placeholder="A short description, e.g. New motor for crane 3" className="field-input" />
            <FieldError result={result} name="title" />
          </div>
        )}
        {fields.map((field) => (
          <div key={field.key}>
            <label htmlFor={`f-${field.key}`} className="field-label">
              {field.label}
              {!field.required && <span className="font-normal text-ink-faint"> (optional)</span>}
            </label>
            <FieldInput field={field} people={people} defaultValue={initial?.[field.key] ?? ""} />
            {field.help && <p className="mt-1 text-caption text-ink-muted">{field.help}</p>}
            <FieldError result={result} name={field.key} />
          </div>
        ))}
        <div>
          <label htmlFor="f-attachments" className="field-label">
            {mode === "submit" ? "Attachments" : "Add files"} <span className="font-normal text-ink-faint">(optional)</span>
          </label>
          <input id="f-attachments" name="attachments" type="file" multiple accept={ACCEPT_ATTRIBUTE} className="block w-full text-label file:mr-3 file:rounded-md file:border-0 file:bg-surface-muted file:px-3 file:py-2" />
          <p className="mt-1 text-caption text-ink-muted">Quotes, invoices, photos: PDF, images, Word, Excel, PowerPoint, CSV or text. Up to 5 files of 10 MB each.</p>
          <FieldError result={result} name="attachments" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4">
        <SubmitButton pending={pending} className="btn-compact">
          {mode === "submit" ? "Submit request" : "Resubmit"}
        </SubmitButton>
        <div className="min-w-0 flex-1">
          <ResultMessage result={result} />
        </div>
      </div>
    </form>
  );
}

function FieldInput({ field, people, defaultValue }: { field: FormField; people: { id: number; label: string }[]; defaultValue: string }) {
  const id = `f-${field.key}`;
  switch (field.type) {
    case "LONG_TEXT":
      return <textarea id={id} name={field.key} defaultValue={defaultValue} rows={4} className="field-input h-auto py-2.5" />;
    case "NUMBER":
      return <input id={id} name={field.key} defaultValue={defaultValue} inputMode="decimal" placeholder="e.g. 12,50,000" className="field-input" />;
    case "DATE":
      return <input id={id} name={field.key} type="date" defaultValue={defaultValue} className="field-input" />;
    case "CHOICE":
      return (
        <select id={id} name={field.key} defaultValue={defaultValue} className="field-input">
          <option value="">Choose…</option>
          {field.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    case "PERSON":
      return (
        <select id={id} name={field.key} defaultValue={defaultValue} className="field-input">
          <option value="">Choose a person…</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.label}
            </option>
          ))}
        </select>
      );
    default:
      return <input id={id} name={field.key} defaultValue={defaultValue} className="field-input" />;
  }
}
