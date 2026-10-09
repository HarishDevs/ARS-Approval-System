"use client";

import { useEffect, useState } from "react";
import { DraftStatus, useDraftAutosave } from "@/features/requests/useDraftAutosave";
import type { DraftInfo } from "@/features/requests/RequestForm";
import { submitCustomAction } from "@/app/users/collab-actions";
import { LevelsEditor, newStepId, type BuilderOptions } from "@/features/admin/WorkflowBuilder";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import type { BuilderStage } from "@/server/workflows/builder";
import type { FormField } from "@/server/forms/fields";
import { ACCEPT_ATTRIBUTE } from "@/server/attachments/files";

// Custom approval (F-33, D-060): anyone picks anyone, any mix of levels.
const CUSTOM_FIELDS: FormField[] = [{ key: "amount", label: "Amount (₹)", type: "NUMBER", required: false, min: 0 }];

function restoredStages(spec: string | undefined): BuilderStage[] | null {
  try {
    const parsed = spec ? (JSON.parse(spec) as { stages?: BuilderStage[] }) : null;
    return parsed?.stages?.length ? parsed.stages : null;
  } catch {
    return null;
  }
}

export function CustomApprovalForm({ options, draft, initial }: { options: BuilderOptions; draft?: DraftInfo; initial?: { title: string; fields: Record<string, string> } }) {
  const [stages, setStages] = useState<BuilderStage[]>(
    () =>
      restoredStages(initial?.fields.spec) ?? [{ kind: "STEP", step: { id: "s1", label: "First approval", approvers: { kind: "PEOPLE", userIds: [] }, rule: "ALL" } }],
  );
  const { result, pending, onSubmit } = useActionForm(submitCustomAction);
  const restoredAt = draft?.savedAt ? new Date(draft.savedAt) : null;
  const autosave = useDraftAutosave({ draftKey: draft?.key ?? "", initialVersion: draft?.version ?? null, savedAt: null, disabled: !draft });
  const { nudge } = autosave;
  // The levels live in a hidden input, which fires no input event: save on change.
  const [firstRender, setFirstRender] = useState(true);
  useEffect(() => {
    if (firstRender) {
      setFirstRender(false);
      return;
    }
    nudge();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stages]);
  const [submissionKey] = useState(() => crypto.randomUUID());
  const possibleDuplicate = Boolean(result && !result.ok && result.fieldErrors?.allowDuplicate);

  return (
    <form ref={autosave.formRef} onSubmit={onSubmit} className="space-y-6">
      {draft && restoredAt && (
        <p role="status" className="rounded-md bg-primary-50/60 px-3 py-2 text-label text-primary-700">
          Restored your draft from {restoredAt.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}. Files aren&apos;t kept in drafts: add them again before submitting.
        </p>
      )}
      <input type="hidden" name="spec" value={JSON.stringify({ stages })} />
      <input type="hidden" name="submissionKey" value={submissionKey} />
      <section className="card space-y-5 px-5 py-5">
        <div>
          <label htmlFor="c-title" className="field-label">
            Title
          </label>
          <input id="c-title" name="title" defaultValue={initial?.title ?? ""} placeholder="e.g. Approval to hire a temporary driver" className="field-input" />
          <FieldError result={result} name="title" />
        </div>
        <div>
          <label htmlFor="c-details" className="field-label">
            Details
          </label>
          <textarea id="c-details" name="details" rows={4} defaultValue={initial?.fields.details ?? ""} placeholder="What you need approved, and why." className="field-input h-auto py-2.5" />
          <FieldError result={result} name="details" />
        </div>
        <div className="max-w-xs">
          <label htmlFor="c-amount" className="field-label">
            Amount (₹) <span className="font-normal text-ink-faint">(optional)</span>
          </label>
          <input id="c-amount" name="amount" inputMode="decimal" defaultValue={initial?.fields.amount ?? ""} placeholder="e.g. 45,000" className="field-input" />
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
      {draft && (
        <DraftStatus
          state={autosave.state}
          restoredAt={restoredAt}
          onDiscard={async () => {
            if (!window.confirm("Discard this draft? What you typed is cleared.")) return;
            const done = await autosave.discard().catch(() => ({ ok: false, message: "Couldn't reach the server. Try again." }));
            if (done.ok) window.location.reload();
            else window.alert(done.message);
          }}
        />
      )}
    </form>
  );
}
