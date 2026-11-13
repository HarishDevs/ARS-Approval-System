import { TaskPriorityPill } from "@/features/ui/ChoicePill";
import { RichText } from "@/features/work/RichText";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/features/shell/PageHeader";
import { Hint } from "@/features/ui/Hint";
import { Badge, Breadcrumbs } from "@/features/ui/Display";
import { AttachFilesForm, EditTaskForm, ReassignForm, TaskActionButton } from "@/features/modules/TaskForms";
import { ActionRemarks } from "@/features/modules/ActionRemarks";
import { FieldValues, FileLinks, type HistoryEntry } from "@/features/modules/RecordParts";
import { STATUS_TONE } from "@/features/modules/TaskListScreen";
import { listTaskEvents, listPeopleFacts, personFacts } from "@/lib/db/repositories/tasks.repository";
import { loadFieldLookups, loadLookupNames } from "@/lib/db/repositories/lookups.repository";
import { listRecordFiles } from "@/server/modules/files";
import { isAdminActor, loadTaskFor, relatedRequestVisible } from "@/server/modules/tasks";
import { meetingOfTask } from "@/lib/db/repositories/meetings.repository";
import { loadJourney } from "@/server/journey/load";
import { ARSApprovalJourney } from "@/features/journey/ARSApprovalJourney";
import { COMPLETION_LABEL, indiaDateTimeText, utcToIndiaLocal } from "@/server/modules/settings";
import { isOverdue, mayAssignTo, TASK_STATUS_LABEL } from "@/server/modules/task-rules";
import { TaskWorkPanel, TaskWorkSide } from "@/features/work/TaskWorkPanel";
import { CommentThread } from "@/features/work/CommentThread";
import { taskWorkView } from "@/server/work/task-view";
import { TaskCompleteButton } from "@/features/work/client";
import { TaskShareButton } from "@/features/work/ShareDialogs";
import { visibilityText } from "@/features/work/visibility";
import { ArrowLeft, CalendarDays, MoreHorizontal } from "lucide-react";
import { isMobileLayout } from "@/server/ui/layout-mode";
import { SheetButton } from "@/features/mobile/BottomSheet";
import { CopyLinkButton } from "@/features/work/client";
import { initials } from "@/features/ui/Display";

import { TaskActivity } from "@/features/work/TaskActivity";
import { personLabel } from "@/lib/people/label";
import { recurrenceLabel } from "@/server/work/more-rules";
import type { AuthenticatedUser } from "@/types/auth";

const EVENT_TEXT: Record<string, string> = {
  CREATED: "Created",
  START: "Started",
  BLOCK: "Marked blocked",
  UNBLOCK: "Back in progress",
  COMPLETE: "Completed",
  REOPEN: "Reopened",
  CANCEL: "Cancelled",
  REASSIGN: "Reassigned",
  EDIT: "Details changed",
  COMMENT: "Comment",
  // D-215: Task & Project Management.
  COMMENTED: "Commented",
  SUBTASK_ADDED: "Added a subtask",
  PARENT_CHANGED: "Moved in the task tree",
  MOVED_SECTION: "Moved to another section",
  ADDED_TO_PROJECT: "Added to a project",
  REMOVED_FROM_PROJECT: "Removed from a project",
  FOLLOWER_ADDED: "Added a follower",
  FOLLOWER_REMOVED: "Removed a follower",
  DEPENDENCY_ADDED: "Now waits for another task",
  DEPENDENCY_REMOVED: "No longer waits for a task",
  TAG_ADDED: "Added a tag",
  TAG_REMOVED: "Removed a tag",
  DELETED: "Deleted",
  RESTORED: "Restored",
  // D-218
  REPEAT_SET: "Repeat changed",
  RECURRED: "Repeated",
  FIELD_SET: "Field changed",
};

// v1.9.0 (D-143): one task. Only its creator, assigner, assignee, the
// assignee's manager and IT can open it; anyone else gets "not found".
// v1.52.1 (owner: "when opening a task it should open in a popup window with
// all the actions"): the whole task, shared by its full page and the popup
// opened from a list (?task=<id>). In the popup the breadcrumbs make way for
// a bar with Open full page and Close.
export async function TaskDetail({ taskId, user, query, popup }: { taskId: number; user: AuthenticatedUser; query: { created?: string; project?: string }; popup?: { closeHref: string } }) {
  const loaded = await loadTaskFor(taskId, user);
  if (!loaded) {
    if (!popup) notFound();
    return <p className="px-5 py-6 text-ink-muted">Not found, or you can&apos;t see this task.</p>;
  }
  const { task, settings, form, versionNo, actions } = loaded;
  const [events, files, people, lookups, lookupNames, me, relatedVisible] = await Promise.all([
    listTaskEvents(task.id),
    listRecordFiles("TASK", task.id),
    listPeopleFacts(),
    loadFieldLookups(),
    loadLookupNames(),
    personFacts(user.id),
    task.relatedRequestId ? relatedRequestVisible(task.relatedRequestId, user) : Promise.resolve(false),
  ]);
  // v1.51.0 (D-300): the meeting an action-item task came from (like projects).
  const fromMeeting = await meetingOfTask(task.id).catch(() => null);
  // D-273: the parent request's journey, small, for anyone who may see that request (its own check).
  const parentJourney = task.relatedRequestId ? await loadJourney(task.relatedRequestId, { id: user.id, roles: user.roles }).catch(() => null) : null;
  const created = query.created === "1";
  // D-215: projects, subtasks, dependencies, tags, followers, likes, comments (shared with the task panel, D-219).
  const view = await taskWorkView(task, user);
  const { panel, rights, chain, links, viewer, group } = view;
  const fromProject = links.find((link) => String(link.projectId) === query.project) ?? null;
  const names = new Map(people.map((person) => [person.id, person.name]));
  const now = new Date();
  const late = isOverdue(task, now);
  const options = people.map((person) => ({ id: person.id, label: personLabel(person), detail: person.departmentName ?? undefined }));
  const assignable = people.filter(
    (person) =>
      person.id !== task.assigneeId && mayAssignTo(settings, { creatorId: user.id, creatorDepartmentId: me?.departmentId ?? null, creatorTeamIds: loaded.viewer.teamIds ?? [], candidate: person }, isAdminActor(user)),
  );
  const editable = form.filter((field) => field.editable && field.type !== "ATTACHMENT" && field.type !== "CALC");
  const values = Object.fromEntries(
    editable.map((field) => [field.key, Array.isArray(task.formData[field.key]) ? JSON.stringify(task.formData[field.key]) : task.formData[field.key] === undefined ? "" : String(task.formData[field.key])]),
  );
  const history: HistoryEntry[] = events.map((event) => ({
    id: event.id,
    when: event.createdAt,
    who: event.actorName,
    what:
      event.eventType === "REASSIGN" && event.payload
        ? `Reassigned from ${names.get(Number(event.payload.from)) ?? "someone"} to ${names.get(Number(event.payload.to)) ?? "someone"}`
        : (EVENT_TEXT[event.eventType] ?? event.eventType),
    // D-215: mentions read as @Name.
    detail: event.body?.replace(/@\[([^\]\n]{1,80})\]\(user:\d{1,10}\)/g, "@$1") ?? null,
  }));

  const actionsCard = (
    <>
          <section className="card space-y-3 px-5 py-4">
            <h2 className="font-semibold">Actions</h2>
            {[...actions].filter((action) => action !== "COMMENT").length === 0 && <p className="text-label text-ink-muted">Nothing for you to do on this task now.</p>}
            {[...actions].some((action) => action !== "COMMENT" && action !== "EDIT") ? (
            <ActionRemarks>
            <div className="flex flex-wrap gap-2">
              {actions.has("START") && <TaskActionButton taskId={task.id} rowVersion={task.rowVersion} action="START" needsText={false} />}
              {actions.has("UNBLOCK") && <TaskActionButton taskId={task.id} rowVersion={task.rowVersion} action="UNBLOCK" needsText={false} />}
              {actions.has("COMPLETE") && (
                <TaskActionButton
                  taskId={task.id}
                  rowVersion={task.rowVersion}
                  action="COMPLETE"
                  needsText={settings.completion === "NOTE" || settings.completion === "NOTE_AND_FILE"}
                  allowFiles={settings.completion === "FILE" || settings.completion === "NOTE_AND_FILE"}
                  textLabel={`Completion note${settings.completion === "NONE" || settings.completion === "FILE" ? " (optional)" : ""}`}
                />
              )}
              {actions.has("BLOCK") && <TaskActionButton taskId={task.id} rowVersion={task.rowVersion} action="BLOCK" needsText textLabel="What is blocking it?" />}
              {actions.has("REOPEN") && <TaskActionButton taskId={task.id} rowVersion={task.rowVersion} action="REOPEN" needsText textLabel="Why reopen it?" />}
              {actions.has("CANCEL") && <TaskActionButton taskId={task.id} rowVersion={task.rowVersion} action="CANCEL" needsText textLabel="Why cancel it?" danger />}
            </div>
            {actions.has("COMPLETE") && settings.completion !== "NONE" && <p className="text-caption text-ink-muted">To complete: {COMPLETION_LABEL[settings.completion].toLowerCase()}.</p>}
            {actions.has("REASSIGN") && <ReassignForm taskId={task.id} rowVersion={task.rowVersion} assignable={assignable.map((person) => ({ id: person.id, label: personLabel(person), detail: person.departmentName ?? undefined }))} />}
            </ActionRemarks>
            ) : null}
            {actions.has("EDIT") && (
              <EditTaskForm
                taskId={task.id}
                rowVersion={task.rowVersion}
                title={task.title}
                description={task.description ?? ""}
                priority={task.priority}
                due={utcToIndiaLocal(task.dueAt)}
                editable={editable}
                values={values}
                people={options}
                lookups={lookups}
              />
            )}
          </section>
    </>
  );
  const canTick = (actions.has("COMPLETE") && settings.completion === "NONE") || actions.has("REOPEN") || task.status === "COMPLETED";
  const mobile = await isMobileLayout();

  return (
    <>
      {mobile && (
        // v1.45.0 (owner's Asana task screen): back, Mark complete, copy link and … (the task's actions) stay at the top.
        <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-sticky -mx-4 -mt-4 mb-3 flex items-center gap-2 border-b border-line bg-surface px-2 py-2" data-testid="m-task-bar">
          <Link href={fromProject ? `/users/work/projects/${fromProject.projectId}` : "/users/work/my-tasks"} aria-label="Back to tasks" className="grid h-11 w-11 place-items-center rounded-full text-ink">
            <ArrowLeft aria-hidden="true" className="h-6 w-6" />
          </Link>
          <span className="flex flex-1 justify-center">{canTick && <TaskCompleteButton taskId={task.id} done={task.status === "COMPLETED"} disabled={!(actions.has("COMPLETE") || actions.has("REOPEN"))} title={task.title} />}</span>
          <span className="grid h-11 w-11 place-items-center">
            <CopyLinkButton path={`/users/tasks/${task.id}`} />
          </span>
          <SheetButton label="Task actions" title="Task actions" content={<div className="space-y-4 pb-2 [&_.card]:border-0 [&_.card]:px-0 [&_.card]:shadow-none">{actionsCard}<TaskShareButton taskId={task.id} title={task.title} followers={panel.followers} people={panel.people} visibility={visibilityText(links)} canAdd={rights.comment} /></div>} testId="m-task-actions" className="grid h-11 w-11 place-items-center rounded-full text-ink-muted">
            <MoreHorizontal aria-hidden="true" className="h-6 w-6" />
          </SheetButton>
        </div>
      )}
      {mobile ? (
        <header className="mb-4 space-y-4">
          <p className="font-mono text-[12px] text-ink-muted">
            {task.taskNo} · {task.typeName}
          </p>
          <h1 className="text-[26px] font-semibold leading-tight">{task.title}</h1>
          <div className="flex flex-wrap gap-2">
            <Badge tone={STATUS_TONE[task.status]}>{TASK_STATUS_LABEL[task.status]}</Badge>
            <TaskPriorityPill priority={task.priority} showNormal />
            {late && <Badge tone="danger">Overdue</Badge>}
            {task.deletedAt && <Badge tone="danger">Deleted</Badge>}
          </div>
          <dl className="grid grid-cols-2 gap-3 border-y border-line py-3" data-testid="m-task-facts">
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[color:var(--m-navy)] text-[14px] font-bold text-white">
                {initials(task.assigneeName)}
              </span>
              <div className="min-w-0">
                <dt className="text-[13px] text-ink-muted">Assigned to</dt>
                <dd className="truncate text-[15px]">{task.assigneeName}</dd>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 ${late ? "border-danger-600 text-danger-600" : "border-line text-ink-muted"}`}>
                <CalendarDays className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <dt className="text-[13px] text-ink-muted">Due date</dt>
                <dd className={`truncate text-[15px] ${late ? "text-danger-600" : ""}`}>{task.dueAt ? DUE_DAY.format(new Date(task.dueAt)) : "None"}</dd>
              </div>
            </div>
          </dl>
        </header>
      ) : (
      <>
      {!popup && <Breadcrumbs
        items={[
          fromProject ? { href: `/users/work/projects/${fromProject.projectId}`, label: fromProject.projectName } : { href: "/users/tasks", label: "Tasks" },
          ...chain.map((item) => ({ href: `/users/tasks/${item.id}`, label: item.title })),
          { label: task.taskNo },
        ]}
      />}
      <PageHeader title={task.title} meta={`${task.taskNo} · ${task.typeName} (version ${versionNo})`}>
        <TaskShareButton taskId={task.id} title={task.title} followers={panel.followers} people={panel.people} visibility={visibilityText(links)} canAdd={rights.comment} />
        {/* D-219: complete or reopen in one click, as in Asana (types that need a note or file say so). */}
        {((actions.has("COMPLETE") && settings.completion === "NONE") || actions.has("REOPEN") || task.status === "COMPLETED") && (
          <TaskCompleteButton taskId={task.id} done={task.status === "COMPLETED"} disabled={!(actions.has("COMPLETE") || actions.has("REOPEN"))} title={task.title} />
        )}
        <Badge tone={STATUS_TONE[task.status]}>{TASK_STATUS_LABEL[task.status]}</Badge>
        <TaskPriorityPill priority={task.priority} showNormal />
        {late && <Badge tone="danger">Overdue</Badge>}
        {task.isMilestone && <Badge tone="primary">Milestone</Badge>}
        {/* D-222: the two kinds of task. */}
        <Badge tone={panel.adhoc ? "neutral" : "info"}>{panel.adhoc ? "Ad hoc" : panel.recurrence ? `Periodic: ${recurrenceLabel(panel.recurrence)}` : "Periodic"}</Badge>
        {task.deletedAt && <Badge tone="danger">Deleted</Badge>}
      </PageHeader>
      </>
      )}
      {parentJourney && (
        <section className="mb-4" aria-label={`Approval journey of ${parentJourney.requestNo}`} data-testid="task-parent-journey">
          <p className="mb-1.5 text-label text-ink-muted">
            From approval request{" "}
            <Link href={`/users/requests/${parentJourney.requestId}`} className="link font-mono">
              {parentJourney.requestNo}
            </Link>
          </p>
          <ARSApprovalJourney journey={parentJourney} serverNow={new Date().toISOString()} variant="compact" />
        </section>
      )}
      {created && (
        <p role="status" className="mb-4 rounded-md bg-success-50 px-3 py-2 text-label text-success-600">
          Task {task.taskNo} created{task.assigneeId !== user.id ? ` and ${task.assigneeName} was told` : ""}.
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <section className="card space-y-4 px-5 py-4" aria-labelledby="details">
            <h2 id="details" className="font-semibold">
              Details
            </h2>
            {task.description && <RichText text={task.description} />}
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Fact label="Assigned to" value={task.assigneeName} />
              <Fact label="Assigned by" value={task.assignedByName} />
              <Fact label="Created by" value={`${task.createdByName}, ${indiaDateTimeText(task.createdAt)}`} />
              <Fact label="Due" value={task.dueAt ? indiaDateTimeText(task.dueAt) : "No due date"} />
              {task.startsOn && <Fact label="Start on" value={task.startsOn} />}
              {task.completedAt && <Fact label="Completed" value={`${task.completedByName ?? ""}, ${indiaDateTimeText(task.completedAt)}`} />}
              {task.relatedRequestNo && (
                <div>
                  <dt className="text-caption font-semibold uppercase tracking-wide text-ink-faint">Related request</dt>
                  <dd>
                    {relatedVisible ? (
                      <Link href={`/users/requests/${task.relatedRequestId}`} className="link font-mono">
                        {task.relatedRequestNo}
                      </Link>
                    ) : (
                      <span className="font-mono">{task.relatedRequestNo}</span>
                    )}{" "}
                    <Hint text="Separate from this task: completing it doesn't approve the request." align="start" />
                  </dd>
                </div>
              )}
              {fromMeeting && (
                <div>
                  <dt className="text-caption font-semibold uppercase tracking-wide text-ink-faint">Meeting</dt>
                  <dd>
                    <Link href={`/users/meetings/${fromMeeting.id}`} className="link">
                      <span className="font-mono">{fromMeeting.meetingNo}</span> {fromMeeting.title}
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
            <FieldValues form={form} data={task.formData} names={names} lookupNames={lookupNames} />
            {task.completionNote && (
              <div>
                <h3 className="text-label font-semibold">Completion note</h3>
                <p className="whitespace-pre-wrap">{task.completionNote}</p>
              </div>
            )}
          </section>
          {/* v1.54.7 (owner): a task's files, and adding more, always at hand. */}
          <section className="card space-y-3 px-5 py-4" aria-labelledby="task-files" data-testid="task-files">
            <h2 id="task-files" className="font-semibold">
              Attachments
            </h2>
            {files.length ? <FileLinks files={files} label="" /> : <p className="text-label text-ink-muted">No files yet.</p>}
            {actions.has("COMMENT") && <AttachFilesForm taskId={task.id} />}
          </section>
          {group.length > 0 && (
            <p className="card px-5 py-3 text-label" data-testid="assign-group">
              <span className="text-ink-muted">Also given to (each has their own copy): </span>
              {group.map((item, index) => (
                <span key={item.id}>
                  {index > 0 && ", "}
                  <Link href={`/users/tasks/${item.id}`} className="link">
                    {item.assigneeName}
                  </Link>
                  {item.status === "COMPLETED" && " ✓"}
                </span>
              ))}
            </p>
          )}
          <TaskWorkPanel data={panel} />
          {/* v1.52.1 (owner, Asana): Comments and All activity as two tabs. */}
          <TaskActivity
            comments={<CommentThread taskId={task.id} meId={user.id} canComment={rights.comment && !task.deletedAt} canPin={rights.edit} isAdmin={viewer.isAdmin} people={panel.people} comments={view.comments} docked={mobile && !popup} />}
            commentCount={view.comments.filter((comment) => !comment.deleted).length}
            activity={history.map((entry, index) => ({
              id: entry.id,
              when: entry.when.toISOString(),
              who: entry.who,
              what: entry.what,
              detail: entry.detail ?? null,
              kind: activityKind(events[index]?.eventType ?? ""),
            }))}
          />
        </div>
        <aside className="space-y-4" aria-label="Task actions">
          {!mobile && actionsCard}
          <TaskWorkSide data={panel} />
        </aside>
      </div>
    </>
  );
}

// v1.52.2 (owner, Asana's activity): comments in full, completion with a tick,
// creation, and everything else as small updates that fold together.
function activityKind(eventType: string): "comment" | "done" | "created" | "update" {
  if (eventType === "COMMENT" || eventType === "COMMENTED") return "comment";
  if (eventType === "COMPLETE") return "done";
  if (eventType === "CREATED") return "created";
  return "update";
}

const DUE_DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption font-semibold uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
