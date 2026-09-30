import Link from "next/link";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { MyRequestsTable } from "@/features/requests/lists";
import { listMyRequests } from "@/lib/db/repositories/approvals.repository";

export default async function MyRequestsPage() {
  const { user } = await requireArea("users");
  const mine = await listMyRequests(user.id);
  return (
    <>
      <PageHeader title="My requests" description="Everything you've raised, with where it is now.">
        <Link href="/users/new" className="btn-primary btn-compact">
          New request
        </Link>
      </PageHeader>
      <MyRequestsTable items={mine} />
    </>
  );
}
