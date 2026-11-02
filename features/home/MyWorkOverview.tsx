import { TaskPriorityPill } from "@/features/ui/ChoicePill";
import "server-only";
import { ApprovalBadge, approvalRowClass } from "@/features/work/ApprovalLink";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  Clock3,
  FolderKanban,
  Layers,
  ListChecks,
  MessageSquare,
  Minus,
  MoreHorizontal,
  Pencil,
  Search,
  Tag,
  UserPlus,
  Users,
} from "lucide-react";
import { paneLinks, paneTaskId, TaskPane, WithPane } from "@/features/work/TaskPane";
import { CreateTaskButton, ProjectDot, TaskCheck } from "@/features/work/client";
import { Badge, type Tone } from "@/features/ui/Display";
import { dueLabel, indiaDayOf, TONE_TEXT } from "@/features/work/format";
import { homeProjects, listTaskItems, recentStatusUpdates, type StatusUpdate, type WorkTaskItem } from "@/lib/db/repositories/work.repository";
import { STATUS_KIND_LABEL, STATUS_KIND_TONE } from "@/server/work/access";
import { weeklyWorkload, workActivity, workSummary, type WorkActivity } from "@/lib/db/repositories/overview.repository";
import { personProfile } from "@/lib/db/repositories/profile.repository";
import { indiaDateTimeText } from "@/server/modules/settings";
import { changePercent, parsePeriod, PREVIOUS_LABEL } from "@/server/work/period";
import type { WorkViewer } from "@/server/work/access";
import type { workPage } from "@/server/work/page-context";
import { PeriodPicker, QuietRefresh, WorkloadChart } from "@/features/home/HomeClient";

// D-265 (owner's My Work brief): Home → Task Management. Every figure is
// counted from the task records with the same rules as My Tasks (India days;
// overdue = due before today). Totals say what they cover: "open now" figures
// are not limited to the period; completed and assigned are.
const OPEN = "t.status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED')";
const IST_DAY = "DATE(DATE_ADD(t.due_at, INTERVAL 330 MINUTE))";
const PAGE = 6;
type Tab = "upcoming" | "overdue" | "completed" | "all";
const STATUS: Record<WorkTaskItem["status"], [string, Tone]> = {
  OPEN: ["Open", "info"],
  IN_PROGRESS: ["In progress", "primary"],
  BLOCKED: ["Blocked", "warning"],
  COMPLETED: ["Completed", "success"],
  CANCELLED: ["Cancelled", "neutral"],
};

export async function MyWorkOverview({
  user,
  viewer,
  query,
  switcher,
  others,
}: {
  user: Awaited<ReturnType<typeof workPage>>["user"];
  viewer: WorkViewer;
  query: Record<string, string | undefined>;
  switcher: React.ReactNode;
  others: React.ReactNode;
}) {
  const now = new Date();
  const today = indiaDayOf(now);
  const period = parsePeriod(query, today, "week");
  const tab: Tab = query.tab === "overdue" || query.tab === "completed" || query.tab === "all" ? query.tab : "upcoming";
  const page = Math.max(1, Math.min(50, Number(query.tp) || 1));
  const mineBase = ["t.assignee_id = ?", "t.deleted_at IS NULL"];
  const completedIn = "(t.status = 'COMPLETED' AND t.completed_at >= ? AND t.completed_at < ?)";
  const tabWhere = (which: Tab): [string[], unknown[], string] =>
    which === "overdue"
      ? [[...mineBase, OPEN, "t.due_at IS NOT NULL", `${IST_DAY} < ?`], [user.id, today], "t.due_at"]
      : which === "completed"
        ? [[...mineBase, completedIn], [user.id, period.from, period.to], "t.completed_at DESC"]
        : which === "all"
          ? [[...mineBase, `(${OPEN} OR ${completedIn})`], [user.id, period.from, period.to], "t.status = 'COMPLETED', t.due_at IS NULL, t.due_at, t.id DESC"]
          : [[...mineBase, OPEN, "t.due_at IS NOT NULL", `${IST_DAY} >= ?`], [user.id, today], "t.due_at, t.id DESC"];
  const limit = query.activity === "more" ? 20 : 6;
  const [summary, list, projects, taskEvents, statusPosts, workload, profile] = await Promise.all([
    workSummary(user.id, today, period),
    listTaskItems(...tabWhere(tab), PAGE, (page - 1) * PAGE),
    homeProjects(viewer, 4),
    workActivity(user.id, limit),
    recentStatusUpdates(viewer, limit),
    weeklyWorkload(user.id, period),
    personProfile(user.id).catch(() => null),
  ]);
  // The timeline: task events and project status posts, newest first.
  const activity: ({ kind: "task"; event: WorkActivity } | { kind: "status"; update: StatusUpdate })[] = [
    ...taskEvents.map((event) => ({ kind: "task" as const, event })),
    ...statusPosts.map((update) => ({ kind: "status" as const, update })),
  ]
    .sort((a, b) => (b.kind === "task" ? b.event.createdAt : b.update.createdAt).getTime() - (a.kind === "task" ? a.event.createdAt : a.update.createdAt).getTime())
    .slice(0, limit);
  const total = summary.open + summary.completed;
  const counts: Record<Tab, number> = { upcoming: summary.upcoming, overdue: summary.overdue, completed: summary.completed, all: total };
  const keep: Record<string, string> = { home: "tasks", ...(period.key !== "week" ? { period: period.key } : {}), ...(period.key === "custom" ? { from: period.fromDay, to: period.toDay } : {}) };
  const href = (extra: Record<string, string>) => `/users?${new URLSearchParams({ ...keep, tab, ...extra })}`;
  const links = paneLinks("/users", { ...keep, tab, ...(page > 1 ? { tp: String(page) } : {}) });
  const paneId = paneTaskId(query.task);
  const pane = paneId ? <TaskPane taskId={paneId} user={user} closeHref={links.close} /> : null;
  const pages = Math.max(1, Math.ceil(list.total / PAGE));
  const role = [profile?.designationName, profile?.departmentName].filter(Boolean).join(" · ");

  const cards = [
    {
      key: "total",
      label: "Total tasks",
      note: `open now + done ${period.label.toLowerCase()}`,
      value: total,
      icon: ListChecks,
      tone: "bg-primary-50 text-primary-700",
      href: "/users/work/my-tasks",
      change: null as number | null,
    },
    {
      key: "upcoming",
      label: "Upcoming",
      note: "open, due today or later",
      value: summary.upcoming,
      icon: Clock3,
      tone: "bg-[color:var(--violet-bg)] text-[color:var(--violet-fg)]",
      href: `/users/work/search?assignee=me&due_from=${today}`,
      change: null,
    },
    {
      key: "overdue",
      label: "Overdue",
      note: "open, past their due date",
      value: summary.overdue,
      icon: AlertTriangle,
      tone: "bg-warning-50 text-warning-600",
      href: "/users/work/search?assignee=me&overdue=1",
      change: null,
      bad: true,
    },
    {
      key: "completed",
      label: "Completed",
      note: period.label,
      value: summary.completed,
      icon: CheckCircle2,
      tone: "bg-success-50 text-success-600",
      href: "/users/work/search?assignee=me&status=completed",
      change: changePercent(summary.completed, summary.completedBefore),
    },
  ];

  return (
    <div data-testid="my-work-overview">
      <QuietRefresh />
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="page-icon grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-700" aria-hidden="true">
            <Layers className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h1 className="text-title font-semibold tracking-tight">My Work – Overview</h1>
            <p className="text-label text-ink-muted">
              Welcome back, <span className="font-medium text-ink">{user.name}</span>
              {role && <span> · {role}</span>}
            </p>
            <p className="text-label text-ink-muted">Your tasks, projects and recent updates in one place.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {switcher}
          <PeriodPicker value={period.key} from={period.fromDay} to={period.toDay} base={{ home: "tasks", tab }} />
        </div>
      </header>

      <nav aria-label="Quick actions" className="mb-5 flex flex-wrap gap-2" data-testid="work-quick-actions">
        <CreateTaskButton />
        <QuickLink href="/users/work/my-tasks" icon={<ListChecks className="h-4 w-4" />} label="View all tasks" />
        <QuickLink href="/users/work/projects" icon={<FolderKanban className="h-4 w-4" />} label="Projects" />
        <QuickLink href="/users/work/search" icon={<Search className="h-4 w-4" />} label="Search tasks" />
        <QuickLink href="/users/calendar" icon={<CalendarDays className="h-4 w-4" />} label="Calendar" />
      </nav>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" data-testid="work-kpis">
        {cards.map((card) => (
          <Link key={card.key} href={card.href} className="card-link status-card flex items-center gap-3 px-4 py-3" data-testid={`work-kpi-${card.key}`}>
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${card.tone}`} aria-hidden="true">
              <card.icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-2xl font-bold tabular-nums leading-tight">{card.value}</span>
              <span className="block text-label font-medium">{card.label}</span>
              <span className="block truncate text-caption text-ink-muted">{card.note}</span>
            </span>
            {card.key === "completed" && <Change value={card.change} label={PREVIOUS_LABEL[period.key]} />}
          </Link>
        ))}
      </div>

      <WithPane pane={pane}>
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <section className="card min-w-0 px-4 py-4 sm:px-5" aria-labelledby="mw-tasks">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 id="mw-tasks" className="text-[calc(17px*var(--text-scale,1))] font-semibold">
                My Tasks
              </h2>
              <span className="flex items-center gap-3">
                <CreateTaskButton />
                <Link href="/users/work/my-tasks" className="link inline-flex items-center gap-1 text-label">
                  View all <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              </span>
            </div>
            <nav aria-label="My tasks" className="mb-2 flex gap-1 overflow-x-auto border-b border-line">
              {(
                [
                  ["upcoming", "Upcoming"],
                  ["overdue", "Overdue"],
                  ["completed", "Completed"],
                  ["all", "All"],
                ] as [Tab, string][]
              ).map(([key, label]) => (
                <Link
                  key={key}
                  href={`/users?${new URLSearchParams({ ...keep, tab: key })}`}
                  scroll={false}
                  aria-current={tab === key ? "page" : undefined}
                  className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-label ${tab === key ? "border-primary-600 font-semibold text-primary-700" : "border-transparent text-ink-muted hover:text-ink"}`}
                >
                  {label} ({counts[key]})
                </Link>
              ))}
            </nav>
            {list.items.length === 0 ? (
              <p className="py-8 text-center text-label text-ink-muted" data-testid="mw-empty">
                {tab === "overdue"
                  ? "Nothing overdue. Well done."
                  : tab === "completed"
                    ? `Nothing completed ${period.label.toLowerCase()}.`
                    : tab === "upcoming"
                      ? "Nothing upcoming with a due date."
                      : "No tasks given to you."}
              </p>
            ) : (
              <>
                <table className="hidden w-full text-label md:table" data-testid="mw-table">
                  <caption className="sr-only">My tasks: {tab}</caption>
                  <thead className="text-left text-caption text-ink-muted">
                    <tr className="border-b border-line">
                      <th scope="col" className="w-8 py-2" />
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Task
                      </th>
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Project
                      </th>
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Due date
                      </th>
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Priority
                      </th>
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Status
                      </th>
                      <th scope="col" className="py-2">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {list.items.map((task) => (
                      <tr key={task.id} className={approvalRowClass(task.approval)}>
                        <td className="py-2.5">
                          <TaskCheck taskId={task.id} done={task.status === "COMPLETED"} disabled={task.assigneeId !== user.id || task.status === "CANCELLED"} label={task.title} />
                        </td>
                        <td className="min-w-0 py-2.5 pr-3">
                          <Link href={links.open(task.id)} scroll={false} className="block font-semibold hover:underline">
                            {task.title}
                          </Link>
                          {task.approval && (
                            <span className="mt-0.5 block">
                              <ApprovalBadge approval={task.approval} size="sm" />
                            </span>
                          )}
                          {task.summary && <span className="line-clamp-1 text-caption text-ink-muted">{task.summary}</span>}
                        </td>
                        <td className="py-2.5 pr-3">
                          <ProjectChip task={task} />
                        </td>
                        <td className="whitespace-nowrap py-2.5 pr-3">
                          <Due task={task} now={now} />
                        </td>
                        <td className="py-2.5 pr-3">
                          <TaskPriorityPill priority={task.priority} showNormal />
                        </td>
                        <td className="py-2.5 pr-3">
                          <StatusBadge task={task} today={today} />
                        </td>
                        <td className="py-2.5 text-right">
                          <RowMenu task={task} openHref={links.open(task.id)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Phones: cards instead of a squeezed table. */}
                <ul className="divide-y divide-line md:hidden" data-testid="mw-cards">
                  {list.items.map((task) => (
                    <li key={task.id} className={`flex gap-3 py-3 ${approvalRowClass(task.approval)}`}>
                      <TaskCheck taskId={task.id} done={task.status === "COMPLETED"} disabled={task.assigneeId !== user.id || task.status === "CANCELLED"} label={task.title} />
                      <div className="min-w-0 flex-1">
                        <Link href={links.open(task.id)} scroll={false} className="block font-semibold [overflow-wrap:anywhere] hover:underline">
                          {task.title}
                        </Link>
                        {task.summary && <p className="line-clamp-2 text-caption text-ink-muted">{task.summary}</p>}
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <ApprovalBadge approval={task.approval} size="sm" />
                          <ProjectChip task={task} />
                          <Due task={task} now={now} />
                          <TaskPriorityPill priority={task.priority} showNormal />
                          <StatusBadge task={task} today={today} />
                        </div>
                      </div>
                      <RowMenu task={task} openHref={links.open(task.id)} />
                    </li>
                  ))}
                </ul>
                {pages > 1 && (
                  <nav aria-label="My tasks pages" className="mt-3 flex items-center justify-between text-label">
                    <span className="text-ink-muted">
                      Page {page} of {pages} · {list.total} tasks
                    </span>
                    <span className="flex gap-2">
                      {page > 1 && (
                        <Link href={href({ tp: String(page - 1) })} scroll={false} className="btn-secondary btn-compact">
                          Previous
                        </Link>
                      )}
                      {page < pages && (
                        <Link href={href({ tp: String(page + 1) })} scroll={false} className="btn-secondary btn-compact">
                          Next
                        </Link>
                      )}
                    </span>
                  </nav>
                )}
              </>
            )}
          </section>

          <section className="card min-w-0 px-4 py-4 sm:px-5" aria-labelledby="mw-projects">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="mw-projects" className="text-[calc(17px*var(--text-scale,1))] font-semibold">
                Projects
              </h2>
              <Link href="/users/work/projects" className="link inline-flex items-center gap-1 text-label">
                All projects <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
            {projects.length === 0 ? (
              <div className="py-6 text-center text-label text-ink-muted">
                <p>No projects yet.</p>
                <Link href="/users/work/projects/new" className="link">
                  Create a project
                </Link>
              </div>
            ) : (
              <ul className="space-y-3" data-testid="mw-project-list">
                {projects.map((project) => {
                  const all = project.openTasks + project.doneTasks;
                  const percent = all ? Math.round((project.doneTasks / all) * 100) : 0;
                  return (
                    <li key={project.id}>
                      <Link href={`/users/work/projects/${project.id}`} className="block rounded-lg border border-line px-3 py-3 hover:bg-surface-muted">
                        <span className="flex items-center gap-3">
                          <ProjectDot color={project.color} className="h-3 w-3" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold">{project.name}</span>
                            <span className="block text-caption text-ink-muted">
                              {all} tasks · {project.doneTasks} completed · {project.openTasks} pending
                            </span>
                          </span>
                          <Ring percent={percent} />
                        </span>
                        <span
                          className="mt-2 block h-1.5 overflow-hidden rounded-full bg-line"
                          role="progressbar"
                          aria-label={`${project.name} progress`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={percent}
                        >
                          <span className="block h-full rounded-full bg-success-solid" style={{ width: `${percent}%` }} />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="card min-w-0 px-4 py-4 sm:px-5" aria-labelledby="mw-activity">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="mw-activity" className="text-[calc(17px*var(--text-scale,1))] font-semibold">
                Latest status updates
              </h2>
              {query.activity !== "more" && activity.length >= 6 && (
                <Link href={href({ activity: "more" })} scroll={false} className="link inline-flex items-center gap-1 text-label">
                  View all <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              )}
            </div>
            {activity.length === 0 ? (
              <p className="py-6 text-center text-label text-ink-muted">No activity on your tasks yet.</p>
            ) : (
              <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[17px] before:top-2 before:w-px before:bg-line" data-testid="mw-activity-list">
                {activity.map((item) => {
                  if (item.kind === "status")
                    return (
                      <li key={`s${item.update.id}`} className="relative flex gap-3">
                        <span
                          className="relative z-[1] grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-50 text-primary-700 ring-4 ring-[color:var(--color-surface)]"
                          aria-hidden="true"
                        >
                          <FolderKanban className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                            <span className="font-semibold">
                              Project status <Badge tone={STATUS_KIND_TONE[item.update.status]}>{STATUS_KIND_LABEL[item.update.status]}</Badge>
                            </span>
                            <span className="text-caption text-ink-muted">{indiaDateTimeText(item.update.createdAt)}</span>
                          </p>
                          <p className="text-label text-ink-muted [overflow-wrap:anywhere]">
                            <Link href={`/users/work/projects/${item.update.projectId}?view=overview`} className="link">
                              {item.update.projectName}
                            </Link>
                            : {item.update.title} · by {item.update.authorId === user.id ? "you" : item.update.authorName}
                          </p>
                        </div>
                      </li>
                    );
                  const event = item.event;
                  const shown = describe(event, user.id);
                  return (
                    <li key={`t${event.id}`} className="relative flex gap-3">
                      <span className={`relative z-[1] grid h-9 w-9 shrink-0 place-items-center rounded-full ring-4 ring-[color:var(--color-surface)] ${shown.tone}`} aria-hidden="true">
                        <shown.icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span className="font-semibold">{shown.title}</span>
                          <span className="text-caption text-ink-muted">{indiaDateTimeText(event.createdAt)}</span>
                        </p>
                        <p className="text-label text-ink-muted [overflow-wrap:anywhere]">
                          <Link href={links.open(event.taskId)} scroll={false} className="link">
                            “{event.taskTitle}”
                          </Link>{" "}
                          {shown.text}
                          {event.actorName && event.actorId !== user.id ? ` · by ${event.actorName}` : event.actorId === user.id ? " · by you" : ""}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section className="card min-w-0 px-4 py-4 sm:px-5" aria-labelledby="mw-workload">
            <h2 id="mw-workload" className="mb-1 text-[calc(17px*var(--text-scale,1))] font-semibold">
              My weekly workload
            </h2>
            <p className="mb-2 text-caption text-ink-muted">
              {period.key === "week" ? "This week, day by day" : `${period.label}, by day of the week`}: tasks given to you and tasks you completed (by when they were done).
            </p>
            <WorkloadChart assigned={workload.assigned} completed={workload.completed} caption={`Tasks assigned and completed by day, ${period.label.toLowerCase()}`} />
          </section>
        </div>
        {others}
      </WithPane>
    </div>
  );
}

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="btn-secondary btn-compact inline-flex items-center gap-1.5">
      <span aria-hidden="true">{icon}</span>
      {label}
    </Link>
  );
}

function Change({ value, label }: { value: number | null; label: string }) {
  if (value === null)
    return (
      <span className="hidden shrink-0 text-right text-caption text-ink-faint sm:block">
        <Minus aria-hidden="true" className="ml-auto h-3.5 w-3.5" />
        {label}
      </span>
    );
  const up = value >= 0;
  return (
    <span className="hidden shrink-0 text-right sm:block">
      <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-caption font-semibold ${up ? "bg-success-50 text-success-600" : "bg-danger-50 text-danger-600"}`}>
        {up ? <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" /> : <ArrowDownRight aria-hidden="true" className="h-3.5 w-3.5" />}
        {up ? "+" : ""}
        {value}%
      </span>
      <span className="block text-caption text-ink-muted">{label}</span>
    </span>
  );
}

function ProjectChip({ task }: { task: WorkTaskItem }) {
  const project = task.projects[0];
  if (!project) return <span className="text-caption text-ink-faint">—</span>;
  return (
    <Link href={`/users/work/projects/${project.id}`} className="inline-flex max-w-[12rem] items-center gap-1.5 rounded-md border border-line px-2 py-0.5 text-caption hover:bg-surface-muted">
      <ProjectDot color={project.color} />
      <span className="truncate">{project.name}</span>
    </Link>
  );
}

function Due({ task, now }: { task: WorkTaskItem; now: Date }) {
  const open = ["OPEN", "IN_PROGRESS", "BLOCKED"].includes(task.status);
  const due = dueLabel(task.dueAt, now, open);
  if (!due) return <span className="text-caption text-ink-faint">No due date</span>;
  return (
    <span className={`inline-flex items-center gap-1 text-caption ${TONE_TEXT[due.tone]}`}>
      <CalendarClock aria-hidden="true" className="h-3.5 w-3.5" />
      {due.text}
    </span>
  );
}

// Open tasks read as Upcoming / Overdue (the same days as the cards); the rest keep their status.
function StatusBadge({ task, today }: { task: WorkTaskItem; today: string }) {
  const open = ["OPEN", "IN_PROGRESS", "BLOCKED"].includes(task.status);
  if (open && task.status !== "BLOCKED" && task.dueAt) {
    const late = indiaDayOf(task.dueAt) < today;
    return <Badge tone={late ? "danger" : "info"}>{late ? "Overdue" : task.status === "IN_PROGRESS" ? "In progress" : "Upcoming"}</Badge>;
  }
  return <Badge tone={STATUS[task.status][1]}>{STATUS[task.status][0]}</Badge>;
}

function RowMenu({ task, openHref }: { task: WorkTaskItem; openHref: string }) {
  return (
    <details className="relative inline-block text-left">
      <summary
        className="grid h-8 w-8 cursor-pointer list-none place-items-center rounded-md text-ink-muted hover:bg-surface-muted [&::-webkit-details-marker]:hidden"
        aria-label={`Actions for ${task.title}`}
      >
        <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
      </summary>
      <div className="absolute right-0 z-[var(--z-drawer)] mt-1 w-52 rounded-lg border border-line bg-raised p-1 text-label shadow-overlay">
        <Link href={openHref} scroll={false} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-surface-muted">
          <CircleDot aria-hidden="true" className="h-4 w-4" /> Open task
        </Link>
        <Link href={openHref} scroll={false} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-surface-muted">
          <Pencil aria-hidden="true" className="h-4 w-4" /> Edit, reassign or change due date
        </Link>
        {task.projects[0] && (
          <Link href={`/users/work/projects/${task.projects[0].id}`} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-surface-muted">
            <FolderKanban aria-hidden="true" className="h-4 w-4" /> Go to {task.projects[0].name}
          </Link>
        )}
      </div>
    </details>
  );
}

function Ring({ percent }: { percent: number }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative grid h-11 w-11 shrink-0 place-items-center" aria-hidden="true">
      <svg viewBox="0 0 40 40" className="absolute inset-0 h-full w-full -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" stroke="var(--color-border)" strokeWidth="4" />
        <circle cx="20" cy="20" r={r} fill="none" stroke="var(--road-done)" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(percent / 100) * c} ${c}`} />
      </svg>
      <span className="text-[11px] font-semibold tabular-nums">{percent}%</span>
    </span>
  );
}

// What an event says on the timeline (task_events types, D-150 / D-215).
function describe(event: WorkActivity, meId: number): { title: string; text: string; icon: typeof CheckCircle2; tone: string } {
  const p = event.payload ?? {};
  const blue = "bg-primary-50 text-primary-700";
  const green = "bg-success-50 text-success-600";
  const amber = "bg-warning-50 text-warning-600";
  const violet = "bg-[color:var(--violet-bg)] text-[color:var(--violet-fg)]";
  switch (event.type) {
    case "CREATED":
      return Number(p.assigneeId) === meId && event.actorId !== meId
        ? { title: "New task assigned", text: "was assigned to you.", icon: UserPlus, tone: blue }
        : { title: "Task created", text: "was created.", icon: ListChecks, tone: blue };
    case "REASSIGN":
      return Number(p.to) === meId
        ? { title: "Task assigned to you", text: "was reassigned to you.", icon: UserPlus, tone: blue }
        : { title: "Task reassigned", text: "was given to someone else.", icon: Users, tone: violet };
    case "COMPLETE":
      return { title: "Task completed", text: "was marked as completed.", icon: CheckCircle2, tone: green };
    case "REOPEN":
      return { title: "Task reopened", text: "was reopened.", icon: CircleDot, tone: amber };
    case "START":
      return { title: "Task started", text: "is in progress.", icon: CircleDot, tone: blue };
    case "BLOCK":
      return { title: "Task blocked", text: event.body ? `is blocked: ${event.body}` : "is blocked.", icon: AlertTriangle, tone: amber };
    case "UNBLOCK":
      return { title: "Task unblocked", text: "can go ahead again.", icon: CircleDot, tone: green };
    case "CANCEL":
    case "DELETED":
      return { title: "Task cancelled", text: "was cancelled.", icon: Minus, tone: amber };
    case "EDIT":
      return p.dueChanged
        ? { title: "Due date changed", text: event.body ? `· ${event.body}` : "has a new due date.", icon: CalendarClock, tone: amber }
        : { title: "Task updated", text: event.body ? `· ${event.body}` : "was changed.", icon: Pencil, tone: blue };
    case "COMMENT":
    case "COMMENTED":
      return { title: "New comment", text: event.body ? `· “${event.body.slice(0, 120)}”` : "has a new comment.", icon: MessageSquare, tone: violet };
    case "ADDED_TO_PROJECT":
      return { title: "Added to project", text: event.body ? `was added to ${event.body}.` : "was added to a project.", icon: FolderKanban, tone: violet };
    case "REMOVED_FROM_PROJECT":
      return { title: "Removed from project", text: event.body ? `was taken out of ${event.body}.` : "was taken out of a project.", icon: FolderKanban, tone: amber };
    case "FOLLOWER_ADDED":
      return { title: "Collaborator added", text: Number(p.userId) === meId ? "· you now follow it." : "has a new collaborator.", icon: Users, tone: violet };
    case "FOLLOWER_REMOVED":
      return { title: "Collaborator removed", text: "lost a collaborator.", icon: Users, tone: amber };
    case "TAG_ADDED":
    case "TAG_REMOVED":
      return { title: event.type === "TAG_ADDED" ? "Tag added" : "Tag removed", text: event.body ? `#${event.body}` : "", icon: Tag, tone: blue };
    case "DEPENDENCY_ADDED":
    case "DEPENDENCY_REMOVED":
      return { title: event.type === "DEPENDENCY_ADDED" ? "Now waiting on another task" : "No longer waiting", text: event.body ?? "", icon: Clock3, tone: amber };
    default:
      return { title: "Task updated", text: event.body ?? "", icon: Pencil, tone: blue };
  }
}
