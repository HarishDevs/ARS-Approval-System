import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { RequestStatusPill } from "@/features/requests/StatusPill";
import { StepMap } from "@/features/requests/StepMap";
import { BlockedStepForm, DecisionForm, ReopenForm, ResumeForm, WithdrawForm } from "@/features/requests/ActionPanel";
import { listApproverOptions } from "@/lib/db/repositories/approvers.repository";
import { RequestForm } from "@/features/requests/RequestForm";
import { CommentForm } from "@/features/requests/Discussion";
import { AddFilesForm } from "@/features/requests/Attachments";
import { loadRequestView } from "@/server/approvals/view";
import { listActiveUserOptions } from "@/lib/db/repositories/admin-users.repository";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import { DeleteRequestButton } from "@/features/superadmin/DeleteRequestButton";
import { loadFieldLookups } from "@/lib/db/repositories/lookups.repository";
import { SafeText } from "@/features/ui/SafeText";

// F-14 request page. loadRequestView applies the record-level check
// (D-057); anyone else gets the same 404 as a request that doesn't exist.
export default async function RequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ submitted?: string; files?: string }> }) {
  const { user } = await requireArea("users");
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const view = await loadRequestView(Number(id), { id: user.id, roles: user.roles });
  if (!view) notFound();
  const query = await searchParams;
  const submitted = query.submitted === "1";
  const lookups = view.canResubmit && view.form.some((field) => field.type === "LOOKUP") ? await loadFieldLookups() : undefined;
  const people =
    view.canResubmit && view.form.some((field) => field.type === "PERSON")
      ? (await listActiveUserOptions()).map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` }))
      : [];
  // Blocked steps (IT): approval steps take approver-eligible people; work any active person.
  const assignable = view.blockedSteps.length
    ? {
        approvers: (await listApproverOptions()).filter((person) => person.id !== view.requesterId).map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` })),
        anyone: (await listActiveUserOptions()).map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` })),
      }
    : null;

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
      {submitted && query.files === "failed" && (
        <p role="alert" className="mb-4 rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-label text-danger-600">
          The request was submitted, but the files couldn&apos;t be saved. Add them again under Attachments.
        </p>
      )}
      {view.changesComment && (
        <p className="mb-4 rounded-md border border-warning-600/30 bg-warning-50 px-3 py-2 text-label text-warning-600">Changes asked: <SafeText text={view.changesComment} />
        </p>
      )}
      {view.holdReason && <p className="mb-4 rounded-md bg-warning-50 px-3 py-2 text-label text-warning-600">On hold: <SafeText text={view.holdReason} />
        </p>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          {view.blockedSteps.length > 0 && assignable && (
            <section className="card divide-y divide-line border-warning-600">
              <h2 className="px-5 py-4 font-semibold">Stuck: needs IT</h2>
              {view.blockedSteps.map((step) => (
                <BlockedStepForm key={step.nodeId} requestId={view.id} step={step} people={step.work ? assignable.anyone : assignable.approvers} />
              ))}
            </section>
          )}
          {(view.myTasks.length > 0 || view.canResume) && (
            <section className="card divide-y divide-line border-primary-600">
              <h2 className="px-5 py-4 font-semibold">Needs your action</h2>
              {view.myTasks.map((task) => (
                <DecisionForm
                  key={task.taskKey}
                  requestId={view.id}
                  taskKey={task.taskKey}
                  work={task.work}
                  label={task.forName ? `${task.label} (for ${task.forName}, as their delegate)` : task.label}
                />
              ))}
              {view.canResume && <ResumeForm requestId={view.id} />}
            </section>
          )}
          {view.canResubmit && (
            <section>
              <h2 className="mb-3 font-semibold">Update and resubmit</h2>
              <RequestForm mode="resubmit" requestId={view.id} fields={view.form} people={people} initial={view.rawFields} lookups={lookups} />
            </section>
          )}
          {(view.canWithdraw || view.canReopen) && (
            <section className="card divide-y divide-line">
              {view.canWithdraw && <WithdrawForm requestId={view.id} />}
              {view.canReopen && <ReopenForm requestId={view.id} />}
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
                    <dd className="whitespace-pre-wrap">
                      <SafeText text={field.value} />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>
        <div className="space-y-6">
        <section className="card px-5 py-4">
          <h2 className="mb-3 font-semibold">Attachments</h2>
          {view.attachments.length === 0 ? (
            <p className="mb-3 text-label text-ink-muted">No files attached.</p>
          ) : (
            <ul className="mb-4 space-y-2">
              {view.attachments.map((file) => (
                <li key={file.id} className="text-label">
                  <a href={`/api/attachments/${file.id}`} className="link break-all" download>
                    {file.name}
                  </a>
                  <p className="text-caption text-ink-faint">
                    {file.size} · {file.uploaderName} · {formatIndiaTime(file.createdAt)}
                    {view.round > 1 ? ` · round ${file.round}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {view.canAddFiles && <AddFilesForm requestId={view.id} />}
        </section>
        <section className="card px-5 py-4">
          <h2 className="mb-3 font-semibold">Discussion</h2>
          {view.comments.length === 0 ? (
            <p className="mb-3 text-label text-ink-muted">No comments yet.</p>
          ) : (
            <ul className="mb-4 space-y-3">
              {view.comments.map((comment) => (
                <li key={comment.id} className="text-label">
                  <p>
                    <span className="font-medium">{comment.authorName}</span> <span className="text-caption text-ink-faint">· {formatIndiaTime(comment.createdAt)}</span>
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap">
                    <SafeText text={comment.body} />
                  </p>
                </li>
              ))}
            </ul>
          )}
          <CommentForm requestId={view.id} />
        </section>
        <section className="card h-fit px-5 py-4">
          <h2 className="mb-3 font-semibold">Timeline</h2>
          <ol className="space-y-3 border-l border-line pl-4">
            {view.timeline.map((entry) => (
              <li key={entry.id} className="text-label">
                <p>
                  <SafeText text={entry.text} />
                </p>
                <p className="text-caption text-ink-faint">{formatIndiaTime(entry.at)}</p>
              </li>
            ))}
          </ol>
        </section>
        {user.roles.includes("SUPER_ADMIN") && (
          <section className="card h-fit px-5 py-4">
            <h2 className="mb-1 font-semibold">Super Admin</h2>
            <p className="mb-3 text-label text-ink-muted">Remove this request from every screen, for example a test or a mistake.</p>
            <DeleteRequestButton requestId={view.id} requestNo={view.requestNo} redirectTo="/superadmin/requests?tab=deleted" />
          </section>
        )}
        </div>
      </div>
    </>
  );
}
