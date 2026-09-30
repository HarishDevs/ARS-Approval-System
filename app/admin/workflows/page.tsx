import Link from "next/link";
import { EmptyState, PageHeader } from "@/features/shell/PageHeader";
import { requireArea } from "@/server/authorization/guards";
import { listWorkflows } from "@/lib/db/repositories/approvals.repository";

export default async function WorkflowsPage() {
  await requireArea("admin");
  const workflows = await listWorkflows({ kind: "PREDEFINED" });
  return (
    <>
      <PageHeader title="Workflows" description="Predefined approval types: the form people fill in and the levels it goes through.">
        <Link href="/admin/workflows/new" className="btn-primary btn-compact">
          New workflow
        </Link>
      </PageHeader>
      {workflows.length === 0 ? (
        <EmptyState title="No workflows yet" body="Create the first approval type, e.g. Purchase & SCM Approval." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Prefix</th>
                <th>Published</th>
                <th>Latest</th>
                <th>Requests</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {workflows.map((workflow) => (
                <tr key={workflow.id}>
                  <td>
                    <Link href={`/admin/workflows/${workflow.id}`} className="link">
                      {workflow.name}
                    </Link>
                    <p className="text-caption text-ink-muted">{workflow.code}</p>
                  </td>
                  <td>{workflow.requestPrefix}</td>
                  <td>{workflow.publishedVersionNo ? `v${workflow.publishedVersionNo}` : <span className="text-warning-600">Not published</span>}</td>
                  <td>v{workflow.latestVersionNo}</td>
                  <td>{workflow.requestCount}</td>
                  <td>
                    <span className={`badge ${workflow.active ? "bg-success-50 text-success-600" : "bg-surface-muted text-ink-muted"}`}>{workflow.active ? "Open" : "Closed"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
