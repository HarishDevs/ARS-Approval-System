"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { manageViewAction, restoreViewAction, saveViewAction } from "@/app/users/search-actions";
import { FieldError, ResultMessage, SubmitButton, guardAction, useActionForm } from "@/features/ui/form";
import { useToast } from "@/features/ui/Toast";

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
  // FB-03: deleting is reversible, so it happens at once with "Undo".
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const remove = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDeleting(true);
    const result = await guardAction(manageViewAction)(null, new FormData(event.currentTarget));
    setDeleting(false);
    if (!result.ok) {
      toast({ tone: "error", title: "Not deleted", body: result.message });
      return;
    }
    const removed = (result.data as { removed?: { name: string; query: Record<string, string>; isDefault: boolean } } | undefined)?.removed;
    router.refresh();
    toast({
      tone: "success",
      title: `Deleted "${view.name}"`,
      action: removed
        ? {
            label: "Undo",
            onClick: async () => {
              const data = new FormData();
              data.set("name", removed.name);
              data.set("query", JSON.stringify(removed.query));
              if (removed.isDefault) data.set("isDefault", "1");
              const undo = await guardAction(restoreViewAction)(null, data);
              router.refresh();
              toast(undo.ok ? { tone: "info", title: `"${removed.name}" is back` } : { tone: "error", title: "Couldn't undo", body: undo.message });
            },
          }
        : undefined,
    });
  };
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
            <form onSubmit={remove}>
              <input type="hidden" name="id" value={view.id} />
              <input type="hidden" name="command" value="delete" />
              <button type="submit" className="link text-label text-danger-600" disabled={deleting} aria-label={`Delete the view ${view.name}`}>
                {deleting ? "Deleting…" : "Delete"}
              </button>
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
