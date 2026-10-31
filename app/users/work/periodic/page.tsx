import type { Metadata } from "next";
import { Repeat } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/features/shell/PageHeader";
import { EmptyState } from "@/features/ui/Display";
import { ProjectDot, TaskCheck } from "@/features/work/client";
import { StopRepeatButton } from "@/features/work/MoreParts";
import { paneLinks, paneTaskId, TaskPane, WithPane } from "@/features/work/TaskPane";
import { dueLabel, TONE_TEXT } from "@/features/work/format";
import { listPeriodic } from "@/lib/db/repositories/work.repository";
import { parseRecurrence, recurrenceLabel } from "@/server/work/more-rules";
import { workPage } from "@/server/work/page-context";

export const metadata: Metadata = { title: "Periodic tasks" };
export const dynamic = "force-dynamic";

// D-219: every repeating task the person can see: how often, when the next
// one is due, who does it, how many have been done. Ad hoc tasks are the
// one-time ones everywhere else.
export default async function PeriodicPage({ searchParams }: { searchParams: Promise<{ task?: string }> }) {
  const { user, viewer } = await workPage();
  const params = await searchParams;
  const items = await listPeriodic(viewer);
  const now = new Date();
  const links = paneLinks("/users/work/periodic", params);
  const paneId = paneTaskId(params.task);
  const pane = paneId ? <TaskPane taskId={paneId} user={user} closeHref={links.close} /> : null;
  return (
    <>
      <PageHeader title="Periodic tasks" icon={Repeat} description="Tasks that repeat. When one is completed the next one is made. Make any task periodic from its Repeats box." />
      <WithPane pane={pane}>
        {items.length === 0 ? (
          <EmptyState title="No periodic tasks yet" body="Open a task and choose Repeats → Make it repeat, or create one with Create → Task → Periodic." />
        ) : (
          <div className="card overflow-x-auto">
            <table className="data-table" data-testid="periodic-table">
              <caption className="sr-only">Periodic tasks</caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">Done</span>
                  </th>
                  <th scope="col">Task</th>
                  <th scope="col">Repeats</th>
                  <th scope="col">Next due</th>
                  <th scope="col">Assignee</th>
                  <th scope="col">Done so far</th>
                  <th scope="col">
                    <span className="sr-only">Stop</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((task) => {
                  const rule = parseRecurrence(task.rule);
                  const due = dueLabel(task.dueAt, now, true);
                  return (
                    <tr key={task.id} className="work-row" tabIndex={-1}>
                      <td className="w-8">
                        <TaskCheck taskId={task.id} done={task.status === "COMPLETED"} disabled={task.status === "CANCELLED"} label={task.title} />
                      </td>
                      <td>
                        <Link href={links.open(task.id)} scroll={false} className="link font-medium">
                          {task.title}
                        </Link>
                        <p className="flex flex-wrap gap-2 text-caption text-ink-muted">
                          <span className="font-mono">{task.taskNo}</span>
                          {task.projects.map((project) => (
                            <span key={project.id} className="inline-flex items-center gap-1">
                              <ProjectDot color={project.color} />
                              {project.name}
                            </span>
                          ))}
                        </p>
                      </td>
                      <td className="text-label">{rule ? recurrenceLabel(rule) : "—"}</td>
                      <td className={`text-label ${due ? TONE_TEXT[due.tone] : ""}`}>{due?.text ?? "No due date"}</td>
                      <td className="text-label">{task.assigneeName}</td>
                      <td className="text-label">{task.doneInSeries}</td>
                      <td>
                        <StopRepeatButton taskId={task.id} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </WithPane>
    </>
  );
}
