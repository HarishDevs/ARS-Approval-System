import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/features/shell/PageHeader";
import { EmptyState, Pagination } from "@/features/ui/Display";
import { ProjectDot, TaskCheck } from "@/features/work/client";
import { dueLabel, TONE_TEXT } from "@/features/work/format";
import { SaveSearchForm, SavedSearchButtons } from "@/features/work/SearchParts";
import { listSavedSearches, listTags, listTaskItems, listVisibleProjects, WORK_SEARCH_PAGE, workSearchSql } from "@/lib/db/repositories/work.repository";
import { TASK_STATUS_LABEL } from "@/server/modules/task-rules";
import { parseWorkSearch, SEARCH_PRESETS, workSearchQuery } from "@/server/work/rules";
import { peopleOptions, workPage } from "@/server/work/page-context";

export const metadata: Metadata = { title: "Task search" };
export const dynamic = "force-dynamic";

// D-215: every task the person can see (the same rule as everywhere,
// applied in the SQL), by words, number, people, project, tag, dates; with
// built-in and saved searches. D-216: "My team" = the whole reporting line.
export default async function WorkSearchPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { user, viewer } = await workPage();
  const raw = await searchParams;
  const search = parseWorkSearch(raw);
  const now = new Date();
  const sql = workSearchSql(viewer, search, now);
  const [result, projects, tags, people, saved] = await Promise.all([
    listTaskItems(sql.where, sql.params, "t.status IN ('COMPLETED', 'CANCELLED'), t.due_at IS NULL, t.due_at, t.id DESC", WORK_SEARCH_PAGE, (search.page - 1) * WORK_SEARCH_PAGE),
    listVisibleProjects(viewer),
    listTags(),
    peopleOptions(),
    listSavedSearches(user.id),
  ]);
  const { page: _page, ...plain } = workSearchQuery(search);
  void _page;
  const queryText = new URLSearchParams(plain).toString();
  const pages = Math.max(1, Math.ceil(result.total / WORK_SEARCH_PAGE));
  return (
    <>
      <PageHeader title="Task search" description="Every task you can see: yours, ones you follow, your projects' and your team's (everyone below you in the reporting line)." />
      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="space-y-4" aria-label="Searches">
          <section className="card px-4 py-3">
            <h2 className="mb-2 text-label font-semibold">Quick searches</h2>
            <ul className="space-y-1 text-label">
              {SEARCH_PRESETS.map((preset) => (
                <li key={preset.key}>
                  <Link href={`/users/work/search?${new URLSearchParams(preset.query)}`} className="link">
                    {preset.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section className="card px-4 py-3">
            <h2 className="mb-2 text-label font-semibold">Saved searches</h2>
            {saved.length === 0 && <p className="text-caption text-ink-muted">None yet. Search, then save it below the results.</p>}
            <ul className="space-y-1 text-label">
              {saved.map((item) => (
                <li key={item.id} className="flex items-center gap-1">
                  <Link href={`/users/work/search?${item.query}`} className="link min-w-0 flex-1 truncate">
                    {item.name}
                  </Link>
                  <SavedSearchButtons id={item.id} name={item.name} starred={item.starred} />
                </li>
              ))}
            </ul>
          </section>
          <Link href="/users/work/deleted" className="block px-1 text-label link">
            Deleted tasks
          </Link>
        </aside>
        <div className="space-y-4">
          <form action="/users/work/search" className="card grid gap-3 px-4 py-3 md:grid-cols-4" aria-label="Search tasks">
            <div className="md:col-span-4">
              <label htmlFor="ws-q" className="field-label">
                Words or task number
              </label>
              <input id="ws-q" name="q" defaultValue={search.q} className="field-input" placeholder="Title, description, comments or TSK-2026-000123" />
            </div>
            <Select id="ws-status" name="status" label="Status" value={search.status} options={[["open", "Open"], ["completed", "Completed"], ["cancelled", "Cancelled"], ["all", "Any"]]} />
            <Select id="ws-assignee" name="assignee" label="Assigned to" value={search.assignee === null ? "" : String(search.assignee)} options={[["", "Anyone"], ["me", "Me"], ...people.map((person) => [String(person.id), person.label] as [string, string])]} />
            <Select id="ws-created" name="created_by" label="Assigned by" value={search.createdBy === null ? "" : String(search.createdBy)} options={[["", "Anyone"], ["me", "Me"], ...people.map((person) => [String(person.id), person.label] as [string, string])]} />
            <Select id="ws-project" name="project" label="Project" value={search.project === null ? "" : String(search.project)} options={[["", "Any"], ...projects.map((project) => [String(project.id), project.name] as [string, string])]} />
            <Select id="ws-priority" name="priority" label="Priority" value={search.priority ?? ""} options={[["", "Any"], ["URGENT", "Urgent"], ["HIGH", "High"], ["NORMAL", "Normal"], ["LOW", "Low"]]} />
            <Select id="ws-tag" name="tag" label="Tag" value={search.tag === null ? "" : String(search.tag)} options={[["", "Any"], ...tags.map((tag) => [String(tag.id), `#${tag.name}`] as [string, string])]} />
            <div>
              <label htmlFor="ws-from" className="field-label">
                Due from
              </label>
              <input id="ws-from" type="date" name="due_from" defaultValue={search.dueFrom ?? ""} className="field-input" />
            </div>
            <div>
              <label htmlFor="ws-to" className="field-label">
                Due to
              </label>
              <input id="ws-to" type="date" name="due_to" defaultValue={search.dueTo ?? ""} className="field-input" />
            </div>
            <div className="flex flex-wrap items-center gap-4 md:col-span-4">
              <label className="flex items-center gap-1.5 text-label">
                <input type="checkbox" name="team" value="1" defaultChecked={search.team} /> My team (all levels)
              </label>
              <label className="flex items-center gap-1.5 text-label">
                <input type="checkbox" name="followed" value="1" defaultChecked={search.followed} /> I follow
              </label>
              <label className="flex items-center gap-1.5 text-label">
                <input type="checkbox" name="overdue" value="1" defaultChecked={search.overdue} /> Overdue
              </label>
              <button type="submit" className="btn-primary btn-compact ml-auto">
                Search
              </button>
              <Link href="/users/work/search" className="btn-secondary btn-compact">
                Clear
              </Link>
            </div>
          </form>
          <p role="status" className="text-label text-ink-muted">
            {result.total} task{result.total === 1 ? "" : "s"}
          </p>
          {result.items.length === 0 ? (
            <EmptyState title="No tasks match" body="Try fewer filters, or Status: Any." />
          ) : (
            <ul className="card divide-y divide-line" data-testid="work-search-results">
              {result.items.map((task) => {
                const open = ["OPEN", "IN_PROGRESS", "BLOCKED"].includes(task.status);
                const due = dueLabel(task.dueAt, now, open);
                return (
                  <li key={task.id} className="work-row flex flex-wrap items-center gap-2 px-4 py-2" tabIndex={-1}>
                    <TaskCheck taskId={task.id} done={task.status === "COMPLETED"} disabled={task.status === "CANCELLED"} label={task.title} />
                    <Link href={`/users/tasks/${task.id}`} className={`min-w-0 flex-1 truncate text-label hover:underline ${task.status === "COMPLETED" ? "text-ink-muted line-through" : ""}`}>
                      <span className="font-mono text-caption text-ink-muted">{task.taskNo}</span> {task.title}
                    </Link>
                    {task.projects.slice(0, 2).map((project) => (
                      <span key={project.id} className="inline-flex items-center gap-1 text-caption text-ink-muted">
                        <ProjectDot color={project.color} />
                        {project.name}
                      </span>
                    ))}
                    <span className="text-caption text-ink-muted">{task.assigneeName}</span>
                    {!open && <span className="text-caption text-ink-muted">{TASK_STATUS_LABEL[task.status]}</span>}
                    {due && <span className={`text-caption ${TONE_TEXT[due.tone]}`}>{due.text}</span>}
                  </li>
                );
              })}
            </ul>
          )}
          {pages > 1 && <Pagination page={search.page} pages={pages} hrefFor={(page) => `/users/work/search?${new URLSearchParams({ ...plain, page: String(page) })}`} />}
          {queryText && (
            <section className="card px-4 py-3">
              <SaveSearchForm query={queryText} />
            </section>
          )}
        </div>
      </div>
    </>
  );
}

function Select({ id, name, label, value, options }: { id: string; name: string; label: string; value: string; options: [string, string][] }) {
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <select id={id} name={name} defaultValue={value} className="field-input">
        {options.map(([option, text]) => (
          <option key={option} value={option}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}
