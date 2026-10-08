"use client";

import { publishAction, simulateAction, updateDetailsAction } from "@/app/admin/workflows/actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import type { FormField } from "@/server/forms/fields";
import type { SimulationView } from "@/server/approvals/service";

// Test mode (P3-05): sample values → the exact route and names. Nothing is saved.
export function TestModePanel({ versionId, form, people }: { versionId: number; form: FormField[]; people: { id: number; label: string }[] }) {
  const { result, pending, onSubmit } = useActionForm(simulateAction);
  const view = (result?.ok ? (result.data as { view?: SimulationView } | undefined)?.view : undefined) ?? null;
  return (
    <form onSubmit={onSubmit} className="card space-y-4 px-5 py-4">
      <input type="hidden" name="versionId" value={versionId} />
      <div>
        <h2 className="font-semibold">Test mode</h2>
        <p className="text-label text-ink-muted">Enter sample values and see who would approve, in order. Nothing is saved or sent.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="sim-requester" className="field-label">
            Sample requester
          </label>
          <select id="sim-requester" name="requesterId" defaultValue="" className="field-input">
            <option value="">Choose a person…</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.label}
              </option>
            ))}
          </select>
          <FieldError result={result} name="requesterId" />
        </div>
        {form.map((field) => (
          <div key={field.key}>
            <label htmlFor={`sim-${field.key}`} className="field-label">
              {field.label}
            </label>
            {field.type === "CHOICE" ? (
              <select id={`sim-${field.key}`} name={`field:${field.key}`} defaultValue="" className="field-input">
                <option value="">—</option>
                {field.options?.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            ) : field.type === "PERSON" ? (
              <select id={`sim-${field.key}`} name={`field:${field.key}`} defaultValue="" className="field-input">
                <option value="">—</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.label}
                  </option>
                ))}
              </select>
            ) : (
              <input id={`sim-${field.key}`} name={`field:${field.key}`} type={field.type === "DATE" ? "date" : "text"} className="field-input" />
            )}
          </div>
        ))}
      </div>
      <SubmitButton pending={pending} variant="secondary" className="btn-compact">
        Run test
      </SubmitButton>
      <ResultMessage result={result} />
      {view && (
        <div className="space-y-3">
          {Object.keys(view.formErrors).length > 0 && (
            <p className="text-label text-warning-600">Some sample values aren&apos;t valid, so they were left out: {Object.values(view.formErrors).join(" ")}</p>
          )}
          <ol className="space-y-2">
            {view.stages.map((stage, index) => (
              <li key={index} className="rounded-md border border-line p-3 text-label">
                <p className="text-caption font-semibold uppercase tracking-wider text-ink-faint">
                  Stage {index + 1}
                  {stage.length > 1 ? " · in parallel" : ""}
                </p>
                {stage.map((step) => (
                  <p key={step.label} className="mt-1">
                    <span className="font-medium">{step.label}</span> <span className="text-ink-muted">({step.rule})</span>: {step.people.join(", ")}
                  </p>
                ))}
              </li>
            ))}
          </ol>
          {view.skipped.length > 0 && <p className="text-label text-ink-muted">Skipped: {view.skipped.join(", ")}</p>}
          {view.blocked.length > 0 && <p className="text-label text-danger-600">Blocked: {view.blocked.join("; ")}</p>}
        </div>
      )}
    </form>
  );
}

export function PublishButton({ workflowId, versionId, versionNo }: { workflowId: number; versionId: number; versionNo: number }) {
  const { result, pending, onSubmit, confirmBar } = useActionForm(publishAction, { confirm: `Publish version ${versionNo}? New requests will use it straight away.` });
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <input type="hidden" name="workflowId" value={workflowId} />
      <input type="hidden" name="versionId" value={versionId} />
      <SubmitButton pending={pending} className="btn-compact">
        Publish version {versionNo}
      </SubmitButton>
      <ResultMessage result={result} />
      {confirmBar}
    </form>
  );
}

export function DetailsForm({ workflowId, name, description, active }: { workflowId: number; name: string; description: string | null; active: boolean }) {
  const { result, pending, onSubmit } = useActionForm(updateDetailsAction);
  return (
    <form onSubmit={onSubmit} className="card space-y-3 px-5 py-4">
      <input type="hidden" name="workflowId" value={workflowId} />
      <h2 className="font-semibold">Details</h2>
      <div>
        <label htmlFor="d-name" className="field-label">
          Name
        </label>
        <input id="d-name" name="name" defaultValue={name} className="field-input" />
        <FieldError result={result} name="name" />
      </div>
      <div>
        <label htmlFor="d-desc" className="field-label">
          Description
        </label>
        <input id="d-desc" name="description" defaultValue={description ?? ""} className="field-input" />
      </div>
      <label className="flex items-center gap-2 text-label">
        <input type="checkbox" name="active" defaultChecked={active} /> Open for new requests
      </label>
      <SubmitButton pending={pending} variant="secondary" className="btn-compact">
        Save details
      </SubmitButton>
      <ResultMessage result={result} />
    </form>
  );
}
