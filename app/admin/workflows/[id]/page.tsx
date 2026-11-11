import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/features/ui/Display";
import { notFound } from "next/navigation";
import { PageHeader } from "@/features/shell/PageHeader";
import { WorkflowBuilder } from "@/features/admin/WorkflowBuilder";
import { DeleteWorkflowForm, DetailsForm, PublishButton, TestModePanel, TypeSettingsForm } from "@/features/admin/WorkflowPanels";
import { DEFAULT_TYPE_SETTINGS } from "@/server/workflows/type-settings";
import { loadBuilderOptions } from "@/features/admin/workflow-options";
import { namedApprovers } from "@/server/approvals/approver-rules";
import { listActiveUserOptions } from "@/lib/db/repositories/admin-users.repository";
import { listDepartments } from "@/lib/db/repositories/organisation.repository";
import { requireArea } from "@/server/authorization/guards";
import { findWorkflow, listVersions } from "@/lib/db/repositories/approvals.repository";
import { validateVersion } from "@/server/approvals/service";
import { openCountsByVersion } from "@/server/workflows/migration";
import { RestoreVersionButton } from "@/features/admin/VersionTools";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import { personLabel } from "@/lib/people/label";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Approval type" };

const VERSION_STYLE = { DRAFT: "bg-warning-50 text-warning-600", PUBLISHED: "bg-success-50 text-success-600", ARCHIVED: "bg-surface-muted text-ink-muted" } as const;

export default async function WorkflowPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  await requireArea("admin");
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const workflow = await findWorkflow(Number(id));
  if (!workflow || workflow.kind !== "PREDEFINED") notFound();
  const versions = await listVersions(workflow.id);
  const options = await loadBuilderOptions(versions.flatMap((version) => namedApprovers(version.definition)));
  // Test mode: anyone can be the sample requester (approver-only lists are for choosing approvers).
  const everyone = (await listActiveUserOptions()).map((person) => ({ id: person.id, label: personLabel(person), detail: person.departmentName ?? undefined }));
  const latest = versions[0];
  const published = versions.find((version) => version.status === "PUBLISHED");
  const latestChecks = latest && latest.status === "DRAFT" ? await validateVersion(latest.id) : null;
  // FN7: open requests per version, for the move link.
  const openCounts = await openCountsByVersion(workflow.id);
  const created = (await searchParams).created === "1";

  return (
    <>
      <Breadcrumbs items={[{ href: "/admin", label: "Admin" }, { href: "/admin/workflows", label: "Approval types" }, { label: workflow.name }]} />
      <PageHeader title={workflow.name} meta={`${workflow.code} · numbers ${workflow.requestPrefix}-YYYY-000001 · ${published ? `version ${published.versionNo} is live` : "not published yet"}`}>
        <Link href="/admin/workflows" className="link text-label">
          ← Approval types
        </Link>
      </PageHeader>
      {created && (
        <p role="status" className="mb-4 rounded-md bg-success-50 px-3 py-2 text-label text-success-600">
          Created as draft version 1. Test it below, then publish.
        </p>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          {latest?.builder ? (
            <WorkflowBuilder
              mode="edit"
              workflowId={workflow.id}
              initialStages={latest.builder.stages}
              initialForm={latest.form}
              options={options}
              draftKey={`${workflow.id}-v${latest.id}`}
              draft={latest.status === "DRAFT" ? { versionId: latest.id, revision: latest.draftRevision } : { versionId: null, revision: 0 }}
            />
          ) : (
            <p className="card px-5 py-4 text-label text-ink-muted">This workflow was made outside the builder, so it can&apos;t be edited here yet.</p>
          )}
        </div>
        <div className="space-y-6">
          <section className="card divide-y divide-line">
            <h2 className="flex items-center justify-between gap-2 px-5 py-4 font-semibold">
              Versions
              {published && workflow.kind === "PREDEFINED" && (
                <a href={`/api/admin/workflows/${workflow.id}/export`} className="link text-label font-normal" download>
                  Export live version
                </a>
              )}
            </h2>
            {versions.map((version) => (
              <div key={version.id} className="space-y-2 px-5 py-3 text-label">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">Version {version.versionNo}</span>
                  <span className={`badge ${VERSION_STYLE[version.status]}`}>{version.status === "DRAFT" ? "Draft" : version.status === "PUBLISHED" ? "Live" : "Archived"}</span>
                </div>
                <p className="text-caption text-ink-muted">
                  Saved {formatIndiaTime(version.createdAt)}
                  {version.publishedAt ? ` · published ${formatIndiaTime(version.publishedAt)}` : ""}
                </p>
                {version.id !== latest?.id || version.status !== "DRAFT" ? (
                  <div className="flex flex-wrap items-center gap-3">
                    {published && version.id !== published.id && (
                      <Link href={`/admin/workflows/${workflow.id}/compare?from=${version.versionNo}&to=${published.versionNo}`} className="link text-caption">
                        Compare with live
                      </Link>
                    )}
                    {published && version.id !== published.id && (openCounts.get(version.id) ?? 0) > 0 && (
                      <Link href={`/admin/workflows/${workflow.id}/migrate?from=${version.id}`} className="link text-caption">
                        Move {openCounts.get(version.id)} open request{openCounts.get(version.id) === 1 ? "" : "s"} to the live version
                      </Link>
                    )}
                    {version.id !== latest?.id && latest?.status !== "DRAFT" && <RestoreVersionButton workflowId={workflow.id} versionId={version.id} versionNo={version.versionNo} />}
                  </div>
                ) : null}
                {version.id === latest?.id && version.status === "DRAFT" && latestChecks && (
                  <>
                    {latestChecks.errors.map((issue) => (
                      <p key={issue.message} className="text-danger-600">
                        ✗ {issue.message}
                      </p>
                    ))}
                    {latestChecks.warnings.map((issue) => (
                      <p key={issue.message} className="text-warning-600">
                        ! {issue.message}
                      </p>
                    ))}
                    {latestChecks.valid && <PublishButton workflowId={workflow.id} versionId={version.id} versionNo={version.versionNo} />}
                  </>
                )}
              </div>
            ))}
          </section>
          {latest && <TestModePanel versionId={latest.id} form={latest.form} people={everyone} lookups={options.lookups} />}
          {workflow.kind === "PREDEFINED" && (
            <TypeSettingsForm
              workflowId={workflow.id}
              settings={workflow.settings ?? DEFAULT_TYPE_SETTINGS}
              form={latest?.form ?? []}
              departments={(await listDepartments()).filter((department) => department.active).map((department) => ({ id: department.id, label: department.name }))}
              people={everyone}
            />
          )}
          <DetailsForm workflowId={workflow.id} name={workflow.name} description={workflow.description ?? null} active={workflow.active} resubmitPolicy={workflow.resubmitPolicy} />
          <DeleteWorkflowForm workflowId={workflow.id} name={workflow.name} />
        </div>
      </div>
    </>
  );
}
