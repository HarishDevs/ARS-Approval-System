import Link from "next/link";
import { FileCheck2, ListChecks } from "lucide-react";
import { countTaskItems, listTaskItems, type WorkTaskItem } from "@/lib/db/repositories/work.repository";
import { dueLabel, indiaDayOf, TONE_TEXT } from "@/features/work/format";
import { addDays } from "@/server/work/rules";
import { EmptyState } from "@/features/ui/Display";
import { SafeText } from "@/features/ui/SafeText";
import { TaskFab } from "@/features/mobile/NewTaskButton";

const OPEN = "t.status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED')";
const TABS = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "overdue", label: "Overdue" },
  { key: "completed", label: "Completed" },
  { key: "assigned", label: "Assigned by me" },
] as const;
type Tab = (typeof TABS)[number]["key"];
const PRIORITY: Record<string, string | null> = { URGENT: "bg-[color:var(--m-red)] text-white", HIGH: "bg-warning-50 text-warning-600", NORMAL: null, LOW: null };
const STATUS: Record<string, string> = { OPEN: "Open", IN_PROGRESS: "In progress", BLOCKED: "Blocked", COMPLETED: "Completed", CANCELLED: "Cancelled" };

// v1.43.0 (owner's mobile brief §5): My Tasks on a phone: five tabs as
// cards, the floating + (the app's one Create task window). The same rows as
// the computer's My Tasks: assigned to me (or, on the last tab, given by me).
export async function MobileTasks({ userId, tab: asked }: { userId: number; tab?: string }) {
  const tab: Tab = TABS.some((item) => item.key === asked) ? (asked as Tab) : "today";
  const now = new Date();
  const today = indiaDayOf(now);
  const dayStart = new Date(`${today}T00:00:00+05:30`);
  const tomorrow = new Date(`${addDays(today, 1)}T00:00:00+05:30`);
  const mine = ["t.assignee_id = ?", "t.deleted_at IS NULL"];
  const where: Record<Tab, [string[], unknown[], string]> = {
    today: [[...mine, OPEN, "t.due_at >= ? AND t.due_at < ?"], [userId, dayStart, tomorrow], "t.due_at"],
    upcoming: [[...mine, OPEN, "(t.due_at IS NULL OR t.due_at >= ?)"], [userId, tomorrow], "t.due_at IS NULL, t.due_at, t.id DESC"],
    overdue: [[...mine, OPEN, "t.due_at < ?"], [userId, dayStart], "t.due_at"],
    completed: [[...mine, "t.status = 'COMPLETED'"], [userId], "t.completed_at DESC"],
    assigned: [["t.assigned_by = ?", "t.assignee_id <> ?", "t.deleted_at IS NULL", OPEN], [userId, userId], "t.due_at IS NULL, t.due_at"],
  };
  const [list, today_, overdue] = await Promise.all([
    listTaskItems(...where[tab], 100),
    countTaskItems(where.today[0], where.today[1]),
    countTaskItems(where.overdue[0], where.overdue[1]),
  ]);
  const counts: Partial<Record<Tab, number>> = { today: today_, overdue };

  return (
    <div className="space-y-4" data-testid="mobile-tasks">
      <h1 className="mob-screen-title">Tasks</h1>
      <nav aria-label="Task lists" className="mob-chips -mx-4 overflow-x-auto px-4">
        <ul className="flex gap-2">
          {TABS.map((item) => {
            const active = item.key === tab;
            const count = counts[item.key];
            return (
              <li key={item.key} className="shrink-0">
                <Link
                  href={`/users/work/my-tasks?tab=${item.key}`}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-[14px] font-semibold ${active ? "border-transparent bg-[color:var(--m-navy)] text-white" : "border-line bg-surface text-ink"}`}
                >
                  {item.label}
                  {count ? <span className={`rounded-full px-1.5 text-[12px] ${active ? "bg-white/20" : item.key === "overdue" ? "bg-danger-50 text-danger-600" : "bg-surface-muted"}`}>{count}</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {list.items.length === 0 ? (
        <EmptyState
          title={tab === "overdue" ? "Nothing overdue" : tab === "completed" ? "Nothing completed yet" : tab === "assigned" ? "No open tasks you gave" : "No tasks here"}
          body={tab === "assigned" ? "Tasks you give to others show here until they are done." : "Use + to add a task."}
          icon={<ListChecks className="h-6 w-6" />}
        />
      ) : (
        <ul className="space-y-3">
          {list.items.map((task) => (
            <li key={task.id}>
              <TaskCard task={task} now={now} showAssignee={tab === "assigned"} />
            </li>
          ))}
        </ul>
      )}
      {list.total > list.items.length && <p className="text-center text-[13px] text-ink-muted">Showing {list.items.length} of {list.total}. Use Search to find the rest.</p>}
      <TaskFab />
    </div>
  );
}

function TaskCard({ task, now, showAssignee }: { task: WorkTaskItem; now: Date; showAssignee: boolean }) {
  const open = task.status !== "COMPLETED" && task.status !== "CANCELLED";
  const due = dueLabel(task.dueAt, now, open);
  const priority = PRIORITY[task.priority];
  return (
    <Link href={`/users/tasks/${task.id}`} className={`mob-card block p-4 ${task.approval ? "border-l-4 border-l-[color:var(--m-navy)]" : ""}`} data-testid="m-task-card">
      <div className="flex items-center gap-2 text-[12px] font-semibold text-ink-muted">
        <span className="font-mono">{task.taskNo}</span>
        {task.approval && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-primary-700">
            <FileCheck2 aria-hidden="true" className="h-3.5 w-3.5" />
            {task.approval.requestNo}
          </span>
        )}
      </div>
      <p className={`mt-1 text-[16px] font-bold leading-snug ${open ? "" : "text-ink-muted line-through"}`}>
        <SafeText text={task.title} />
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
        {due && <span className={`font-semibold ${TONE_TEXT[due.tone]}`}>{due.text}</span>}
        <span className="text-ink-muted">{STATUS[task.status] ?? task.status}</span>
        {showAssignee && <span className="text-ink-muted">To {task.assigneeName}</span>}
        {task.projects[0] && <span className="truncate text-ink-muted">{task.projects[0].name}</span>}
        {priority && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${priority}`}>{task.priority === "URGENT" ? "Urgent" : "High"}</span>}
      </div>
    </Link>
  );
}
