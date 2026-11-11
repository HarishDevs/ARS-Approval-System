import Link from "next/link";
import { cookies } from "next/headers";
import { COMPACT_COOKIE } from "@/lib/ui/layout";
import { ArrowDownUp, CalendarDays, FileCheck2, FolderKanban, LayoutList, ListChecks, RefreshCw, Search, Trash2 } from "lucide-react";
import { countTaskItems, listTaskItems, type WorkTaskItem } from "@/lib/db/repositories/work.repository";
import { dueLabel, indiaDayOf } from "@/features/work/format";
import { addDays } from "@/server/work/rules";
import { EmptyState } from "@/features/ui/Display";
import { SafeText } from "@/features/ui/SafeText";
import { TaskCheck } from "@/features/work/client";
import { CompactToggle, ScreenTitle, SheetChoices, SheetLink, ViewDock } from "@/features/mobile/BottomSheet";
import { TaskDockAdd } from "@/features/mobile/NewTaskButton";
import { TaskPriorityPill } from "@/features/ui/ChoicePill";

const OPEN = "t.status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED')";
const TABS = [
  { key: "today", label: "Due today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "overdue", label: "Overdue" },
  { key: "completed", label: "Completed" },
  { key: "assigned", label: "Assigned by me" },
] as const;
type Tab = (typeof TABS)[number]["key"];
// Manage view → Sort and Group by (fixed SQL per choice, never from the address).
const SORTS = {
  due: { label: "Due date", sql: "t.due_at IS NULL, t.due_at, t.id DESC" },
  priority: { label: "Priority", sql: "FIELD(t.priority, 'URGENT', 'HIGH', 'IMPORTANT', 'NORMAL', 'LOW'), t.due_at IS NULL, t.due_at" },
  title: { label: "Title", sql: "t.title, t.id" },
  newest: { label: "Newest first", sql: "t.created_at DESC, t.id DESC" },
} as const;
type Sort = keyof typeof SORTS;
const GROUPS = { none: "None", due: "Due date", project: "Project" } as const;
type Group = keyof typeof GROUPS;
const PRIORITY: Record<string, { label: string; dot: string } | null> = {
  URGENT: { label: "Critical", dot: "bg-[color:var(--m-red)]" },
  HIGH: { label: "Most Important", dot: "bg-warning-solid" },
  IMPORTANT: { label: "Important", dot: "bg-warning-solid" },
  NORMAL: null,
  LOW: null,
};

// v1.43.0 (owner's mobile brief §5) and v1.45.0 (owner's Asana screens): My
// tasks on a phone: flat rows with the tick circle, the projects, the
// priority dot and the due date; Choose view (the five lists), Manage view
// (compact, sort, group) and + float above the tab bar. Same rows as the
// computer's My Tasks: assigned to me (or, on the last view, given by me).
export async function MobileTasks({ userId, tab: asked, sort: askedSort, group: askedGroup, projectsOn = true }: { userId: number; tab?: string; sort?: string; group?: string; projectsOn?: boolean }) {
  const tab: Tab = TABS.some((item) => item.key === asked) ? (asked as Tab) : "today";
  const sort: Sort = askedSort && askedSort in SORTS ? (askedSort as Sort) : tab === "completed" ? "newest" : "due";
  const group: Group = askedGroup && askedGroup in GROUPS ? (askedGroup as Group) : tab === "upcoming" ? "due" : "none";
  const compact = (await cookies()).get(COMPACT_COOKIE)?.value === "1";
  const now = new Date();
  const today = indiaDayOf(now);
  const dayStart = new Date(`${today}T00:00:00+05:30`);
  const tomorrow = new Date(`${addDays(today, 1)}T00:00:00+05:30`);
  const mine = ["t.assignee_id = ?", "t.deleted_at IS NULL"];
  const where: Record<Tab, [string[], unknown[]]> = {
    today: [[...mine, OPEN, "t.due_at >= ? AND t.due_at < ?"], [userId, dayStart, tomorrow]],
    upcoming: [[...mine, OPEN, "(t.due_at IS NULL OR t.due_at >= ?)"], [userId, tomorrow]],
    overdue: [[...mine, OPEN, "t.due_at < ?"], [userId, dayStart]],
    completed: [[...mine, "t.status = 'COMPLETED'"], [userId]],
    assigned: [["t.assigned_by = ?", "t.assignee_id <> ?", "t.deleted_at IS NULL", OPEN], [userId, userId]],
  };
  const order = tab === "completed" && sort === "newest" ? "t.completed_at DESC, t.id DESC" : SORTS[sort].sql;
  const [list, todayCount, overdueCount] = await Promise.all([
    listTaskItems(where[tab][0], where[tab][1], order, 100),
    countTaskItems(where.today[0], where.today[1]),
    countTaskItems(where.overdue[0], where.overdue[1]),
  ]);
  const counts: Partial<Record<Tab, number>> = { today: todayCount, overdue: overdueCount };
  const href = (next: { tab?: Tab; sort?: Sort; group?: Group }) => {
    const params = new URLSearchParams({ tab: next.tab ?? tab });
    const s = next.sort ?? (next.tab ? undefined : askedSort);
    const g = next.group ?? (next.tab ? undefined : askedGroup);
    if (s && s in SORTS) params.set("sort", s);
    if (g && g in GROUPS) params.set("group", g);
    return `/users/work/my-tasks?${params}`;
  };
  const sections = groupTasks(list.items, group, now, today);
  const currentLabel = TABS.find((item) => item.key === tab)!.label;

  const manage = (
    <div>
      <CompactToggle on={compact} />
      <p className="flex items-center gap-2 pt-4 text-[13px] font-semibold uppercase tracking-wide text-ink-muted">
        <ArrowDownUp aria-hidden="true" className="h-4 w-4" /> Sort
      </p>
      <SheetChoices label="Sort" items={(Object.keys(SORTS) as Sort[]).map((key) => ({ href: href({ sort: key }), label: SORTS[key].label, current: key === sort }))} />
      <p className="flex items-center gap-2 pt-4 text-[13px] font-semibold uppercase tracking-wide text-ink-muted">
        <LayoutList aria-hidden="true" className="h-4 w-4" /> Group by
      </p>
      <SheetChoices label="Group by" items={(Object.keys(GROUPS) as Group[]).map((key) => ({ href: href({ group: key }), label: GROUPS[key], current: key === group }))} />
    </div>
  );
  const menu = (
    <nav aria-label="More task pages">
      {projectsOn && <SheetLink href="/users/work/projects" icon={<FolderKanban className="h-5 w-5" />} label="Projects" />}
      <SheetLink href="/users/work/periodic" icon={<RefreshCw className="h-5 w-5" />} label="Periodic tasks" />
      <SheetLink href="/users/calendar" icon={<CalendarDays className="h-5 w-5" />} label="Calendar" />
      <SheetLink href="/users/work/search" icon={<Search className="h-5 w-5" />} label="Search tasks" />
      <SheetLink href="/users/work/deleted" icon={<Trash2 className="h-5 w-5" />} label="Deleted tasks" />
    </nav>
  );

  return (
    <div className="space-y-1 pb-20" data-testid="mobile-tasks">
      <ScreenTitle title="My tasks" menu={menu} menuLabel="More task pages" />
      {list.items.length === 0 ? (
        <div className="pt-4">
          <EmptyState
            title={tab === "overdue" ? "Nothing overdue" : tab === "completed" ? "Nothing completed yet" : tab === "assigned" ? "No open tasks you gave" : "No tasks here"}
            body={tab === "assigned" ? "Tasks you give to others show here until they are done." : "Use + to add a task."}
            icon={<ListChecks className="h-6 w-6" />}
          />
        </div>
      ) : (
        sections.map((section) => (
          <details key={section.key} open className="mob-section -mx-4" data-testid="m-task-section">
            <summary className="flex min-h-[52px] cursor-pointer list-none items-center gap-3 px-4 text-[17px] font-semibold">
              <span aria-hidden="true" className="mob-caret text-ink-muted">
                ▾
              </span>
              <span className="min-w-0 flex-1 truncate">{section.label}</span>
              <span className="text-[14px] font-normal tabular-nums text-ink-muted">{section.items.length}</span>
            </summary>
            <ul>
              {section.items.map((task) => (
                <li key={task.id}>
                  <TaskRow task={task} now={now} compact={compact} showAssignee={tab === "assigned"} />
                </li>
              ))}
            </ul>
          </details>
        ))
      )}
      {list.total > list.items.length && <p className="pt-3 text-center text-[13px] text-ink-muted">Showing {list.items.length} of {list.total}. Use Search tasks to find the rest.</p>}
      <ViewDock
        label="Task views"
        manage={manage}
        add={<TaskDockAdd />}
        views={TABS.map((item) => ({ href: href({ tab: item.key }), label: item.label, current: item.key === tab, count: counts[item.key] }))}
      />
      <span className="sr-only" aria-live="polite">
        {currentLabel}
      </span>
    </div>
  );
}

type Section = { key: string; label: string; items: WorkTaskItem[] };
function groupTasks(items: WorkTaskItem[], group: Group, now: Date, today: string): Section[] {
  if (group === "none") return [{ key: "all", label: "Tasks", items }];
  const order: string[] = [];
  const map = new Map<string, Section>();
  const put = (key: string, label: string, task: WorkTaskItem) => {
    if (!map.has(key)) {
      map.set(key, { key, label, items: [] });
      order.push(key);
    }
    map.get(key)!.items.push(task);
  };
  for (const task of items) {
    if (group === "project") {
      const project = task.projects[0];
      put(project ? `p${project.id}` : "none", project ? project.name : "No project", task);
    } else {
      const day = task.dueAt ? indiaDayOf(new Date(task.dueAt)) : null;
      const open = task.status !== "COMPLETED" && task.status !== "CANCELLED";
      if (!day) put("z", "No due date", task);
      else if (day < today && open) put("a", "Overdue", task);
      else if (day === today) put("b", "Today", task);
      else if (day <= addDays(today, 7)) put("c", "Next 7 days", task);
      else put("d", "Later", task);
    }
  }
  void now;
  const sections = order.map((key) => map.get(key)!);
  return group === "due" ? sections.sort((a, b) => a.key.localeCompare(b.key)) : sections;
}

const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const CHIP: Record<string, string> = {
  danger: "bg-danger-50 text-danger-600",
  warning: "bg-warning-50 text-warning-600",
  success: "bg-success-50 text-success-600",
  neutral: "bg-surface-muted text-ink-muted",
};

function TaskRow({ task, now, compact, showAssignee }: { task: WorkTaskItem; now: Date; compact: boolean; showAssignee: boolean }) {
  const open = task.status !== "COMPLETED" && task.status !== "CANCELLED";
  const due = dueLabel(task.dueAt, now, open);
  const priority = PRIORITY[task.priority];
  const detail = [showAssignee ? `To ${task.assigneeName}` : null, task.projects.map((project) => project.name).join(", ") || null].filter(Boolean).join(" · ");
  return (
    <div className={`flex items-center gap-3 pl-4 ${task.approval ? "border-l-4 border-l-[color:var(--m-navy)] pl-3" : ""}`} data-testid="m-task-card">
      <TaskCheck taskId={task.id} done={!open} disabled={task.status === "CANCELLED"} label={task.title} />
      <Link href={`/users/tasks/${task.id}`} className={`flex min-w-0 flex-1 items-center gap-3 border-b border-line pr-4 ${compact ? "min-h-[52px] py-2" : "min-h-[72px] py-3"}`}>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[16px] ${open ? "" : "text-ink-muted line-through"}`}>
            <SafeText text={task.title} />
          </span>
          {!compact && (
            <>
              {(detail || task.approval) && (
                <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-ink-muted">
                  {task.approval && (
                    <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-primary-700">
                      <FileCheck2 aria-hidden="true" className="h-3.5 w-3.5" />
                      {task.approval.requestNo}
                    </span>
                  )}
                  {detail && <span className="truncate">{detail}</span>}
                </span>
              )}
              {priority && (
                <span className="mt-0.5 block">
                  <TaskPriorityPill priority={task.priority} />
                </span>
              )}
            </>
          )}
        </span>
        {task.dueAt && (
          <span className={`shrink-0 rounded-md px-2.5 py-1 text-[13px] font-medium ${CHIP[due?.tone ?? "neutral"] ?? CHIP.neutral}`} title={due?.text}>
            {DAY.format(new Date(task.dueAt))}
            {due && <span className="sr-only">, {due.text}</span>}
          </span>
        )}
      </Link>
    </div>
  );
}
