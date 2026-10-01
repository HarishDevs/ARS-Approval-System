import { PageHeader, EmptyState } from "@/features/shell/PageHeader";
import { requireArea } from "@/server/authorization/guards";
import { findPublishedVersion, listWorkflows } from "@/lib/db/repositories/approvals.repository";
import { deriveDoaTable, type DoaTable } from "@/server/workflows/doa";

// F-54 / D-065: the approval limits as they are actually set in the live
// workflows (skip conditions on the amount). Changing them = a new version.
const rupees = (value: number) => `₹${value.toLocaleString("en-IN")}`;

function bandLabel(from: number, to: number | null): string {
  if (to === null) return from === 0 ? "Any amount" : `Above ${rupees(from - 1)}`;
  return `${rupees(from)} to ${rupees(to)}`;
}

export default async function DoaPage() {
  await requireArea("admin");
  const workflows = (await listWorkflows({ kind: "PREDEFINED" })).filter((workflow) => workflow.active && workflow.publishedVersionNo);
  const tables: { id: number; name: string; versionNo: number; table: DoaTable }[] = [];
  for (const workflow of workflows) {
    const version = await findPublishedVersion(workflow.id);
    if (version?.builder) tables.push({ id: workflow.id, name: workflow.name, versionNo: version.versionNo, table: deriveDoaTable(version.builder) });
  }
  return (
    <>
      <PageHeader
        title="Approval authority (DoA)"
        description="Who must approve at each amount, read from the live workflows. To change a limit, edit the workflow step (Skip this step when amount is at most …) and publish a new version."
      />
      {tables.length === 0 ? (
        <EmptyState title="No live workflows" body="Publish a workflow with an amount field to see its limits here." />
      ) : (
        <div className="space-y-6">
          {tables.map(({ id, name, versionNo, table }) => (
            <section key={id} className="card overflow-x-auto">
              <h2 className="border-b border-line px-5 py-4 font-semibold">
                {name} <span className="text-label font-normal text-ink-muted">· version {versionNo}</span>
              </h2>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Amount</th>
                    <th>Levels needed, in order</th>
                  </tr>
                </thead>
                <tbody>
                  {table.bands.map((band) => (
                    <tr key={band.from}>
                      <td className="whitespace-nowrap">{bandLabel(band.from, band.to)}</td>
                      <td>{band.levels.join(" → ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {table.otherConditions.length > 0 && <p className="px-5 py-3 text-caption text-ink-muted">Also depends on other fields: {table.otherConditions.join(", ")}</p>}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
