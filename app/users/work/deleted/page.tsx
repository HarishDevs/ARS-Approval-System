import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/features/shell/PageHeader";
import { EmptyState } from "@/features/ui/Display";
import { RestoreTaskButton } from "@/features/work/SearchParts";
import { listDeletedTasks } from "@/lib/db/repositories/work.repository";
import { indiaDateTimeText } from "@/server/modules/settings";
import { workPage } from "@/server/work/page-context";

export const metadata: Metadata = { title: "Deleted tasks" };
export const dynamic = "force-dynamic";

// D-215: tasks the person created or deleted in the last 30 days, to restore
// (with their subtasks). Deleted projects are under Projects → Deleted.
export default async function DeletedTasksPage() {
  const { user } = await workPage();
  const tasks = await listDeletedTasks(user.id);
  return (
    <>
      <PageHeader title="Deleted tasks" description="Deleted tasks stay here for 30 days. Restoring one brings back its subtasks, projects and comments." />
      {tasks.length === 0 ? (
        <EmptyState title="Nothing deleted" body="Tasks you create or delete appear here for 30 days after they are deleted." />
      ) : (
        <ul className="card divide-y divide-line">
          {tasks.map((task) => (
            <li key={task.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Link href={`/users/tasks/${task.id}`} className="min-w-0 flex-1 truncate">
                <span className="font-mono text-caption text-ink-muted">{task.taskNo}</span> {task.title}
              </Link>
              <span className="text-caption text-ink-muted">Deleted {indiaDateTimeText(task.deletedAt)}</span>
              <RestoreTaskButton taskId={task.id} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
