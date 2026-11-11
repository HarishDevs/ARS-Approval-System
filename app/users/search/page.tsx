import type { Metadata } from "next";
import { Search } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { ListToolbar } from "@/features/ui/ListToolbar";
import { NoResults } from "@/features/ui/Display";
import { PendingLink } from "@/features/ui/PendingLink";
import { RequestStatusPill } from "@/features/requests/StatusPill";
import { PriorityPill } from "@/features/ui/ChoicePill";
import { priorityRecord } from "@/server/approvals/priority-lookup";
import { SaveViewForm, SavedViewList } from "@/features/requests/SavedViews";
import { SafeText } from "@/features/ui/SafeText";
import { REQUEST_STATUS_OPTIONS } from "@/features/ui/labels";
import { parseSearchFilters, searchQuery, SEARCH_PAGE_SIZE } from "@/server/search/filters";
import { listSavedViews, searchRequests } from "@/lib/db/repositories/search.repository";
import { listWorkflows } from "@/lib/db/repositories/approvals.repository";
import { listDepartments } from "@/lib/db/repositories/organisation.repository";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import { isMobileLayout } from "@/server/ui/layout-mode";
import { isHiddenHref, navAccess } from "@/server/authorization/page-access";
import { featureOn } from "@/server/settings/features";
import { MobileSearch } from "@/features/mobile/MobileSearch";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Search" };

// Global search (#4, D-109): every request you can see, in one place.
// Access is decided in the SQL (search.repository.ts).
export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { user } = await requireArea("users");
  const isAdmin = user.roles.includes("IT_ADMIN") || user.roles.includes("SUPER_ADMIN");
  const params = await searchParams;
  const views = await listSavedViews(user.id);
  // A default view opens when the page is opened plainly.
  const plain = Object.keys(params).length === 0;
  const defaultView = views.find((view) => view.isDefault);
  if (plain && defaultView && Object.keys(defaultView.query).length) redirect(`/users/search?${new URLSearchParams({ ...defaultView.query, v: String(defaultView.id) })}`);

  // v1.45.0: a phone opens on the Asana-style search screen.
  if (plain && (await isMobileLayout())) {
    const access = await navAccess(user);
    const tasks = await featureOn("tasks", user);
    return <MobileSearch tasks={tasks && !isHiddenHref("/users/work/search", access.hidden)} projects={tasks && !isHiddenHref("/users/work/projects", access.hidden)} />;
  }
  const filters = parseSearchFilters(params);
  const [result, types, departments] = await Promise.all([searchRequests({ id: user.id, isAdmin }, filters), listWorkflows({ kind: "PREDEFINED" }), isAdmin ? listDepartments() : Promise.resolve([])]);
  const pages = Math.max(1, Math.ceil(result.total / SEARCH_PAGE_SIZE));
  // v1.47.0: each result's Priority (one query for the page).
  const priority = await priorityRecord(
    result.items.map((item) => item.id),
    user,
  );
  const link = (page: number) => `/users/search?${new URLSearchParams(searchQuery({ ...filters, page }))}`;
  const query = searchQuery({ ...filters, page: 1 });

  return (
    <>
      <PageHeader
        title="Search"
        icon={Search}
        description={isAdmin ? "Every request (you're IT). Search by number, title or who raised it." : "Every request you raised, approve or covered for. Search by number, title or who raised it."}
      />
      {/* v1.51.1 (owner): the toolbar filters only; searching starts from the bar at the top (Ctrl K). */}
      <ListToolbar
        id="request-search"
        path="/users/search"
        label="Filter requests"
        keep={{}}
        search={{ name: "q", value: filters.q, placeholder: "Number, title or name" }}
        filterCount={[filters.status, filters.role !== "any", filters.typeId, filters.departmentId, filters.from || filters.to, filters.sort !== "newest", filters.overdue].filter(Boolean).length}
        clearHref={plain ? null : "/users/search?clear=1"}
        filters={
          <>
            <div>
              <label htmlFor="s-status" className="field-label">
                Status
              </label>
              <select id="s-status" name="status" defaultValue={filters.status ?? ""} className="field-input h-10">
                {REQUEST_STATUS_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="s-role" className="field-label">
                My part
              </label>
              <select id="s-role" name="role" defaultValue={filters.role} className="field-input h-10">
                <option value="any">Any</option>
                <option value="raised">I raised it</option>
                <option value="approver">I approve or approved it</option>
              </select>
            </div>
            <div>
              <label htmlFor="s-type" className="field-label">
                Approval type
              </label>
              <select id="s-type" name="type" defaultValue={filters.typeId ?? ""} className="field-input h-10">
                <option value="">Any type</option>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </div>
            {isAdmin && (
              <div>
                <label htmlFor="s-dept" className="field-label">
                  Raised by department
                </label>
                <select id="s-dept" name="dept" defaultValue={filters.departmentId ?? ""} className="field-input h-10">
                  <option value="">Any department</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label htmlFor="s-from" className="field-label">
                Raised from
              </label>
              <input id="s-from" name="from" type="date" defaultValue={filters.from ?? ""} className="field-input h-10" />
            </div>
            <div>
              <label htmlFor="s-to" className="field-label">
                to
              </label>
              <input id="s-to" name="to" type="date" defaultValue={filters.to ?? ""} className="field-input h-10" />
            </div>
            <div>
              <label htmlFor="s-sort" className="field-label">
                Order
              </label>
              <select id="s-sort" name="sort" defaultValue={filters.sort} className="field-input h-10">
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="due">Due soonest first</option>
              </select>
            </div>
            <label className="flex items-center gap-2 self-end pb-3 text-label">
              <input type="checkbox" name="overdue" value="1" defaultChecked={filters.overdue} /> Overdue only
            </label>
          </>
        }
      />

      <p role="status" className="mb-2 text-caption text-ink-muted">
        {result.total === 0 ? "No requests match." : `${result.total.toLocaleString("en-IN")} request${result.total === 1 ? "" : "s"}${pages > 1 ? ` · page ${filters.page} of ${pages}` : ""}`}
      </p>
      {result.items.length === 0 ? (
        <NoResults
          what="requests"
          query={filters.q}
          clearSearchHref={`/users/search?${new URLSearchParams(searchQuery({ ...filters, q: "", page: 1 }))}`}
          resetHref="/users/search"
          hint={filters.q ? undefined : "Try another status, or a wider date range."}
        />
      ) : (
        <ul className="card divide-y divide-line">
          {result.items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-start justify-between gap-2 px-5 py-3">
              <div className="min-w-0">
                <Link href={`/users/requests/${item.id}`} className="link font-medium">
                  <SafeText text={item.title} />
                </Link>
                <p className="text-caption text-ink-muted">
                  {item.requestNo} · {item.typeName} · raised by <SafeText text={item.requesterName} /> · {formatIndiaTime(item.submittedAt)}
                </p>
                {item.pendingWith && (
                  <p className="text-caption text-ink-muted">
                    Waiting for <SafeText text={item.pendingWith} />
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {priority[item.id] && <PriorityPill priority={priority[item.id]} />}
                {item.overdue && <span className="badge bg-danger-50 text-danger-600">Overdue</span>}
                <RequestStatusPill status={item.status} validUntil={item.validUntil} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <nav aria-label="Pages" className="mt-4 flex items-center gap-3 text-label">
          {filters.page > 1 ? (
            <PendingLink href={link(filters.page - 1)} className="btn-secondary btn-compact">
              ← Previous
            </PendingLink>
          ) : null}
          {filters.page < pages ? (
            <PendingLink href={link(filters.page + 1)} className="btn-secondary btn-compact">
              Next →
            </PendingLink>
          ) : null}
        </nav>
      )}

      <section className="card mt-8 space-y-4 px-5 py-4" aria-labelledby="views">
        <h2 id="views" className="font-semibold">
          Your saved views
        </h2>
        <SavedViewList
          views={views.map((view) => ({ id: view.id, name: view.name, isDefault: view.isDefault, href: `/users/search?${new URLSearchParams({ ...view.query, v: String(view.id) })}` }))}
        />
        {!plain && <SaveViewForm query={query} />}
      </section>
    </>
  );
}
