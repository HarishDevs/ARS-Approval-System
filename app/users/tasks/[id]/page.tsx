import type { Metadata } from "next";
import { featureOn } from "@/server/settings/features";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { Hint } from "@/features/ui/Hint";
import { Badge, Breadcrumbs } from "@/features/ui/Display";
import { CommentForm, EditTaskForm, ReassignForm, TaskActionButton } from "@/features/modules/TaskForms";
import { FieldValues, FileLinks, HistoryList, type HistoryEntry } from "@/features/modules/RecordParts";
import { PRIORITY_TONE, STATUS_TONE } from "@/features/modules/TaskListScreen";
import { listTaskEvents, listPeopleFacts, personFacts } from "@/lib/db/repositories/tasks.repository";
import { loadFieldLookups, loadLookupNames } from "@/lib/db/repositories/lookups.repository";
import { listRecordFiles } from "@/server/modules/files";
import { isAdminActor, loadTaskFor, relatedRequestVisible } from "@/server/modules/tasks";
import { COMPLETION_LABEL, indiaDateTimeText, PRIORITY_LABEL, utcToIndiaLocal } from "@/server/modules/settings";
import { isOverdue, mayAssignTo, OPEN_STATUSES, TASK_STATUS_LABEL } from "@/server/modules/task-rules";
import { TaskWorkPanel, TaskWorkSide, type PanelData } from "@/features/work/TaskWorkPanel";
import { CommentThread } from "@/features/work/CommentThread";
import { recurrenceOf } from "@/server/work/service-more";
import { loadSetting } from "@/server/work/holiday-store";
import { parseRecurrenceSettings, RECURRENCE_SETTINGS_KEY } from "@/server/work/more-rules";
import { ancestors, fieldValues, listProjectFields, likesOf, listComments, listDependencies, listFollowers, listSections, listSubtasks, listTaskItems, listTaskProjects, listVisibleProjects } from "@/lib/db/repositories/work.repository";
import { rightsOn, workViewer } from "@/server/work/task-access";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Task" };

export const dynamic = "force-dynamic";

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
export default async function TaskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; project?: string }> }) {
  const { user } = await requireArea("users");
  if (!(await featureOn("tasks", user))) notFound();
  const { id } = await params;
  if (!/^\d{1,10}$/.test(id)) notFound();
  const loaded = await loadTaskFor(Number(id), user);
  if (!loaded) notFound();
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
  const query = await searchParams;
  const created = query.created === "1";
  // D-215: projects, subtasks, dependencies, tags, followers, likes, comments.
  const viewer = await workViewer(user);
  const [rights, chain, links, subtasks, deps, followers, likes, comments, choices, workItem] = await Promise.all([
    rightsOn(task, viewer),
    ancestors(task.id),
    listTaskProjects(task.id),
    listSubtasks(task.id),
    listDependencies(task.id),
    listFollowers(task.id),
    likesOf("TASK", task.id),
    listComments(task.id, user.id),
    listVisibleProjects(viewer),
    listTaskItems(["t.id = ?"], [task.id], "t.id", 1),
  ]);
  const linkSections = await Promise.all(links.map((link) => listSections(link.projectId)));
  // D-218: repeating, and each project's own fields.
  const [recurrence, recurrenceSettings, linkFields, ownValues] = await Promise.all([
    recurrenceOf(task.id),
    loadSetting(RECURRENCE_SETTINGS_KEY).then(parseRecurrenceSettings),
    Promise.all(links.map((link) => listProjectFields(link.projectId))),
    fieldValues([task.id]),
  ]);
  const fromProject = links.find((link) => String(link.projectId) === query.project) ?? null;
  const panel: PanelData = {
    taskId: task.id,
    taskNo: task.taskNo,
    title: task.title,
    open: OPEN_STATUSES.includes(task.status),
    isMilestone: task.isMilestone,
    startsOn: task.startsOn ?? "",
    meId: user.id,
    canEdit: rights.edit,
    canProgress: task.assigneeId === user.id,
    canComment: rights.comment,
    deleted: Boolean(task.deletedAt),
    parent: chain.at(-1) ?? null,
    links: links.map((link, index) => ({ projectId: link.projectId, projectName: link.projectName, color: link.color, sectionId: link.sectionId, sections: linkSections[index]!.map((section) => ({ id: section.id, name: section.name })) })),
    projectChoices: choices.map((project) => ({ id: project.id, name: project.name })),
    subtasks: subtasks.map((item) => ({ id: item.id, title: item.title, status: item.status, assigneeName: item.assigneeName, dueAt: item.dueAt?.toISOString() ?? null, subtasks: item.subtasks })),
    blockedBy: deps.blockedBy,
    blocking: deps.blocking,
    tags: workItem.items[0]?.tags.map((tag) => ({ id: tag.id, name: tag.name })) ?? [],
    followers,
    people: people.map((person) => ({ id: person.id, label: person.name })),
    likes,
    nowIso: new Date().toISOString(),
    recurrence,
    recurrenceOn: recurrenceSettings.enabled,
    fields: links.map((link, index) => ({ projectId: link.projectId, fields: linkFields[index]!.map((field) => ({ id: field.id, name: field.name, kind: field.kind, options: field.options })), values: ownValues.get(task.id) ?? {} })),
  };
  const names = new Map(people.map((person) => [person.id, person.name]));
  const now = new Date();
  const late = isOverdue(task, now);
  const options = people.map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` }));
  const assignable = people.filter((person) => person.id !== task.assigneeId && mayAssignTo(settings, { creatorId: user.id, creatorDepartmentId: me?.departmentId ?? null, creatorTeamIds: loaded.viewer.teamIds ?? [], candidate: person }, isAdminActor(user)));
  const editable = form.filter((field) => field.editable && field.type !== "ATTACHMENT" && field.type !== "CALC");
  const values = Object.fromEntries(editable.map((field) => [field.key, Array.isArray(task.formData[field.key]) ? JSON.stringify(task.formData[field.key]) : task.formData[field.key] === undefined ? "" : String(task.formData[field.key])]));
  const history: HistoryEntry[] = events.map((event) => ({
    id: event.id,
    when: event.createdAt,
    who: event.actorName,
    what: event.eventType === "REASSIGN" && event.payload ? `Reassigned from ${names.get(Number(event.payload.from)) ?? "someone"} to ${names.get(Number(event.payload.to)) ?? "someone"}` : (EVENT_TEXT[event.eventType] ?? event.eventType),
    // D-215: mentions read as @Name.
    detail: event.body?.replace(/@\[([^\]\n]{1,80})\]\(user:\d{1,10}\)/g, "@$1") ?? null,
  }));

  return (
    <>
      <Breadcrumbs
        items={[
          fromProject ? { href: `/users/work/projects/${fromProject.projectId}`, label: fromProject.projectName } : { href: "/users/tasks", label: "Tasks" },
          ...chain.map((item) => ({ href: `/users/tasks/${item.id}`, label: item.title })),
          { label: task.taskNo },
        ]}
      />
      <PageHeader title={task.title} meta={`${task.taskNo} · ${task.typeName} (version ${versionNo})`}>
        <Badge tone={STATUS_TONE[task.status]}>{TASK_STATUS_LABEL[task.status]}</Badge>
        <Badge tone={PRIORITY_TONE[task.priority]}>{PRIORITY_LABEL[task.priority]}</Badge>
        {late && <Badge tone="danger">Overdue</Badge>}
        {task.isMilestone && <Badge tone="primary">Milestone</Badge>}
        {task.deletedAt && <Badge tone="danger">Deleted</Badge>}
      </PageHeader>
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
            {task.description && <p className="whitespace-pre-wrap">{task.description}</p>}
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
            </dl>
            <FieldValues form={form} data={task.formData} names={names} lookupNames={lookupNames} />
            {task.completionNote && (
              <div>
                <h3 className="text-label font-semibold">Completion note</h3>
                <p className="whitespace-pre-wrap">{task.completionNote}</p>
              </div>
            )}
            <FileLinks files={files} />
          </section>
          <TaskWorkPanel data={panel} />
          <CommentThread
            taskId={task.id}
            meId={user.id}
            canComment={rights.comment && !task.deletedAt}
            canPin={rights.edit}
            isAdmin={viewer.isAdmin}
            people={panel.people}
            comments={comments.map((comment) => ({
              id: comment.id,
              parentCommentId: comment.parentCommentId,
              authorId: comment.authorId,
              authorName: comment.authorName,
              body: comment.body,
              isPinned: comment.isPinned,
              edited: comment.editedAt !== null,
              deleted: comment.deletedAt !== null,
              when: indiaDateTimeText(comment.createdAt),
              likes: comment.likes,
              likedByMe: comment.likedByMe,
            }))}
          />
          <section className="card space-y-4 px-5 py-4" aria-labelledby="history">
            <h2 id="history" className="font-semibold">
              History
            </h2>
            <HistoryList entries={history} />
            {actions.has("COMMENT") && <CommentForm taskId={task.id} />}
          </section>
        </div>
        <aside className="space-y-4" aria-label="Task actions">
          <section className="card space-y-3 px-5 py-4">
            <h2 className="font-semibold">Actions</h2>
            {[...actions].filter((action) => action !== "COMMENT").length === 0 && <p className="text-label text-ink-muted">Nothing for you to do on this task now.</p>}
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
            {actions.has("REASSIGN") && <ReassignForm taskId={task.id} rowVersion={task.rowVersion} assignable={assignable.map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` }))} />}
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
          <TaskWorkSide data={panel} />
        </aside>
      </div>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption font-semibold uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
