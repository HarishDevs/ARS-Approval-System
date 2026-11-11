import type { Metadata } from "next";
import { paneLinks, paneTaskId, TaskPane, WithPane } from "@/features/work/TaskPane";
import { TaskGrid } from "@/features/work/TaskGrid";
import { toGridTask } from "@/server/work/grid-rows";
import { DEFAULT_GRID } from "@/server/work/grid";
import Link from "next/link";
import { PageHeader } from "@/features/shell/PageHeader";
import { NoResults, Pagination } from "@/features/ui/Display";
import { SaveSearchForm } from "@/features/work/SearchParts";
import { X } from "lucide-react";
import { listTags, listTaskItems, listVisibleProjects, WORK_SEARCH_PAGE, workSearchSql } from "@/lib/db/repositories/work.repository";
import { parseWorkSearch, workSearchQuery } from "@/server/work/rules";
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
  const [result, projects, tags, people] = await Promise.all([
    listTaskItems(sql.where, sql.params, "t.status IN ('COMPLETED', 'CANCELLED'), t.due_at IS NULL, t.due_at, t.id DESC", WORK_SEARCH_PAGE, (search.page - 1) * WORK_SEARCH_PAGE),
    listVisibleProjects(viewer),
    listTags(),
    peopleOptions(),
  ]);
  const matchingProjects = search.q ? projects.filter((project) => project.name.toLowerCase().includes(search.q.toLowerCase())).length : 0;
  const { page: _page, ...plain } = workSearchQuery(search);
  void _page;
  const queryText = new URLSearchParams(plain).toString();
  const pages = Math.max(1, Math.ceil(result.total / WORK_SEARCH_PAGE));
  // v1.51.1: each criterion of the search as a chip that removes it.
  const without = (change: Partial<typeof search>) => `/users/work/search?${new URLSearchParams(workSearchQuery({ ...search, ...change, page: 1 }))}`;
  const nameOf = (value: number | "me" | null) => (value === "me" ? "me" : (people.find((person) => person.id === value)?.label ?? "someone"));
  const STATUS_TEXT: Record<string, string> = { completed: "Completed", cancelled: "Cancelled", all: "Any status" };
  const PRIORITY_TEXT: Record<string, string> = { URGENT: "Critical", HIGH: "Most Important", IMPORTANT: "Important", NORMAL: "Normal", LOW: "Low" };
  const chips = [
    search.q && { label: `“${search.q}”`, href: without({ q: "" }) },
    search.status !== "open" && { label: STATUS_TEXT[search.status] ?? search.status, href: without({ status: "open" }) },
    search.assignee !== null && { label: `Assigned to ${nameOf(search.assignee)}`, href: without({ assignee: null }) },
    search.createdBy !== null && { label: `Assigned by ${nameOf(search.createdBy)}`, href: without({ createdBy: null }) },
    search.project !== null && { label: `Project: ${projects.find((project) => project.id === search.project)?.name ?? "—"}`, href: without({ project: null }) },
    search.priority && { label: PRIORITY_TEXT[search.priority] ?? search.priority, href: without({ priority: null }) },
    search.tag !== null && { label: `#${tags.find((tag) => tag.id === search.tag)?.name ?? "tag"}`, href: without({ tag: null }) },
    (search.dueFrom || search.dueTo) && { label: `Due ${search.dueFrom ?? "…"} to ${search.dueTo ?? "…"}`, href: without({ dueFrom: null, dueTo: null }) },
    search.followed && { label: "I follow", href: without({ followed: false }) },
    search.overdue && { label: "Overdue", href: without({ overdue: false }) },
    search.team && { label: "My team", href: without({ team: false }) },
    search.kind && { label: search.kind === "periodic" ? "Periodic" : "Ad hoc", href: without({ kind: null }) },
  ].filter((chip): chip is { label: string; href: string } => Boolean(chip));
  // D-219: a task opens in the pane beside the list.
  const links = paneLinks("/users/work/search", raw);
  const paneId = paneTaskId(raw.task);
  const pane = paneId ? <TaskPane taskId={paneId} user={user} closeHref={links.close} /> : null;
  return (
    <>
      <PageHeader title="Search results" description="Tasks you can see that match your search. Search from the bar at the top (Ctrl K); Filters there narrows it.">
        <Link href="/users/work/deleted" className="btn-secondary btn-compact">
          Deleted tasks
        </Link>
      </PageHeader>
      <WithPane pane={pane}>
        {/* v1.51.1 (owner): no search form or side panels here. Searches start
            from the global search bar (Ctrl K, with its Filters and saved
            searches); this page shows what was asked as removable chips, and
            the grid's own toolbar (Filter, Sort, Group, Options) narrows it. */}
        <div className="space-y-4">
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2" data-testid="search-chips" aria-label="What was searched">
              {chips.map((chip) => (
                <Link key={chip.label} href={chip.href} className="tb-pill inline-flex items-center gap-1 px-2.5 py-1 text-label" aria-label={`Remove ${chip.label}`}>
                  {chip.label} <X aria-hidden="true" className="h-3.5 w-3.5" />
                </Link>
              ))}
              <Link href="/users/work/search" className="link text-label">
                Clear all
              </Link>
            </div>
          )}
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
            <NoResults
              what="tasks"
              query={search.q}
              clearSearchHref={`/users/work/search?${new URLSearchParams(workSearchQuery({ ...search, q: "", page: 1 }))}`}
              resetHref="/users/work/search"
              hint={search.q ? undefined : "Try fewer filters, or Status: Any."}
            />
          ) : (
            <TaskGrid
              rows={result.items.map((task) => toGridTask(task, user.id, false))}
              initial={{ ...DEFAULT_GRID, completed: "all" }}
              columns={["assignee", "due", "priority", "projects", "tags", "createdBy", "collaborators"]} // v1.47.0: + Priority
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
      </WithPane>
    </>
  );
}
