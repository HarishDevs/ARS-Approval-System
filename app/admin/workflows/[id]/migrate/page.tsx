import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { Breadcrumbs } from "@/features/ui/Display";
import { Hint } from "@/features/ui/Hint";
import { MigrationForm } from "@/features/admin/VersionTools";
import { listMigrationItems, listMigrationRuns, planMigration } from "@/server/workflows/migration";
import { VERDICT_LABEL } from "@/server/workflows/migration-plan";
import { formatIndiaTime } from "@/server/notifications/security-messages";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Move requests to a version" };

// FN7 migration assistant: open requests on an older version, a dry-run
// verdict for each, step mapping for steps that were renamed or removed,
// and the run history with each request's outcome.
export default async function MigratePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { user } = await requireArea("admin");
  const { id } = await params;
  if (!/^\d{1,10}$/.test(id)) notFound();
  const query = await searchParams;
  const fromVersionId = /^\d{1,10}$/.test(query.from ?? "") ? Number(query.from) : null;
  if (fromVersionId === null) notFound();
  const rawMapping = Object.fromEntries(Object.entries(query).filter(([key, value]) => key.startsWith("map:") && value).map(([key, value]) => [key.slice(4), value!]));
  const plan = await planMigration({ workflowId: Number(id), fromVersionId, mapping: rawMapping }, { id: user.id, roles: user.roles });
  if (!plan) notFound();
  const runs = await listMigrationRuns(plan.workflow.id);
  const justRan = runs.find((run) => String(run.id) === query.run) ?? null;
  const runItems = await Promise.all(runs.slice(0, 5).map(async (run) => ({ run, items: await listMigrationItems(run.id) })));
  // Steps reached on some request but missing in the live version.
  const unmapped = new Map<string, { id: string; label: string; kind: string }>();
  for (const request of plan.requests) for (const step of request.check.unmapped) unmapped.set(step.id, step);
  for (const fromId of Object.keys(plan.mapping)) {
    const step = plan.source.definition.nodes.find((node) => node.id === fromId);
    if (step) unmapped.set(step.id, { id: step.id, label: step.label, kind: step.kind });
  }

  return (
    <>
      <Breadcrumbs items={[{ href: "/admin/workflows", label: "Approval types" }, { href: `/admin/workflows/${plan.workflow.id}`, label: plan.workflow.name }, { label: "Move open requests" }]} />
      <PageHeader title={`Move open requests to version ${plan.target.versionNo}`} description={`Each request on version ${plan.source.versionNo} is checked first; nothing changes until you press Move.`}>
        <Link href={`/admin/workflows/${plan.workflow.id}/compare?from=${plan.source.versionNo}&to=${plan.target.versionNo}`} className="link text-label">
          What changed between the versions
        </Link>
      </PageHeader>

      {justRan && (
        <p role="status" className={`mb-4 rounded-md px-3 py-2 text-label ${justRan.failed ? "bg-danger-50 text-danger-600" : justRan.moved ? "bg-success-50 text-success-600" : "bg-warning-50 text-warning-600"}`}>
          Run #{justRan.id}: moved {justRan.moved}, skipped {justRan.skipped}
          {justRan.failed ? `, failed ${justRan.failed}` : ""}. Each request&apos;s outcome is under Earlier moves.
        </p>
      )}
      {unmapped.size > 0 && (
        <form method="get" className="card mb-6 space-y-3 px-5 py-4" aria-label="Step mapping">
          <input type="hidden" name="from" value={plan.source.id} />
          <div className="flex items-center gap-1.5">
            <h2 className="font-semibold">Steps that are no longer in version {plan.target.versionNo}</h2>
            <Hint text="Some requests have reached these steps. Choose which live step each one becomes (same kind of step only), then check again." align="start" />
          </div>
          {[...unmapped.values()].map((step) => (
            <div key={step.id} className="flex flex-wrap items-center gap-2 text-label">
              <label htmlFor={`map-${step.id}`} className="min-w-48 font-medium">
                {step.label}
              </label>
              <select id={`map-${step.id}`} name={`map:${step.id}`} defaultValue={plan.mapping[step.id] ?? ""} className="field-input h-9 w-64">
                <option value="">Not mapped</option>
                {plan.target.definition.nodes
                  .filter((node) => node.kind === step.kind)
                  .map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.label}
                    </option>
                  ))}
              </select>
            </div>
          ))}
          <button type="submit" className="btn-secondary btn-compact">
            Check again with this mapping
          </button>
        </form>
      )}

      {plan.requests.length === 0 ? (
        <p role="status" className="card mb-6 px-5 py-4 text-label">
          No open requests on version {plan.source.versionNo}.
        </p>
      ) : (
        <div className="mb-6">
          <MigrationForm
            workflowId={plan.workflow.id}
            fromVersionId={plan.source.id}
            fromNo={plan.source.versionNo}
            toNo={plan.target.versionNo}
            mapping={plan.mapping}
            rows={plan.requests.map((request) => ({ id: request.id, requestNo: request.requestNo, title: request.title, verdict: request.check.verdict, verdictLabel: VERDICT_LABEL[request.check.verdict], reasons: request.check.reasons, currentSteps: request.check.currentSteps }))}
          />
        </div>
      )}

      <section aria-label="Earlier moves" className="card px-5 py-4">
        <div className="flex items-center gap-1.5">
          <h2 className="font-semibold">Earlier moves</h2>
          <Hint text="To undo: restore the old version, publish it, and move the requests back." align="start" />
        </div>
        {runItems.length === 0 ? (
          <p className="mt-1 text-label text-ink-muted">None yet.</p>
        ) : (
          <ol className="mt-2 space-y-3">
            {runItems.map(({ run, items }) => (
              <li key={run.id} className="text-label">
                <details>
                  <summary className="cursor-pointer">
                    Run #{run.id}: version {run.fromVersionNo} → {run.toVersionNo} by {run.byName}, {formatIndiaTime(run.createdAt)} · moved {run.moved}, skipped {run.skipped}
                    {run.failed ? `, failed ${run.failed}` : ""}
                  </summary>
                  <ul className="mt-2 space-y-1 pl-4">
                    {items.map((item) => (
                      <li key={`${run.id}-${item.requestId}`}>
                        <Link href={`/users/requests/${item.requestId}`} className="link">
                          {item.requestNo}
                        </Link>{" "}
                        <span className={item.outcome === "MOVED" ? "text-success-600" : item.outcome === "FAILED" ? "text-danger-600" : "text-ink-muted"}>{item.outcome.toLowerCase()}</span>: {item.message}
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
