"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookmarkPlus, FileStack, Trash2 } from "lucide-react";
import { deleteTemplateAction, saveTemplateFromRequestAction } from "@/app/users/template-actions";
import { FieldError, ResultMessage, SubmitButton, guardAction, useActionForm } from "@/features/ui/form";
import { useToast } from "@/features/ui/Toast";

// FN4 / RP-01: start a request from a personal template; save one from an
// earlier request.
export function TemplatePicker({ workflowId, templates }: { workflowId: number; templates: { id: number; name: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  return (
    <section aria-labelledby="templates" className="mb-4 max-w-2xl rounded-md border border-line px-4 py-3">
      <h2 id="templates" className="mb-2 flex items-center gap-2 text-label font-semibold">
        <FileStack aria-hidden="true" className="h-4 w-4 text-ink-muted" />
        Start from one of your templates
      </h2>
      <ul className="flex flex-wrap gap-2">
        {templates.map((template) => (
          <li key={template.id} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface pl-3 text-label">
            <Link href={`/users/new/${workflowId}?template=${template.id}`} className="link">
              {template.name}
            </Link>
            <button
              type="button"
              aria-label={`Delete template ${template.name}`}
              className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:text-danger-600"
              onClick={async () => {
                const data = new FormData();
                data.set("templateId", String(template.id));
                const result = await guardAction(deleteTemplateAction)(null, data);
                toast(result.ok ? { tone: "success", title: `Deleted "${template.name}"` } : { tone: "error", title: "Not deleted", body: result.message });
                router.refresh();
              }}
            >
              <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SaveTemplateForm({ requestId }: { requestId: number }) {
  const { result, pending, formRef, onSubmit } = useActionForm(saveTemplateFromRequestAction, { resetOnSuccess: true });
  return (
    <details className="text-label">
      <summary className="inline-flex cursor-pointer items-center gap-1 font-semibold text-primary-600">
        <BookmarkPlus aria-hidden="true" className="h-4 w-4" />
        Save as a template
      </summary>
      <form ref={formRef} onSubmit={onSubmit} className="mt-2 flex flex-wrap items-start gap-2">
        <input type="hidden" name="requestId" value={requestId} />
        <div>
          <label htmlFor="templateName" className="sr-only">
            Template name
          </label>
          <input id="templateName" name="templateName" maxLength={80} placeholder="e.g. Monthly stationery" className="field-input h-9 w-56" />
          <FieldError result={result} name="templateName" />
        </div>
        <SubmitButton pending={pending} variant="secondary" className="btn-compact">
          Save
        </SubmitButton>
        {result && (result.ok || !result.fieldErrors) && <ResultMessage result={result} />}
      </form>
    </details>
  );
}
