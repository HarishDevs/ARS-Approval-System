import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { QueueTable } from "@/features/requests/lists";
import { listPendingTasksFor } from "@/lib/db/repositories/approvals.repository";

export default async function QueuePage() {
  const { user } = await requireArea("users");
  const queue = await listPendingTasksFor(user.id);
  return (
    <>
      <PageHeader title="Waiting for me" description="Every request that needs your decision, oldest first." />
      <QueueTable items={queue} />
    </>
  );
}
