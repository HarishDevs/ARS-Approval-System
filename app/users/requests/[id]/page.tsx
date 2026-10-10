import Link from "next/link";
import { Breadcrumbs } from "@/features/ui/Display";
import { formatPaise } from "@/server/forms/dynamic";
import { notFound } from "next/navigation";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { RequestStatusPill } from "@/features/requests/StatusPill";
import { StepMap, TrackerBanner } from "@/features/requests/StepMap";
import { AnswerQuestionForm, BlockedStepForm, DecisionForm, DecisionShortcuts, DelegateTaskForm, MobileDecisionBar, RecallForm, ReopenForm, ResumeForm, WithdrawForm } from "@/features/requests/ActionPanel";
import { Advice, Links } from "@/features/requests/Collaboration";
import { STATUS_WORD } from "@/features/ui/labels";
import { PromoteCustomForm } from "@/features/admin/PromoteCustomForm";
import { listApproverOptions } from "@/lib/db/repositories/approvers.repository";
import { RequestForm } from "@/features/requests/RequestForm";
import { CommentForm } from "@/features/requests/Discussion";
import { AddFilesForm } from "@/features/requests/Attachments";
import { AttachmentList } from "@/features/requests/AttachmentList";
import { Timeline } from "@/features/requests/Timeline";
import { SectionBoundary } from "@/features/ui/SectionBoundary";
import { loadRequestView } from "@/server/approvals/view";
import { recordView } from "@/lib/db/repositories/recent.repository";
import { listActiveUserOptions } from "@/lib/db/repositories/admin-users.repository";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import { DeleteRequestButton } from "@/features/superadmin/DeleteRequestButton";
import { loadFieldLookups } from "@/lib/db/repositories/lookups.repository";
import { SafeText } from "@/features/ui/SafeText";
import { listMentionable } from "@/lib/db/repositories/collab.repository";

// F-14 request page. loadRequestView applies the record-level check
// (D-057); anyone else gets the same 404 as a request that doesn't exist.
export default async function RequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ submitted?: string; files?: string; act?: string }> }) {
  const { user } = await requireArea("users");
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const view = await loadRequestView(Number(id), { id: user.id, roles: user.roles });
  if (!view) notFound();
  // WS-04: remember the visit (only after the access check passed).
  await recordView(user.id, view.id).catch(() => undefined);
  const query = await searchParams;
  const mentionable = (await listMentionable(view.id)).filter((person) => person.loginId !== user.loginId);
  const submitted = query.submitted === "1";
  const lookups = view.canResubmit && view.form.some((field) => field.type === "LOOKUP") ? await loadFieldLookups() : undefined;
  const people =
    view.canResubmit && view.form.some((field) => field.type === "PERSON")
      ? (await listActiveUserOptions()).map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` }))
      : [];
  // v1.6.0: colleagues to pass an approval to (approver-eligible) or to ask for advice (anyone active).
  const colleagues =
    view.myTasks.length > 0
      ? {
          approvers: (await listApproverOptions()).filter((person) => person.id !== user.id && person.id !== view.requesterId).map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` })),
          anyone: (await listActiveUserOptions()).filter((person) => person.id !== user.id && person.id !== view.requesterId).map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` })),
        }
      : null;
  // Blocked steps (IT): approval steps take approver-eligible people; work any active person.
  const assignable = view.blockedSteps.length
    ? {
        approvers: (await listApproverOptions()).filter((person) => person.id !== view.requesterId).map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` })),
        anyone: (await listActiveUserOptions()).map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` })),
      }
    : null;

  return (
    <>
      <Breadcrumbs
        items={[
          { href: "/users", label: "My work" },
          view.myTasks.length > 0 ? { href: "/users/queue", label: "Waiting for me" } : view.requesterId === user.id ? { href: "/users/requests", label: "My requests" } : { href: "/users/search", label: "Search" },
          { label: view.requestNo },
        ]}
      />
      <PageHeader title={view.title} description={`${view.requestNo} · ${view.workflowName} · raised by ${view.requesterName}${view.round > 1 ? ` · round ${view.round}` : ""}`}>
        <div className="flex flex-wrap items-center gap-3">
          <RequestStatusPill status={view.status} />
          {/* #10: a plain download, not a page (no prefetch). */}
          <a href={`/api/requests/${view.id}/summary.pdf`} className="link text-label" download>
            Download PDF
          </a>
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
      {view.holdReason && !view.question && <p className="mb-4 rounded-md bg-warning-50 px-3 py-2 text-label text-warning-600">On hold: <SafeText text={view.holdReason} />
        </p>}
      {view.question && !view.canAnswerQuestion && (
        <p className="mb-4 rounded-md bg-warning-50 px-3 py-2 text-label text-warning-600">
          Waiting for the requester to answer {view.question.byName}: <SafeText text={view.question.text} />
        </p>
      )}

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
          {view.canAnswerQuestion && view.question && (
            <section className="card divide-y divide-line border-warning-600" aria-label="A question for you">
              <h2 className="px-5 py-4 font-semibold">A question for you</h2>
              <AnswerQuestionForm requestId={view.id} question={view.question.text} byName={view.question.byName} />
            </section>
          )}
          {(view.myTasks.length > 0 || view.canResume) && (
            <section className="card divide-y divide-line border-primary-600">
              <h2 className="px-5 py-4 font-semibold">Needs your action</h2>
              {view.myTasks.map((task) => (
                <div key={task.taskKey}>
                  <DecisionForm
                    requestId={view.id}
                    taskKey={task.taskKey}
                    work={task.work}
                    label={task.forName ? `${task.label} (for ${task.forName}, as their delegate)` : task.label}
                  />
                  {colleagues && <DelegateTaskForm requestId={view.id} taskKey={task.taskKey} people={task.work ? colleagues.anyone : colleagues.approvers} />}
                </div>
              ))}
              {view.canResume && <ResumeForm requestId={view.id} />}
            </section>
          )}
          {view.myTasks[0] && (
            <MobileDecisionBar
              requestId={view.id}
              taskKey={view.myTasks[0].taskKey}
              work={view.myTasks[0].work}
              label={view.myTasks[0].forName ? `${view.myTasks[0].label} (for ${view.myTasks[0].forName})` : view.myTasks[0].label}
            />
          )}
          {view.myTasks[0] && (
            <DecisionShortcuts
              requestId={view.id}
              taskKey={view.myTasks[0].taskKey}
              work={view.myTasks[0].work}
              initial={query.act}
              label={view.myTasks[0].forName ? `${view.myTasks[0].label} (for ${view.myTasks[0].forName})` : view.myTasks[0].label}
            />
          )}
          {/* Room for the phone decision bar, so it never covers the page's end. */}
          {view.myTasks[0] && <div aria-hidden="true" className="h-16 md:hidden" />}
          {view.canResubmit && (
            <section>
              <h2 className="mb-3 font-semibold">Update and resubmit</h2>
              <RequestForm mode="resubmit" requestId={view.id} fields={view.form} people={people} initial={view.rawFields} lookups={lookups} />
            </section>
          )}
          {(view.canWithdraw || view.canReopen || view.canRecall) && (
            <section className="card divide-y divide-line">
              {view.canRecall && <RecallForm requestId={view.id} />}
              {view.canWithdraw && <WithdrawForm requestId={view.id} />}
              {view.canReopen && <ReopenForm requestId={view.id} />}
            </section>
          )}
          {view.changes === "unrecorded" && (
            <p className="card px-5 py-3 text-label text-ink-muted">This request was resubmitted before changes were recorded, so what changed in round {view.round} can&apos;t be shown.</p>
          )}
          {view.changes && view.changes !== "unrecorded" && (
            <section className="card px-5 py-4" aria-labelledby="changes">
              <h2 id="changes" className="mb-1 font-semibold">
                What changed in round {view.changes.round}
              </h2>
              {view.changes.fields.length === 0 && view.changes.files.length === 0 ? (
                <p className="text-label text-ink-muted">Resubmitted without changing the details.</p>
              ) : (
                <dl className="mt-2 divide-y divide-line text-label">
                  {view.changes.fields.map((change) => (
                    <div key={change.key} className="grid gap-1 py-2 sm:grid-cols-3 sm:gap-4">
                      <dt className="text-ink-muted">
                        {change.label} <span className="text-caption">({change.kind === "added" ? "added" : change.kind === "removed" ? "removed" : "changed"})</span>
                      </dt>
                      <dd className="sm:col-span-2">
                        {change.kind !== "added" && (
                          <del className="mr-2 text-ink-muted">
                            <span className="sr-only">Before: </span>
                            <SafeText text={change.before} />
                          </del>
                        )}
                        {change.kind !== "removed" && (
                          <ins className="font-medium no-underline">
                            <span className="sr-only">Now: </span>
                            <SafeText text={change.after} />
                          </ins>
                        )}
                      </dd>
                    </div>
                  ))}
                  {view.changes.files.length > 0 && (
                    <div className="grid gap-1 py-2 sm:grid-cols-3 sm:gap-4">
                      <dt className="text-ink-muted">Files added</dt>
                      <dd className="break-all sm:col-span-2">{view.changes.files.join(", ")}</dd>
                    </div>
                  )}
                </dl>
              )}
            </section>
          )}
          <section className="card px-5 py-4" aria-labelledby="levels">
            <h2 id="levels" className="mb-3 font-semibold">
              Approval levels
            </h2>
            <TrackerBanner summary={view.tracker} />
            <StepMap stages={view.stages} />
          </section>
          {view.fields.length > 0 && (
            <section className="card px-5 py-4">
              <h2 className="mb-3 font-semibold">Details</h2>
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {view.fields.map((field) => (
                  <div key={field.key} className={field.lines?.length ? "sm:col-span-2" : undefined}>
                    <dt className="text-caption text-ink-muted">{field.label}</dt>
                    <dd className="whitespace-pre-wrap">
                      {field.lines?.length ? (
                        <div className="mt-1 overflow-x-auto rounded-md border border-line">
                          <table className="data-table">
                            <caption className="sr-only">{field.label}</caption>
                            <thead>
                              <tr>
                                <th scope="col">Description</th>
                                <th scope="col" className="text-right">Qty</th>
                                <th scope="col" className="text-right">Rate</th>
                                <th scope="col" className="text-right">GST %</th>
                                <th scope="col" className="text-right">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {field.lines.map((line, index) => (
                                <tr key={index}>
                                  <td>
                                    <SafeText text={line.description} />
                                  </td>
                                  <td className="text-right tabular-nums">{line.quantity}</td>
                                  <td className="text-right tabular-nums">{formatPaise(Math.round(Number(line.rate) * 100))}</td>
                                  <td className="text-right tabular-nums">{line.gst}</td>
                                  <td className="text-right tabular-nums">{formatPaise(line.totalPaise)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <p className="border-t border-line px-4 py-2 text-right font-semibold tabular-nums">Total {field.value}</p>
                        </div>
                      ) : (
                        <SafeText text={field.value} />
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>
        <div className="space-y-6">
        <SectionBoundary label="Attachments">
          <section className="card px-5 py-4">
            <h2 className="mb-3 font-semibold">Attachments</h2>
            {view.attachments.length === 0 ? (
              <p className="mb-3 text-label text-ink-muted">No files attached.</p>
            ) : (
              <AttachmentList
                files={view.attachments.map((file) => ({
                  id: file.id,
                  name: file.name,
                  size: file.size,
                  preview: file.preview,
                  meta: `${file.uploaderName} · ${formatIndiaTime(file.createdAt)}${view.round > 1 ? ` · round ${file.round}` : ""}`,
                }))}
              />
            )}
            {view.canAddFiles && <AddFilesForm requestId={view.id} />}
          </section>
        </SectionBoundary>
        <SectionBoundary label="Discussion">
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
          <CommentForm requestId={view.id} people={mentionable} />
        </section>
        </SectionBoundary>
        <SectionBoundary label="Advice">
          <Advice
            requestId={view.id}
            canAsk={view.canConsult}
            people={colleagues?.anyone ?? []}
            rows={view.consultations.map((row) => ({
              id: row.id,
              byName: row.requestedByName,
              consulteeName: row.consulteeName,
              question: row.question,
              answer: row.answer,
              status: row.status,
              askedAt: formatIndiaTime(row.createdAt),
              mine: row.consulteeId === user.id && row.status === "OPEN",
            }))}
          />
        </SectionBoundary>
        <SectionBoundary label="Linked requests">
          <Links
            requestId={view.id}
            followUpHref={view.canFollowUp ? `/users/new?followUp=${view.id}` : null}
            rows={view.links.map((link) => ({
              id: link.id,
              requestNo: link.requestNo,
              title: link.title,
              status: STATUS_WORD[link.status] ?? link.status,
              relation: link.kind === "RELATED" ? "Related" : link.direction === "to" ? "Follow-up" : "Follow-up of",
            }))}
          />
        </SectionBoundary>
        <SectionBoundary label="History">
          <section className="card h-fit px-5 py-4" aria-labelledby="history">
            <h2 id="history" className="mb-3 font-semibold">
              Timeline
            </h2>
            <Timeline entries={view.timeline} />
          </section>
        </SectionBoundary>
        {view.isCustom && (user.roles.includes("IT_ADMIN") || user.roles.includes("SUPER_ADMIN")) && (
          <section className="card h-fit px-5 py-4">
            <h2 className="mb-1 font-semibold">Reuse these levels</h2>
            <p className="mb-3 text-label text-ink-muted">Make this custom approval a predefined approval type. Its levels and form are copied into a draft you can change, test and publish.</p>
            <PromoteCustomForm requestId={view.id} title={view.title} />
          </section>
        )}
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
