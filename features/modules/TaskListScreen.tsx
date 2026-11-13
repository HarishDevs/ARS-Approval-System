import { featureOn } from "@/server/settings/features";
import { ListChecks } from "lucide-react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireArea } from "@/server/authorization/guards";
import { EmptyState, PageHeader } from "@/features/shell/PageHeader";
import { Badge, type Tone } from "@/features/ui/Display";
import { countTasks, hasDirectReports, listTasks } from "@/lib/db/repositories/tasks.repository";
import { listModuleTypes, listTypeVersions } from "@/lib/db/repositories/module-types.repository";
import { listActiveUserOptions } from "@/lib/db/repositories/admin-users.repository";
import { parseTaskFilters, PAGE_SIZES, TASK_SORT_LABEL, TASK_SORTS, TASK_TAB_LABEL, TASK_TABS, taskListSql, taskQuery, type TaskBase } from "@/server/modules/task-lists";
import { isOverdue, TASK_STATUS_LABEL, TASK_STATUSES, type TaskStatus } from "@/server/modules/task-rules";
import { indiaDateTimeText, PRIORITY_LABEL, TASK_PRIORITIES, type TaskPriority } from "@/server/modules/settings";
import { displayValue, OPTION_TYPES, type FormField } from "@/server/forms/fields";
import { ChoicePills, TaskPriorityPill } from "@/features/ui/ChoicePill";
import { choiceValues } from "@/features/modules/RecordParts";
import { isAdminActor } from "@/server/modules/tasks";
import { TaskCheck } from "@/features/work/client";
import { teamOf } from "@/server/work/task-access";
import { ListToolbar } from "@/features/ui/ListToolbar";
import { PersonSelect } from "@/features/ui/PersonSelect";
import { personLabel } from "@/lib/people/label";
import { NoResults } from "@/features/ui/Display";
import { periodicDetails, visibleTaskClause } from "@/lib/db/repositories/work.repository";
import { workViewer } from "@/server/work/task-access";
import { parseRecurrence, recurrenceLabel } from "@/server/work/more-rules";
import { StopRepeatButton } from "@/features/work/MoreParts";

// v1.9.0 (D-143): My tasks / Assigned by me / Team tasks. Filters live in
// the address (GET form), so a list can be bookmarked and shared.
const TITLE: Record<TaskBase, string> = { MINE: "Assigned to me", CREATED: "Assigned by me", TEAM: "Team tasks", PERIODIC: "Periodic tasks" }; // v1.54.3 (owner)
const PATH: Record<TaskBase, string> = { MINE: "/users/tasks", CREATED: "/users/tasks/assigned", TEAM: "/users/tasks/team", PERIODIC: "/users/work/periodic" };
const DESCRIPTION: Record<TaskBase, string> = {
  MINE: "Ad hoc tasks assigned to you. Repeating ones are on Periodic tasks.",
  CREATED: "Ad hoc tasks you created or assigned to someone. Repeating ones are on Periodic tasks.",
  PERIODIC: "Tasks that repeat. When one is completed the next one is made. Make any task periodic from its Repeats box.",
  TEAM: "Tasks of everyone below you in the reporting line, at every level (IT sees everyone's).",
};
export const STATUS_TONE: Record<TaskStatus, Tone> = { OPEN: "info", IN_PROGRESS: "primary", BLOCKED: "warning", COMPLETED: "success", CANCELLED: "neutral" };
export const PRIORITY_TONE: Record<TaskPriority, Tone> = { LOW: "neutral", NORMAL: "neutral", IMPORTANT: "warning", HIGH: "warning", URGENT: "danger" };

export async function TaskListScreen({ base, query }: { base: TaskBase; query: Record<string, string | string[] | undefined> }) {
  const { user } = await requireArea("users");
  if (!(await featureOn("tasks", user))) notFound();
  const filters = parseTaskFilters(query);
  // D-216: Team tasks covers the whole reporting line below the person.
  const viewer = { id: user.id, isAdmin: isAdminActor(user), teamIds: base === "TEAM" && !isAdminActor(user) ? await teamOf(user.id) : undefined };
  const now = new Date();
  const [types, people, manages] = await Promise.all([listModuleTypes("TASK"), listActiveUserOptions(), base === "TEAM" && !viewer.isAdmin ? hasDirectReports(user.id) : Promise.resolve(true)]);
  // Fields marked "searchable" in any version, and the chosen type's listed columns.
  const versions = (await Promise.all(types.map((type) => listTypeVersions(type.id)))).flat();
  const searchable = [...new Set(versions.flatMap((version) => version.form.filter((field) => field.searchable).map((field) => field.key)))];
  const chosen = filters.typeId ? versions.find((version) => version.typeId === filters.typeId && version.status === "PUBLISHED") : undefined;
  const columns: FormField[] = chosen ? chosen.form.filter((field) => field.listed && field.type !== "SECTION").slice(0, 4) : [];

  // v1.54.7 (owner): Periodic tasks uses this list too (tabs, Filter, Sort, Options).
  const visible = base === "PERIODIC" ? visibleTaskClause(await workViewer(user)) : undefined;
  const sql = taskListSql(filters, base, viewer, searchable, now, undefined, visible);
  const [list, counts] = await Promise.all([
    listTasks(sql.where, sql.params, sql.orderBy, filters.size, (filters.page - 1) * filters.size),
    Promise.all(
      TASK_TABS.map(async (tab) => {
        const counted = taskListSql(filters, base, viewer, searchable, now, tab, visible);
        return [tab, await countTasks(counted.where, counted.params)] as const;
      }),
    ),
  ]);
  const repeats = base === "PERIODIC" ? await periodicDetails(list.rows.map((task) => task.id)) : null;
  const pages = Math.max(1, Math.ceil(list.total / filters.size));
  const names = new Map(people.map((person) => [person.id, person.name]));
  const path = PATH[base];

  return (
    <>
      <PageHeader title={TITLE[base]} description={DESCRIPTION[base]} icon={ListChecks}>
        <Link href="/users/tasks/new" className="btn-primary btn-compact">
          New task
        </Link>
      </PageHeader>
      {base === "TEAM" && !manages ? (
        <EmptyState title="Nobody reports to you" body="Team tasks shows the tasks of people whose reporting manager you are." />
      ) : (
        <>
          <nav aria-label="Quick filters" className="mb-3 flex flex-wrap gap-x-1 border-b border-line">
            {counts.map(([tab, count]) => (
              <Link
                key={tab}
                href={`${path}${taskQuery(filters, { tab })}`}
                aria-current={filters.tab === tab ? "page" : undefined}
                className={`-mb-px border-b-2 px-2.5 py-1.5 text-label ${filters.tab === tab ? "border-primary-600 font-semibold text-primary-700" : "border-transparent text-ink-muted hover:text-ink"}`}
              >
                {TASK_TAB_LABEL[tab]} ({count})
              </Link>
            ))}
          </nav>
          <ListToolbar
            id="task-filters"
            path={path}
            label="Filter tasks"
            keep={{ tab: filters.tab !== "open" ? filters.tab : undefined, sort: filters.sort !== "due" ? filters.sort : undefined, size: filters.size !== 25 ? String(filters.size) : undefined }}
            search={{ name: "q", value: filters.q, placeholder: "Number, title or description" }}
            filterCount={[filters.typeId, filters.priorities.length, filters.statuses.length, filters.personId, filters.dueFrom || filters.dueTo, filters.createdFrom || filters.createdTo].filter(Boolean).length}
            clearHref={
              filters.q || filters.typeId || filters.priorities.length || filters.statuses.length || filters.personId || filters.dueFrom || filters.dueTo || filters.createdFrom || filters.createdTo
                ? `${path}${taskQuery({ ...filters, q: "", typeId: null, priorities: [], statuses: [], personId: null, dueFrom: null, dueTo: null, createdFrom: null, createdTo: null })}`
                : null
            }
            filters={
              <>
                <label className="text-label">
                  Type
                  <select name="type" defaultValue={filters.typeId ?? ""} className="field-input h-10">
                    <option value="">Any</option>
                    {types.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="text-label">
                  <label htmlFor="task-person">{base === "MINE" ? "Created by" : "Assigned to"}</label>
                  <PersonSelect
                    id="task-person"
                    name="person"
                    options={people.map((person) => ({ id: person.id, label: personLabel(person), detail: person.departmentName ?? undefined }))}
                    defaultValue={filters.personId ?? null}
                    emptyLabel="Anyone"
                    compact
                  />
                </div>
                <label className="text-label">
                  Priority
                  <select name="priority" defaultValue={filters.priorities[0] ?? ""} className="field-input h-10">
                    <option value="">Any</option>
                    {TASK_PRIORITIES.map((priority) => (
                      <option key={priority} value={priority}>
                        {PRIORITY_LABEL[priority]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-label">
                  Status
                  <select name="status" defaultValue={filters.statuses[0] ?? ""} className="field-input h-10">
                    <option value="">Any</option>
                    {TASK_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {TASK_STATUS_LABEL[status]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-label">
                  Due from
                  <input type="date" name="dueFrom" defaultValue={filters.dueFrom ?? ""} className="field-input h-10" />
                </label>
                <label className="text-label">
                  Due to
                  <input type="date" name="dueTo" defaultValue={filters.dueTo ?? ""} className="field-input h-10" />
                </label>
                <label className="text-label">
                  Created from
                  <input type="date" name="createdFrom" defaultValue={filters.createdFrom ?? ""} className="field-input h-10" />
                </label>
                <label className="text-label">
                  Created to
                  <input type="date" name="createdTo" defaultValue={filters.createdTo ?? ""} className="field-input h-10" />
                </label>
              </>
            }
            sort={{
              label: TASK_SORT_LABEL[filters.sort],
              changed: filters.sort !== "due",
              choices: TASK_SORTS.map((sort) => ({ label: TASK_SORT_LABEL[sort], href: `${path}${taskQuery(filters, { sort })}`, active: filters.sort === sort })),
            }}
            sizes={PAGE_SIZES.map((size) => ({ label: `${size} per page`, href: `${path}${taskQuery(filters, { size })}`, active: filters.size === size }))}
          />
          {list.rows.length === 0 ? (
            filters.q || filters.typeId || filters.priorities.length || filters.statuses.length || filters.personId || filters.dueFrom || filters.dueTo || filters.createdFrom || filters.createdTo ? (
              <NoResults what="tasks" query={filters.q} clearSearchHref={`${path}${taskQuery(filters, { q: "" })}`} resetHref={`${path}${taskQuery({ ...filters, q: "", typeId: null, priorities: [], statuses: [], personId: null, dueFrom: null, dueTo: null, createdFrom: null, createdTo: null })}`} />
            ) : (
              <EmptyState title="No tasks here" body={filters.tab === "open" ? "Nothing open here. Try another tab." : "Nothing in this tab. Try another tab."} />
            )
          ) : (
            <div className="card overflow-x-auto">
              <table className="data-table" data-testid={base === "PERIODIC" ? "periodic-table" : "task-table"}>
                <caption className="sr-only">{TITLE[base]}</caption>
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="sr-only">Done</span>
                    </th>
                    <th scope="col">Task</th>
                    <th scope="col">Type</th>
                    <th scope="col">{base === "MINE" ? "From" : "Assignee"}</th>
                    <th scope="col">Priority</th>
                    <th scope="col">Status</th>
                    <th scope="col">Due</th>
                    {repeats && (
                      <>
                        <th scope="col">Repeats</th>
                        <th scope="col">Done so far</th>
                        <th scope="col">
                          <span className="sr-only">Stop</span>
                        </th>
                      </>
                    )}
                    {columns.map((field) => (
                      <th key={field.key} scope="col">
                        {field.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map((task) => {
                    const late = isOverdue(task, now);
                    return (
                      <tr key={task.id}>
                        <td className="w-8">
                          {/* D-219: tick to complete, as everywhere (only the assignee here). */}
                          <TaskCheck taskId={task.id} done={task.status === "COMPLETED"} disabled={task.assigneeId !== user.id || task.status === "CANCELLED"} label={task.title} />
                        </td>
                        <td>
                          <Link href={`/users/tasks/${task.id}`} className="link font-medium">
                            {task.title}
                          </Link>
                          <p className="font-mono text-caption text-ink-muted">{task.taskNo}</p>
                        </td>
                        <td className="text-label">{task.typeName}</td>
                        <td className="text-label">{base === "MINE" ? task.createdByName : task.assigneeName}</td>
                        <td>
                          <TaskPriorityPill priority={task.priority} showNormal /> {/* v1.47.0: the one priority pill */}
                        </td>
                        <td>
                          <Badge tone={STATUS_TONE[task.status]}>{TASK_STATUS_LABEL[task.status]}</Badge>
                        </td>
                        <td className={`text-label ${late ? "font-semibold text-danger-600" : ""}`}>
                          {task.dueAt ? indiaDateTimeText(task.dueAt) : "—"}
                          {late && <span className="block text-caption">Overdue</span>}
                        </td>
                        {repeats && (
                          <>
                            <td className="text-label">{(() => {
                              const rule = parseRecurrence(repeats.get(task.id)?.rule);
                              return rule ? recurrenceLabel(rule) : "Stopped";
                            })()}</td>
                            <td className="text-label">{repeats.get(task.id)?.doneInSeries ?? 0}</td>
                            <td>{task.status !== "COMPLETED" && task.status !== "CANCELLED" && <StopRepeatButton taskId={task.id} />}</td>
                          </>
                        )}
                        {columns.map((field) => (
                          <td key={field.key} className="text-label">
                            {/* v1.47.0: coloured choice values. */}
                            {OPTION_TYPES.includes(field.type) && field.optionColors ? <ChoicePills values={choiceValues(field, task.formData[field.key])} /> : displayValue(field, task.formData[field.key], names)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {pages > 1 && (
            <nav aria-label="Pages" className="mt-4 flex items-center justify-between text-label">
              {filters.page > 1 ? (
                <Link href={`${path}${taskQuery(filters, { page: filters.page - 1 })}`} className="link">
                  ← Previous
                </Link>
              ) : (
                <span />
              )}
              <span className="text-ink-muted">
                Page {filters.page} of {pages} · {list.total} tasks
              </span>
              {filters.page < pages ? (
                <Link href={`${path}${taskQuery(filters, { page: filters.page + 1 })}`} className="link">
                  Next →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </>
  );
}
