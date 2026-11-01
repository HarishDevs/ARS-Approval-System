import "server-only";
import { paneLinks, paneTaskId, TaskPane, WithPane } from "@/features/work/TaskPane";
import Link from "next/link";
import { getDbPool } from "@/lib/db/client";
import type { RowDataPacket } from "mysql2/promise";
import { Badge } from "@/features/ui/Display";
import { CreateTaskButton, ProjectDot, TaskCheck } from "@/features/work/client";
import { dueLabel, indiaDayOf, TONE_TEXT } from "@/features/work/format";
import { homeProjects, listTaskItems, recentStatusUpdates, teamWorkload, type WorkTaskItem } from "@/lib/db/repositories/work.repository";
import { indiaDateTimeText } from "@/server/modules/settings";
import { STATUS_KIND_LABEL, STATUS_KIND_TONE } from "@/server/work/access";
import { addDays } from "@/server/work/rules";
import type { workPage } from "@/server/work/page-context";
import type { WorkViewer } from "@/server/work/access";

type WorkPageUser = Awaited<ReturnType<typeof workPage>>["user"];
const OPEN = "t.status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED')";
type Tab = "upcoming" | "overdue" | "completed" | "week";

// D-215: the day's start: my tasks (upcoming, overdue, completed), what I
// gave others, my projects and their latest status, and (D-216) my team
// through every level of the reporting line.
// D-265: part="others" gives only "Tasks I've assigned" and My team, under
// Home's My Work overview (which has my tasks, projects and updates itself).
export async function TaskHome({
  user,
  viewer,
  params,
  basePath,
  greet = true,
  part = "all",
}: {
  user: WorkPageUser;
  viewer: WorkViewer;
  params: { tab?: string; given?: string; task?: string; home?: string };
  basePath: string;
  greet?: boolean;
  part?: "all" | "others";
}) {
  const tab: Tab = params.tab === "overdue" || params.tab === "completed" ? params.tab : "upcoming";
  const given: Tab = params.given === "overdue" || params.given === "completed" || params.given === "upcoming" ? params.given : "week";
  const now = new Date();
  const today = indiaDayOf(now);
  const weekEnd = new Date(`${addDays(today, 8)}T00:00:00+05:30`);
  const mineWhere = (which: Tab): [string[], unknown[], string] =>
    which === "overdue"
      ? [["t.assignee_id = ?", "t.deleted_at IS NULL", OPEN, "t.due_at < ?"], [user.id, now], "t.due_at"]
      : which === "completed"
        ? [["t.assignee_id = ?", "t.deleted_at IS NULL", "t.status = 'COMPLETED'"], [user.id], "t.completed_at DESC"]
        : [["t.assignee_id = ?", "t.deleted_at IS NULL", OPEN, "(t.due_at IS NULL OR (t.due_at >= ? AND t.due_at < ?))"], [user.id, now, weekEnd], "t.due_at IS NULL, t.due_at, t.id DESC"];
  const givenWhere = (which: Tab): [string[], unknown[], string] => {
    const base = ["t.assigned_by = ?", "t.assignee_id <> ?", "t.deleted_at IS NULL"];
    // D-219 (catalog S-02): This week first, as in Asana's "Tasks I've assigned".
    if (which === "week") return [[...base, OPEN, "t.due_at >= ? AND t.due_at < ?"], [user.id, user.id, new Date(`${today}T00:00:00+05:30`), weekEnd], "t.due_at"];
    return which === "overdue"
      ? [[...base, OPEN, "t.due_at < ?"], [user.id, user.id, now], "t.due_at"]
      : which === "completed"
        ? [[...base, "t.status = 'COMPLETED'"], [user.id, user.id], "t.completed_at DESC"]
        : [[...base, OPEN], [user.id, user.id], "t.due_at IS NULL, t.due_at"];
  };
  const [mine, overdueCount, givenList, projects, statuses, team, doneWeek, givenCounts, collaborators] = await Promise.all([
    listTaskItems(...mineWhere(tab), 12),
    listTaskItems(...mineWhere("overdue"), 1).then((result) => result.total),
    listTaskItems(...givenWhere(given), 8),
    homeProjects(viewer, 8),
    recentStatusUpdates(viewer, 5),
    teamWorkload(viewer.teamIds, user.id),
    listTaskItems(["t.assignee_id = ?", "t.deleted_at IS NULL", "t.status = 'COMPLETED'", "t.completed_at >= ?"], [user.id, new Date(now.getTime() - 7 * 86_400_000)], "t.id", 1).then(
      (result) => result.total,
    ),
    Promise.all((["week", "upcoming", "overdue"] as Tab[]).map((which) => listTaskItems(...givenWhere(which), 1).then((result) => result.total))),
    getDbPool()
      .query<RowDataPacket[]>(
        "SELECT COUNT(DISTINCT f.user_id) AS n FROM task_followers f JOIN tasks t ON t.id = f.task_id AND t.deleted_at IS NULL WHERE (t.assignee_id = ? OR t.created_by = ?) AND f.user_id <> ?",
        [user.id, user.id, user.id],
      )
      .then(([rows]) => Number(rows[0]?.n ?? 0)),
  ]);
  const hour = Number(new Date(now.getTime() + 330 * 60_000).toISOString().slice(11, 13));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const tabLink = (key: Tab, label: string, param: "tab" | "given", current: Tab, extra?: string) => (
    <Link
      key={key}
      href={`${basePath}?${new URLSearchParams({ ...(params.home ? { home: params.home } : {}), ...(param === "tab" ? { tab: key, given } : { ...(part === "others" && params.tab ? { tab: params.tab } : { tab }), given: key }) })}`}
      scroll={part === "others" ? false : undefined}
      aria-current={current === key ? "page" : undefined}
      className={`border-b-2 px-2 py-1 text-label ${current === key ? "border-primary-600 font-semibold text-primary-700" : "border-transparent text-ink-muted hover:text-ink"}`}
    >
      {label}
      {extra}
    </Link>
  );
  // D-219: a task opens in the pane beside the list.
  const links = paneLinks(basePath, params);
  const paneId = paneTaskId(params.task);
  const pane = paneId ? <TaskPane taskId={paneId} user={user} closeHref={links.close} /> : null;
  const givenAndTeam = (
    <>
      <section className="card px-5 py-4" aria-labelledby="home-given">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="home-given" className="font-semibold">
            Tasks I&apos;ve assigned
          </h2>
          <Link href="/users/work/search?created_by=me" className="link text-label">
            See all
          </Link>
        </div>
        <nav aria-label="Tasks I've assigned" className="mb-2 flex gap-1 overflow-x-auto border-b border-line">
          {tabLink("week", "This week", "given", given, ` (${givenCounts[0]})`)}
          {tabLink("upcoming", "Upcoming", "given", given, ` (${givenCounts[1]})`)}
          {tabLink("overdue", "Overdue", "given", given, ` (${givenCounts[2]})`)}
          {tabLink("completed", "Completed", "given", given)}
        </nav>
        <TaskLines hrefFor={links.open} items={givenList.items} now={now} meId={user.id} empty="Nothing here." showAssignee />
      </section>
      {team.length > 0 && (
        <section className="card px-5 py-4 xl:col-span-2" aria-labelledby="home-team">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 id="home-team" className="font-semibold">
              My team <span className="font-normal text-ink-muted">· everyone below you in the reporting line ({team.length})</span>
            </h2>
            <span className="flex gap-3 text-label">
              <Link href="/users/work/search?team=1" className="link">
                Their open tasks
              </Link>
              <Link href="/users/work/search?team=1&overdue=1" className="link">
                Overdue
              </Link>
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-label" data-testid="team-workload">
              <thead className="text-left text-caption uppercase tracking-wide text-ink-faint">
                <tr>
                  <th className="py-1 pr-3">Person</th>
                  <th className="py-1 pr-3">Reports to</th>
                  <th className="py-1 pr-3 text-right">Open</th>
                  <th className="py-1 pr-3 text-right">Overdue</th>
                  <th className="py-1 text-right">Done (7 days)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {team.slice(0, 25).map((person) => (
                  <tr key={person.id}>
                    <td className="py-1.5 pr-3">
                      <Link href={`/users/work/search?assignee=${person.id}`} className="link">
                        {person.name}
                      </Link>
                      {person.direct && <span className="ml-1 text-caption text-ink-muted">(direct)</span>}
                    </td>
                    <td className="py-1.5 pr-3 text-ink-muted">{person.managerName ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-right">{person.open}</td>
                    <td className={`py-1.5 pr-3 text-right ${person.overdue ? "font-semibold text-danger-600" : ""}`}>{person.overdue}</td>
                    <td className="py-1.5 text-right">{person.doneWeek}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
  if (part === "others") return <div className="mt-6 grid gap-6 xl:grid-cols-2">{givenAndTeam}</div>;
  return (
    <>
      {/* D-219 (catalog S-02): date line, greeting, this week's numbers. */}
      <header className={greet ? "mb-6 text-center" : "mb-4 mt-10"} data-testid="home-header">
        {greet ? (
          <>
            <p className="text-label text-ink-muted">{new Date(`${today}T12:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}</p>
            <h1 className="mt-1 text-display font-semibold tracking-tight">{`${greeting}, ${user.name.split(" ")[0]}`}</h1>
          </>
        ) : (
          <h2 className="mb-2 text-card-title font-semibold">My work</h2>
        )}
        <div className="mt-3 inline-flex flex-wrap items-center justify-center gap-2 rounded-full bg-surface-muted px-4 py-1.5 text-label text-ink-muted">
          <span>My week</span>
          <span aria-hidden="true">·</span>
          <span>
            <span className="font-semibold text-ink">{doneWeek}</span> task{doneWeek === 1 ? "" : "s"} completed
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <span className="font-semibold text-ink">{collaborators}</span> collaborator{collaborators === 1 ? "" : "s"}
          </span>
        </div>
      </header>
      <WithPane pane={pane}>
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="card px-5 py-4 xl:col-span-2" aria-labelledby="home-mine">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 id="home-mine" className="font-semibold">
                My tasks
              </h2>
              <span className="flex items-center gap-3">
                <CreateTaskButton />
                <Link href="/users/work/my-tasks" className="link text-label">
                  Show more
                </Link>
              </span>
            </div>
            <nav aria-label="My tasks" className="mb-2 flex gap-1 border-b border-line">
              {tabLink("upcoming", "Upcoming", "tab", tab)}
              {tabLink("overdue", "Overdue", "tab", tab, overdueCount ? ` (${overdueCount})` : "")}
              {tabLink("completed", "Completed", "tab", tab)}
            </nav>
            <TaskLines
              hrefFor={links.open}
              items={mine.items}
              now={now}
              meId={user.id}
              empty={tab === "overdue" ? "Nothing overdue. Well done." : tab === "completed" ? "Nothing completed yet." : "Nothing due in the next 7 days."}
              showProject
            />
          </section>
          {givenAndTeam}
          <section className="card px-5 py-4" aria-labelledby="home-projects">
            <div className="mb-2 flex items-center justify-between">
              <h2 id="home-projects" className="font-semibold">
                Projects
              </h2>
              <Link href="/users/work/projects" className="link text-label">
                All projects
              </Link>
            </div>
            {projects.length === 0 ? (
              <p className="text-label text-ink-muted">
                No projects yet.{" "}
                <Link href="/users/work/projects" className="link">
                  Create one
                </Link>
                .
              </p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {projects.map((project) => (
                  <li key={project.id}>
                    <Link href={`/users/work/projects/${project.id}`} className="flex items-center gap-2 rounded-md border border-line px-3 py-2 hover:bg-surface-muted">
                      <ProjectDot color={project.color} className="h-3 w-3" />
                      <span className="min-w-0 flex-1 truncate text-label font-medium">
                        {project.starred ? "★ " : ""}
                        {project.name}
                      </span>
                      {project.currentStatus && <Badge tone={STATUS_KIND_TONE[project.currentStatus]}>{STATUS_KIND_LABEL[project.currentStatus]}</Badge>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card px-5 py-4" aria-labelledby="home-status">
            <h2 id="home-status" className="mb-2 font-semibold">
              Latest status updates
            </h2>
            {statuses.length === 0 ? (
              <p className="text-label text-ink-muted">No status updates in your projects yet.</p>
            ) : (
              <ul className="space-y-2">
                {statuses.map((update) => (
                  <li key={update.id} className="text-label">
                    <Badge tone={STATUS_KIND_TONE[update.status]}>{STATUS_KIND_LABEL[update.status]}</Badge>{" "}
                    <Link href={`/users/work/projects/${update.projectId}?view=overview`} className="link">
                      {update.projectName}
                    </Link>
                    : {update.title}{" "}
                    <span className="text-caption text-ink-muted">
                      · {update.authorName}, {indiaDateTimeText(update.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </WithPane>
    </>
  );
}

function TaskLines({
  items,
  now,
  meId,
  empty,
  showProject,
  showAssignee,
  hrefFor,
}: {
  items: WorkTaskItem[];
  now: Date;
  meId: number;
  empty: string;
  showProject?: boolean;
  showAssignee?: boolean;
  hrefFor: (id: number) => string;
}) {
  if (!items.length) return <p className="py-3 text-label text-ink-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line">
      {items.map((task) => {
        const open = ["OPEN", "IN_PROGRESS", "BLOCKED"].includes(task.status);
        const due = dueLabel(task.dueAt, now, open);
        return (
          <li key={task.id} className="work-row flex items-center gap-2 py-1.5" tabIndex={-1}>
            <TaskCheck taskId={task.id} done={task.status === "COMPLETED"} disabled={task.assigneeId !== meId || task.status === "CANCELLED"} label={task.title} />
            <Link href={hrefFor(task.id)} scroll={false} className={`min-w-0 flex-1 truncate text-label hover:underline ${task.status === "COMPLETED" ? "text-ink-muted line-through" : ""}`}>
              {task.isPeriodic && (
                <span title="Periodic" className="text-info-600">
                  ↻{" "}
                </span>
              )}
              {task.title}
            </Link>
            {showAssignee && <span className="truncate text-caption text-ink-muted">{task.assigneeName}</span>}
            {showProject && task.projects[0] && (
              <span className="hidden items-center gap-1 text-caption text-ink-muted sm:inline-flex">
                <ProjectDot color={task.projects[0].color} />
                {task.projects[0].name}
              </span>
            )}
            {due && <span className={`shrink-0 text-caption ${TONE_TEXT[due.tone]}`}>{due.text}</span>}
          </li>
        );
      })}
    </ul>
  );
}
