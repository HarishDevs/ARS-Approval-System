import type { Metadata } from "next";
import Link from "next/link";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { Breadcrumbs } from "@/features/ui/Display";
import { ImportTypeForm } from "@/features/admin/ImportTypeForm";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Import an approval type" };

// FN9 configuration promotion: import an approval type exported from
// another environment (for example the test site) as a draft.
export default async function ImportTypePage() {
  await requireArea("admin");
  return (
    <>
      <Breadcrumbs items={[{ href: "/admin/workflows", label: "Approval types" }, { label: "Import" }]} />
      <PageHeader title="Import an approval type" description="Bring in an approval type exported from another copy of the app (for example the test site). It arrives as a draft: nothing goes live until you check it and publish it.">
        <Link href="/admin/workflows" className="link text-label">
          ← Approval types
        </Link>
      </PageHeader>
      <div className="max-w-3xl">
        <ImportTypeForm />
      </div>
    </>
  );
}
