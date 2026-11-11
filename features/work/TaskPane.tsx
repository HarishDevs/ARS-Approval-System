import Link from "next/link";
import { ExternalLink, X } from "lucide-react";
import { CopyLinkButton } from "@/features/work/client";
import { TaskDetail } from "@/features/work/TaskDetail";
import type { AuthenticatedUser } from "@/types/auth";
export { visibilityText } from "@/features/work/visibility";

// D-219: a task opens from the list it was clicked in (?task=<id>).
// v1.52.1 (owner: "when opening a task it should open in a popup window with
// all the actions"): it opens in a popup over the list with everything its
// full page has (TaskDetail): actions, completion, reassign, edit, subtasks,
// comments and activity. Esc, × or a click outside closes it; Open full page
// opens the task's own page. Someone who can't see the task gets "not found".
export async function TaskPane({ taskId, user, closeHref }: { taskId: number; user: AuthenticatedUser; closeHref: string }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Task" data-task-pane data-close-href={closeHref} data-testid="task-pane" className="fixed inset-0 z-[60] flex items-center justify-center p-0 sm:p-6">
      {/* The dimmed page behind: a click on it closes the popup. */}
      <Link href={closeHref} scroll={false} aria-label="Close task" tabIndex={-1} className="fixed inset-0 cursor-default bg-black/40" />
      <div className="relative h-full w-full max-w-6xl overflow-y-auto overscroll-contain rounded-none bg-page shadow-2xl sm:h-auto sm:max-h-full sm:rounded-xl">
        <div className="sticky top-0 z-10 flex items-center justify-end gap-1 rounded-t-xl border-b border-line bg-surface px-3 py-2">
          <CopyLinkButton path={`/users/tasks/${taskId}`} />
          <Link href={`/users/tasks/${taskId}`} className="inline-flex items-center gap-1 rounded px-2 py-1 text-label text-ink-muted hover:bg-surface-muted hover:text-ink">
            <ExternalLink aria-hidden="true" className="h-4 w-4" /> Open full page
          </Link>
          <Link href={closeHref} scroll={false} aria-label="Close task" aria-keyshortcuts="Escape" className="rounded p-1 text-ink-muted hover:bg-surface-muted hover:text-ink" data-testid="close-pane">
            <X aria-hidden="true" className="h-5 w-5" />
          </Link>
        </div>
        <div className="p-4 sm:p-6">
          <TaskDetail taskId={taskId} user={user} query={{}} popup={{ closeHref }} />
        </div>
      </div>
    </div>
  );
}

// The page with its list on the left and the task pane on the right.
export function WithPane({ pane, children }: { pane: React.ReactNode | null; children: React.ReactNode }) {
  if (!pane) return <>{children}</>;
  // v1.52.1: the task is a popup over the list, so the list keeps its full width.
  return (
    <>
      {children}
      {pane}
    </>
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


