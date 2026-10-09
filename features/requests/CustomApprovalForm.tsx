"use client";

import { useState } from "react";
import { submitCustomAction } from "@/app/users/collab-actions";
import { LevelsEditor, newStepId, type BuilderOptions } from "@/features/admin/WorkflowBuilder";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import type { BuilderStage } from "@/server/workflows/builder";
import type { FormField } from "@/server/forms/fields";
import { ACCEPT_ATTRIBUTE } from "@/server/attachments/files";

// Custom approval (F-33, D-060): anyone picks anyone, any mix of levels.
const CUSTOM_FIELDS: FormField[] = [{ key: "amount", label: "Amount (₹)", type: "NUMBER", required: false, min: 0 }];

export function CustomApprovalForm({ options }: { options: BuilderOptions }) {
  const [stages, setStages] = useState<BuilderStage[]>([
    { kind: "STEP", step: { id: "s1", label: "First approval", approvers: { kind: "PEOPLE", userIds: [] }, rule: "ALL" } },
  ]);
  const { result, pending, onSubmit } = useActionForm(submitCustomAction);
  const [submissionKey] = useState(() => crypto.randomUUID());
  const possibleDuplicate = Boolean(result && !result.ok && result.fieldErrors?.allowDuplicate);

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <input type="hidden" name="spec" value={JSON.stringify({ stages })} />
      <input type="hidden" name="submissionKey" value={submissionKey} />
      <section className="card space-y-5 px-5 py-5">
        <div>
          <label htmlFor="c-title" className="field-label">
            Title
          </label>
          <input id="c-title" name="title" placeholder="e.g. Approval to hire a temporary driver" className="field-input" />
          <FieldError result={result} name="title" />
        </div>
        <div>
          <label htmlFor="c-details" className="field-label">
            Details
          </label>
          <textarea id="c-details" name="details" rows={4} placeholder="What you need approved, and why." className="field-input h-auto py-2.5" />
          <FieldError result={result} name="details" />
        </div>
        <div className="max-w-xs">
          <label htmlFor="c-amount" className="field-label">
            Amount (₹) <span className="font-normal text-ink-faint">(optional)</span>
          </label>
          <input id="c-amount" name="amount" inputMode="decimal" placeholder="e.g. 45,000" className="field-input" />
          <FieldError result={result} name="amount" />
        </div>
        <div>
          <label htmlFor="c-attachments" className="field-label">
            Attachments <span className="font-normal text-ink-faint">(optional)</span>
          </label>
          <input id="c-attachments" name="attachments" type="file" multiple accept={ACCEPT_ATTRIBUTE} className="block w-full text-label file:mr-3 file:rounded-md file:border-0 file:bg-surface-muted file:px-3 file:py-2" />
          <p className="mt-1 text-caption text-ink-muted">Quotes, invoices, photos: PDF, images, Word, Excel, PowerPoint, CSV or text. Up to 5 files of 10 MB each.</p>
          <FieldError result={result} name="attachments" />
        </div>
      </section>
      <LevelsEditor
        stages={stages}
        setStages={setStages}
        options={options}
        form={CUSTOM_FIELDS}
        newId={newStepId}
        title="Who approves"
        hint="Pick anyone, in any order. Add parallel steps when several people should look at the same time. You can't approve your own request."
      />
      {possibleDuplicate && (
        <label className="flex items-start gap-2 rounded-md border border-warning-600/40 bg-warning-50 px-3 py-2 text-label text-warning-600">
          <input type="checkbox" name="allowDuplicate" className="mt-0.5" />
          <span>This is a separate request: raise it anyway.</span>
        </label>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending} className="btn-compact">
          Submit custom approval
        </SubmitButton>
        <div className="min-w-0 flex-1">
          <ResultMessage result={result} />
        </div>
      </div>
    </form>
  );
}
