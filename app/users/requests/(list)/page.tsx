import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { columnsFor, RequestListScreen, VIEW_TARGET } from "@/features/requests/RequestListScreen";
import { OwnershipTabs } from "@/features/requests/OwnershipTabs";
import { listExtras } from "@/server/requests/list-extras";
import { ClipboardList, Plus } from "lucide-react";
import { baseTotal, listChoices, listRequests, tabCounts } from "@/lib/db/repositories/request-lists.repository";
import { listViews } from "@/lib/db/repositories/analytics-views.repository";
import { parseListFilters } from "@/server/requests/list-filters";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "My pending requests" };

export const dynamic = "force-dynamic";

// My requests (F-14, v1.7.2): everything I raised, with the full filter set.
export default async function MyRequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user } = await requireArea("users");
  const params = await searchParams;
  // v1.7.2: the old "Shared with me" tab is its own screen now.
  if (params.tab === "shared") redirect("/users/collaborating");
  // D-234 (Default effect): no filters in the address → your default view, as on the other lists.
  if (Object.keys(params).length === 0) {
    const preferred = (await listViews(user.id, "my_requests")).find((view) => view.isDefault && Object.keys(view.query).length > 0);
    if (preferred) redirect(`/users/requests?${new URLSearchParams(preferred.query).toString()}`);
  }
  const filters = parseListFilters(params, "MINE");
  const [result, counts, choices, views, mineTotal, sharedTotal] = await Promise.all([
    listRequests("MINE", user.id, filters),
    tabCounts("MINE", user.id, filters),
    listChoices("MINE", user.id),
    listViews(user.id, "my_requests"),
    baseTotal("MINE", user.id),
    baseTotal("COLLAB", user.id),
  ]);
  const extras = await listExtras(VIEW_TARGET.MINE, columnsFor("MINE"), user.id, result.items, user.roles);
  return (
    <>
      <PageHeader title="My pending requests" meta="Track and manage your approval requests in one place." description="Everything you've raised, with where it is now." icon={ClipboardList}>
        {/* D-206 (owner): New request opens the page where people choose their own approvers. */}
        <Link href="/users/custom" className="btn-primary inline-flex items-center gap-1.5">
          <Plus className="h-4 w-4" aria-hidden="true" /> New request
        </Link>
      </PageHeader>
      <OwnershipTabs current="mine" mine={mineTotal} shared={sharedTotal} />
      <RequestListScreen
        base="MINE"
        path="/users/requests"
        filters={filters}
        result={result}
        counts={counts}
        choices={choices}
        views={views.map((view) => ({ id: view.id, name: view.name, href: `/users/requests?${new URLSearchParams(view.query).toString()}`, mine: view.mine, shared: view.shared, isDefault: view.isDefault, ownerName: view.ownerName }))}
        empty="You haven't raised any requests yet."
        userId={user.id}
        progress={extras.progress}
        priority={extras.priority}
        groupData={extras.groupData}
        columns={extras.columns}
      />
    </>
  );
}
