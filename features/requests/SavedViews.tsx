"use client";

import Link from "next/link";
import { useState } from "react";
import { manageViewAction, saveViewAction } from "@/app/users/search-actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";

// Saved views (#4): private, named searches. Opening one is a plain link.
export interface ViewItem {
  id: number;
  name: string;
  href: string;
  isDefault: boolean;
}

export function SaveViewForm({ query }: { query: Record<string, string> }) {
  const { result, pending, onSubmit, formRef } = useActionForm(saveViewAction, { resetOnSuccess: true });
  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="query" value={JSON.stringify(query)} />
      <div>
        <label htmlFor="view-name" className="field-label">
          Save this search as
        </label>
        <input id="view-name" name="name" maxLength={80} placeholder="e.g. Overdue purchases" className="field-input w-56" />
        <FieldError result={result} name="name" />
      </div>
      <SubmitButton pending={pending} variant="secondary" className="btn-compact h-11">
        Save view
      </SubmitButton>
      <ResultMessage result={result && !result.ok && result.fieldErrors ? null : result} />
    </form>
  );
}

function ViewRow({ view }: { view: ViewItem }) {
  const [renaming, setRenaming] = useState(false);
  const manage = useActionForm(manageViewAction);
  const remove = useActionForm(manageViewAction, { confirm: `The view "${view.name}" is removed. Requests aren't affected.`, confirmTitle: "Delete this view?", confirmLabel: "Yes, delete", confirmTone: "danger" });
  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <Link href={view.href} className="link font-medium">
        {view.name}
      </Link>
      {view.isDefault && <span className="badge bg-primary-50 text-primary-700">default</span>}
      <span className="ml-auto flex flex-wrap items-center gap-2">
        {renaming ? (
          <form onSubmit={manage.onSubmit} className="flex items-center gap-2">
            <input type="hidden" name="id" value={view.id} />
            <input type="hidden" name="command" value="rename" />
            <input aria-label={`New name for ${view.name}`} name="name" defaultValue={view.name} maxLength={80} className="field-input h-9 w-44" />
            <SubmitButton pending={manage.pending} variant="secondary" className="btn-compact">
              Rename
            </SubmitButton>
            <button type="button" className="link text-label" onClick={() => setRenaming(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <>
            <button type="button" className="link text-label" onClick={() => setRenaming(true)}>
              Rename
            </button>
            <form onSubmit={manage.onSubmit}>
              <input type="hidden" name="id" value={view.id} />
              <input type="hidden" name="command" value={view.isDefault ? "undefault" : "default"} />
              <button type="submit" className="link text-label" disabled={manage.pending}>
                {view.isDefault ? "Stop opening by default" : "Open by default"}
              </button>
            </form>
            <form onSubmit={remove.onSubmit}>
              <input type="hidden" name="id" value={view.id} />
              <input type="hidden" name="command" value="delete" />
              <button type="submit" className="link text-label text-danger-600" disabled={remove.pending}>
                Delete
              </button>
              {remove.confirmBar}
            </form>
          </>
        )}
        <ResultMessage result={manage.result?.ok ? null : manage.result} />
      </span>
    </li>
  );
}

export function SavedViewList({ views }: { views: ViewItem[] }) {
  if (views.length === 0) return <p className="text-label text-ink-muted">No saved views yet. Search, then save it with a name.</p>;
  return (
    <ul className="divide-y divide-line">
      {views.map((view) => (
        <ViewRow key={view.id} view={view} />
      ))}
    </ul>
  );
}
