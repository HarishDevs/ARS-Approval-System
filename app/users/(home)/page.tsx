import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { displayName } from "@/features/shell/AppShell";
import { MyRequestsTable, QueueTable } from "@/features/requests/lists";
import { PriorityPill } from "@/features/ui/ChoicePill";
import { priorityRecord } from "@/server/approvals/priority-lookup";
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
import { isMobileLayout } from "@/server/ui/layout-mode";
import { MobileHome } from "@/features/mobile/MobileHome";
import { isHiddenHref, navAccess } from "@/server/authorization/page-access";
import { workViewer } from "@/server/work/task-access";
import { TaskHome } from "@/features/work/TaskHome";
import { MyWorkOverview } from "@/features/home/MyWorkOverview";
import { DeleteDraftButton, PeriodPicker, QuietRefresh } from "@/features/home/HomeClient";
import { approvalInsights, isApproverForHome, myRequestCounts } from "@/lib/db/repositories/overview.repository";
import { indiaDayOf } from "@/features/work/format";
import { parsePeriod } from "@/server/work/period";
import { AlertTriangle, ArrowRight, BarChart3, CheckCircle2, Clock3, FileEdit, FilePlus2, FileText, Inbox, Layers, PenSquare, Repeat2 } from "lucide-react";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Home" };

// My Work (S9-11, spec #1): the next thing to do first. Every list uses the
// same access rules as its full page (Waiting for me, My requests) and is
// bounded; each section links to that page.
const RECENT_DAYS = 30;
// D-264 (owner): Home shows one area at a time, Approvals or Task Management,
// chosen at the top (?home=). D-265 (owner): approvers start on Approvals,
// everyone else on Task Management; either can switch.
type HomeFocus = "approvals" | "tasks";

export default async function UsersHome({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { user } = await requireArea("users");
  // D-210: in the Classic view the first screen is the Gateway; the Overview
  // dashboard is one of its entries (?view=overview).
  const query = await searchParams;
  // v1.43.0: phones get the mobile Home (features/mobile/MobileHome.tsx).
  if (await isMobileLayout()) {
    const access = await navAccess(user);
    const open = (href: string) => !isHiddenHref(href, access.hidden);
    const words = displayName(user.name).split(/\s+/);
    return (
      <MobileHome
        user={user}
        greeting={`${greetingFor(new Date())}, ${words.length <= 2 ? words.join(" ") : words[0]}`}
        approvals={hasModule(user, "APPROVAL") && (open("/users/queue") || open("/users/requests"))}
        tasks={(await featureOn("tasks", user).catch(() => false)) && open("/users/work")}
        can={{ newRequest: open("/users/custom") || open("/users/new"), newRequestHref: open("/users/custom") ? "/users/custom" : "/users/new", search: open("/users/search"), ai: (await featureOn("ai", user).catch(() => false)) && open("/users/ai/assistant") }}
      />
    );
  }
  if (query.view !== "overview" && !query.tour && parseWorkspaceView(await getUserSetting(user.id, WORKSPACE_VIEW_SETTING).catch(() => null)) === "CLASSIC") return <ClassicGateway user={user} />;
  // D-236 (owner): Home holds the Task home too, for people who have Tasks
  // and may open its pages.
  const tasksOn = (await featureOn("tasks", user).catch(() => false)) && !isHiddenHref("/users/work", (await navAccess(user)).hidden);
  // D-168: without the Approval module the page offers the person's other modules.
  if (!hasModule(user, "APPROVAL")) {
    const tasks = tasksOn ? (
      <Suspense
        fallback={
          <p className="mt-10 text-label text-ink-muted" role="status">
            Loading your tasks…
          </p>
        }
      >
        <TaskHome user={user} viewer={await workViewer(user)} params={{ tab: query.tab, given: query.given, task: query.task }} basePath="/users" greet={false} />
      </Suspense>
    ) : null;
    return <ModulesHome name={displayName(user.name)} user={user} tasks={tasks} />;
  }
  // A task link (a task, or a tab of the task lists) opens Task Management.
  const asked = query.home === "tasks" || query.home === "approvals" ? query.home : query.task || query.tab || query.given ? "tasks" : null;
  // The tour points at the approval tiles, so it always opens on Approvals.
  const focus: HomeFocus = !tasksOn || query.tour ? "approvals" : (asked ?? ((await isApproverForHome(user.id).catch(() => true)) ? "approvals" : "tasks"));
  const overview = query.view === "overview";
  const name = displayName(user.name);
  const words = name.split(/\s+/);
  const greetingName = words.length <= 2 ? name : words[0];

  if (focus === "tasks") {
    const viewer = await workViewer(user);
    return (
      <MyWorkOverview
        user={user}
        viewer={viewer}
        query={query}
        switcher={<HomeFocusSwitch focus={focus} overview={overview} />}
        others={
          <Suspense
            fallback={
              <p className="mt-6 text-label text-ink-muted" role="status">
                Loading…
              </p>
            }
          >
            <TaskHome user={user} viewer={viewer} params={{ tab: query.tab, given: query.given, home: "tasks" }} basePath="/users" greet={false} part="others" />
          </Suspense>
        }
      />
    );
  }

  const today = indiaDayOf(new Date());
  const period = parsePeriod({ period: query.period, from: query.from, to: query.to }, today, "month");
  const [queue, waiting, attention, mine, drafts, onboarded, recent, insights, counts] = await Promise.all([
    listPendingTasksFor(user.id, { limit: 5, offset: 0 }),
    countPendingTasksFor(user.id),
    listAttentionTasksFor(user.id, 10),
    listMyRequests(user.id),
    listDrafts(user.id, query.drafts === "all" ? 20 : 5),
    hasFlag(user.id, "ONBOARDING_DONE"),
    listRecent({ id: user.id, isAdmin: user.roles.includes("IT_ADMIN") || user.roles.includes("SUPER_ADMIN") }, 5).catch(() => null), // D-233: a failure says so, it isn't "nothing viewed"
    approvalInsights(user.id, period).catch(() => null),
    myRequestCounts(user.id),
  ]);
  const returned = mine.filter((item) => item.status === "CHANGES_REQUIRED");
  const since = Date.now() - RECENT_DAYS * 86_400_000;
  const completed = mine.filter((item) => (item.status === "APPROVED" || item.status === "REJECTED") && item.closedAt && item.closedAt.getTime() >= since).slice(0, 5);
  // v1.47.0 (owner): the Priority pill on every Home widget, one query for them all.
  const priority = await priorityRecord([...queue.map((item) => item.requestId), ...attention.items.map((item) => item.requestId), ...[...returned.slice(0, 5), ...mine.slice(0, 5), ...completed].map((item) => item.id), ...(recent ?? []).map((item) => item.id)], user);
  // D-265: icon, label, what it counts; each opens the page with that list.
  const tiles = [
    { label: "Waiting for me", note: "Requests awaiting your approval", value: waiting, href: "/users/queue", icon: Inbox, tone: "bg-primary-50 text-primary-700", alert: waiting > 0 },
    {
      label: "Overdue for me",
      note: "Your steps past their due time",
      value: attention.overdue,
      href: "/users/queue?show=overdue",
      icon: AlertTriangle,
      tone: "bg-warning-50 text-warning-600",
      alert: attention.overdue > 0,
      danger: true,
    },
    {
      label: "My open requests",
      note: "Raised by you, in progress",
      value: counts.open,
      href: "/users/requests?status=IN_PROGRESS",
      icon: FileText,
      tone: "bg-[color:var(--violet-bg)] text-[color:var(--violet-fg)]",
      alert: false,
    },
    {
      label: "Changes asked of me",
      note: "Returned to you for changes",
      value: counts.returned,
      href: "/users/requests?status=CHANGES_REQUIRED",
      icon: PenSquare,
      tone: "bg-danger-50 text-danger-600",
      alert: counts.returned > 0,
    },
  ];
  const keep = { home: "approvals", ...(overview ? { view: "overview" } : {}) };
  const hours = insights?.avgHours ?? null;

  return (
    <div data-testid="approval-overview">
      <QuietRefresh />
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4" data-tour="page-header">
        <div className="flex min-w-0 items-center gap-3">
          <span className="page-icon grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-700" aria-hidden="true">
            <Layers className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h1 className="text-title font-semibold tracking-tight">Approval Overview</h1>
            <p className="text-label text-ink-muted">Welcome back, {greetingName}. What needs you first, then where your requests are.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {tasksOn && <HomeFocusSwitch focus={focus} overview={overview} />}
          {/* D-206 (owner): New request opens the page where people choose their own approvers. */}
          <Link href="/users/custom" className="btn-primary btn-compact inline-flex items-center gap-1.5">
            <FilePlus2 aria-hidden="true" className="h-4 w-4" /> New request
          </Link>
        </div>
      </header>
      {!onboarded && <FirstUseChecklist hidden={(await navAccess(user)).hidden.has("users.queue") ? ["/users/queue", "/users/delegation"] : []} />}
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4" data-tour="overview-tiles">
        {tiles.map((tile) => (
          <Link key={tile.label} href={tile.href} className="card-link status-card flex items-center gap-3 px-4 py-3">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tile.tone}`} aria-hidden="true">
              <tile.icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-label font-semibold">{tile.label}</span>
              <span className="block text-caption leading-snug text-ink-muted">{tile.note}</span>
            </span>
            <span className={`text-2xl font-bold tabular-nums ${tile.alert ? (tile.danger ? "text-danger-600" : "text-primary-700") : "text-ink"}`}>{tile.value}</span>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <section className="card min-w-0 px-4 py-4 sm:px-5" aria-labelledby="waiting">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 id="waiting" className="text-[calc(17px*var(--text-scale,1))] font-semibold">
                Waiting for me
              </h2>
              {waiting > 0 && (
                <Link href="/users/queue" className="link inline-flex items-center gap-1 text-label">
                  {waiting > 5 ? `All ${waiting}` : "View all"} <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              )}
            </div>
            {queue.length === 0 ? (
              <div className="flex flex-col items-center px-4 py-8 text-center" data-testid="nothing-waiting">
                <span className="relative mb-4 grid h-20 w-20 place-items-center rounded-full bg-primary-50 text-primary-700" aria-hidden="true">
                  <Inbox className="h-10 w-10" />
                  <span className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full bg-success-solid text-on-solid ring-4 ring-[color:var(--color-surface)]">
                    <CheckCircle2 className="h-5 w-5" />
                  </span>
                </span>
                <p className="font-semibold">Nothing waiting for you</p>
                <p className="mt-1 text-label text-ink-muted">Requests that need your approval, and work given to you, appear here.</p>
              </div>
            ) : (
              <QueueTable items={queue} priority={priority} />
            )}
          </section>

          {attention.items.length > 0 && (
            <section className="card min-w-0 px-4 py-4 sm:px-5" aria-labelledby="attention">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="attention" className="text-[calc(17px*var(--text-scale,1))] font-semibold">
                  Due soon or overdue
                </h2>
                <span className="text-label text-ink-muted">
                  {attention.overdue} overdue · {attention.dueSoon} due within 24 hours
                </span>
              </div>
              <QueueTable items={attention.items} priority={priority} />
            </section>
          )}

          {returned.length > 0 && (
            <section className="card min-w-0 px-4 py-4 sm:px-5" aria-labelledby="returned">
              <h2 id="returned" className="mb-3 text-[calc(17px*var(--text-scale,1))] font-semibold">
                Returned to you for changes
              </h2>
              <MyRequestsTable items={returned.slice(0, 5)} priority={priority} />
            </section>
          )}

          <section className="card min-w-0 px-4 py-4 sm:px-5" aria-labelledby="recent-requests">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 id="recent-requests" className="text-[calc(17px*var(--text-scale,1))] font-semibold">
                My recent requests
              </h2>
              {mine.length > 0 && (
                <Link href="/users/requests" className="link inline-flex items-center gap-1 text-label">
                  View all <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              )}
            </div>
            <MyRequestsTable items={mine.slice(0, 5)} priority={priority} />
          </section>

          {completed.length > 0 && (
            <section className="card min-w-0 px-4 py-4 sm:px-5" aria-labelledby="completed">
              <h2 id="completed" className="mb-3 text-[calc(17px*var(--text-scale,1))] font-semibold">
                Finished in the last {RECENT_DAYS} days
              </h2>
              <MyRequestsTable items={completed} priority={priority} />
            </section>
          )}
        </div>

        <div className="min-w-0 space-y-6">
          <section className="card min-w-0 px-4 py-4 sm:px-5" aria-labelledby="drafts">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 id="drafts" className="text-[calc(17px*var(--text-scale,1))] font-semibold">
                Your drafts
              </h2>
              {drafts.length === 5 && query.drafts !== "all" && (
                <Link href={`/users?${new URLSearchParams({ ...keep, drafts: "all" })}`} scroll={false} className="link inline-flex items-center gap-1 text-label">
                  View all <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              )}
            </div>
            {drafts.length === 0 ? (
              <p className="py-3 text-label text-ink-muted">No drafts. A request you start is kept here until you submit it.</p>
            ) : (
              <ul className="space-y-2">
                {drafts.map((draft) => (
                  <li key={draft.key} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
                    <FileEdit aria-hidden="true" className="h-5 w-5 shrink-0 text-primary-700" />
                    <span className="min-w-0 flex-1">
                      <Link href={draft.href} className="link block truncate font-medium">
                        <SafeText text={draft.title} />
                      </Link>
                      <span className="block truncate text-caption text-ink-muted">
                        {draft.typeName} · saved {formatIndiaTime(draft.updatedAt)}
                      </span>
                    </span>
                    <DeleteDraftButton draftKey={draft.key} title={draft.title} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card min-w-0 px-4 py-4 sm:px-5" aria-labelledby="recently-viewed">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 id="recently-viewed" className="text-[calc(17px*var(--text-scale,1))] font-semibold">
                Recently viewed
              </h2>
            </div>
            {recent === null ? (
              <ErrorState variant="inline" body="Recently viewed couldn't be loaded just now. Reload the page to try again." />
            ) : recent.length === 0 ? (
              <p className="py-3 text-label text-ink-muted">Requests you open are listed here.</p>
            ) : (
              <ul className="divide-y divide-line">
                {recent.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 py-2">
                    <FileText aria-hidden="true" className="h-5 w-5 shrink-0 text-primary-700" />
                    <span className="min-w-0 flex-1">
                      <Link href={`/users/requests/${item.id}`} className="link block truncate font-medium">
                        <SafeText text={item.title} />
                      </Link>
                      <span className="flex flex-wrap items-center gap-1.5 text-caption text-ink-muted">
                        {item.requestNo}
                        {priority[item.id] && (
                          <>
                            <span aria-hidden="true">·</span>
                            <PriorityPill priority={priority[item.id]} />
                          </>
                        )}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-caption text-ink-muted">opened {formatIndiaTime(item.viewedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card min-w-0 px-4 py-4 sm:px-5" aria-labelledby="insights" data-testid="quick-insights">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 id="insights" className="flex items-center gap-2 text-[calc(17px*var(--text-scale,1))] font-semibold">
                <BarChart3 aria-hidden="true" className="h-5 w-5 text-primary-700" /> Quick insights
              </h2>
              <PeriodPicker
                value={period.key}
                from={period.fromDay}
                to={period.toDay}
                base={keep}
                label="Insights period"
                options={[
                  ["week", "This week"],
                  ["month", "This month"],
                  ["30d", "Last 30 days"],
                  ["90d", "Last 90 days"],
                ]}
              />
            </div>
            {insights === null ? (
              <ErrorState variant="inline" body="Insights couldn't be worked out just now. Reload the page to try again." />
            ) : (
              <dl className="grid grid-cols-3 divide-x divide-line rounded-lg border border-line">
                <Insight icon={<CheckCircle2 className="h-5 w-5" />} tone="text-success-600" label="Requests raised" value={String(insights.raised)} />
                <Insight icon={<Repeat2 className="h-5 w-5" />} tone="text-primary-700" label="Requests approved" value={String(insights.approved)} />
                <Insight
                  icon={<Clock3 className="h-5 w-5" />}
                  tone="text-[color:var(--violet-fg)]"
                  label="Avg. approval time"
                  value={hours === null ? "N/A" : hours < 1 ? (hours * 60 < 1 ? "< 1 min" : `${Math.round(hours * 60)} min`) : hours < 24 ? `${hours.toFixed(1)} h` : `${(hours / 24).toFixed(1)} d`}
                />
              </dl>
            )}
            {insights && (
              <p className="mt-2 text-caption text-ink-muted">
                {period.label}: {insights.returned} of your requests sent back for changes; you decided {insights.decided} approval step{insights.decided === 1 ? "" : "s"}. Average time is from
                submission to final approval.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Insight({ icon, tone, label, value }: { icon: React.ReactNode; tone: string; label: string; value: string }) {
  return (
    <div className="min-w-0 px-3 py-3">
      <dt className="text-caption text-ink-muted">
        <span className={`mb-1 block ${tone}`} aria-hidden="true">
          {icon}
        </span>
        {label}
      </dt>
      <dd className="text-title font-bold tabular-nums">{value}</dd>
    </div>
  );
}

// D-264: the Approvals / Task Management choice at the top of Home.
// overview: keeps ?view=overview (the Classic view's Overview, not its Gateway).
function HomeFocusSwitch({ focus, overview }: { focus: HomeFocus; overview: boolean }) {
  const options: [HomeFocus, string][] = [
    ["approvals", "Approvals"],
    ["tasks", "Task Management"],
  ];
  return (
    <nav aria-label="Show on Home" className="inline-flex rounded-lg border border-line bg-surface-muted p-0.5" data-testid="home-focus">
      {options.map(([key, label]) => (
        <Link
          key={key}
          href={`/users?${overview ? "view=overview&" : ""}home=${key}`}
          aria-current={focus === key ? "page" : undefined}
          className={`rounded-md px-3 py-1.5 text-label font-medium ${focus === key ? "bg-raised text-primary-700 shadow-card" : "text-ink-muted hover:text-ink"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
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

// v1.43.0: the greeting by the hour in India.
function greetingFor(now: Date): string {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hourCycle: "h23" }).format(now));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}
