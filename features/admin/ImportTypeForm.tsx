"use client";

import Link from "next/link";
import { applyImportAction, previewImportAction } from "@/app/admin/workflows/import/actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";

// FN9: check an exported approval-type file, then import it as a draft.
interface Section {
  added: { id: string; label: string }[];
  removed: { id: string; label: string }[];
  changed: { id: string; label: string; changes: string[] }[];
}
interface Preview {
  problems: string[];
  existing: { id: number; name: string } | null;
  diff: { steps: Section; routes: Section; fields: Section; same: boolean } | null;
  settingsDiffer: boolean;
  code?: string;
  name?: string;
  versionNo?: number;
  source?: string;
  exportedAt?: string;
}

function Changes({ title, section }: { title: string; section: Section }) {
  const count = section.added.length + section.removed.length + section.changed.length;
  if (!count) return null;
  return (
    <div>
      <h3 className="font-semibold">{title}</h3>
      <ul className="list-disc pl-5">
        {section.added.map((item) => (
          <li key={`a${item.id}`}>Added: {item.label}</li>
        ))}
        {section.removed.map((item) => (
          <li key={`r${item.id}`}>Removed: {item.label}</li>
        ))}
        {section.changed.map((item) => (
          <li key={`c${item.id}`}>
            Changed: {item.label} ({item.changes.join("; ")})
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ImportTypeForm() {
  const check = useActionForm(previewImportAction);
  const data = check.result?.data as { preview?: Preview; json?: string } | undefined;
  const preview = data?.preview;
  const apply = useActionForm(applyImportAction, { confirmTitle: "Import as a draft?", confirm: "Nothing goes live: the import is a draft you check and publish separately.", confirmLabel: "Import" });
  const done = apply.result?.ok ? (apply.result.data as { workflowId?: number } | undefined)?.workflowId : undefined;
  return (
    <div className="space-y-6">
      <form onSubmit={check.onSubmit} className="card space-y-3 px-5 py-4">
        <div>
          <label htmlFor="f-file" className="field-label">
            Exported file (.json)
          </label>
          <input id="f-file" name="file" type="file" accept="application/json,.json" className="block w-full text-label file:mr-3 file:rounded-md file:border-0 file:bg-surface-muted file:px-3 file:py-2" />
          <FieldError result={check.result} name="file" />
        </div>
        <SubmitButton pending={check.pending} variant="secondary" className="btn-compact">
          Check the file
        </SubmitButton>
        {check.result && !preview && <ResultMessage result={check.result} />}
      </form>

      {preview && (
        <section aria-label="Check result" className="card space-y-3 px-5 py-4 text-label">
          <p className="font-semibold">
            {preview.name} ({preview.code}), version {preview.versionNo}, exported {preview.exportedAt ? new Date(preview.exportedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "?"} from {preview.source}
          </p>
          {preview.problems.length > 0 ? (
            <ul role="alert" className="list-disc space-y-1 pl-5 text-danger-600">
              {preview.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          ) : (
            <p role="status" className="text-success-600">
              {check.result?.message}
            </p>
          )}
          {preview.diff && !preview.diff.same && (
            <div className="space-y-2">
              <p>Compared with the latest version here:</p>
              <Changes title="Steps" section={preview.diff.steps} />
              <Changes title="Routes" section={preview.diff.routes} />
              <Changes title="Form fields" section={preview.diff.fields} />
            </div>
          )}
          {preview.diff?.same && <p>The file is the same as the latest version here.</p>}
          {preview.settingsDiffer && <p className="text-warning-600">Its submission checks differ from the ones here. Imports don&apos;t change live checks; adjust them on the type&apos;s page if needed.</p>}
          {preview.problems.length === 0 && !done && (
            <form onSubmit={apply.onSubmit}>
              {apply.confirmBar}
              <input type="hidden" name="json" value={data?.json ?? ""} />
              <SubmitButton pending={apply.pending} className="btn-compact">
                Import as a draft
              </SubmitButton>
              <ResultMessage result={apply.result} />
            </form>
          )}
          {done && (
            <p role="status" className="text-success-600">
              {apply.result?.message}{" "}
              <Link href={`/admin/workflows/${done}`} className="link">
                Open it
              </Link>
            </p>
          )}
        </section>
      )}
    </div>
  );
}
