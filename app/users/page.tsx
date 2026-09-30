import Link from "next/link";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { MyRequestsTable, QueueTable } from "@/features/requests/lists";
import { listMyRequests, listPendingTasksFor } from "@/lib/db/repositories/approvals.repository";

export default async function UsersHome() {
  const { user } = await requireArea("users");
  const [queue, mine] = await Promise.all([listPendingTasksFor(user.id), listMyRequests(user.id)]);
  const firstName = user.name.split(/\s+/)[0] ?? user.name;
  const open = mine.filter((item) => item.status === "IN_PROGRESS" || item.status === "ON_HOLD").length;
  const changes = mine.filter((item) => item.status === "CHANGES_REQUIRED").length;

  return (
    <>
      <PageHeader title={`Hello, ${firstName}`} description="Raise requests, follow every level of approval, and act on what's waiting for you.">
        <Link href="/users/new" className="btn-primary btn-compact">
          New request
        </Link>
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Waiting for me", value: queue.length, href: "/users/queue" },
          { label: "My open requests", value: open, href: "/users/requests" },
          { label: "Changes asked of me", value: changes, href: "/users/requests" },
        ].map((stat) => (
          <Link key={stat.label} href={stat.href} className="card block p-5 hover:border-primary-600">
            <p className="text-label text-ink-muted">{stat.label}</p>
            <p className="mt-2 text-display font-bold tabular-nums">{stat.value}</p>
          </Link>
        ))}
      </div>
      <h2 className="mb-3 mt-8 text-card-title font-semibold">Waiting for me</h2>
      <QueueTable items={queue.slice(0, 10)} />
      <h2 className="mb-3 mt-8 text-card-title font-semibold">My recent requests</h2>
      <MyRequestsTable items={mine.slice(0, 10)} />
    </>
  );
}
