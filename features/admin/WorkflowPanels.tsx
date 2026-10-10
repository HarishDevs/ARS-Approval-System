"use client";

import { publishAction, simulateAction, updateDetailsAction, deleteWorkflowAction, updateTypeSettingsAction } from "@/app/admin/workflows/actions";
import type { TypeSettings } from "@/server/workflows/type-settings";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { NO_LOOKUPS, type FieldLookups, type FormField } from "@/server/forms/fields";
import type { SimulationView } from "@/server/approvals/service";

// Test mode (P3-05): sample values → the exact route and names. Nothing is saved.
export function TestModePanel({ versionId, form, people, lookups = NO_LOOKUPS }: { versionId: number; form: FormField[]; people: { id: number; label: string }[]; lookups?: FieldLookups }) {
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
        {form.filter((field) => field.type !== "SECTION" && field.type !== "CALC").map((field) => (
          <div key={field.key}>
            <label htmlFor={`sim-${field.key}`} className="field-label">
              {field.label}
              {field.type === "LINE_ITEMS" && <span className="font-normal text-ink-faint"> (sample total, ₹)</span>}
              {field.type === "ATTACHMENT" && <span className="font-normal text-ink-faint"> (number of files)</span>}
            </label>
            {field.type === "LINE_ITEMS" ? (
              <input id={`sim-${field.key}`} name={`lines:${field.key}`} inputMode="decimal" className="field-input" />
            ) : field.type === "CHOICE" ? (
              <select id={`sim-${field.key}`} name={`field:${field.key}`} defaultValue="" className="field-input">
                <option value="">—</option>
                {field.options?.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            ) : field.type === "LOOKUP" ? (
              <select id={`sim-${field.key}`} name={`field:${field.key}`} defaultValue="" className="field-input">
                <option value="">—</option>
                {(field.source ? lookups[field.source] : []).map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
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
          {view.branches.length > 0 && (
            <div className="text-label">
              <p className="font-medium">Choices</p>
              <ul className="list-disc pl-5 text-ink-muted">
                {view.branches.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            </div>
          )}
          {view.skippedReasons.length > 0 && (
            <div className="text-label">
              <p className="text-ink-muted">Skipped: {view.skipped.join(", ")}</p>
              <ul aria-label="Why steps were skipped" className="list-disc pl-5 text-ink-muted">
                {view.skippedReasons.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            </div>
          )}
          {view.blocked.length > 0 && <p className="text-label text-danger-600">Blocked: {view.blocked.join("; ")}</p>}
          {view.comparison && (
            <div className="rounded-md border border-line bg-surface-muted p-3 text-label">
              <p className="font-medium">Compared with the live version {view.comparison.liveVersionNo}</p>
              {view.comparison.same ? (
                <p className="text-ink-muted">Same route and people for this sample.</p>
              ) : (
                <ul className="list-disc pl-5">
                  {view.comparison.notes.map((note, index) => (
                    <li key={index}>{note}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {view.impact && (
            <p className="text-label text-ink-muted">
              {view.impact.isLive
                ? `This is the live version. `
                : `Publishing version ${view.impact.versionNo} affects new requests only. `}
              {view.impact.openRequests === 0
                ? "No requests of this type are open right now."
                : `${view.impact.openRequests} open request${view.impact.openRequests === 1 ? "" : "s"} of this type keep the version they started with.`}
            </p>
          )}
        </div>
      )}
    </form>
  );
}

export function PublishButton({ workflowId, versionId, versionNo }: { workflowId: number; versionId: number; versionNo: number }) {
  const { result, pending, onSubmit, confirmBar } = useActionForm(publishAction, { confirmTitle: `Publish version ${versionNo}?`, confirmLabel: "Yes, publish", confirm: `Publish version ${versionNo}? New requests will use it straight away.` });
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

export function DetailsForm({
  workflowId,
  name,
  description,
  active,
  resubmitPolicy = "REQUESTING_STEP",
}: {
  workflowId: number;
  name: string;
  description: string | null;
  active: boolean;
  resubmitPolicy?: "REQUESTING_STEP" | "BEGINNING";
}) {
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
      <div>
        <label htmlFor="d-resubmit" className="field-label">
          After &quot;changes asked&quot;, a resubmitted request starts again
        </label>
        <select id="d-resubmit" name="resubmitPolicy" defaultValue={resubmitPolicy} className="field-input">
          <option value="REQUESTING_STEP">at the step that asked (earlier approvals stand)</option>
          <option value="BEGINNING">from the first level (everyone approves again)</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-label">
        <input type="checkbox" name="active" defaultChecked={active} /> Open for new requests <span className="text-ink-faint">(untick to archive)</span>
      </label>
      <SubmitButton pending={pending} variant="secondary" className="btn-compact">
        Save details
      </SubmitButton>
      <ResultMessage result={result} />
    </form>
  );
}

// Remove an approval type that was never used (two-step confirmation).
export function DeleteWorkflowForm({ workflowId, name }: { workflowId: number; name: string }) {
  const { result, pending, onSubmit, confirmBar } = useActionForm(deleteWorkflowAction, { confirm: `Remove "${name}" for good? This can't be undone.`, confirmTitle: "Remove this approval type?", confirmLabel: "Yes, remove", confirmTone: "danger" });
  return (
    <form onSubmit={onSubmit} className="card space-y-2 px-5 py-4">
      <input type="hidden" name="workflowId" value={workflowId} />
      <h2 className="font-semibold">Remove this approval type</h2>
      <p className="text-label text-ink-muted">Only if no request was ever raised on it. Otherwise archive it above.</p>
      <SubmitButton pending={pending} variant="secondary" className="btn-compact text-danger-600">
        Remove approval type
      </SubmitButton>
      {confirmBar}
      <ResultMessage result={result} />
    </form>
  );
}

// Submission checks for this type (FN1, FN3, EN-09) and, for later
// features, approval validity (EN-10) and amendments (FN5). All off by
// default: nothing is checked that IT hasn't switched on.
export function TypeSettingsForm({ workflowId, settings, form }: { workflowId: number; settings: TypeSettings; form: FormField[] }) {
  const { result, pending, onSubmit } = useActionForm(updateTypeSettingsAction);
  // Attachment fields hold a file count: not a duplicate key, not amendable.
  const fields = form.filter((field) => field.type !== "SECTION" && field.type !== "ATTACHMENT");
  const numeric = fields.filter((field) => ["NUMBER", "CALC", "LINE_ITEMS"].includes(field.type));
  return (
    <form onSubmit={onSubmit} className="card space-y-4 px-5 py-4">
      <input type="hidden" name="workflowId" value={workflowId} />
      <div>
        <h2 className="font-semibold">Submission checks</h2>
        <p className="text-label text-ink-muted">Checked before a request is submitted (people can also check first). Off unless you switch them on.</p>
      </div>
      <fieldset className="space-y-2">
        <legend className="field-label">Possible duplicates: match on</legend>
        <div className="flex flex-wrap gap-3">
          {fields.length === 0 && <span className="text-caption text-ink-faint">Save the form first.</span>}
          {fields.map((field) => (
            <label key={field.key} className="flex items-center gap-2 text-label">
              <input type="checkbox" name="dupField" value={field.key} defaultChecked={settings.duplicates.fields.includes(field.key)} />
              {field.label}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-label">
          <label className="flex items-center gap-2">
            within the last
            <input name="dupWindow" type="number" min={1} max={730} defaultValue={settings.duplicates.windowDays} className="field-input w-24" aria-label="Days to look back for duplicates" />
            days
          </label>
          <label className="flex items-center gap-2">
            then
            <select name="dupPolicy" defaultValue={settings.duplicates.policy} className="field-input w-auto" aria-label="What to do with a possible duplicate">
              <option value="WARN">warn (the requester says why it isn&apos;t one)</option>
              <option value="BLOCK">block (IT can still submit with a reason)</option>
            </select>
          </label>
        </div>
      </fieldset>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="minFiles" className="field-label">
            Files required
          </label>
          <input id="minFiles" name="minFiles" type="number" min={0} max={20} defaultValue={settings.attachments.minimum} className="field-input w-24" />
        </div>
        <div className="min-w-60 flex-1">
          <label htmlFor="filesNote" className="field-label">
            Which files <span className="font-normal text-ink-faint">(shown to the requester)</span>
          </label>
          <input id="filesNote" name="filesNote" maxLength={200} defaultValue={settings.attachments.note ?? ""} placeholder="e.g. two quotes and the vendor form" className="field-input" />
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex h-11 items-center gap-2 text-label">
          <input type="checkbox" name="budgetEnabled" defaultChecked={settings.budget.enabled} />
          Check against the department budget
        </label>
        <div>
          <label htmlFor="budgetField" className="field-label">
            Amount field
          </label>
          <select id="budgetField" name="budgetField" defaultValue={settings.budget.amountField} className="field-input w-auto">
            {numeric.length === 0 && <option value="amount">amount</option>}
            {numeric.map((field) => (
              <option key={field.key} value={field.key}>
                {field.label}
              </option>
            ))}
          </select>
          <FieldError result={result} name="budgetField" />
        </div>
        <div>
          <label htmlFor="validityDays" className="field-label">
            Approval valid for <span className="font-normal text-ink-faint">(days, optional)</span>
          </label>
          <input id="validityDays" name="validityDays" type="number" min={1} max={3650} defaultValue={settings.validityDays ?? ""} className="field-input w-28" />
        </div>
      </div>
      <fieldset className="space-y-2">
        <legend className="field-label">Amendments after approval</legend>
        <label className="flex items-center gap-2 text-label">
          <input type="checkbox" name="amendEnabled" defaultChecked={settings.amendableFields !== null} />
          Allow the requester to propose changes to an approved request (they go through approval again)
        </label>
        <div className="flex flex-wrap gap-3 pl-6">
          {fields
            .filter((field) => field.type !== "CALC")
            .map((field) => (
              <label key={field.key} className="flex items-center gap-2 text-label">
                <input type="checkbox" name="amendField" value={field.key} defaultChecked={settings.amendableFields?.includes(field.key) ?? false} />
                {field.label}
              </label>
            ))}
        </div>
      </fieldset>
      <SubmitButton pending={pending} variant="secondary" className="btn-compact">
        Save checks
      </SubmitButton>
      <ResultMessage result={result} />
    </form>
  );
}
