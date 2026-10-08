import Link from "next/link";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { displayName } from "@/features/shell/AppShell";
import { MyRequestsTable, QueueTable } from "@/features/requests/lists";
import { listMyRequests, listPendingTasksFor } from "@/lib/db/repositories/approvals.repository";

// Overview of the My approvals space (S9-11): a short greeting, compact KPI
// tiles, then what's waiting and what you raised. Navigation stays in the
// sidebar.
export default async function UsersHome() {
  const { user } = await requireArea("users");
  const [queue, mine] = await Promise.all([listPendingTasksFor(user.id), listMyRequests(user.id)]);
  const name = displayName(user.name);
  const words = name.split(/\s+/);
  const greetingName = words.length <= 2 ? name : words[0];
  const open = mine.filter((item) => item.status === "IN_PROGRESS" || item.status === "ON_HOLD").length;
  const changes = mine.filter((item) => item.status === "CHANGES_REQUIRED").length;
  const tiles = [
    { label: "Waiting for me", value: queue.length, href: "/users/queue", alert: queue.length > 0 },
    { label: "My open requests", value: open, href: "/users/requests?status=IN_PROGRESS", alert: false },
    { label: "Changes asked of me", value: changes, href: "/users/requests?status=CHANGES_REQUIRED", alert: changes > 0 },
  ];

  return (
    <>
      <PageHeader title={`Welcome back, ${greetingName}`} description="What needs your decision, and where your requests are.">
        <Link href="/users/new" className="btn-primary btn-compact">
          New request
        </Link>
      </PageHeader>
      <div className="grid gap-3 sm:grid-cols-3">
        {tiles.map((tile) => (
          <Link key={tile.label} href={tile.href} className="card-link flex items-center justify-between px-4 py-3">
            <span className="text-label text-ink-muted">{tile.label}</span>
            <span className={`text-2xl font-bold tabular-nums ${tile.alert ? "text-primary-700" : "text-ink"}`}>{tile.value}</span>
          </Link>
        ))}
      </div>
      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-card-title font-semibold">Waiting for me</h2>
          {queue.length > 5 && (
            <Link href="/users/queue" className="link text-label">
              All {queue.length}
            </Link>
          )}
        </div>
        <QueueTable items={queue.slice(0, 5)} />
      </section>
      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-card-title font-semibold">My recent requests</h2>
          {mine.length > 5 && (
            <Link href="/users/requests" className="link text-label">
              All requests
            </Link>
          )}
        </div>
        <MyRequestsTable items={mine.slice(0, 5)} />
      </section>
    </>
  );
}
