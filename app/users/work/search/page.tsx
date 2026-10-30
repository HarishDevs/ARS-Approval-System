import type { Metadata } from "next";
import { paneLinks, paneTaskId, TaskPane, WithPane } from "@/features/work/TaskPane";
import { TaskGrid } from "@/features/work/TaskGrid";
import { toGridTask } from "@/server/work/grid-rows";
import { DEFAULT_GRID } from "@/server/work/grid";
import Link from "next/link";
import { PageHeader } from "@/features/shell/PageHeader";
import { EmptyState, Pagination } from "@/features/ui/Display";
import { SaveSearchForm, SavedSearchButtons } from "@/features/work/SearchParts";
import { listSavedSearches, listTags, listTaskItems, listVisibleProjects, WORK_SEARCH_PAGE, workSearchSql } from "@/lib/db/repositories/work.repository";
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
  const matchingProjects = search.q ? projects.filter((project) => project.name.toLowerCase().includes(search.q.toLowerCase())).length : 0;
  const { page: _page, ...plain } = workSearchQuery(search);
  void _page;
  const queryText = new URLSearchParams(plain).toString();
  const pages = Math.max(1, Math.ceil(result.total / WORK_SEARCH_PAGE));
  // D-219: a task opens in the pane beside the list.
  const links = paneLinks("/users/work/search", raw);
  const paneId = paneTaskId(raw.task);
  const pane = paneId ? <TaskPane taskId={paneId} user={user} closeHref={links.close} /> : null;
  return (
    <>
      <PageHeader title="Search results" description="Every task you can see: yours, ones you follow, your projects' and your team's (everyone below you in the reporting line)." />
      <WithPane pane={pane}>
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
              <Select
                id="ws-status"
                name="status"
                label="Status"
                value={search.status}
                options={[
                  ["open", "Open"],
                  ["completed", "Completed"],
                  ["cancelled", "Cancelled"],
                  ["all", "Any"],
                ]}
              />
              <Select
                id="ws-assignee"
                name="assignee"
                label="Assigned to"
                value={search.assignee === null ? "" : String(search.assignee)}
                options={[["", "Anyone"], ["me", "Me"], ...people.map((person) => [String(person.id), person.label] as [string, string])]}
              />
              <Select
                id="ws-created"
                name="created_by"
                label="Assigned by"
                value={search.createdBy === null ? "" : String(search.createdBy)}
                options={[["", "Anyone"], ["me", "Me"], ...people.map((person) => [String(person.id), person.label] as [string, string])]}
              />
              <Select
                id="ws-project"
                name="project"
                label="Project"
                value={search.project === null ? "" : String(search.project)}
                options={[["", "Any"], ...projects.map((project) => [String(project.id), project.name] as [string, string])]}
              />
              <Select
                id="ws-priority"
                name="priority"
                label="Priority"
                value={search.priority ?? ""}
                options={[
                  ["", "Any"],
                  ["URGENT", "Urgent"],
                  ["HIGH", "High"],
                  ["NORMAL", "Normal"],
                  ["LOW", "Low"],
                ]}
              />
              <Select id="ws-tag" name="tag" label="Tag" value={search.tag === null ? "" : String(search.tag)} options={[["", "Any"], ...tags.map((tag) => [String(tag.id), `#${tag.name}`] as [string, string])]} />
            <Select id="ws-kind" name="kind" label="Periodic or ad hoc" value={search.kind ?? ""} options={[["", "Both"], ["periodic", "Periodic (repeating)"], ["adhoc", "Ad hoc (one-time)"]]} />
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
            {/* D-219 (catalog S-20): Tasks and Projects tabs, then the task grid. */}
            <nav aria-label="Result types" className="flex gap-1 border-b border-line">
              <span aria-current="page" className="-mb-px border-b-2 border-primary-600 px-3 py-1.5 text-label font-semibold text-primary-700">
                Tasks ({result.total > 999 ? "999+" : result.total})
              </span>
              {search.q && (
                <Link href={`/users/work/projects?q=${encodeURIComponent(search.q)}`} className="-mb-px border-b-2 border-transparent px-3 py-1.5 text-label text-ink-muted hover:text-ink">
                  Projects ({matchingProjects})
                </Link>
              )}
            </nav>
            {result.items.length === 0 ? (
              <EmptyState title="No tasks match" body="Try fewer filters, or Status: Any." />
            ) : (
              <TaskGrid
                rows={result.items.map((task) => toGridTask(task, user.id, false))}
                initial={{ ...DEFAULT_GRID, completed: "all" }}
                columns={["assignee", "due", "projects", "tags", "createdBy", "collaborators"]}
                groupsAllowed={["assignee", "createdBy", "project", "due", "priority", "kind"]}
                people={people}
                projects={projects.map((project) => ({ id: project.id, name: project.name }))}
                meId={user.id}
                nowIso={now.toISOString()}
                testId="work-search-results"
              />
            )}
            {pages > 1 && <Pagination page={search.page} pages={pages} hrefFor={(page) => `/users/work/search?${new URLSearchParams({ ...plain, page: String(page) })}`} />}
            {queryText && (
              <section className="card px-4 py-3">
                <SaveSearchForm query={queryText} />
              </section>
            )}
          </div>
        </div>
      </WithPane>
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
