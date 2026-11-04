import { countPendingTasksFor, listPendingTasksFor } from "@/lib/db/repositories/approvals.repository";
import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/features/ui/Display";
import { NavOwner } from "@/features/shell/nav-owner";
import { notFound } from "next/navigation";
import { MessagesSquare, Paperclip, Repeat2, ShieldCheck, Copy } from "lucide-react";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { Hint } from "@/features/ui/Hint";
import { RequestStatusPill } from "@/features/requests/StatusPill";
import { ApprovalLevels } from "@/features/requests/ApprovalLevels";
import { RequestDetails } from "@/features/requests/RequestDetails";
import { RequestTimeline } from "@/features/requests/RequestTimeline";
import { indiaDateTime, processFigures } from "@/features/requests/request-page";
import { loadJourney } from "@/server/journey/load";
import { ARSApprovalJourney } from "@/features/journey/ARSApprovalJourney";
import {
  AnswerQuestionForm,
  BlockedStepForm,
  DecisionForm,
  DecisionShortcuts,
  DelegateTaskForm,
  MobileDecisionBar,
  RecallForm,
  ReopenForm,
  ResumeForm,
  MobileResumeBar,
  WithdrawForm,
} from "@/features/requests/ActionPanel";
import { Advice, Links } from "@/features/requests/Collaboration";
import { STATUS_WORD } from "@/features/ui/labels";
import { PromoteCustomForm } from "@/features/admin/PromoteCustomForm";
import { listApproverOptions } from "@/lib/db/repositories/approvers.repository";
import { RequestForm } from "@/features/requests/RequestForm";
import { CommentForm } from "@/features/requests/Discussion";
import { AddFilesForm } from "@/features/requests/Attachments";
import { AttachmentList } from "@/features/requests/AttachmentList";
import { SubmissionChecks } from "@/features/requests/SubmissionChecks";
import { SaveTemplateForm } from "@/features/requests/Templates";
import { CollaboratorsCard } from "@/features/requests/CollaboratorsCard";
import { listCollaborators } from "@/server/approvals/collaborators";
import { AmendmentsCard } from "@/features/requests/Amendments";
import { amendmentPlan } from "@/server/approvals/amendments";
import { featureOn } from "@/server/settings/features";
import { SectionBoundary } from "@/features/ui/SectionBoundary";
import { loadRequestView } from "@/server/approvals/view";
import { recordView } from "@/lib/db/repositories/recent.repository";
import { listActiveUserOptions } from "@/lib/db/repositories/admin-users.repository";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import { DeleteRequestButton } from "@/features/superadmin/DeleteRequestButton";
import { loadFieldLookups } from "@/lib/db/repositories/lookups.repository";
import { SafeText } from "@/features/ui/SafeText";
import { listMentionable } from "@/lib/db/repositories/collab.repository";
import { expiryState } from "@/server/approvals/expiry-rules";
import { personProfile } from "@/lib/db/repositories/profile.repository";
import { BrandAnimation } from "@/features/ui/BrandAnimation";
import { RequestPriorityBadge } from "@/features/ui/ChoicePill";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Request" };

// F-14 request page. loadRequestView applies the record-level check
// (D-057); anyone else gets the same 404 as a request that doesn't exist.
export default async function RequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ submitted?: string; files?: string; act?: string; decided?: string }>;
}) {
  const { user } = await requireArea("users");
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const view = await loadRequestView(Number(id), { id: user.id, roles: user.roles });
  const journey = view ? await loadJourney(view.id, { id: user.id, roles: user.roles }).catch(() => null) : null;
  const road = journey ? { road: journey.road } : null;
  if (!view) notFound();
  // WS-04: remember the visit (only after the access check passed).
  await recordView(user.id, view.id).catch(() => undefined);
  const query = await searchParams;
  const mentionable = (await listMentionable(view.id)).filter((person) => person.loginId !== user.loginId);
  const submitted = query.submitted === "1";
  const afterDecision =
    query.decided === "1"
      ? await Promise.all([listPendingTasksFor(user.id, { limit: 5, offset: 0 }), countPendingTasksFor(user.id)])
          .then(([items, left]) => ({ next: items.find((item) => item.requestId !== view.id) ?? null, left }))
          .catch(() => null)
      : null;
  const lookups = view.canResubmit && view.form.some((field) => field.type === "LOOKUP") ? await loadFieldLookups() : undefined;
  const people =
    view.canResubmit && view.form.some((field) => field.type === "PERSON") ? (await listActiveUserOptions()).map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` })) : [];
  // v1.6.0: colleagues to pass an approval to (approver-eligible) or to ask for advice (anyone active).
  const colleagues =
    view.myTasks.length > 0
      ? {
          approvers: (await listApproverOptions())
            .filter((person) => person.id !== user.id && person.id !== view.requesterId)
            .map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` })),
          anyone: (await listActiveUserOptions())
            .filter((person) => person.id !== user.id && person.id !== view.requesterId)
            .map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` })),
        }
      : null;
  const templatesOn = await featureOn("templates", user);
  // v1.6.1 collaborators: the requester and IT manage them.
  const collaborators = await listCollaborators(view.id);
  const canManageCollaborators = view.requesterId === user.id || user.roles.includes("IT_ADMIN") || user.roles.includes("SUPER_ADMIN");
  const collaboratorOptions = canManageCollaborators
    ? (await listActiveUserOptions()).filter((person) => person.id !== view.requesterId).map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` }))
    : [];
  // FN5: the requester may amend an approved request when the type allows it.
  const canAmend = view.requesterId === user.id && view.status === "APPROVED" && (await amendmentPlan(view.id, { id: user.id, roles: user.roles })).ok;
  // Blocked steps (IT): approval steps take approver-eligible people; work any active person.
  const assignable = view.blockedSteps.length
    ? {
        approvers: (await listApproverOptions()).filter((person) => person.id !== view.requesterId).map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` })),
        anyone: (await listActiveUserOptions()).map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` })),
      }
    : null;

  // D-263 (owner): the requester's details sit in the Details card.
  const requester = await personProfile(view.requesterId).catch(() => null);
  const raisedAt = road?.road.checkpoints[0]?.finishedAt ?? null;
  // v1.49 (owner's layout): the Approval levels figures and the footer's actions.
  const figures = processFigures({ status: view.status, road: road?.road ?? null, tracker: view.tracker, timeline: view.timeline, raisedAt });
  const isAdmin = user.roles.includes("IT_ADMIN") || user.roles.includes("SUPER_ADMIN");
  const isSuperAdmin = user.roles.includes("SUPER_ADMIN");
  const raiseAgainHref =
    view.requesterId === user.id
      ? view.isCustom
        ? `/users/custom?from=${view.id}` // D-234: a custom request can be raised again too (approvers included).
        : templatesOn && view.workflowActive
          ? `/users/new/${view.workflowId}?from=${view.id}`
          : null
      : null;
  const reuse: "levels" | "template" | null = view.isCustom && isAdmin ? "levels" : templatesOn && view.requesterId === user.id && !view.isCustom && view.workflowActive ? "template" : null;

  const fileRows = view.attachments.map((file) => ({
    id: file.id,
    name: file.name,
    size: file.size,
    preview: file.preview,
    meta: `${file.fieldLabel ? `${file.fieldLabel} · ` : ""}${file.uploaderName} · ${formatIndiaTime(file.createdAt)}${view.round > 1 ? ` · round ${file.round}` : ""}`,
  }));

  // v1.49.5 (owner: "opened from Waiting for me but it highlights My pending
  // requests"): the list this request belongs to for this person. The
  // breadcrumb, Back and the highlighted tab (NavOwner) all follow it.
  const backTo =
    view.myTasks.length > 0
      ? { href: "/users/queue", label: "Waiting for me" }
      : view.requesterId === user.id
        ? view.status === "APPROVED"
          ? { href: "/users/approved", label: "My approved requests" }
          : { href: "/users/requests", label: "My pending requests" }
        : view.approvedByMe
          ? { href: "/users/approved-by-me", label: "Approved by me" }
          : collaborators.some((row) => row.userId === user.id)
            ? { href: "/users/collaborating", label: "Collaborating" }
            : { href: "/users/search", label: "Search" };
  return (
    <>
      {/* D-234 (Jakob): ← Back goes to the list the breadcrumb names. */}
      <Breadcrumbs items={[{ href: "/users", label: "Home" }, backTo, { label: view.requestNo }]} />
      <NavOwner href={backTo.href} />
      {/* v1.42.1 (owner's sketch): the title and number across the top; D-273: the approval journey below them, full width. */}
      <div className="mb-6 grid items-center gap-4" data-testid="request-top">
        <div className="min-w-0 [&>div]:mb-0">
          <PageHeader title={view.title} badge={view.priority && !view.priority.hidden ? <RequestPriorityBadge priority={view.priority} /> : undefined} meta={`${view.requestNo} · ${view.workflowName} · raised by ${view.requesterName}${view.round > 1 ? ` · round ${view.round}` : ""}`}>
            <div className="flex flex-wrap items-center gap-3">
              <RequestStatusPill status={view.status} validUntil={view.validUntil} />
              <ValidityBadge validUntil={view.validUntil} />
              {/* #10: a plain download, not a page (no prefetch). */}
              <a href={`/api/requests/${view.id}/summary.pdf`} className="link text-label" download>
                Download PDF
              </a>
              <Link href={backTo.href} className="link text-label">
                ← Back to {backTo.label}
              </Link>
            </div>
          </PageHeader>
        </div>
        {journey && (
          <section className="min-w-0" aria-label="Approval journey">
            <ARSApprovalJourney journey={journey} serverNow={new Date().toISOString()} fresh={query.submitted === "1"} />
          </section>
        )}
      </div>
      {afterDecision && (
        // D-234 (Peak-end, Parkinson): after a decision, the next thing waiting.
        <p role="status" data-testid="next-waiting" className="mb-4 flex flex-wrap items-center gap-2 rounded-md bg-success-50 px-3 py-2 text-label text-success-600">
          {/* The whole request approved: the celebration; otherwise the approval seal. */}
          <BrandAnimation name={view.status === "APPROVED" ? "celebrate" : "approved"} className={view.status === "APPROVED" ? "h-10 w-10" : "h-6 w-6"} />
          <span className="font-semibold">Your decision is recorded.</span>
          {afterDecision.next ? (
            <>
              <Link href={`/users/requests/${afterDecision.next.requestId}`} className="btn-primary btn-compact w-auto">
                Next waiting for you →
              </Link>
              <span className="text-ink-muted">
                {afterDecision.next.requestNo}: {afterDecision.next.title} · {afterDecision.left.toLocaleString("en-IN")} still waiting
              </span>
            </>
          ) : (
            <span>Nothing else is waiting for you. All done.</span>
          )}
        </p>
      )}
      {submitted && (
        <p role="status" className="flex items-center gap-2 mb-4 rounded-md bg-success-50 px-3 py-2 text-label text-success-600">
          <BrandAnimation name="success" className="h-6 w-6" />
          <span>Submitted as {view.requestNo}. The first approvers have been told.</span>
        </p>
      )}
      {submitted && query.files === "failed" && (
        <p role="alert" className="mb-4 rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-label text-danger-600">
          The request was submitted, but the files couldn&apos;t be stored on the server. If file storage is the cause, IT has been told; add the files again under Attachments once it&apos;s fixed.
        </p>
      )}
      {view.changesComment && (
        <p className="mb-4 rounded-md border border-warning-600/30 bg-warning-50 px-3 py-2 text-label text-warning-600">
          Changes asked: <SafeText text={view.changesComment} />
        </p>
      )}
      {view.holdReason && !view.question && (
        <p className="mb-4 rounded-md bg-warning-50 px-3 py-2 text-label text-warning-600">
          On hold: <SafeText text={view.holdReason} />
        </p>
      )}
      {view.question && !view.canAnswerQuestion && (
        <p className="mb-4 rounded-md bg-warning-50 px-3 py-2 text-label text-warning-600">
          Waiting for the requester to answer {view.question.byName}: <SafeText text={view.question.text} />
        </p>
      )}

      {/* v1.49 (owner's layout, 2 Nov 2026): under the journey, the main
          column (Request details, Approval levels) and the side column (the
          decision first for approvers, then the request's actions,
          Attachments, Collaborators, Discussion). On a phone everything
          stacks in the owner's order: the approval visual (journey), then
          Request details, then the rest (Approval levels, the side cards). */}
      <div className="request-layout grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]" data-testid="request-layout">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="order-1 min-w-0">
            <RequestDetails view={view} requester={requester} raisedOn={indiaDateTime(raisedAt ?? figures.startIso, true)} files={fileRows} />
          </div>
          <div className="order-2 min-w-0">
            <ApprovalLevels status={view.status} tracker={view.tracker} stages={view.stages} figures={figures} />
          </div>
          <div className="order-3 min-w-0 space-y-6 empty:hidden">
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
            {/* D-234 (Banner blindness, Proximity): an approver sees the budget
                and submission warnings beside their decision, not far below it. */}
            {view.myTasks.length > 0 && <SubmissionChecks check={view.submissionCheck} department={view.budgetDepartment} />}
            {/* v1.48.1: on hold, the phone bar is Resume (nothing can be decided until then). */}
            {view.status === "ON_HOLD" && view.canResume && <MobileResumeBar requestId={view.id} />}
            {view.status !== "ON_HOLD" && view.myTasks[0] && (
              <MobileDecisionBar
                requestId={view.id}
                taskKey={view.myTasks[0].taskKey}
                work={view.myTasks[0].work}
                label={view.myTasks[0].forName ? `${view.myTasks[0].label} (for ${view.myTasks[0].forName})` : view.myTasks[0].label}
              />
            )}
            {view.status !== "ON_HOLD" && view.myTasks[0] && (
              <DecisionShortcuts
                requestId={view.id}
                taskKey={view.myTasks[0].taskKey}
                work={view.myTasks[0].work}
                initial={query.act}
                label={view.myTasks[0].forName ? `${view.myTasks[0].label} (for ${view.myTasks[0].forName})` : view.myTasks[0].label}
              />
            )}
            {view.canResubmit && (
              <section id="resubmit" className="scroll-mt-20">
                <h2 className="mb-3 font-semibold">Update and resubmit</h2>
                <RequestForm
                  mode="resubmit"
                  requestId={view.id}
                  fields={view.form}
                  people={people}
                  initial={view.rawFields}
                  lookups={lookups}
                  existingFiles={Object.fromEntries(view.fields.filter((field) => field.files).map((field) => [field.key, field.files!.length]))}
                />
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
            {view.myTasks.length === 0 && <SubmissionChecks check={view.submissionCheck} department={view.budgetDepartment} />}
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          {/* D-263: the decision leads the side column for approvers. */}
          {(view.myTasks.length > 0 || view.canResume) && (
            <section className="card action-compact divide-y divide-line border-primary-600" aria-labelledby="your-action">
              <h2 id="your-action" className="px-4 py-2.5 text-label font-semibold">
                Needs your action
              </h2>
              {/* v1.48.1 (owner): on hold, Resume comes first and the decisions wait for it. */}
              {view.canResume && <ResumeForm requestId={view.id} reason={view.holdReason} />}
              {view.status === "ON_HOLD" && !view.canResume && view.myTasks.length > 0 && (
                <p className="px-5 py-4 text-label text-ink-muted">This request is on hold. You can decide once it is resumed.</p>
              )}
              {view.status !== "ON_HOLD" && view.myTasks.map((task) => (
                <div key={task.taskKey}>
                  <DecisionForm requestId={view.id} taskKey={task.taskKey} work={task.work} label={task.forName ? `${task.label} (for ${task.forName}, as their delegate)` : task.label} />
                  {colleagues && <DelegateTaskForm requestId={view.id} taskKey={task.taskKey} people={task.work ? colleagues.anyone : colleagues.approvers} />}
                </div>
              ))}
            </section>
          )}
          {(view.canWithdraw || view.canReopen || view.canRecall) && (
            <div id="request-actions" className="scroll-mt-20 space-y-4">
              {view.canRecall && (
                <section className="card" aria-labelledby="recall-title">
                  <RecallForm requestId={view.id} />
                </section>
              )}
              {view.canWithdraw && (
                <section className="card" aria-labelledby="withdraw-title">
                  <WithdrawForm requestId={view.id} />
                </section>
              )}
              {view.canReopen && (
                <section className="card" aria-labelledby="reopen-title">
                  <ReopenForm requestId={view.id} />
                </section>
              )}
            </div>
          )}
          <SectionBoundary label="Attachments">
            <section className="card px-5 py-4" aria-labelledby="attachments-title">
              <h2 id="attachments-title" className="mb-3 flex items-center gap-2 font-semibold">
                <Paperclip aria-hidden="true" className="h-4 w-4 shrink-0 text-primary-600" />
                Attachments
              </h2>
              {view.attachments.length === 0 ? <p className="mb-3 text-label text-ink-muted">No files attached.</p> : <AttachmentList files={fileRows} />}
              {view.canAddFiles && <AddFilesForm requestId={view.id} />}
            </section>
          </SectionBoundary>
          <SectionBoundary label="Collaborators">
            <CollaboratorsCard
              requestId={view.id}
              viewerId={user.id}
              canManage={canManageCollaborators}
              options={collaboratorOptions}
              rows={collaborators.map((row) => ({ userId: row.userId, name: row.name, loginId: row.loginId, addedByName: row.addedByName, addedAt: formatIndiaTime(row.addedAt) }))}
            />
          </SectionBoundary>
          <SectionBoundary label="Discussion">
            <section className="card px-5 py-4" aria-labelledby="discussion-title">
              <h2 id="discussion-title" className="mb-3 flex items-center gap-2 font-semibold">
                <MessagesSquare aria-hidden="true" className="h-4 w-4 shrink-0 text-primary-600" />
                Discussion
              </h2>
              {view.comments.length === 0 ? (
                <p className="mb-3 text-label text-ink-muted">No comments yet.</p>
              ) : (
                <ul className="mb-4 space-y-3">
                  {view.comments.map((comment) => (
                    <li key={comment.id} className="text-label">
                      <p>
                        <span className="font-medium">{comment.authorName}</span> <span className="text-caption text-ink-muted">· {formatIndiaTime(comment.createdAt)}</span>
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap break-words">
                        <SafeText text={comment.body} />
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <CommentForm requestId={view.id} people={mentionable} />
            </section>
          </SectionBoundary>
          <SectionBoundary label="Amendments">
            <AmendmentsCard hideConfidential={view.confidentialHidden} requestId={view.id} form={view.form} canAmend={canAmend} />
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
        </div>
      </div>

      {/* v1.49: the bottom row: Linked requests, Timeline, Reuse (a phone shows the Timeline first). */}
      <div className="request-bottom mt-6 grid items-stretch gap-6 md:grid-cols-2 xl:grid-cols-3" data-testid="request-bottom">
        <div className="order-2 min-w-0 xl:order-1">
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
        </div>
        <div className="order-1 min-w-0 xl:order-2">
          <SectionBoundary label="History">
            {/* Owner: the latest 3 events, newest first; "Show more" opens the rest in a scrolling box. */}
            <RequestTimeline entries={view.timeline} />
          </SectionBoundary>
        </div>
        {reuse === "levels" && (
          <div className="order-3 min-w-0 md:col-span-2 xl:col-span-1">
            <section className="card h-full px-5 py-4" aria-labelledby="reuse-levels">
              <h2 id="reuse-levels" className="mb-3 flex items-center gap-2 font-semibold">
                <Copy aria-hidden="true" className="h-4 w-4 shrink-0 text-primary-600" />
                Reuse these levels
                <Hint text="Make this custom approval a predefined approval type. Its levels and form are copied into a draft you can change, test and publish." align="start" />
              </h2>
              <PromoteCustomForm requestId={view.id} title={view.title} />
            </section>
          </div>
        )}
        {reuse === "template" && (
          <div className="order-3 min-w-0 md:col-span-2 xl:col-span-1">
            <section className="card h-full px-5 py-4" aria-labelledby="reuse-request">
              <h2 id="reuse-request" className="mb-3 flex items-center gap-2 font-semibold">
                <Copy aria-hidden="true" className="h-4 w-4 shrink-0 text-primary-600" />
                Reuse this request
              </h2>
              <SaveTemplateForm requestId={view.id} />
            </section>
          </div>
        )}
      </div>

      {/* v1.49: the footer: raise again on the left; the Super Admin's actions on the right. */}
      {(raiseAgainHref || isSuperAdmin) && (
        <div className="request-footer card mt-6 flex flex-wrap items-center justify-between gap-3 px-5 py-3" data-testid="request-footer" aria-label="Request actions" role="group">
          {raiseAgainHref ? (
            <Link href={raiseAgainHref} className="link inline-flex min-h-11 items-center gap-2 text-label">
              <Repeat2 aria-hidden="true" className="h-4 w-4 shrink-0" />
              Raise again like this
            </Link>
          ) : (
            <span />
          )}
          {isSuperAdmin && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link href={`/superadmin/requests?q=${encodeURIComponent(view.requestNo)}`} className="btn-secondary btn-compact inline-flex items-center gap-1.5">
                <ShieldCheck aria-hidden="true" className="h-4 w-4" />
                Super Admin
              </Link>
              <Hint text="Remove this request from every screen, for example a test or a mistake." align="end" />
              <DeleteRequestButton requestId={view.id} requestNo={view.requestNo} redirectTo="/superadmin/requests?tab=deleted" />
            </div>
          )}
        </div>
      )}
      {/* Room for the phone decision bar, so it never covers the page's end. */}
      {view.myTasks[0] && <div aria-hidden="true" className="h-16 md:hidden" />}
    </>
  );
}

// A1: how long the approval stays valid (types with a validity period).
function ValidityBadge({ validUntil }: { validUntil: Date | null }) {
  const state = expiryState(validUntil);
  if (state === "NONE" || !validUntil) return null;
  const day = validUntil.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
  if (state === "EXPIRED")
    return (
      <span data-testid="validity" className="rounded-full bg-danger-50 px-2.5 py-0.5 text-caption font-semibold text-danger-600">
        Expired on {day}
      </span>
    );
  return (
    <span data-testid="validity" className={`rounded-full px-2.5 py-0.5 text-caption font-semibold ${state === "EXPIRING" ? "bg-warning-50 text-warning-600" : "bg-surface-muted text-ink-muted"}`}>
      Valid until {day}
    </span>
  );
}
