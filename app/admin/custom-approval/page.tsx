import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { CustomApprovalSetup } from "@/features/admin/CustomApprovalSetup";
import { loadCustomConfig } from "@/server/approvals/custom-config";
import { loadFieldLookups } from "@/lib/db/repositories/lookups.repository";
import { listActiveUserOptions } from "@/lib/db/repositories/admin-users.repository";
import { formatIndiaTime } from "@/server/notifications/security-messages";

export const dynamic = "force-dynamic";

// v1.8.0 (owner): the custom approval set-up (IT). Fields and step options.
export default async function CustomApprovalSetupPage() {
  await requireArea("admin");
  const [config, lookups, people] = await Promise.all([loadCustomConfig(), loadFieldLookups(), listActiveUserOptions()]);
  return (
    <>
      <PageHeader
        title="Custom approval"
        description={`What people fill in when they raise a custom approval, and which step options they may change.${config.updatedAt ? ` Last changed ${formatIndiaTime(config.updatedAt)}${config.updatedByName ? ` by ${config.updatedByName}` : ""}.` : " Using the standard set-up."}`}
      />
      <CustomApprovalSetup initialForm={config.form} initialPolicy={config.policy} lookups={lookups} people={people.map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` }))} />
    </>
  );
}
