import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/features/shell/PageHeader";
import { requireArea } from "@/server/authorization/guards";
import { listReassignableTasks, pendingCountsByApprover } from "@/lib/db/repositories/workload.repository";
import { listActiveUserOptions } from "@/lib/db/repositories/admin-users.repository";
import { listWorkflows } from "@/lib/db/repositories/approvals.repository";
import { BulkReassign } from "@/features/admin/BulkReassign";
import { personLabel } from "@/lib/people/label";
import { PersonSelect } from "@/features/ui/PersonSelect";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Move pending approvals" };

// v1.7.0 (A3): bulk reassignment of pending tasks (IT). Narrow the list by
// who holds the tasks and by approval type, tick, move.
export default async function ReassignPage({ searchParams }: { searchParams: Promise<{ from?: string; type?: string }> }) {
  await requireArea("admin");
  const params = await searchParams;
  const from = /^\d{1,10}$/.test(params.from ?? "") ? Number(params.from) : null;
  const type = /^\d{1,10}$/.test(params.type ?? "") ? Number(params.type) : null;
  const [rows, counts, people, workflows] = await Promise.all([listReassignableTasks({ approverId: from, workflowId: type }), pendingCountsByApprover(), listActiveUserOptions(), listWorkflows({ kind: "PREDEFINED" })]);
  const holders = people.filter((person) => counts.has(person.id));
  return (
    <>
      <PageHeader title="Move pending tasks" description="Reassign chosen approvals and work tasks to one person. Each request's timeline records the move and both people are told.">
        <Link href="/admin/workload" className="link text-label">
          ← Workload
        </Link>
      </PageHeader>
      <form method="get" className="card mb-4 flex flex-wrap items-end gap-3 px-4 py-3">
        <div>
          <label htmlFor="from" className="field-label">
            Waiting on
          </label>
          <PersonSelect
            id="from"
            name="from"
            options={holders.map((person) => ({ id: person.id, label: personLabel(person), detail: [person.departmentName, `${counts.get(person.id)} waiting`].filter(Boolean).join(" · ") }))}
            defaultValue={from}
            emptyLabel="Anyone"
            className="w-72"
          />
        </div>
        <div>
          <label htmlFor="type" className="field-label">
            Approval type
          </label>
          <select id="type" name="type" defaultValue={type ?? ""} className="field-input">
            <option value="">Any</option>
            {workflows.map((workflow) => (
              <option key={workflow.id} value={workflow.id}>
                {workflow.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary btn-compact h-11">
          Show
        </button>
      </form>
      <BulkReassign
        rows={rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))}
        people={people.map((person) => ({ id: person.id, label: personLabel(person), detail: person.departmentName ?? undefined }))}
      />
    </>
  );
}
