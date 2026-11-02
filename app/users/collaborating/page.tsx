import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { columnsFor, RequestListScreen, VIEW_TARGET } from "@/features/requests/RequestListScreen";
import { OwnershipTabs } from "@/features/requests/OwnershipTabs";
import { listExtras } from "@/server/requests/list-extras";
import { UsersRound } from "lucide-react";
import { baseTotal, listChoices, listRequests, tabCounts } from "@/lib/db/repositories/request-lists.repository";
import { listViews } from "@/lib/db/repositories/analytics-views.repository";
import { parseListFilters } from "@/server/requests/list-filters";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Collaborating" };

export const dynamic = "force-dynamic";

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
  const [result, counts, choices, mineTotal, sharedTotal] = await Promise.all([listRequests("COLLAB", user.id, filters), tabCounts("COLLAB", user.id, filters), listChoices("COLLAB", user.id), baseTotal("MINE", user.id), baseTotal("COLLAB", user.id)]);
  const extras = await listExtras(VIEW_TARGET.COLLAB, columnsFor("COLLAB"), user.id, result.items, user.roles);
  return (
    <>
      <PageHeader title="Collaborating" meta="Requests shared with you: follow them, comment and add files." description="Requests other people added you to follow. You can see them, comment and add files; you don't approve them." icon={UsersRound} />
      <OwnershipTabs current="shared" mine={mineTotal} shared={sharedTotal} />
      <RequestListScreen
        base="COLLAB"
        path="/users/collaborating"
        filters={filters}
        result={result}
        counts={counts}
        choices={choices}
        views={views.map((view) => ({ id: view.id, name: view.name, href: `/users/collaborating?${new URLSearchParams(view.query).toString()}`, mine: view.mine, shared: view.shared, isDefault: view.isDefault, ownerName: view.ownerName }))}
        empty="Nobody has added you to a request yet. When they do, it appears here."
        userId={user.id}
        progress={extras.progress}
        priority={extras.priority}
        columns={extras.columns}
      />
    </>
  );
}
