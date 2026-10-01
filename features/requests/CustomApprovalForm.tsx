"use client";

import { useState } from "react";
import { submitCustomAction } from "@/app/users/collab-actions";
import { LevelsEditor, newStepId, type BuilderOptions } from "@/features/admin/WorkflowBuilder";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import type { BuilderStage } from "@/server/workflows/builder";
import type { FormField } from "@/server/forms/fields";

// Custom approval (F-33, D-060): anyone picks anyone, any mix of levels.
const CUSTOM_FIELDS: FormField[] = [{ key: "amount", label: "Amount (₹)", type: "NUMBER", required: false }];

export function CustomApprovalForm({ options }: { options: BuilderOptions }) {
  const [stages, setStages] = useState<BuilderStage[]>([
    { kind: "STEP", step: { id: "s1", label: "First approval", approvers: { kind: "PEOPLE", userIds: [] }, rule: "ALL" } },
  ]);
  const { result, pending, onSubmit } = useActionForm(submitCustomAction);

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <input type="hidden" name="spec" value={JSON.stringify({ stages })} />
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
