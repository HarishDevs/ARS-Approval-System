import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/features/shell/PageHeader";
import { MyTasks } from "@/features/work/MyTasks";
import { DigestToggle } from "@/features/work/MoreParts";
import { getDbPool } from "@/lib/db/client";
import type { RowDataPacket } from "mysql2/promise";
import { TaskCalendar } from "@/features/work/TaskCalendar";
import { indiaDayOf } from "@/features/work/format";
import { ensureMySections, listTaskItems, myPlacements } from "@/lib/db/repositories/work.repository";
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
export default async function MyTasksPage({ searchParams }: { searchParams: Promise<{ view?: string; done?: string; month?: string }> }) {
  const { user, viewer } = await workPage();
  const params = await searchParams;
  const view = params.view === "board" || params.view === "calendar" ? params.view : "list";
  const showDone = params.done === "1";
  const now = new Date();
  const today = indiaDayOf(now);
  const where = ["t.assignee_id = ?", "t.deleted_at IS NULL", showDone ? "(t.status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED') OR (t.status = 'COMPLETED' AND t.completed_at >= ?))" : "t.status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED')"];
  const [sections, placements, list, digestOff] = await Promise.all([
    ensureMySections(user.id),
    myPlacements(user.id),
    listTaskItems(where, showDone ? [user.id, new Date(now.getTime() - 7 * 86_400_000)] : [user.id], "t.due_at IS NULL, t.due_at, t.id", 1000),
    getDbPool()
      .query<RowDataPacket[]>("SELECT 1 FROM user_settings WHERE user_id = ? AND setting_key = 'work.digest' AND value = 'OFF'", [user.id])
      .then(([rows]) => rows.length > 0),
  ]);
  const bySystem = new Map(sections.filter((section) => section.system).map((section) => [section.system as MySystemSection, section]));
  const rows = list.items.map((task) => {
    const placed = placements.get(task.id);
    const placedSection = placed ? sections.find((section) => section.id === placed.sectionId) : undefined;
    const bucket = myTaskBucket(
      { dueDay: task.dueAt ? indiaDayOf(task.dueAt) : null, assignedAt: task.assignedAt, selfAssigned: task.createdBy === user.id },
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
    };
  });
  const link = (changes: Record<string, string | null>) => {
    const query = new URLSearchParams({ ...(view !== "list" ? { view } : {}), ...(showDone ? { done: "1" } : {}) });
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) query.delete(key);
      else query.set(key, value);
    }
    const text = query.toString();
    return `/users/work/my-tasks${text ? `?${text}` : ""}`;
  };
  return (
    <>
      <PageHeader title="My Tasks" description="Everything assigned to you, from every project, in your own sections. Only you see these sections and this order." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <nav aria-label="My Tasks views" className="flex gap-1">
          {VIEWS.map((item) => (
            <Link key={item.key} href={link({ view: item.key === "list" ? null : item.key })} aria-current={view === item.key ? "page" : undefined} className={`rounded-md px-3 py-1.5 text-label ${view === item.key ? "bg-primary-50 font-semibold text-primary-700" : "text-ink-muted hover:bg-surface-muted"}`}>
              {item.label}
            </Link>
          ))}
        </nav>
        <span className="ml-auto">
          <DigestToggle on={!digestOff} />
        </span>
        <Link href={link({ done: showDone ? null : "1" })} className="text-label link">
          {showDone ? "Hide completed" : "Show completed (last 7 days)"}
        </Link>
        <Link href="/users/tasks" className="text-label link">
          Table with filters
        </Link>
      </div>
      {view === "calendar" ? (
        <TaskCalendar
          tasks={rows.map((row) => ({ id: row.id, title: row.title, status: row.status, dueAt: row.dueAt, assigneeId: user.id, isMilestone: false }))}
          month={/^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : today.slice(0, 7)}
          todayDay={today}
          canEdit
          meId={user.id}
          monthHref={`${link({ view: "calendar" })}&month=`}
          holidays={await calendarHolidays(undefined, viewer.departmentId)}
        />
      ) : (
        <MyTasks sections={sections.map((section) => ({ id: section.id, name: section.name, system: section.system }))} tasks={rows} layout={view === "board" ? "BOARD" : "LIST"} nowIso={now.toISOString()} />
      )}
    </>
  );
}
