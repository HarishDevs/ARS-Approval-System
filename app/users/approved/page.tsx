import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { RequestListScreen, VIEW_TARGET, columnsFor } from "@/features/requests/RequestListScreen";
import { listExtras } from "@/server/requests/list-extras";
import { BadgeCheck } from "lucide-react";
import { listChoices, listRequests, tabCounts } from "@/lib/db/repositories/request-lists.repository";
import { listViews } from "@/lib/db/repositories/analytics-views.repository";
import { parseListFilters } from "@/server/requests/list-filters";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "My approved requests" };

export const dynamic = "force-dynamic";

// v1.8.0: My approved requests - everything I raised that was approved, with validity, amendments and who approved it.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user } = await requireArea("users");
  const params = await searchParams;
  const views = await listViews(user.id, VIEW_TARGET.APPROVED_MINE);
  // Opening it with no filters uses your default view, if you have one.
  const defaultView = Object.keys(params).length === 0 ? views.find((view) => view.isDefault && Object.keys(view.query).length > 0) : undefined;
  if (defaultView) redirect(`/users/approved?${new URLSearchParams(defaultView.query).toString()}`);
  const filters = parseListFilters(params, "APPROVED_MINE");
  const [result, counts, choices] = await Promise.all([listRequests("APPROVED_MINE", user.id, filters), tabCounts("APPROVED_MINE", user.id, filters), listChoices("APPROVED_MINE", user.id)]);
  const extras = await listExtras(VIEW_TARGET.APPROVED_MINE, columnsFor("APPROVED_MINE"), user.id, result.items, user.roles);
  return (
    <>
      <PageHeader title="My approved requests" description="Requests you raised that were fully approved: when, by whom, and whether the approval is still valid." icon={BadgeCheck} />
      <RequestListScreen
        base="APPROVED_MINE"
        path="/users/approved"
        filters={filters}
        result={result}
        counts={counts}
        choices={choices}
        views={views.map((view) => ({ id: view.id, name: view.name, href: `/users/approved?${new URLSearchParams(view.query).toString()}`, mine: view.mine, shared: view.shared, isDefault: view.isDefault, ownerName: view.ownerName }))}
        empty="None of your requests has been approved yet."
        userId={user.id}
        progress={extras.progress}
        priority={extras.priority}
        columns={extras.columns}
      />
    </>
  );
}
