"use client";

import { useState } from "react";
import { saveCustomApprovalAction } from "@/app/admin/custom-approval/actions";
import { FormFieldsEditor } from "@/features/admin/FormFieldsEditor";
import { DynamicFields } from "@/features/requests/DynamicFields";
import { ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { NO_LOOKUPS, type FieldLookups, type FormField } from "@/server/forms/fields";
import { NOBODY, NOBODY_TEXT, RULES, RULE_TEXT, type StepPolicy } from "@/server/workflows/step-policy";

// v1.8.0 (owner): Admin → Custom approval. The fields everyone fills in on a
// custom approval, and the step options they may change. A change applies to
// new custom approvals only; requests already raised keep their own fields.
export function CustomApprovalSetup({ initialForm, initialPolicy, lookups = NO_LOOKUPS, people }: { initialForm: FormField[]; initialPolicy: StepPolicy; lookups?: FieldLookups; people: { id: number; label: string }[] }) {
  const [form, setForm] = useState<FormField[]>(initialForm);
  const [policy, setPolicy] = useState<StepPolicy>(initialPolicy);
  const [previewing, setPreviewing] = useState(false);
  const { result, pending, onSubmit, confirmBar } = useActionForm(saveCustomApprovalAction, {
    confirm: "New custom approvals will use these fields and step options. Requests already raised keep their own fields.",
    confirmTitle: "Save the custom approval set-up?",
    confirmLabel: "Yes, save",
  });
  const set = <K extends keyof StepPolicy>(key: K, change: Partial<StepPolicy[K]>) => setPolicy((current) => ({ ...current, [key]: { ...current[key], ...change } }));

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <input type="hidden" name="form" value={JSON.stringify(form)} />
      <input type="hidden" name="policy" value={JSON.stringify(policy)} />
      <p className="text-label text-ink-muted">Everyone fills in a title, the fields below, any files and the levels of approvers. Collaborators can always be added.</p>
      <FormFieldsEditor form={form} setForm={setForm} lockedKeys={[]} />

      <section className="card space-y-4 px-5 py-4" aria-labelledby="step-options">
        <div>
          <h2 id="step-options" className="font-semibold">
            Step options
          </h2>
          <p className="text-label text-ink-muted">The default for every new step, and whether people may change it. A fixed option is shown to people but can&apos;t be changed, and the server applies it.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <fieldset className="space-y-2">
            <legend className="field-label">How many must approve</legend>
            <select aria-label="Default: how many must approve" value={policy.rule.value} onChange={(event) => set("rule", { value: event.target.value as StepPolicy["rule"]["value"] })} className="field-input">
              {RULES.map((rule) => (
                <option key={rule} value={rule}>
                  {RULE_TEXT[rule]}
                </option>
              ))}
            </select>
            {policy.rule.value === "ANY_N" && (
              <label className="flex items-center gap-2 text-label">
                N =
                <input aria-label="Default N" type="number" min={1} max={50} value={policy.rule.n} onChange={(event) => set("rule", { n: Math.max(1, Number(event.target.value) || 1) })} className="field-input w-24" />
              </label>
            )}
            <label className="flex items-center gap-2 text-label">
              <input type="checkbox" checked={policy.rule.editable} onChange={(event) => set("rule", { editable: event.target.checked })} />
              People may change it
            </label>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="field-label">Respond within</legend>
            <label className="flex items-center gap-2 text-label">
              <input
                aria-label="Default: respond within hours"
                type="number"
                min={1}
                max={720}
                value={policy.slaHours.value ?? ""}
                onChange={(event) => set("slaHours", { value: event.target.value ? Math.min(720, Math.max(1, Number(event.target.value))) : null })}
                placeholder="—"
                className="field-input w-24"
              />
              hours <span className="text-ink-faint">(empty = no response time)</span>
            </label>
            <label className="flex items-center gap-2 text-label">
              <input type="checkbox" checked={policy.slaHours.editable} onChange={(event) => set("slaHours", { editable: event.target.checked })} />
              People may change it
            </label>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="field-label">If nobody to approve</legend>
            <select aria-label="Default: if nobody to approve" value={policy.onNoApprover.value} onChange={(event) => set("onNoApprover", { value: event.target.value as StepPolicy["onNoApprover"]["value"] })} className="field-input">
              {NOBODY.map((value) => (
                <option key={value} value={value}>
                  {NOBODY_TEXT[value]}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-label">
              <input type="checkbox" checked={policy.onNoApprover.editable} onChange={(event) => set("onNoApprover", { editable: event.target.checked })} />
              People may change it
            </label>
          </fieldset>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-secondary btn-compact" aria-expanded={previewing} onClick={() => setPreviewing((open) => !open)}>
          {previewing ? "Hide preview" : "Preview the fields"}
        </button>
        <SubmitButton pending={pending} className="btn-compact">
          Save set-up
        </SubmitButton>
        <div className="min-w-0 flex-1">
          <ResultMessage result={result} />
        </div>
      </div>
      {confirmBar}
      {previewing && (
        <section aria-label="Preview of the custom approval fields" className="rounded-lg border-2 border-dashed border-primary-200 p-4">
          <h2 className="mb-3 font-semibold">
            Preview <span className="font-normal text-ink-muted">(unsaved changes included; nothing is sent)</span>
          </h2>
          <div className="card px-5 py-5">
            <DynamicFields key={JSON.stringify(form)} fields={form} mode="submit" people={people} lookups={lookups} result={null} />
          </div>
        </section>
      )}
    </form>
  );
}
