"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookmarkPlus, Layers, Pencil, Play, Trash2 } from "lucide-react";
import { useState } from "react";
import { deleteApprovalTemplateAction, renameApprovalTemplateAction, saveApprovalTemplateAction } from "@/app/users/template-actions";
import { FieldError, ResultMessage, SubmitButton, guardAction, useActionForm } from "@/features/ui/form";
import { useToast } from "@/features/ui/Toast";
import { ConfirmButton } from "@/features/ui/ConfirmButton";

// v1.54.0 (owner, D-309): approval templates are the person's own: the levels
// of a request, saved under a name. Saved from a request the person raised,
// or from the New request form (its levels as they are now).
export function SaveTemplateForm({ requestId, spec, compact = false }: { requestId?: number; spec?: string; compact?: boolean }) {
  const { result, pending, formRef, onSubmit } = useActionForm(saveApprovalTemplateAction, { resetOnSuccess: true });
  return (
    <details className="text-label" data-testid="save-template">
      <summary className={`inline-flex cursor-pointer items-center gap-1 font-semibold text-primary-600 ${compact ? "text-caption" : ""}`}>
        <BookmarkPlus aria-hidden="true" className="h-4 w-4" />
        Save levels as a template
      </summary>
      <form ref={formRef} onSubmit={onSubmit} className="mt-2 flex flex-wrap items-start gap-2">
        {requestId !== undefined && <input type="hidden" name="requestId" value={requestId} />}
        {spec !== undefined && <input type="hidden" name="spec" value={spec} />}
        <div>
          <label htmlFor={`templateName-${requestId ?? "form"}`} className="sr-only">
            Template name
          </label>
          <input id={`templateName-${requestId ?? "form"}`} name="templateName" maxLength={80} placeholder="e.g. Purchase above 1 lakh" className="field-input h-9 w-56" />
          <FieldError result={result} name="templateName" />
        </div>
        <SubmitButton pending={pending} variant="secondary" className="btn-compact">
          Save template
        </SubmitButton>
        {result && (result.ok || !result.fieldErrors) && <ResultMessage result={result} />}
      </form>
      <p className="mt-1 text-caption text-ink-muted">Keeps the approval levels and approvers only, never the details or files. Only you see your templates.</p>
    </details>
  );
}

export interface TemplateCardData {
  id: number;
  name: string;
  levels: { label: string; who: string }[];
  updated: string;
}

export function TemplateCard({ template }: { template: TemplateCardData }) {
  const router = useRouter();
  const toast = useToast();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(template.name);
  const rename = async () => {
    const data = new FormData();
    data.set("templateId", String(template.id));
    data.set("templateName", name);
    const result = await guardAction(renameApprovalTemplateAction)(null, data);
    toast(result.ok ? { tone: "success", title: "Renamed" } : { tone: "error", title: "Not renamed", body: result.message });
    if (result.ok) {
      setRenaming(false);
      router.refresh();
    }
  };
  return (
    <li className="card flex flex-col px-4 py-4" data-testid="approval-template">
      <div className="flex items-start justify-between gap-2">
        {renaming ? (
          <form
            className="flex min-w-0 flex-1 gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void rename();
            }}
          >
            <label className="sr-only" htmlFor={`rename-${template.id}`}>
              Template name
            </label>
            <input id={`rename-${template.id}`} value={name} onChange={(event) => setName(event.target.value)} maxLength={80} className="field-input h-9 min-w-0 flex-1" autoFocus />
            <button type="submit" className="btn-secondary btn-compact">
              Save
            </button>
          </form>
        ) : (
          <h2 className="min-w-0 truncate font-semibold" title={template.name}>
            {template.name}
          </h2>
        )}
        <div className="flex shrink-0 items-center gap-0.5">
          <button type="button" onClick={() => setRenaming((value) => !value)} aria-label={`Rename ${template.name}`} title="Rename" className="grid h-8 w-8 place-items-center rounded-md text-ink-muted hover:bg-surface-muted">
            <Pencil aria-hidden="true" className="h-4 w-4" />
          </button>
          <ConfirmButton
            ariaLabel={`Delete template ${template.name}`}
            title={`Delete the template “${template.name}”?`}
            body="Requests already raised with it are not affected."
            className="grid h-8 w-8 place-items-center rounded-md text-ink-faint hover:bg-danger-50 hover:text-danger-600"
            onConfirm={async () => {
              const data = new FormData();
              data.set("templateId", String(template.id));
              const result = await guardAction(deleteApprovalTemplateAction)(null, data);
              toast(result.ok ? { tone: "success", title: `Deleted "${template.name}"` } : { tone: "error", title: "Not deleted", body: result.message });
              router.refresh();
            }}
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
          </ConfirmButton>
        </div>
      </div>
      <p className="mt-0.5 flex items-center gap-1 text-caption text-ink-muted">
        <Layers aria-hidden="true" className="h-3.5 w-3.5" /> {template.levels.length} level{template.levels.length === 1 ? "" : "s"} · saved {template.updated}
      </p>
      <ol className="mt-3 flex-1 space-y-1.5 text-label">
        {template.levels.slice(0, 6).map((level, index) => (
          <li key={index} className="flex items-start gap-2">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary-50 text-[11px] font-semibold text-primary-700">{index + 1}</span>
            <span className="min-w-0">
              <span className="font-medium">{level.label}</span>
              {level.who && <span className="block truncate text-caption text-ink-muted">{level.who}</span>}
            </span>
          </li>
        ))}
        {template.levels.length > 6 && <li className="text-caption text-ink-muted">+{template.levels.length - 6} more</li>}
      </ol>
      <Link href={`/users/custom?template=${template.id}`} className="btn-primary btn-compact mt-4 inline-flex w-full items-center justify-center gap-1.5">
        <Play aria-hidden="true" className="h-4 w-4" /> Use this template
      </Link>
    </li>
  );
}

// Inside the New request form (a form can't hold another form): the same
// save, sent by a button with the levels as they are now.
export function SaveLevelsInline({ spec }: { spec: string }) {
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const data = new FormData();
    data.set("templateName", name);
    data.set("spec", spec);
    const result = await guardAction(saveApprovalTemplateAction)(null, data);
    setBusy(false);
    toast(result.ok ? { tone: "success", title: "Template saved", body: result.message } : { tone: "error", title: "Not saved", body: result.message });
    if (result.ok) {
      setOpen(false);
      setName("");
      router.refresh();
    }
  };
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-label font-semibold text-primary-600 hover:underline" data-testid="save-levels">
        <BookmarkPlus aria-hidden="true" className="h-4 w-4" /> Save these levels as a template
      </button>
    );
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="save-levels-form">
      <label htmlFor="save-levels-name" className="sr-only">
        Template name
      </label>
      <input
        id="save-levels-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void save();
          }
          if (event.key === "Escape") setOpen(false);
        }}
        maxLength={80}
        placeholder="Template name"
        className="field-input h-9 w-56"
        autoFocus
      />
      <button type="button" onClick={() => void save()} disabled={busy || name.trim().length < 2} className="btn-secondary btn-compact disabled:opacity-60">
        {busy ? "Saving…" : "Save template"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="btn-ghost btn-compact">
        Cancel
      </button>
    </div>
  );
}
