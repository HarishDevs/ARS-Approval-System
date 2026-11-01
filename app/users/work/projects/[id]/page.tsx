import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/features/shell/PageHeader";
import { Badge } from "@/features/ui/Display";
import { SafeText } from "@/features/ui/SafeText";
import { ProjectWorkspace } from "@/features/work/ProjectWorkspace";
import { TaskCalendar } from "@/features/work/TaskCalendar";
import { Timeline } from "@/features/work/Timeline";
import { paneLinks, paneTaskId, TaskPane, WithPane } from "@/features/work/TaskPane";
import { toGridTask } from "@/server/work/grid-rows";
import { DEFAULT_GRID, parseGridConfig } from "@/server/work/grid";
import { ProjectCommandButton, RemoveStatusButton, StatusForm } from "@/features/work/ProjectForms";
import { ProjectHeader } from "@/features/work/ProjectHeader";
import { FromTemplateForm } from "@/features/work/MoreParts";
import { listDepartments } from "@/lib/db/repositories/organisation.repository";
import { countTemplateTasks, parseTemplate, type TemplateTask } from "@/server/work/more-rules";
import { indiaDayOf } from "@/features/work/format";
import { listWorkViews, fieldValues, listProjectFields, listProjectTasks, listSections, listStatusUpdates, projectCounts, projectFor, templateBody, touchRecentProject } from "@/lib/db/repositories/work.repository";
import { getDbPool } from "@/lib/db/client";
import { indiaDateTimeText } from "@/server/modules/settings";
import { PRIVACY_LABEL, PROJECT_ROLE_LABEL, projectAbilities, STATUS_KIND_LABEL, STATUS_KIND_TONE } from "@/server/work/access";
import { peopleOptions, workPage } from "@/server/work/page-context";
import { calendarHolidays } from "@/server/work/holiday-store";
import type { RowDataPacket } from "mysql2/promise";

export const metadata: Metadata = { title: "Project" };
export const dynamic = "force-dynamic";

// D-219: Asana's order.
const VIEWS = [
  { key: "overview", label: "Overview" },
  { key: "list", label: "List" },
  { key: "board", label: "Board" },
  { key: "timeline", label: "Timeline" },
  { key: "calendar", label: "Calendar" },
] as const;
type ViewKey = (typeof VIEWS)[number]["key"];

// D-215: one project. Only people with a role on it (members, its department
// or everyone, by its privacy) can open it; anyone else gets "not found".
export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    view?: string;
    month?: string;
    created?: string;
    task?: string;
    status?: string;
    tab?: string;
  }>;
}) {
  const { user, viewer } = await workPage();
  const { id } = await params;
  if (!/^\d{1,10}$/.test(id)) notFound();
  const found = await projectFor(Number(id), viewer);
  if (!found) notFound();
  const { project, members, role } = found;
  const can = projectAbilities(role);
  // D-218: a template shows what it holds and makes projects.
  if (project.isTemplate) {
    const template = parseTemplate(await templateBody(project.id));
    const departments = (await listDepartments()).filter((department) => department.active).map((department) => ({ id: department.id, name: department.name }));
    const lines = (tasks: TemplateTask[], level = 0): React.ReactNode[] =>
      tasks.flatMap((task, index) => [
        <li key={`${level}-${index}-${task.title}`} style={{ paddingLeft: level * 20 }} className="text-label">
          {task.isMilestone ? "◆ " : "• "}
          {task.title}
          <span className="text-caption text-ink-muted">
            {" "}
            · {template?.sections[task.section] ?? ""}
            {task.dueOffset !== null ? ` · due day ${task.dueOffset >= 0 ? "+" : ""}${task.dueOffset}` : ""}
          </span>
        </li>,
        ...lines(task.subtasks, level + 1),
      ]);
    return (
      <>
        <PageHeader title={project.name} meta={`Template · ${countTemplateTasks(template?.tasks ?? [])} tasks · ${template?.sections.length ?? 0} sections · Owner ${project.ownerName}`}>
          <Badge tone="info">Template</Badge>
          {can.manage && <ProjectCommandButton projectId={project.id} command="DELETE" label="Delete template" danger confirmText="Projects made from it stay." />}
        </PageHeader>
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card px-5 py-4" aria-label="What it holds">
            <h2 className="mb-2 font-semibold">Sections and tasks</h2>
            {template?.fields.length ? <p className="mb-2 text-caption text-ink-muted">Fields: {template.fields.map((field) => field.name).join(", ")}</p> : null}
            <ul className="space-y-1" data-testid="template-tasks">
              {lines(template?.tasks ?? [])}
            </ul>
          </section>
          <section className="card px-5 py-4" aria-label="Use this template">
            <h2 className="mb-3 font-semibold">Use this template</h2>
            <FromTemplateForm templates={[{ id: project.id, name: project.name }]} departments={departments} />
          </section>
        </div>
      </>
    );
  }
  const query = await searchParams;
  const view: ViewKey = VIEWS.some((item) => item.key === query.view) ? (query.view as ViewKey) : (project.defaultView.toLowerCase() as ViewKey);
  const now = new Date();
  const todayDay = indiaDayOf(now);
  const [sections, tasks, people, statuses, counts, starred, fields] = await Promise.all([
    listSections(project.id),
    listProjectTasks(project.id),
    can.edit ? peopleOptions() : Promise.resolve([]),
    view === "overview" ? listStatusUpdates(project.id) : Promise.resolve([]),
    projectCounts(project.id),
    getDbPool()
      .query<RowDataPacket[]>("SELECT 1 FROM work_favourites WHERE user_id = ? AND object_type = 'PROJECT' AND object_id = ?", [user.id, project.id])
      .then(([rows]) => rows.length > 0),
    listProjectFields(project.id),
  ]);
  // D-220: the project's saved tabs (List views with their filters, sort and groups).
  const savedTabs = await listWorkViews("PROJECT", project.id);
  const currentTab = savedTabs.find((item) => String(item.id) === query.tab) ?? null;
  const values = await fieldValues(tasks.map((task) => task.id));
  await touchRecentProject(user.id, project.id).catch(() => undefined);
  const isMember = members.some((member) => member.type === "USER" && member.id === user.id);
  // D-220: the Share dialog's lists.
  const [shareDepartments, sharePeople] = await Promise.all([
    listDepartments().then((items) => items.filter((item) => item.active).map((item) => ({ id: item.id, name: item.name }))),
    people.length ? Promise.resolve(people) : peopleOptions(),
  ]);
  const sectionName = new Map(sections.map((section) => [section.id, section.name]));
  const base = `/users/work/projects/${project.id}`;
  const month = /^\d{4}-\d{2}$/.test(query.month ?? "") ? query.month! : todayDay.slice(0, 7);
  // D-219: a task opens in the pane beside the view.
  const links = paneLinks(base, { ...query, created: undefined, view });
  const paneId = paneTaskId(query.task);
  const pane = paneId ? <TaskPane taskId={paneId} user={user} closeHref={links.close} /> : null;

  return (
    <>
      <ProjectHeader
        projectId={project.id}
        name={project.name}
        color={project.color}
        meta={`${PRIVACY_LABEL[project.privacy]}${project.departmentName ? ` · ${project.departmentName}` : ""} · You: ${PROJECT_ROLE_LABEL[role]} · ${counts.completed}/${counts.open + counts.completed} done${counts.overdue ? ` · ${counts.overdue} overdue` : ""}`}
        starred={starred}
        status={project.currentStatus}
        members={members.filter((member) => member.type === "USER").map((member) => ({ id: member.id, name: member.name }))}
        canEdit={can.edit}
        canManage={can.manage}
        share={{
          privacy: project.privacy,
          departmentId: project.departmentId,
          departments: shareDepartments,
          members,
          people: sharePeople,
          canShare: can.share,
        }}
      />
      {(project.archivedAt || (!isMember && !viewer.isAdmin)) && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {project.archivedAt && <Badge tone="neutral">Archived</Badge>}
          {!isMember && !viewer.isAdmin && <ProjectCommandButton projectId={project.id} command="JOIN" label="Join project" />}
        </div>
      )}
      {query.created === "1" && (
        <p role="status" className="mb-4 rounded-md bg-success-50 px-3 py-2 text-label text-success-600">
          Project created. Add tasks below, and use Share to bring people in.
        </p>
      )}
      {project.archivedAt && <p className="mb-4 rounded-md bg-surface-muted px-3 py-2 text-label">This project is archived. Its tasks still work; it is hidden from the project list.</p>}
      <nav aria-label="Project views" className="mb-3 flex flex-wrap gap-1 border-b border-line" data-testid="view-tabs">
        {VIEWS.map((item) => (
          <span key={item.key} className="contents">
            <Link
              href={`${base}?view=${item.key}`}
              aria-current={view === item.key && !currentTab ? "page" : undefined}
              className={`-mb-px border-b-2 px-3 py-2 text-label ${view === item.key && !currentTab ? "border-primary-600 font-semibold text-primary-700" : "border-transparent text-ink-muted hover:text-ink"}`}
            >
              {item.label}
            </Link>
            {item.key === "list" &&
              savedTabs.map((tab) => (
                <Link
                  key={tab.id}
                  href={`${base}?view=list&tab=${tab.id}`}
                  aria-current={currentTab?.id === tab.id ? "page" : undefined}
                  className={`-mb-px border-b-2 px-3 py-2 text-label ${currentTab?.id === tab.id ? "border-primary-600 font-semibold text-primary-700" : "border-transparent text-ink-muted hover:text-ink"}`}
                >
                  {tab.name}
                </Link>
              ))}
          </span>
        ))}
      </nav>

      <WithPane pane={pane}>
        {(view === "list" || view === "board") && (
          <ProjectWorkspace
            projectId={project.id}
            layout={view === "board" ? "BOARD" : "LIST"}
            sections={sections.map((section) => ({
              id: section.id,
              name: section.name,
            }))}
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
              isPeriodic: task.isPeriodic,
              approval: task.approval ?? null,
              tags: task.tags.map((tag) => ({ id: tag.id, name: tag.name })),
            }))}
            canEdit={can.edit}
            meId={user.id}
            people={people}
            nowIso={now.toISOString()}
            fields={fields.map((field) => ({
              id: field.id,
              name: field.name,
              kind: field.kind,
              options: field.options,
            }))}
            values={Object.fromEntries([...values].map(([taskId, own]) => [taskId, own]))}
            grid={
              view === "list"
                ? {
                    rows: tasks.map((task) => toGridTask(task, user.id, can.edit)),
                    initial: currentTab ? parseGridConfig(currentTab.config) : { ...DEFAULT_GRID, group: "section" },
                    view: { scope: "PROJECT", scopeId: project.id, canSave: can.edit, current: currentTab ? { id: currentTab.id, name: currentTab.name } : null },
                  }
                : undefined
            }
          />
        )}
        {view === "calendar" && (
          <TaskCalendar
            tasks={tasks.map((task) => ({
              id: task.id,
              title: task.title,
              status: task.status,
              dueAt: task.dueAt?.toISOString() ?? null,
              assigneeId: task.assigneeId,
              isMilestone: task.isMilestone,
            }))}
            month={month}
            todayDay={todayDay}
            canEdit={can.edit}
            meId={user.id}
            projectId={project.id}
            monthHref={`${base}?view=calendar&month=`}
            holidays={await calendarHolidays(undefined, viewer.departmentId)}
          />
        )}
        {view === "timeline" && (
          <Timeline
            hrefFor={links.open}
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
                  {/* Keyed by the status chosen in the header, so choosing another one there selects it here. */}
                  <StatusForm key={typeof query.status === "string" ? query.status : "none"} projectId={project.id} initial={typeof query.status === "string" ? query.status : undefined} />
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
      </WithPane>
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
