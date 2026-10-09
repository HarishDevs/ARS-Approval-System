"use client";

import { resubmitAction, submitRequestAction } from "@/app/users/actions";
import { useState } from "react";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { ErrorSummary } from "@/features/ui/Field";
import { NO_LOOKUPS, type FieldLookups, type FormField } from "@/server/forms/fields";
import { ACCEPT_ATTRIBUTE } from "@/server/attachments/files";
import { DraftStatus, useDraftAutosave } from "@/features/requests/useDraftAutosave";

// A saved draft for this form (#3): what was restored, and its version.
export interface DraftInfo {
  key: string;
  version: number | null;
  savedAt: string | null;
}

// Raise a request, or edit and resubmit one (F-14). The server re-checks
// every field against the workflow version's form (D-055).
export function RequestForm({
  mode,
  workflowId,
  requestId,
  fields,
  people,
  approverPeople,
  approverFields = [],
  lookups = NO_LOOKUPS,
  initial,
  initialTitle,
  draft,
}: {
  mode: "submit" | "resubmit";
  workflowId?: number;
  requestId?: number;
  fields: FormField[];
  people: { id: number; label: string }[];
  // D-085: person fields that decide an approver list approvers only.
  approverPeople?: { id: number; label: string }[];
  approverFields?: string[];
  // Department / designation lists for "from the list" fields (D-088).
  lookups?: FieldLookups;
  initial?: Record<string, string>;
  initialTitle?: string;
  draft?: DraftInfo;
}) {
  const { result, pending, onSubmit } = useActionForm(mode === "submit" ? submitRequestAction : resubmitAction);
  const restoredAt = draft?.savedAt ? new Date(draft.savedAt) : null;
  const autosave = useDraftAutosave({ draftKey: draft?.key ?? "", initialVersion: draft?.version ?? null, savedAt: null, disabled: !draft });
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);
  // D-QA-01: one key per form; a retried submit returns the same request.
  const [submissionKey] = useState(() => crypto.randomUUID());
  const possibleDuplicate = Boolean(result && !result.ok && result.fieldErrors?.allowDuplicate);
  // FB-06: every field problem listed at the top, linked to the field.
  const summaryErrors = result && !result.ok && result.fieldErrors ? Object.fromEntries(Object.entries(result.fieldErrors).filter(([key]) => key !== "allowDuplicate").map(([key, message]) => [key === "title" || key === "attachments" ? key : `f-${key}`, message])) : undefined;
  const summaryLabels: Record<string, string> = { title: "Title", attachments: "Attachments", ...Object.fromEntries(fields.map((field) => [`f-${field.key}`, field.label])) };

  return (
    <form ref={autosave.formRef} onSubmit={onSubmit} className="card">
      {draft && restoredAt && (
        <p role="status" className="border-b border-line bg-primary-50/50 px-5 py-2 text-label text-primary-700">
          Restored your draft from {restoredAt.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}. Files aren&apos;t kept in drafts: add them again before submitting.
        </p>
      )}
      {workflowId && <input type="hidden" name="workflowId" value={workflowId} />}
      {requestId && <input type="hidden" name="requestId" value={requestId} />}
      {mode === "submit" && <input type="hidden" name="submissionKey" value={submissionKey} />}
      <div className="space-y-5 px-5 py-5">
        <ErrorSummary errors={summaryErrors} labels={summaryLabels} />
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
            <FieldInput
              field={field}
              people={approverPeople && approverFields.includes(field.key) ? approverPeople : people}
              lookups={lookups}
              defaultValue={initial?.[field.key] ?? ""}
              error={result && !result.ok ? result.fieldErrors?.[field.key] : undefined}
            />
            {field.help && (
              <p id={`f-${field.key}-hint`} className="mt-1 text-caption text-ink-muted">
                {field.help}
              </p>
            )}
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
      {possibleDuplicate && (
        <label className="mx-5 mb-4 flex items-start gap-2 rounded-md border border-warning-600/40 bg-warning-50 px-3 py-2 text-label text-warning-600">
          <input type="checkbox" name="allowDuplicate" className="mt-0.5" />
          <span>This is a separate request: raise it anyway.</span>
        </label>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4">
        <SubmitButton pending={pending} className="btn-compact">
          {mode === "submit" ? "Submit request" : "Resubmit"}
        </SubmitButton>
        <div className="min-w-0 flex-1">
          <ResultMessage result={result} />
        </div>
      </div>
      {draft && (
        <div className="space-y-2 border-t border-line px-5 py-3">
          <DraftStatus state={autosave.state} restoredAt={restoredAt} onDiscard={() => setConfirmDiscard(true)} />
          {confirmDiscard && (
            <div role="alertdialog" aria-label="Discard draft" className="flex flex-wrap items-center gap-2 rounded-md border border-warning-600/40 bg-warning-50 px-3 py-2 text-label">
              <span>Discard this draft? What you typed is cleared.</span>
              <button
                type="button"
                className="btn-primary btn-compact"
                onClick={async () => {
                  const done = await autosave.discard().catch(() => ({ ok: false, message: "Couldn't reach the server. Try again." }));
                  if (done.ok) window.location.reload();
                  else setDiscardError(done.message);
                }}
              >
                Yes, discard
              </button>
              <button type="button" className="btn-secondary btn-compact" onClick={() => setConfirmDiscard(false)}>
                Cancel
              </button>
              {discardError && <span className="text-danger-600">{discardError}</span>}
            </div>
          )}
        </div>
      )}
    </form>
  );
}

function FieldInput({ field, people, lookups, defaultValue, error }: { field: FormField; people: { id: number; label: string }[]; lookups: FieldLookups; defaultValue: string; error?: string }) {
  const id = `f-${field.key}`;
  // FB-06: the hint and the error are read with the control.
  const describedBy = [field.help ? `${id}-hint` : null, error ? `${field.key}-error` : null].filter(Boolean).join(" ") || undefined;
  const a11y = { "aria-invalid": error ? true : undefined, "aria-describedby": describedBy, "aria-required": field.required || undefined };
  switch (field.type) {
    case "LONG_TEXT":
      return <textarea id={id} name={field.key} {...a11y} defaultValue={defaultValue} rows={4} className="field-input h-auto py-2.5" />;
    case "NUMBER":
      return <input id={id} name={field.key} {...a11y} defaultValue={defaultValue} inputMode="decimal" placeholder="e.g. 12,50,000" className="field-input" />;
    case "DATE":
      return <input id={id} name={field.key} {...a11y} type="date" defaultValue={defaultValue} className="field-input" />;
    case "CHOICE":
      return (
        <select id={id} name={field.key} {...a11y} defaultValue={defaultValue} className="field-input">
          <option value="">Choose…</option>
          {field.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    case "LOOKUP": {
      const items = field.source ? lookups[field.source] : [];
      return (
        <select id={id} name={field.key} {...a11y} defaultValue={defaultValue} className="field-input">
          <option value="">Choose…</option>
          {/* A value saved earlier that is no longer active stays selectable. */}
          {defaultValue && !items.some((item) => item.code === defaultValue) && <option value={defaultValue}>{defaultValue}</option>}
          {items.map((item) => (
            <option key={item.code} value={item.code}>
              {item.name}
            </option>
          ))}
        </select>
      );
    }
    case "PERSON":
      return (
        <select id={id} name={field.key} {...a11y} defaultValue={defaultValue} className="field-input">
          <option value="">Choose a person…</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.label}
            </option>
          ))}
        </select>
      );
    default:
      return <input id={id} name={field.key} {...a11y} defaultValue={defaultValue} className="field-input" />;
  }
}
