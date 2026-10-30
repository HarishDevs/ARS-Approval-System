import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Settings } from "lucide-react";
import { PageHeader } from "@/features/shell/PageHeader";
import { Badge } from "@/features/ui/Display";
import { SafeText } from "@/features/ui/SafeText";
import { ProjectDot } from "@/features/work/client";
import { ProjectWorkspace } from "@/features/work/ProjectWorkspace";
import { TaskCalendar } from "@/features/work/TaskCalendar";
import { Timeline } from "@/features/work/Timeline";
import { ProjectCommandButton, RemoveStatusButton, StarButton, StatusForm } from "@/features/work/ProjectForms";
import { indiaDayOf } from "@/features/work/format";
import { listProjectTasks, listSections, listStatusUpdates, projectCounts, projectFor, touchRecentProject } from "@/lib/db/repositories/work.repository";
import { getDbPool } from "@/lib/db/client";
import { indiaDateTimeText } from "@/server/modules/settings";
import { PRIVACY_LABEL, PROJECT_ROLE_LABEL, projectAbilities, STATUS_KIND_LABEL, STATUS_KIND_TONE } from "@/server/work/access";
import { peopleOptions, workPage } from "@/server/work/page-context";
import { calendarHolidays } from "@/server/work/holiday-store";
import type { RowDataPacket } from "mysql2/promise";

export const metadata: Metadata = { title: "Project" };
export const dynamic = "force-dynamic";

const VIEWS = [
  { key: "list", label: "List" },
  { key: "board", label: "Board" },
  { key: "calendar", label: "Calendar" },
  { key: "timeline", label: "Timeline" },
  { key: "overview", label: "Overview" },
] as const;
type ViewKey = (typeof VIEWS)[number]["key"];

// D-215: one project. Only people with a role on it (members, its department
// or everyone, by its privacy) can open it; anyone else gets "not found".
export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string; month?: string; created?: string }> }) {
  const { user, viewer } = await workPage();
  const { id } = await params;
  if (!/^\d{1,10}$/.test(id)) notFound();
  const found = await projectFor(Number(id), viewer);
  if (!found) notFound();
  const { project, members, role } = found;
  const can = projectAbilities(role);
  const query = await searchParams;
  const view: ViewKey = VIEWS.some((item) => item.key === query.view) ? (query.view as ViewKey) : (project.defaultView.toLowerCase() as ViewKey);
  const now = new Date();
  const todayDay = indiaDayOf(now);
  const [sections, tasks, people, statuses, counts, starred] = await Promise.all([
    listSections(project.id),
    listProjectTasks(project.id),
    can.edit ? peopleOptions() : Promise.resolve([]),
    view === "overview" ? listStatusUpdates(project.id) : Promise.resolve([]),
    projectCounts(project.id),
    getDbPool()
      .query<RowDataPacket[]>("SELECT 1 FROM work_favourites WHERE user_id = ? AND object_type = 'PROJECT' AND object_id = ?", [user.id, project.id])
      .then(([rows]) => rows.length > 0),
  ]);
  await touchRecentProject(user.id, project.id).catch(() => undefined);
  const isMember = members.some((member) => member.type === "USER" && member.id === user.id);
  const sectionName = new Map(sections.map((section) => [section.id, section.name]));
  const base = `/users/work/projects/${project.id}`;
  const month = /^\d{4}-\d{2}$/.test(query.month ?? "") ? query.month! : todayDay.slice(0, 7);

  return (
    <>
      <PageHeader title={project.name} meta={`${PRIVACY_LABEL[project.privacy]}${project.departmentName ? ` · ${project.departmentName}` : ""} · You: ${PROJECT_ROLE_LABEL[role]} · ${counts.completed}/${counts.open + counts.completed} done${counts.overdue ? ` · ${counts.overdue} overdue` : ""}`}>
        <div className="flex flex-wrap items-center gap-2">
          <ProjectDot color={project.color} className="h-3 w-3" />
          <StarButton projectId={project.id} starred={starred} name={project.name} />
          {project.currentStatus && <Badge tone={STATUS_KIND_TONE[project.currentStatus]}>{STATUS_KIND_LABEL[project.currentStatus]}</Badge>}
          {project.archivedAt && <Badge tone="neutral">Archived</Badge>}
          {!isMember && !viewer.isAdmin && <ProjectCommandButton projectId={project.id} command="JOIN" label="Join project" />}
          <Link href={`${base}/settings`} className="btn-secondary btn-compact inline-flex items-center gap-1">
            <Settings aria-hidden="true" className="h-4 w-4" />
            {can.share ? "Members & settings" : "Members"}
          </Link>
        </div>
      </PageHeader>
      {query.created === "1" && (
        <p role="status" className="mb-4 rounded-md bg-success-50 px-3 py-2 text-label text-success-600">
          Project created with three sections. Add tasks below, and people from Members &amp; settings.
        </p>
      )}
      {project.archivedAt && <p className="mb-4 rounded-md bg-surface-muted px-3 py-2 text-label">This project is archived. Its tasks still work; it is hidden from the project list.</p>}
      <nav aria-label="Project views" className="mb-4 flex flex-wrap gap-1">
        {VIEWS.map((item) => (
          <Link key={item.key} href={`${base}?view=${item.key}`} aria-current={view === item.key ? "page" : undefined} className={`rounded-md px-3 py-1.5 text-label ${view === item.key ? "bg-primary-50 font-semibold text-primary-700" : "text-ink-muted hover:bg-surface-muted"}`}>
            {item.label}
          </Link>
        ))}
      </nav>

      {(view === "list" || view === "board") && (
        <ProjectWorkspace
          projectId={project.id}
          layout={view === "board" ? "BOARD" : "LIST"}
          sections={sections.map((section) => ({ id: section.id, name: section.name }))}
          tasks={tasks.map((task) => ({
            id: task.id,
            taskNo: task.taskNo,
            title: task.title,
            status: task.status,
            priority: task.priority,
            assigneeId: task.assigneeId,
            assigneeName: task.assigneeName,
            dueAt: task.dueAt?.toISOString() ?? null,
            sectionId: task.sectionId ?? sections[0]?.id ?? 0,
            position: task.position,
            subtasks: task.subtasks,
            subtasksOpen: task.subtasksOpen,
            comments: task.comments,
            likes: task.likes,
            blockedBy: task.blockedBy,
            isMilestone: task.isMilestone,
            tags: task.tags.map((tag) => ({ id: tag.id, name: tag.name })),
          }))}
          canEdit={can.edit}
          meId={user.id}
          people={people}
          nowIso={now.toISOString()}
        />
      )}
      {view === "calendar" && (
        <TaskCalendar
          tasks={tasks.map((task) => ({ id: task.id, title: task.title, status: task.status, dueAt: task.dueAt?.toISOString() ?? null, assigneeId: task.assigneeId, isMilestone: task.isMilestone }))}
          month={month}
          todayDay={todayDay}
          canEdit={can.edit}
          meId={user.id}
          projectId={project.id}
          monthHref={`${base}?view=calendar&month=`}
          holidays={await calendarHolidays()}
        />
      )}
      {view === "timeline" && (
        <Timeline
          todayDay={todayDay}
          tasks={tasks.map((task) => ({
            id: task.id,
            title: task.title,
            status: task.status,
            sectionName: sectionName.get(task.sectionId ?? 0) ?? "",
            startsOn: task.startsOn,
            dueAt: task.dueAt?.toISOString() ?? null,
            isMilestone: task.isMilestone,
            blockedBy: task.blockedBy,
            assigneeName: task.assigneeName,
          }))}
        />
      )}
      {view === "overview" && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            <section className="card space-y-3 px-5 py-4" aria-labelledby="about">
              <h2 id="about" className="font-semibold">
                About this project
              </h2>
              {project.description ? (
                <p className="whitespace-pre-wrap">
                  <SafeText text={project.description} />
                </p>
              ) : (
                <p className="text-ink-muted">No description yet.</p>
              )}
              <dl className="grid gap-3 sm:grid-cols-3">
                <Fact label="Owner" value={project.ownerName} />
                <Fact label="Starts" value={project.startOn ?? "—"} />
                <Fact label="Due" value={project.dueOn ?? "—"} />
              </dl>
              <div>
                <h3 className="text-label font-semibold">Milestones</h3>
                <ul className="mt-1 space-y-1 text-label">
                  {tasks.filter((task) => task.isMilestone).length === 0 && <li className="text-ink-muted">None. Mark a task as a milestone from the task page.</li>}
                  {tasks
                    .filter((task) => task.isMilestone)
                    .map((task) => (
                      <li key={task.id}>
                        ◆{" "}
                        <Link href={`/users/tasks/${task.id}`} className="link">
                          {task.title}
                        </Link>{" "}
                        <span className="text-ink-muted">{task.dueAt ? indiaDayOf(task.dueAt) : "no date"}</span> {task.status === "COMPLETED" && <Badge tone="success">Done</Badge>}
                      </li>
                    ))}
                </ul>
              </div>
            </section>
            <section className="card space-y-4 px-5 py-4" aria-labelledby="statuses">
              <h2 id="statuses" className="font-semibold">
                Status updates
              </h2>
              {statuses.length === 0 && <p className="text-ink-muted">No status update yet.</p>}
              <ol className="space-y-4">
                {statuses.map((update) => (
                  <li key={update.id} className="rounded-md border border-line p-3" data-testid="status-update">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={STATUS_KIND_TONE[update.status]}>{STATUS_KIND_LABEL[update.status]}</Badge>
                      <span className="font-medium">
                        <SafeText text={update.title} />
                      </span>
                      <span className="ml-auto text-caption text-ink-muted">
                        {update.authorName}, {indiaDateTimeText(update.createdAt)}
                      </span>
                      {update.authorId === user.id && <RemoveStatusButton statusId={update.id} />}
                    </div>
                    {update.body && (
                      <p className="mt-2 whitespace-pre-wrap text-label">
                        <SafeText text={update.body} />
                      </p>
                    )}
                    <p className="mt-2 text-caption text-ink-muted">
                      When posted: {update.snapshot.open} open, {update.snapshot.completed} completed, {update.snapshot.overdue} overdue.
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          </div>
          <aside className="space-y-4">
            {can.edit && (
              <section className="card px-5 py-4" aria-label="Post a status update">
                <h2 className="mb-3 font-semibold">Post a status update</h2>
                <StatusForm projectId={project.id} />
              </section>
            )}
            <section className="card px-5 py-4" aria-labelledby="people">
              <h2 id="people" className="mb-2 font-semibold">
                Members
              </h2>
              <ul className="space-y-1 text-label">
                {members.map((member) => (
                  <li key={`${member.type}:${member.id}`} className="flex justify-between gap-2">
                    <span>
                      {member.name}
                      {member.type === "DEPARTMENT" ? " (department)" : ""}
                    </span>
                    <span className="text-ink-muted">{PROJECT_ROLE_LABEL[member.role]}</span>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      )}
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption font-semibold uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
