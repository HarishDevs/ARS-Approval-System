import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { Breadcrumbs } from "@/features/ui/Display";
import { findWorkflow, listVersions } from "@/lib/db/repositories/approvals.repository";
import { diffVersions, type Section } from "@/server/workflows/version-diff";

// Version history: what changed between two versions of an approval type.
export default async function CompareVersionsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireArea("admin");
  const { id } = await params;
  if (!/^\d{1,10}$/.test(id)) notFound();
  const workflow = await findWorkflow(Number(id));
  if (!workflow) notFound();
  const versions = await listVersions(workflow.id);
  if (versions.length < 2) notFound();
  const query = await searchParams;
  const live = versions.find((version) => version.status === "PUBLISHED") ?? versions[0]!;
  const to = versions.find((version) => String(version.versionNo) === query.to) ?? live;
  const from = versions.find((version) => String(version.versionNo) === query.from) ?? versions.find((version) => version.id !== to.id)!;
  const diff = diffVersions(from, to);
  const block = (title: string, section: Section) => (
    <section aria-label={title} className="card px-5 py-4">
      <h2 className="font-semibold">{title}</h2>
      {!section.added.length && !section.removed.length && !section.changed.length ? (
        <p className="mt-1 text-label text-ink-muted">No changes.</p>
      ) : (
        <ul className="mt-2 space-y-1.5 text-label">
          {section.added.map((item) => (
            <li key={`a-${item.id}`}>
              <span className="badge bg-success-50 text-success-600">Added</span> {item.label}
            </li>
          ))}
          {section.removed.map((item) => (
            <li key={`r-${item.id}`}>
              <span className="badge bg-danger-50 text-danger-600">Removed</span> {item.label}
            </li>
          ))}
          {section.changed.map((item) => (
            <li key={`c-${item.id}`}>
              <span className="badge bg-warning-50 text-warning-600">Changed</span> {item.label}: {item.changes.join("; ")}
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <>
      <Breadcrumbs items={[{ href: "/admin/workflows", label: "Approval types" }, { href: `/admin/workflows/${workflow.id}`, label: workflow.name }, { label: "Compare versions" }]} />
      <PageHeader title="Compare versions" description={`${workflow.name}: what changed from one version to another.`}>
        <Link href={`/admin/workflows/${workflow.id}`} className="link text-label">
          ← Back
        </Link>
      </PageHeader>
      <form method="get" className="card mb-6 flex flex-wrap items-end gap-3 px-5 py-4">
        <div>
          <label htmlFor="from" className="field-label">
            From
          </label>
          <select id="from" name="from" defaultValue={from.versionNo} className="field-input w-44">
            {versions.map((version) => (
              <option key={version.id} value={version.versionNo}>
                Version {version.versionNo}
                {version.status === "PUBLISHED" ? " (live)" : version.status === "DRAFT" ? " (draft)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="to" className="field-label">
            To
          </label>
          <select id="to" name="to" defaultValue={to.versionNo} className="field-input w-44">
            {versions.map((version) => (
              <option key={version.id} value={version.versionNo}>
                Version {version.versionNo}
                {version.status === "PUBLISHED" ? " (live)" : version.status === "DRAFT" ? " (draft)" : ""}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary btn-compact">
          Compare
        </button>
      </form>
      {diff.same ? (
        <p role="status" className="card px-5 py-4 text-label">
          Version {from.versionNo} and version {to.versionNo} are the same.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {block("Steps", diff.steps)}
          {block("Routes", diff.routes)}
          {block("Form fields", diff.fields)}
        </div>
      )}
    </>
  );
}
