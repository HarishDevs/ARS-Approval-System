import { redirect } from "next/navigation";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { RequestListScreen, VIEW_TARGET } from "@/features/requests/RequestListScreen";
import { listChoices, listRequests, tabCounts } from "@/lib/db/repositories/request-lists.repository";
import { listViews } from "@/lib/db/repositories/analytics-views.repository";
import { parseListFilters } from "@/server/requests/list-filters";

export const dynamic = "force-dynamic";

// v1.8.0: Approved by me - every request where I approved a step, myself or for someone I cover, and where it is now.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user } = await requireArea("users");
  const params = await searchParams;
  const views = await listViews(user.id, VIEW_TARGET.APPROVED_BY_ME);
  // Opening it with no filters uses your default view, if you have one.
  const defaultView = Object.keys(params).length === 0 ? views.find((view) => view.isDefault && Object.keys(view.query).length > 0) : undefined;
  if (defaultView) redirect(`/users/approved-by-me?${new URLSearchParams(defaultView.query).toString()}`);
  const filters = parseListFilters(params, "APPROVED_BY_ME");
  const [result, counts, choices] = await Promise.all([listRequests("APPROVED_BY_ME", user.id, filters), tabCounts("APPROVED_BY_ME", user.id, filters), listChoices("APPROVED_BY_ME", user.id)]);
  return (
    <>
      <PageHeader title="Approved by me" description="Every request where you approved a step, yourself or for someone you cover, and what happened to it after." />
      <RequestListScreen
        base="APPROVED_BY_ME"
        path="/users/approved-by-me"
        filters={filters}
        result={result}
        counts={counts}
        choices={choices}
        views={views.map((view) => ({ id: view.id, name: view.name, href: `/users/approved-by-me?${new URLSearchParams(view.query).toString()}`, mine: view.mine, shared: view.shared, isDefault: view.isDefault, ownerName: view.ownerName }))}
        empty="You haven't approved anything yet."
      />
    </>
  );
}
