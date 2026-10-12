import Link from "next/link";
import { redirect } from "next/navigation";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { RequestListScreen } from "@/features/requests/RequestListScreen";
import { listChoices, listRequests, tabCounts } from "@/lib/db/repositories/request-lists.repository";
import { listViews } from "@/lib/db/repositories/analytics-views.repository";
import { parseListFilters } from "@/server/requests/list-filters";

export const dynamic = "force-dynamic";

const tabsNav = (current: "mine" | "shared") => (
  <nav aria-label="Which requests" className="mb-4 flex gap-2">
    <Link href="/users/requests" aria-current={current === "mine" ? "page" : undefined} className={`rounded-md px-3 py-1.5 text-label ${current === "mine" ? "bg-primary-50 font-semibold text-primary-700" : "text-ink-muted hover:bg-surface-muted"}`}>
      Raised by me
    </Link>
    <Link href="/users/collaborating" aria-current={current === "shared" ? "page" : undefined} className={`rounded-md px-3 py-1.5 text-label ${current === "shared" ? "bg-primary-50 font-semibold text-primary-700" : "text-ink-muted hover:bg-surface-muted"}`}>
      Shared with me
    </Link>
  </nav>
);

// My requests (F-14, v1.7.2): everything I raised, with the full filter set.
export default async function MyRequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user } = await requireArea("users");
  const params = await searchParams;
  // v1.7.2: the old "Shared with me" tab is its own screen now.
  if (params.tab === "shared") redirect("/users/collaborating");
  const filters = parseListFilters(params, "MINE");
  const [result, counts, choices, views] = await Promise.all([listRequests("MINE", user.id, filters), tabCounts("MINE", user.id, filters), listChoices("MINE", user.id), listViews(user.id, "my_requests")]);
  return (
    <>
      <PageHeader title="My requests" description="Everything you've raised, with where it is now.">
        <Link href="/users/new" className="btn-primary btn-compact">
          New request
        </Link>
      </PageHeader>
      {tabsNav("mine")}
      <RequestListScreen
        base="MINE"
        path="/users/requests"
        filters={filters}
        result={result}
        counts={counts}
        choices={choices}
        views={views.map((view) => ({ id: view.id, name: view.name, href: `/users/requests?${new URLSearchParams(view.query).toString()}`, mine: view.mine, shared: view.shared, isDefault: view.isDefault, ownerName: view.ownerName }))}
        empty="You haven't raised any requests yet."
      />
    </>
  );
}
