import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { RequestStatusPill } from "@/features/requests/StatusPill";
import { StepMap } from "@/features/requests/StepMap";
import { DecisionForm, ResumeForm } from "@/features/requests/ActionPanel";
import { RequestForm } from "@/features/requests/RequestForm";
import { loadRequestView } from "@/server/approvals/view";
import { listActiveUserOptions } from "@/lib/db/repositories/admin-users.repository";
import { formatIndiaTime } from "@/server/notifications/security-messages";

// F-14 request page. loadRequestView applies the record-level check
// (D-057); anyone else gets the same 404 as a request that doesn't exist.
export default async function RequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ submitted?: string }> }) {
  const { user } = await requireArea("users");
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const view = await loadRequestView(Number(id), { id: user.id, roles: user.roles });
  if (!view) notFound();
  const submitted = (await searchParams).submitted === "1";
  const people =
    view.canResubmit && view.form.some((field) => field.type === "PERSON")
      ? (await listActiveUserOptions()).map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` }))
      : [];

  return (
    <>
      <PageHeader title={view.title} description={`${view.requestNo} · ${view.workflowName} · raised by ${view.requesterName}${view.round > 1 ? ` · round ${view.round}` : ""}`}>
        <div className="flex items-center gap-3">
          <RequestStatusPill status={view.status} />
          <Link href="/users" className="link text-label">
            ← Back
          </Link>
        </div>
      </PageHeader>
      {submitted && (
        <p role="status" className="mb-4 rounded-md bg-success-50 px-3 py-2 text-label text-success-600">
          Submitted as {view.requestNo}. The first approvers have been told.
        </p>
      )}
      {view.changesComment && (
        <p className="mb-4 rounded-md border border-warning-600/30 bg-warning-50 px-3 py-2 text-label text-warning-600">Changes asked: {view.changesComment}</p>
      )}
      {view.holdReason && <p className="mb-4 rounded-md bg-warning-50 px-3 py-2 text-label text-warning-600">On hold: {view.holdReason}</p>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          {(view.myTasks.length > 0 || view.canResume) && (
            <section className="card divide-y divide-line border-primary-600">
              <h2 className="px-5 py-4 font-semibold">Needs your action</h2>
              {view.myTasks.map((task) => (
                <DecisionForm key={task.taskKey} requestId={view.id} taskKey={task.taskKey} label={task.label} />
              ))}
              {view.canResume && <ResumeForm requestId={view.id} />}
            </section>
          )}
          {view.canResubmit && (
            <section>
              <h2 className="mb-3 font-semibold">Update and resubmit</h2>
              <RequestForm mode="resubmit" requestId={view.id} fields={view.form} people={people} initial={view.rawFields} />
            </section>
          )}
          <section className="card px-5 py-4">
            <h2 className="mb-4 font-semibold">Approval levels</h2>
            <StepMap stages={view.stages} />
          </section>
          {view.fields.length > 0 && (
            <section className="card px-5 py-4">
              <h2 className="mb-3 font-semibold">Details</h2>
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {view.fields.map((field) => (
                  <div key={field.key}>
                    <dt className="text-caption text-ink-muted">{field.label}</dt>
                    <dd className="whitespace-pre-wrap">{field.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>
        <section className="card h-fit px-5 py-4">
          <h2 className="mb-3 font-semibold">Timeline</h2>
          <ol className="space-y-3 border-l border-line pl-4">
            {view.timeline.map((entry) => (
              <li key={entry.id} className="text-label">
                <p>{entry.text}</p>
                <p className="text-caption text-ink-faint">{formatIndiaTime(entry.at)}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}
