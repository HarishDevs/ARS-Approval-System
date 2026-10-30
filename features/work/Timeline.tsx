import Link from "next/link";
import { indiaDayOf } from "@/features/work/format";
import { TaskCheck } from "@/features/work/client";

// D-215: the project's Timeline. Each dated task is a bar from its start date
// (or its due date alone) to its due date, by section; milestones are
// diamonds; tasks waiting for others show a lock. Read here; dates are
// changed in the List, Calendar or the task itself.
export interface TimelineTask {
  id: number;
  title: string;
  status: string;
  sectionName: string;
  startsOn: string | null;
  dueAt: string | null;
  isMilestone: boolean;
  blockedBy: number;
  assigneeName: string;
}

const DAY = 86_400_000;
const toDate = (day: string) => new Date(`${day}T00:00:00Z`);

export function Timeline({ tasks, todayDay, hrefFor }: { tasks: TimelineTask[]; todayDay: string; hrefFor: (id: number) => string }) {
  const dated = tasks
    .map((task) => {
      const due = task.dueAt ? indiaDayOf(new Date(task.dueAt)) : null;
      const start = task.startsOn ?? due;
      return start && due ? { ...task, start, due } : null;
    })
    .filter((task): task is TimelineTask & { start: string; due: string } => task !== null);
  if (!dated.length) return <p className="card px-5 py-8 text-center text-ink-muted">Give tasks a due date (and a start date for a range) to see them here.</p>;
  const first = Math.min(toDate(todayDay).getTime() - 7 * DAY, ...dated.map((task) => toDate(task.start).getTime()));
  const last = Math.max(toDate(todayDay).getTime() + 14 * DAY, ...dated.map((task) => toDate(task.due).getTime()));
  const span = Math.min(366, Math.round((last - first) / DAY) + 1);
  const at = (day: string) => Math.max(0, Math.min(span, Math.round((toDate(day).getTime() - first) / DAY)));
  const weeks = Array.from({ length: Math.ceil(span / 7) }, (_, index) => new Date(first + index * 7 * DAY));
  const sections = [...new Set(dated.map((task) => task.sectionName))];
  const width = Math.max(720, span * 18);
  return (
    <div className="card overflow-x-auto" data-testid="timeline">
      <div style={{ width: width + 220 }} className="relative">
        <div className="sticky top-0 flex border-b border-line bg-surface-muted text-caption text-ink-faint">
          <div className="w-[220px] shrink-0 px-3 py-1 font-semibold">Task</div>
          <div className="relative h-6 flex-1">
            {weeks.map((week) => (
              <span key={week.getTime()} className="absolute top-1" style={{ left: `${(((week.getTime() - first) / DAY) / span) * 100}%` }}>
                {week.getUTCDate()}/{week.getUTCMonth() + 1}
              </span>
            ))}
          </div>
        </div>
        {sections.map((section) => (
          <div key={section}>
            <div className="border-b border-line bg-surface-muted/60 px-3 py-1 text-label font-semibold">{section}</div>
            {dated
              .filter((task) => task.sectionName === section)
              .sort((a, b) => a.start.localeCompare(b.start))
              .map((task) => {
                const left = (at(task.start) / span) * 100;
                const length = Math.max(1, at(task.due) - at(task.start) + 1);
                const done = task.status === "COMPLETED";
                return (
                  <div key={task.id} className="flex items-center border-b border-line">
                    <div className="flex w-[220px] shrink-0 items-center gap-2 truncate px-3 py-1.5 text-label">
                      <TaskCheck taskId={task.id} done={task.status === "COMPLETED"} disabled={task.status === "CANCELLED"} label={task.title} size="sm" />
                      <Link href={hrefFor(task.id)} scroll={false} className="truncate hover:underline">
                        {task.blockedBy > 0 && <span title="Waiting for other tasks">🔒 </span>}
                        {task.title}
                      </Link>
                    </div>
                    <div className="relative h-8 flex-1">
                      <span className="absolute inset-y-0 w-px bg-primary-600/50" style={{ left: `${(at(todayDay) / span) * 100}%` }} aria-hidden="true" />
                      {task.isMilestone ? (
                        <span title={`${task.title}: ${task.due}`} className="absolute top-2 h-4 w-4 rotate-45 bg-primary-solid" style={{ left: `calc(${(at(task.due) / span) * 100}% - 8px)` }} />
                      ) : (
                        <span
                          title={`${task.title}: ${task.start} to ${task.due} · ${task.assigneeName}`}
                          className={`absolute top-1.5 h-5 truncate rounded px-1.5 text-caption leading-5 text-white ${done ? "bg-success-600/70" : "bg-primary-solid"}`}
                          style={{ left: `${left}%`, width: `${(length / span) * 100}%` }}
                        >
                          {task.assigneeName}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}
