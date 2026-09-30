import Link from "next/link";
import { PageHeader } from "@/features/shell/PageHeader";
import { WorkflowBuilder } from "@/features/admin/WorkflowBuilder";
import { loadBuilderOptions } from "@/features/admin/workflow-options";
import { requireArea } from "@/server/authorization/guards";

export default async function NewWorkflowPage() {
  await requireArea("admin");
  const options = await loadBuilderOptions();
  return (
    <>
      <PageHeader title="New workflow" description="It's saved as a draft. Test it, then publish it to open it for requests.">
        <Link href="/admin/workflows" className="link text-label">
          ← All workflows
        </Link>
      </PageHeader>
      <WorkflowBuilder
        mode="create"
        initialForm={[{ key: "amount", label: "Amount (₹)", type: "NUMBER", required: true }]}
        initialStages={[
          { kind: "STEP", step: { id: "s1", label: "Manager", approvers: { kind: "REQUESTER_MANAGER" }, rule: "ALL" } },
          { kind: "STEP", step: { id: "s2", label: "HOD", approvers: { kind: "REQUESTER_DEPARTMENT_HOD" }, rule: "ALL" } },
        ]}
        options={options}
      />
    </>
  );
}
