import Link from "next/link";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { CustomApprovalForm } from "@/features/requests/CustomApprovalForm";
import { loadBuilderOptions } from "@/features/admin/workflow-options";

// F-33: any user, whenever needed (D-026, D-040).
export default async function CustomApprovalPage() {
  await requireArea("users");
  const options = await loadBuilderOptions();
  return (
    <>
      <PageHeader title="Custom approval" description="For anything that doesn't fit a standard approval type. You choose who approves and in what order.">
        <Link href="/users/new" className="link text-label">
          ← Standard types
        </Link>
      </PageHeader>
      <CustomApprovalForm options={options} />
    </>
  );
}
