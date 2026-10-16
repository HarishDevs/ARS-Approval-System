import type { Metadata } from "next";
import Link from "next/link";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { CustomApprovalForm } from "@/features/requests/CustomApprovalForm";
import { loadBuilderOptions } from "@/features/admin/workflow-options";
import { findDraft } from "@/lib/db/repositories/drafts.repository";
import { listActiveUserOptions } from "@/lib/db/repositories/admin-users.repository";
import { loadCustomConfig } from "@/server/approvals/custom-config";
import { loadFieldLookups } from "@/lib/db/repositories/lookups.repository";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Custom approval" };

// F-33: any user, whenever needed (D-026, D-040).
export default async function CustomApprovalPage() {
  const { user } = await requireArea("users");
  const options = await loadBuilderOptions();
  const draft = await findDraft(user.id, "CUSTOM");
  const everyone = (await listActiveUserOptions()).map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` }));
  const collaboratorOptions = everyone.filter((person) => person.id !== user.id);
  // v1.8.0: the fields and step options IT set up (Admin → Custom approval).
  const config = await loadCustomConfig();
  const lookups = config.form.some((field) => field.type === "LOOKUP") ? await loadFieldLookups() : undefined;
  return (
    <>
      <PageHeader title="Custom approval" description="For anything that doesn't fit a standard approval type. You choose who approves and in what order.">
        <Link href="/users/new" className="link text-label">
          ← Standard types
        </Link>
      </PageHeader>
      <CustomApprovalForm
        options={options}
        collaboratorOptions={collaboratorOptions}
        fields={config.form}
        policy={config.policy}
        lookups={lookups}
        people={everyone}
        initial={draft ? { title: draft.title, fields: draft.fields } : undefined}
        draft={{ key: "CUSTOM", version: draft?.version ?? null, savedAt: draft ? draft.updatedAt.toISOString() : null }}
      />
    </>
  );
}
