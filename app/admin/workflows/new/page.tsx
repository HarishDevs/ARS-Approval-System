import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/features/shell/PageHeader";
import { WorkflowBuilder } from "@/features/admin/WorkflowBuilder";
import { loadBuilderOptions } from "@/features/admin/workflow-options";
import { requireArea } from "@/server/authorization/guards";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "New approval type" };

export default async function NewWorkflowPage() {
  await requireArea("admin");
  const options = await loadBuilderOptions();
  return (
    <>
      <PageHeader title="New workflow" description="Set the form, then the approval authority (DoA): amount limits across, levels down, tick who is needed in each band. It's saved as a draft; test it, then publish it.">
        <Link href="/admin/workflows" className="link text-label">
          ← All workflows
        </Link>
      </PageHeader>
      <WorkflowBuilder
        mode="create"
        initialForm={[{ key: "amount", label: "Amount (₹)", type: "NUMBER", required: true, min: 0 }]}
        // Every approval type starts with its own DoA matrix (D-075): set the
        // limits, name the levels, pick who approves, tick the bands.
        initialStages={[
          {
            kind: "DOA",
            id: "doa",
            label: "Approval authority (DoA)",
            field: "amount",
            limits: [100000, 1000000],
            levels: [
              { step: { id: "manager", label: "Manager", approvers: { kind: "REQUESTER_MANAGER" }, rule: "ALL" }, bands: [true, true, true] },
              { step: { id: "hod", label: "HOD", approvers: { kind: "REQUESTER_DEPARTMENT_HOD" }, rule: "ALL" }, bands: [true, true, true] },
              { step: { id: "senior", label: "Senior approval", approvers: { kind: "REQUESTER_MANAGERS_MANAGER" }, rule: "ALL" }, bands: [false, false, true] },
            ],
          },
        ]}
        options={options}
      />
    </>
  );
}
