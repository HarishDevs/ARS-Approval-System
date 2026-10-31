import type { Metadata } from "next";
import { paneLinks, paneTaskId, TaskPane, WithPane } from "@/features/work/TaskPane";
import Link from "next/link";
import { MyTasks, MyTasksGrid } from "@/features/work/MyTasks";
import { toGridTask } from "@/server/work/grid-rows";
import { DEFAULT_GRID, parseGridConfig } from "@/server/work/grid";
import { peopleOptions } from "@/server/work/page-context";
import { Avatar } from "@/features/ui/Display";
import { CreateTaskButton } from "@/features/work/client";
import { DigestToggle } from "@/features/work/MoreParts";
import { getDbPool } from "@/lib/db/client";
import type { RowDataPacket } from "mysql2/promise";
import { TaskCalendar } from "@/features/work/TaskCalendar";
import { indiaDayOf } from "@/features/work/format";
import { ensureMySections, listTaskItems, listVisibleProjects, listWorkViews, myPlacements } from "@/lib/db/repositories/work.repository";
import { myTaskBucket, type MySystemSection } from "@/server/work/rules";
import { workPage } from "@/server/work/page-context";
import { calendarHolidays } from "@/server/work/holiday-store";

export const metadata: Metadata = { title: "My Tasks" };
export const dynamic = "force-dynamic";

const VIEWS = [
  { key: "list", label: "List" },
  { key: "board", label: "Board" },
  { key: "calendar", label: "Calendar" },
] as const;

// D-215: everything assigned to me, from every project and none, in my own
// sections. Completed tasks of the last 7 days show when asked.
export default async function MyTasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    done?: string;
    month?: string;
    task?: string;
    tab?: string;
  }>;
}) {
  const { user, viewer } = await workPage();
  const params = await searchParams;
  const view = params.view === "board" || params.view === "calendar" ? params.view : "list";
  const showDone = params.done === "1" || view === "list";
  const now = new Date();
  const today = indiaDayOf(now);
  const where = [
    "t.assignee_id = ?",
    "t.deleted_at IS NULL",
    showDone ? "(t.status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED') OR (t.status = 'COMPLETED' AND t.completed_at >= ?))" : "t.status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED')",
  ];
  const [sections, placements, list, digestOff] = await Promise.all([
    ensureMySections(user.id),
    myPlacements(user.id),
    listTaskItems(where, showDone ? [user.id, new Date(now.getTime() - (view === "list" ? 30 : 7) * 86_400_000)] : [user.id], "t.due_at IS NULL, t.due_at, t.id", 1000),
    getDbPool()
      .query<RowDataPacket[]>("SELECT 1 FROM user_settings WHERE user_id = ? AND setting_key = 'work.digest' AND value = 'OFF'", [user.id])
      .then(([rows]) => rows.length > 0),
  ]);
  const bySystem = new Map(sections.filter((section) => section.system).map((section) => [section.system as MySystemSection, section]));
  const rows = list.items.map((task) => {
    const placed = placements.get(task.id);
    const placedSection = placed ? sections.find((section) => section.id === placed.sectionId) : undefined;
    const bucket = myTaskBucket(
      {
        dueDay: task.dueAt ? indiaDayOf(task.dueAt) : null,
        assignedAt: task.assignedAt,
        selfAssigned: task.createdBy === user.id,
        open: task.status !== "COMPLETED",
      },
      placedSection ? { system: placedSection.system, sectionId: placedSection.id } : null,
      today,
      now,
    );
    const sectionId = bucket.sectionId ?? bySystem.get(bucket.system ?? "LATER")!.id;
    // Never-placed tasks follow the placed ones, by due date.
    const position = placed?.position ?? 1e12 + (task.dueAt ? task.dueAt.getTime() / 1000 : 9e9);
    return {
      id: task.id,
      title: task.title,
      status: task.status,
      dueAt: task.dueAt?.toISOString() ?? null,
      sectionId,
      position,
      assignedByName: task.createdByName,
      selfAssigned: task.createdBy === user.id,
      projects: task.projects,
      subtasks: task.subtasks,
      subtasksOpen: task.subtasksOpen,
      comments: task.comments,
      isPeriodic: task.isPeriodic,
    };
  });
  // D-220: the List is the shared table, with the person's saved tabs.
  const [savedTabs, gridPeople, gridProjects] = await Promise.all([listWorkViews("MY_TASKS", user.id), peopleOptions(), listVisibleProjects(viewer)]);
  const currentTab = savedTabs.find((item) => String(item.id) === params.tab) ?? null;
  const gridRows = list.items.map((task) => {
    const row = rows.find((item) => item.id === task.id)!;
    return toGridTask(task, user.id, true, row.sectionId, row.position);
  });
  const link = (changes: Record<string, string | null>) => {
    const query = new URLSearchParams({
      ...(view !== "list" ? { view } : {}),
      ...(showDone ? { done: "1" } : {}),
    });
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) query.delete(key);
      else query.set(key, value);
    }
    const text = query.toString();
    return `/users/work/my-tasks${text ? `?${text}` : ""}`;
  };
  // D-219: a task opens in the pane beside the list.
  const links = paneLinks("/users/work/my-tasks", params);
  const paneId = paneTaskId(params.task);
  const pane = paneId ? <TaskPane taskId={paneId} user={user} closeHref={links.close} /> : null;
  return (
    <>
      <header className="mb-4 flex flex-wrap items-center gap-3" data-testid="my-tasks-header">
        <Avatar name={user.name} />
        <h1 className="text-title font-semibold tracking-tight">My Tasks</h1>
        <span className="text-caption text-ink-muted">Everything assigned to you, from every project, in your own sections. Only you see these sections and this order.</span>
        <span className="ml-auto">
          <CreateTaskButton label="Add task" />
        </span>
      </header>
      <WithPane pane={pane}>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <nav aria-label="My Tasks views" className="flex flex-wrap gap-1 border-b border-line" data-testid="view-tabs">
            {VIEWS.map((item) => (
              <span key={item.key} className="contents">
                <Link
                  href={link({ view: item.key === "list" ? null : item.key, tab: null })}
                  aria-current={view === item.key && !currentTab ? "page" : undefined}
                  className={`-mb-px border-b-2 px-3 py-2 text-label ${view === item.key && !currentTab ? "border-primary-600 font-semibold text-primary-700" : "border-transparent text-ink-muted hover:text-ink"}`}
                >
                  {item.label}
                </Link>
                {item.key === "list" &&
                  savedTabs.map((tab) => (
                    <Link
                      key={tab.id}
                      href={`/users/work/my-tasks?tab=${tab.id}`}
                      aria-current={currentTab?.id === tab.id ? "page" : undefined}
                      className={`-mb-px border-b-2 px-3 py-2 text-label ${currentTab?.id === tab.id ? "border-primary-600 font-semibold text-primary-700" : "border-transparent text-ink-muted hover:text-ink"}`}
                    >
                      {tab.name}
                    </Link>
                  ))}
              </span>
            ))}
          </nav>
          <span className="ml-auto">
            <DigestToggle on={!digestOff} />
          </span>
          {view !== "list" && (
            <Link href={link({ done: params.done === "1" ? null : "1" })} className="text-label link">
              {params.done === "1" ? "Hide completed" : "Show completed (last 7 days)"}
            </Link>
          )}
          <Link href="/users/tasks" className="text-label link">
            Table with filters
          </Link>
        </div>
        {view === "calendar" ? (
          <TaskCalendar
            tasks={rows.map((row) => ({
              id: row.id,
              title: row.title,
              status: row.status,
              dueAt: row.dueAt,
              assigneeId: user.id,
              isMilestone: false,
            }))}
            month={/^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : today.slice(0, 7)}
            todayDay={today}
            canEdit
            meId={user.id}
            monthHref={`${link({ view: "calendar" })}&month=`}
            holidays={await calendarHolidays(undefined, viewer.departmentId)}
          />
        ) : view === "list" ? (
          <MyTasksGrid
            rows={gridRows}
            sections={sections.map((section) => ({ id: section.id, name: section.name, system: section.system }))}
            initial={currentTab ? parseGridConfig(currentTab.config) : { ...DEFAULT_GRID, group: "section" }}
            view={{ scope: "MY_TASKS", scopeId: user.id, canSave: true, current: currentTab ? { id: currentTab.id, name: currentTab.name } : null }}
            people={gridPeople}
            projects={gridProjects.map((project) => ({ id: project.id, name: project.name }))}
            meId={user.id}
            nowIso={now.toISOString()}
          />
        ) : (
          <MyTasks
            sections={sections.map((section) => ({
              id: section.id,
              name: section.name,
              system: section.system,
            }))}
            tasks={rows}
            layout={view === "board" ? "BOARD" : "LIST"}
            nowIso={now.toISOString()}
          />
        )}
      </WithPane>
    </>
  );
}
