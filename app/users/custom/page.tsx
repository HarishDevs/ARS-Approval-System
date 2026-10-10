import Link from "next/link";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { CustomApprovalForm } from "@/features/requests/CustomApprovalForm";
import { loadBuilderOptions } from "@/features/admin/workflow-options";
import { findDraft } from "@/lib/db/repositories/drafts.repository";
import { listActiveUserOptions } from "@/lib/db/repositories/admin-users.repository";

// F-33: any user, whenever needed (D-026, D-040).
export default async function CustomApprovalPage() {
  const { user } = await requireArea("users");
  const options = await loadBuilderOptions();
  const draft = await findDraft(user.id, "CUSTOM");
  const collaboratorOptions = (await listActiveUserOptions()).filter((person) => person.id !== user.id).map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` }));
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
        initial={draft ? { title: draft.title, fields: draft.fields } : undefined}
        draft={{ key: "CUSTOM", version: draft?.version ?? null, savedAt: draft ? draft.updatedAt.toISOString() : null }}
      />
    </>
  );
}
