import { PageHeader } from "@/features/shell/PageHeader";
import { ImportPanel } from "@/features/admin/ImportPanel";
import { isImportKind, type ImportKind } from "@/server/import/kinds";
import { SkeletonBlock } from "@/features/ui/Spinner";

// The bulk import page (S10-05, F-59), shown in both the Admin and the
// Super Admin space. The page that renders it checks the space first.
export function ImportScreen({ kind }: { kind: string | undefined }) {
  const initialKind: ImportKind = isImportKind(kind) ? kind : "users";
  return (
    <>
      <PageHeader
        title="Import data"
        description="Add or update many records at once from a CSV file: download the template, fill it in Excel, upload it, check it, then import. Nothing is saved until every row is fine."
      />
      <ImportPanel key={initialKind} initialKind={initialKind} />
    </>
  );
}

export function ImportScreenLoading() {
  return (
    <div role="status" aria-label="Loading the import page">
      <SkeletonBlock className="mb-3 h-8 w-48" />
      <SkeletonBlock className="mb-8 h-4 w-full max-w-2xl" />
      <SkeletonBlock className="mb-6 h-48 w-full" />
      <SkeletonBlock className="h-40 w-full" />
    </div>
  );
}
