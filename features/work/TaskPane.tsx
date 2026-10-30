import Link from "next/link";
import { ExternalLink, X } from "lucide-react";
import { Badge } from "@/features/ui/Display";
import { SafeText } from "@/features/ui/SafeText";
import { CopyLinkButton, TaskCompleteButton } from "@/features/work/client";
import { TaskShareButton } from "@/features/work/ShareDialogs";
import { TaskWorkPanel, TaskWorkSide } from "@/features/work/TaskWorkPanel";
import { CommentThread } from "@/features/work/CommentThread";
import { PRIORITY_TONE, STATUS_TONE } from "@/features/modules/TaskListScreen";
import { loadTaskFor } from "@/server/modules/tasks";
import { indiaDateTimeText, PRIORITY_LABEL } from "@/server/modules/settings";
import { isOverdue, TASK_STATUS_LABEL } from "@/server/modules/task-rules";
import { taskWorkView } from "@/server/work/task-view";
import { recurrenceLabel } from "@/server/work/more-rules";

// D-219: Asana's task pane. A task opens beside the list it was clicked in
// (?task=<id>), with the same rights and parts as its full page; Esc or ×
// closes it. Someone who can't see the task gets a plain "not found".
export async function TaskPane({ taskId, user, closeHref }: { taskId: number; user: { id: number; roles: readonly string[] }; closeHref: string }) {
  const loaded = await loadTaskFor(taskId, user);
  const frame = (children: React.ReactNode) => (
    <aside
      aria-label="Task details"
      data-task-pane
      data-close-href={closeHref}
      className="fixed inset-0 z-40 overflow-y-auto bg-page p-4 lg:sticky lg:inset-auto lg:top-4 lg:z-auto lg:max-h-[calc(100vh-2rem)] lg:rounded-lg lg:border lg:border-line lg:bg-surface lg:p-0 lg:shadow-sm"
      data-testid="task-pane"
    >
      {children}
    </aside>
  );
  if (!loaded)
    return frame(
      <div className="flex items-center justify-between px-5 py-4">
        <p className="text-ink-muted">Not found, or you can&apos;t see this task.</p>
        <Link href={closeHref} aria-label="Close task" className="rounded p-1 hover:bg-surface-muted">
          <X aria-hidden="true" className="h-5 w-5" />
        </Link>
      </div>,
    );
  const { task, actions, settings } = loaded;
  const view = await taskWorkView(task, user);
  const late = isOverdue(task, new Date());
  return frame(
    <div className="space-y-4 pb-6">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2">
        {((actions.has("COMPLETE") && settings.completion === "NONE") || actions.has("REOPEN") || task.status === "COMPLETED") && (
          <TaskCompleteButton taskId={task.id} done={task.status === "COMPLETED"} disabled={!(actions.has("COMPLETE") || actions.has("REOPEN"))} title={task.title} />
        )}
        <span className="ml-auto flex items-center gap-1">
          <TaskShareButton taskId={task.id} title={task.title} followers={view.panel.followers} people={view.panel.people} visibility={visibilityText(view.links)} canAdd={view.rights.comment} compact />
          <CopyLinkButton path={`/users/tasks/${task.id}`} />
          <Link href={`/users/tasks/${task.id}`} className="inline-flex items-center gap-1 rounded px-2 py-1 text-label text-ink-muted hover:bg-surface-muted hover:text-ink">
            <ExternalLink aria-hidden="true" className="h-4 w-4" /> Open full page
          </Link>
          <Link href={closeHref} aria-label="Close task" aria-keyshortcuts="Escape" className="rounded p-1 text-ink-muted hover:bg-surface-muted hover:text-ink" data-testid="close-pane">
            <X aria-hidden="true" className="h-5 w-5" />
          </Link>
        </span>
      </div>
      {/* Who can see it (catalog S-17 banner). */}
      <p className="mx-4 rounded-md bg-surface-muted px-3 py-2 text-caption text-ink-muted" data-testid="visibility-banner">
        {visibilityText(view.links)}
      </p>
      <div className="space-y-3 px-4">
        <p className="font-mono text-caption text-ink-muted">
          {task.taskNo} · {task.typeName}
        </p>
        <h2 className={`text-title font-semibold ${task.status === "COMPLETED" ? "text-ink-muted line-through" : ""}`}>
          <SafeText text={task.title} />
        </h2>
        <div className="flex flex-wrap gap-2">
          <Badge tone={STATUS_TONE[task.status]}>{TASK_STATUS_LABEL[task.status]}</Badge>
          <Badge tone={PRIORITY_TONE[task.priority]}>{PRIORITY_LABEL[task.priority]}</Badge>
          {late && <Badge tone="danger">Overdue</Badge>}
          <Badge tone={view.panel.recurrence ? "info" : "neutral"}>{view.panel.recurrence ? `Periodic: ${recurrenceLabel(view.panel.recurrence)}` : "Ad hoc"}</Badge>
        </div>
        <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-2 text-label">
          <dt className="text-ink-muted">Assignee</dt>
          <dd>{task.assigneeName}</dd>
          <dt className="text-ink-muted">Due date</dt>
          <dd className={late ? "font-semibold text-danger-600" : ""}>{task.dueAt ? indiaDateTimeText(task.dueAt) : "No due date"}</dd>
          <dt className="text-ink-muted">Created by</dt>
          <dd>
            {task.createdByName}, {indiaDateTimeText(task.createdAt)}
          </dd>
          {settings.completion !== "NONE" && actions.has("COMPLETE") && (
            <>
              <dt className="text-ink-muted">To complete</dt>
              <dd>Needs a note or file: use the full page.</dd>
            </>
          )}
        </dl>
        {view.group.length > 0 && (
          <p className="text-label" data-testid="assign-group">
            <span className="text-ink-muted">Also given to: </span>
            {view.group.map((item, index) => (
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
        {task.description && (
          <p className="whitespace-pre-wrap rounded-md bg-surface-muted p-3 text-body">
            <SafeText text={task.description} />
          </p>
        )}
      </div>
      <div className="space-y-4 px-4">
        <TaskWorkPanel data={view.panel} />
        <TaskWorkSide data={view.panel} />
        <CommentThread taskId={task.id} meId={user.id} canComment={view.rights.comment && !task.deletedAt} canPin={view.rights.edit} isAdmin={view.viewer.isAdmin} people={view.panel.people} comments={view.comments} />
      </div>
    </div>,
  );
}

// The page with its list on the left and the task pane on the right.
export function WithPane({ pane, children }: { pane: React.ReactNode | null; children: React.ReactNode }) {
  if (!pane) return <>{children}</>;
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(380px,520px)] lg:items-start lg:gap-4">
      <div className="min-w-0">{children}</div>
      {pane}
    </div>
  );
}

// ?task=<id> from the page's search parameters (null when absent or odd).
export function paneTaskId(raw: string | string[] | undefined): number | null {
  return typeof raw === "string" && /^\d{1,10}$/.test(raw) ? Number(raw) : null;
}

// Addresses for a server-drawn page: open a task in the pane, close the pane.
export function paneLinks(path: string, params: Record<string, string | string[] | undefined>) {
  const keep = Object.fromEntries(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[0] !== "task"));
  const close = new URLSearchParams(keep).toString();
  return {
    open: (id: number) => `${path}?${new URLSearchParams({ ...keep, task: String(id) })}`,
    close: `${path}${close ? `?${close}` : ""}`,
  };
}

export function visibilityText(links: readonly { projectName: string }[]): string {
  return links.length
    ? `This task is visible to members of ${links.map((link) => link.projectName).join(", ")}, its people and followers.`
    : "This task is visible to its assignee, its creator, its followers and the managers above the assignee.";
}
