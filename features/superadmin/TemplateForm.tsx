"use client";

import { saveTemplateAction } from "@/app/superadmin/templates/actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";

// One WhatsApp template's registry row (F-42).
export function TemplateForm({ code, suggestedName, providerName, on }: { code: string; suggestedName: string; providerName: string | null; on: boolean }) {
  const { result, pending, onSubmit } = useActionForm(saveTemplateAction);
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="code" value={code} />
      <div>
        <label htmlFor={`name-${code}`} className="field-label">
          Approved template name in CEOITBox
        </label>
        <input id={`name-${code}`} name="providerName" defaultValue={providerName ?? ""} placeholder={suggestedName} spellCheck={false} className="field-input font-mono" />
        <FieldError result={result} name="providerName" />
      </div>
      <label className="flex items-start gap-2 text-label">
        <input type="checkbox" name="on" defaultChecked={on} className="mt-0.5" />
        <span>Approved by Meta: send WhatsApp messages with it</span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending} variant="secondary" className="btn-compact">
          Save
        </SubmitButton>
        <ResultMessage result={result} />
      </div>
    </form>
  );
}
