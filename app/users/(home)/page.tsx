import type { Metadata } from "next";
import Link from "next/link";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { displayName } from "@/features/shell/AppShell";
import { MyRequestsTable, QueueTable } from "@/features/requests/lists";
import { countPendingTasksFor, listAttentionTasksFor, listMyRequests, listPendingTasksFor } from "@/lib/db/repositories/approvals.repository";
import { listRecent } from "@/lib/db/repositories/recent.repository";
import { ErrorState } from "@/features/ui/States";
import { listDrafts } from "@/lib/db/repositories/drafts.repository";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import { SafeText } from "@/features/ui/SafeText";
import { FirstUseChecklist } from "@/features/help/FirstUseChecklist";
import { hasFlag } from "@/lib/db/repositories/user-flags.repository";
import { hasModule } from "@/server/modules/modules";
import { getUserSetting } from "@/lib/db/repositories/user-settings.repository";
import { parseWorkspaceView, WORKSPACE_VIEW_SETTING } from "@/server/ui/workspace-view";
import { ClassicGateway } from "@/features/shell/ClassicScreens";
import { featureOn } from "@/server/settings/features";
import { isHiddenHref, navAccess } from "@/server/authorization/page-access";
import { workViewer } from "@/server/work/task-access";
import { TaskHome } from "@/features/work/TaskHome";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Home" };

// My Work (S9-11, spec #1): the next thing to do first. Every list uses the
// same access rules as its full page (Waiting for me, My requests) and is
// bounded; each section links to that page.
const RECENT_DAYS = 30;

export default async function UsersHome({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { user } = await requireArea("users");
  // D-210: in the Classic view the first screen is the Gateway; the Overview
  // dashboard is one of its entries (?view=overview).
  const query = await searchParams;
  if (query.view !== "overview" && !query.tour && parseWorkspaceView(await getUserSetting(user.id, WORKSPACE_VIEW_SETTING).catch(() => null)) === "CLASSIC") return <ClassicGateway user={user} />;
  // D-168: everything below is about approvals; without the Approval module
  // the page offers the person's other modules instead.
  // D-236 (owner): Home holds the Task home too (its sections under the
  // approvals), for people who have Tasks and may open its pages.
  const tasks =
    (await featureOn("tasks", user).catch(() => false)) && !isHiddenHref("/users/work", (await navAccess(user)).hidden) ? (
      <TaskHome user={user} viewer={await workViewer(user)} params={{ tab: query.tab, given: query.given, task: query.task }} basePath="/users" greet={false} />
    ) : null;
  if (!hasModule(user, "APPROVAL")) return <ModulesHome name={displayName(user.name)} user={user} tasks={tasks} />;
  const [queue, waiting, attention, mine, drafts, onboarded, recent] = await Promise.all([
    listPendingTasksFor(user.id, { limit: 5, offset: 0 }),
    countPendingTasksFor(user.id),
    listAttentionTasksFor(user.id, 10),
    listMyRequests(user.id),
    listDrafts(user.id, 5),
    hasFlag(user.id, "ONBOARDING_DONE"),
    listRecent({ id: user.id, isAdmin: user.roles.includes("IT_ADMIN") || user.roles.includes("SUPER_ADMIN") }, 5).catch(() => null), // D-233: a failure says so, it isn't "nothing viewed"
  ]);
  const name = displayName(user.name);
  const words = name.split(/\s+/);
  const greetingName = words.length <= 2 ? name : words[0];
  const open = mine.filter((item) => item.status === "IN_PROGRESS" || item.status === "ON_HOLD");
  const returned = mine.filter((item) => item.status === "CHANGES_REQUIRED");
  const since = Date.now() - RECENT_DAYS * 86_400_000;
  const completed = mine.filter((item) => (item.status === "APPROVED" || item.status === "REJECTED") && item.closedAt && item.closedAt.getTime() >= since).slice(0, 5);
  const tiles = [
    { label: "Waiting for me", value: waiting, href: "/users/queue", alert: waiting > 0 },
    { label: "Overdue for me", value: attention.overdue, href: "/users/queue?show=overdue", alert: attention.overdue > 0, danger: true },
    { label: "My open requests", value: open.length, href: "/users/requests?status=IN_PROGRESS", alert: false },
    { label: "Changes asked of me", value: returned.length, href: "/users/requests?status=CHANGES_REQUIRED", alert: returned.length > 0 },
  ];

  return (
    <>
      <PageHeader title={`Welcome back, ${greetingName}`} description="What needs you first, then where your requests are.">
        {/* D-206 (owner): New request opens the page where people choose their own approvers. */}
        <Link href="/users/custom" className="btn-primary btn-compact">
          New request
        </Link>
      </PageHeader>
      {!onboarded && <FirstUseChecklist />}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-tour="overview-tiles">
        {tiles.map((tile) => (
          <Link key={tile.label} href={tile.href} className="card-link flex items-center justify-between px-4 py-3">
            <span className="text-label text-ink-muted">{tile.label}</span>
            <span className={`text-2xl font-bold tabular-nums ${tile.alert ? (tile.danger ? "text-danger-600" : "text-primary-700") : "text-ink"}`}>{tile.value}</span>
          </Link>
        ))}
      </div>

      {attention.items.length > 0 && (
        <section className="mt-8" aria-labelledby="attention">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="attention" className="text-card-title font-semibold">
              Due soon or overdue
            </h2>
            <span className="text-label text-ink-muted">
              {attention.overdue} overdue · {attention.dueSoon} due within 24 hours
            </span>
          </div>
          <QueueTable items={attention.items} />
        </section>
      )}

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-card-title font-semibold">Waiting for me</h2>
          {waiting > 5 && (
            <Link href="/users/queue" className="link text-label">
              All {waiting}
            </Link>
          )}
        </div>
        <QueueTable items={queue} />
      </section>

      {returned.length > 0 && (
        <section className="mt-8" aria-labelledby="returned">
          <h2 id="returned" className="mb-3 text-card-title font-semibold">
            Returned to you for changes
          </h2>
          <MyRequestsTable items={returned.slice(0, 5)} />
        </section>
      )}

      {drafts.length > 0 && (
        <section className="mt-8" aria-labelledby="drafts">
          <h2 id="drafts" className="mb-3 text-card-title font-semibold">
            Your drafts
          </h2>
          <ul className="card divide-y divide-line">
            {drafts.map((draft) => (
              <li key={draft.key} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3">
                <span>
                  <Link href={draft.href} className="link font-medium">
                    <SafeText text={draft.title} />
                  </Link>
                  <span className="text-label text-ink-muted"> · {draft.typeName}</span>
                </span>
                <span className="text-caption text-ink-muted">saved {formatIndiaTime(draft.updatedAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recent === null && (
        <div className="mt-8">
          <ErrorState variant="inline" body="Recently viewed couldn't be loaded just now. Reload the page to try again." />
        </div>
      )}
      {recent && recent.length > 0 && (
        <section className="mt-8" aria-labelledby="recently-viewed">
          <h2 id="recently-viewed" className="mb-3 text-card-title font-semibold">
            Recently viewed
          </h2>
          <ul className="card divide-y divide-line">
            {recent.map((item) => (
              <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3">
                <span className="min-w-0">
                  <Link href={`/users/requests/${item.id}`} className="link font-medium">
                    <SafeText text={item.title} />
                  </Link>
                  <span className="text-label text-ink-muted"> · {item.requestNo}</span>
                </span>
                <span className="text-caption text-ink-muted">opened {formatIndiaTime(item.viewedAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

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

      {completed.length > 0 && (
        <section className="mt-8" aria-labelledby="completed">
          <h2 id="completed" className="mb-3 text-card-title font-semibold">
            Finished in the last {RECENT_DAYS} days
          </h2>
          <MyRequestsTable items={completed} />
        </section>
      )}
      {tasks}
    </>
  );
}

// D-168: Home for someone without the Approval module.
function ModulesHome({ name, user, tasks }: { name: string; user: Parameters<typeof hasModule>[0]; tasks: React.ReactNode }) {
  const links = [
    hasModule(user, "TASK") && { href: "/users/tasks", label: "My tasks", body: "Tasks given to you, and tasks you give others." },
    hasModule(user, "INFORMATION") && { href: "/users/information", label: "Information inbox", body: "Notices and circulars for you." },
    hasModule(user, "AI") && { href: "/users/ai/assistant", label: "AI Assistant", body: "Ask your business analyst." },
    { href: "/users/calendar", label: "Calendar", body: "Your dates and personal entries." },
  ].filter(Boolean) as { href: string; label: string; body: string }[];
  return (
    <>
      <PageHeader title={`Welcome, ${name}`} />
      <ul className="grid gap-3 sm:grid-cols-2" data-testid="modules-home">
        {links.map((link) => (
          <li key={link.href}>
            {/* D-179: what each link opens is its hover text. */}
            <Link href={link.href} title={link.body} className="card-link block px-5 py-4">
              <span className="block font-semibold">{link.label}</span>
            </Link>
          </li>
        ))}
      </ul>
      {tasks}
    </>
  );
}
