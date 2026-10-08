"use client";

import { useMemo, useRef, useState } from "react";
import { saveTemplateDraftAction, submitTemplateAction, syncTemplatesAction, testTemplateAction } from "@/app/superadmin/templates/actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { compileNamedBody, MAX_BODY, previewNamed } from "@/server/notifications/template-authoring";
import type { TemplateVariable } from "@/server/notifications/templates";
import { SafeText } from "@/features/ui/SafeText";

// WhatsApp template creator (S7, D-076, F-42b). The wording uses named
// placeholders; the server turns them into Meta's {{1}}, {{2}} on save.
export function TemplateEditor({
  code,
  variables,
  initial,
  locked,
}: {
  code: string;
  variables: TemplateVariable[];
  initial: { name: string; category: string; body: string; footer: string };
  locked: boolean; // the latest version was submitted: saving makes a new version
}) {
  const [body, setBody] = useState(initial.body);
  const [footer, setFooter] = useState(initial.footer);
  const area = useRef<HTMLTextAreaElement>(null);
  const { result, pending, onSubmit } = useActionForm(saveTemplateDraftAction);
  const check = useMemo(() => compileNamedBody(body, variables), [body, variables]);

  const insert = (key: string) => {
    const element = area.current;
    const token = `{{${key}}}`;
    if (!element) return setBody((text) => text + token);
    const start = element.selectionStart ?? body.length;
    const end = element.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <form onSubmit={onSubmit} className="card">
      <input type="hidden" name="code" value={code} />
      <div className="border-b border-line px-5 py-4">
        <h2 className="font-semibold">{locked ? "Write a new version" : "Write the message"}</h2>
        <p className="text-label text-ink-muted">
          {locked
            ? "The last version was already sent to Meta, so saving makes a new version with its own name. The live version keeps sending until the new one is approved."
            : "Save a draft, check the preview, then submit it to Meta through CEOITBox."}
        </p>
      </div>
      <div className="grid gap-5 px-5 py-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
            <div>
              <label htmlFor="t-name" className="field-label">
                Template name
              </label>
              <input id="t-name" name="name" defaultValue={initial.name} spellCheck={false} className="field-input font-mono" />
              <FieldError result={result} name="name" />
            </div>
            <div>
              <label htmlFor="t-category" className="field-label">
                Category
              </label>
              <select id="t-category" name="category" defaultValue={initial.category} className="field-input">
                <option value="UTILITY">Utility (recommended)</option>
                <option value="MARKETING">Marketing</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="t-body" className="field-label">
              Message
            </label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {variables.map((variable) => (
                <button key={variable.key} type="button" onClick={() => insert(variable.key)} className="rounded-full border border-line px-2.5 py-1 text-caption hover:bg-surface-muted" title={`Insert ${variable.label}`}>
                  + {variable.label}
                </button>
              ))}
            </div>
            <textarea id="t-body" ref={area} name="body" rows={10} value={body} onChange={(event) => setBody(event.target.value)} className="field-input h-auto py-2.5 font-mono text-label" />
            <p className="mt-1 text-caption text-ink-muted">
              {check.ok ? `${check.value.body.length.toLocaleString("en-IN")} of ${MAX_BODY.toLocaleString("en-IN")} characters · ${check.value.variables.length} placeholders` : check.errors.join(" ")}
            </p>
            <FieldError result={result} name="body" />
          </div>
          <div>
            <label htmlFor="t-footer" className="field-label">
              Footer <span className="font-normal text-ink-faint">(optional, no placeholders)</span>
            </label>
            <input id="t-footer" name="footer" value={footer} onChange={(event) => setFooter(event.target.value)} maxLength={60} placeholder="e.g. ARS Steels · IT" className="field-input" />
            <FieldError result={result} name="footer" />
          </div>
        </div>
        <div>
          <p className="field-label">Preview with sample values</p>
          <div className="rounded-lg bg-success-50 p-4">
            <div className="max-w-sm whitespace-pre-wrap rounded-lg bg-white px-3 py-2 text-label shadow-sm">
              <SafeText text={previewNamed(body, variables)} />
              {footer && <p className="mt-2 text-caption text-ink-faint">{footer}</p>}
            </div>
          </div>
          {check.ok && check.value.variables.length > 0 && (
            <table className="data-table mt-4">
              <thead>
                <tr>
                  <th>Sent as</th>
                  <th>Holds</th>
                  <th>Sample for Meta</th>
                </tr>
              </thead>
              <tbody>
                {check.value.variables.map((variable, index) => (
                  <tr key={variable.key}>
                    <td className="font-mono">{`{{${index + 1}}}`}</td>
                    <td>{variable.label}</td>
                    <td className="break-all">{variable.sample}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4">
        <SubmitButton pending={pending} variant="secondary" className="btn-compact">
          {locked ? "Save as a new version" : "Save draft"}
        </SubmitButton>
        <div className="min-w-0 flex-1">
          <ResultMessage result={result} />
        </div>
      </div>
    </form>
  );
}

export function SubmitTemplateButton({ code, name }: { code: string; name: string }) {
  const { result, pending, onSubmit, confirmBar } = useActionForm(submitTemplateAction, { confirm: `Submit ${name} to Meta through CEOITBox? After this, changes need a new version.` });
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <input type="hidden" name="code" value={code} />
      <SubmitButton pending={pending} className="btn-compact">
        Submit to Meta for approval
      </SubmitButton>
      <ResultMessage result={result} />
      {confirmBar}
    </form>
  );
}

export function SyncTemplatesButton() {
  const { result, pending, onSubmit } = useActionForm(syncTemplatesAction);
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <SubmitButton pending={pending} variant="secondary" className="btn-compact">
        Sync status from Meta
      </SubmitButton>
      <ResultMessage result={result} />
    </form>
  );
}

export function TestTemplateButton({ code }: { code: string }) {
  const { result, pending, onSubmit } = useActionForm(testTemplateAction);
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <input type="hidden" name="code" value={code} />
      <SubmitButton pending={pending} variant="secondary" className="btn-compact">
        Send a test to my WhatsApp
      </SubmitButton>
      <ResultMessage result={result} />
    </form>
  );
}
