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

// Collaborating (v1.7.2): every request someone added me to follow, with
// the full filter set. Only my own collaborations (not removed, not deleted).
export default async function CollaboratingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user } = await requireArea("users");
  const params = await searchParams;
  const views = await listViews(user.id, "collaborating");
  // Opening it with no filters uses your default view, if you have one.
  const defaultView = Object.keys(params).length === 0 ? views.find((view) => view.isDefault && Object.keys(view.query).length > 0) : undefined;
  if (defaultView) redirect(`/users/collaborating?${new URLSearchParams(defaultView.query).toString()}`);
  const filters = parseListFilters(params, "COLLAB");
  const [result, counts, choices] = await Promise.all([listRequests("COLLAB", user.id, filters), tabCounts("COLLAB", user.id, filters), listChoices("COLLAB", user.id)]);
  return (
    <>
      <PageHeader title="Collaborating" description="Requests other people added you to follow. You can see them, comment and add files; you don't approve them." />
      {tabsNav("shared")}
      <RequestListScreen
        base="COLLAB"
        path="/users/collaborating"
        filters={filters}
        result={result}
        counts={counts}
        choices={choices}
        views={views.map((view) => ({ id: view.id, name: view.name, href: `/users/collaborating?${new URLSearchParams(view.query).toString()}`, mine: view.mine, shared: view.shared, isDefault: view.isDefault, ownerName: view.ownerName }))}
        empty="Nobody has added you to a request yet. When they do, it appears here."
      />
    </>
  );
}
