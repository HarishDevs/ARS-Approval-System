import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardList, FilePlus2, FileText, Inbox, ListPlus, MessagesSquare, PenSquare, Search } from "lucide-react";
import { countPendingTasksFor, listAttentionTasksFor, listMyRequests, listPendingTasksFor } from "@/lib/db/repositories/approvals.repository";
import { countTaskItems, listTaskItems } from "@/lib/db/repositories/work.repository";
import { myRequestCounts } from "@/lib/db/repositories/overview.repository";
import { cardFacts } from "@/server/mobile/card-facts";
import { miniRoads } from "@/server/approvals/road-view";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import { ApprovalCard, waitedFor } from "@/features/mobile/ApprovalCard";
import { RequestPriorityBadge } from "@/features/ui/ChoicePill";
import { WAITING_STYLE, REQUEST_STATUS } from "@/features/requests/StatusPill";
import { dueLabel, indiaDayOf, TONE_TEXT } from "@/features/work/format";
import { addDays } from "@/server/work/rules";
import { QuickNewTask } from "@/features/mobile/NewTaskButton";
import { SafeText } from "@/features/ui/SafeText";

const OPEN = "t.status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED')";

// v1.43.0 (owner's mobile brief §3): the mobile Home, personal and short:
// what needs me (attention line, four counts), the first approvals waiting,
// today's tasks, my open requests, and quick actions. Same queries and the
// same access rules as the computer's Home and lists; each block links to
// its full list.
export async function MobileHome({
  user,
  greeting,
  approvals,
  tasks,
  can,
}: {
  user: { id: number };
  greeting: string;
  approvals: boolean;
  tasks: boolean;
  can: { newRequest: boolean; search: boolean; ai: boolean; newRequestHref?: string };
}) {
  const now = new Date();
  const today = indiaDayOf(now);
  const tomorrow = new Date(`${addDays(today, 1)}T00:00:00+05:30`);
  const none = Promise.resolve(null);
  const [queue, waiting, attention, counts, mine, myTasks, tasksOverdue] = await Promise.all([
    approvals ? listPendingTasksFor(user.id, { limit: 3, offset: 0 }) : none,
    approvals ? countPendingTasksFor(user.id) : none,
    approvals ? listAttentionTasksFor(user.id, 1) : none,
    approvals ? myRequestCounts(user.id) : none,
    approvals ? listMyRequests(user.id) : none,
    tasks ? listTaskItems(["t.assignee_id = ?", "t.deleted_at IS NULL", OPEN, "t.due_at < ?"], [user.id, tomorrow], "t.due_at", 5) : none,
    tasks ? countTaskItems(["t.assignee_id = ?", "t.deleted_at IS NULL", OPEN, "t.due_at < ?"], [user.id, now]) : none,
  ]);
  const openMine = (mine ?? []).filter((item) => item.status === "IN_PROGRESS" || item.status === "ON_HOLD" || item.status === "CHANGES_REQUIRED").slice(0, 3);
  // v1.47.0: the facts (and Priority) of the cards and of My requests in progress, in one query.
  const ids = [...(queue ?? []).map((item) => item.requestId), ...openMine.map((item) => item.id)];
  const [facts, roads] = await Promise.all([cardFacts(ids), miniRoads((queue ?? []).map((item) => item.requestId))]);

  const attentionParts = [
    waiting ? `${waiting} approval${waiting === 1 ? "" : "s"} waiting` : null,
    attention?.overdue ? `${attention.overdue} overdue` : null,
    counts?.returned ? `${counts.returned} returned to you` : null,
    tasksOverdue ? `${tasksOverdue} task${tasksOverdue === 1 ? "" : "s"} overdue` : null,
  ].filter(Boolean);

  const kpis = [
    approvals && { label: "Waiting for me", value: waiting ?? 0, href: "/users/approvals?tab=waiting", icon: Inbox, tone: "bg-primary-50 text-primary-700" },
    approvals && { label: "Overdue for me", value: attention?.overdue ?? 0, href: "/users/queue?show=overdue", icon: AlertTriangle, tone: "bg-danger-50 text-danger-600" },
    approvals && { label: "My open requests", value: counts?.open ?? 0, href: "/users/approvals?tab=mine", icon: FileText, tone: "bg-[color:var(--violet-bg)] text-[color:var(--violet-fg)]" },
    approvals && { label: "Returned to me", value: counts?.returned ?? 0, href: "/users/requests?status=CHANGES_REQUIRED", icon: PenSquare, tone: "bg-warning-50 text-warning-600" },
    !approvals && tasks && { label: "Tasks due today", value: myTasks?.items.length ?? 0, href: "/users/work/my-tasks", icon: ClipboardList, tone: "bg-primary-50 text-primary-700" },
    !approvals && tasks && { label: "Tasks overdue", value: tasksOverdue ?? 0, href: "/users/work/my-tasks", icon: AlertTriangle, tone: "bg-danger-50 text-danger-600" },
  ].filter((item): item is Exclude<typeof item, false> => Boolean(item));

  const actions = [
    // v1.48.2 (owner): the custom approval form (the templates list stays under More).
    approvals && can.newRequest && { href: can.newRequestHref ?? "/users/custom", label: "New request", icon: FilePlus2 },
    tasks && { href: "#new-task", label: "New task", icon: ListPlus },
    can.search && { href: "/users/search", label: "Search", icon: Search },
    can.ai && { href: "/users/ai/assistant", label: "Ask AI", icon: MessagesSquare },
  ].filter((item): item is Exclude<typeof item, false> => Boolean(item));

  return (
    <div className="space-y-5" data-testid="mobile-home">
      <section aria-label="Today" className="rounded-2xl bg-[color:var(--m-navy)] p-4 text-white">
        <p className="text-[13px] opacity-80">{greeting}</p>
        <p className="mt-1 text-[18px] font-bold leading-snug" data-testid="m-attention">
          {attentionParts.length ? `Needs you: ${attentionParts.join(" · ")}` : "You're all caught up."}
        </p>
        {approvals && waiting ? (
          <Link href="/users/approvals?tab=waiting" className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white px-4 text-[14px] font-semibold text-[color:var(--m-navy)]">
            Review approvals <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        ) : null}
      </section>

      {kpis.length > 0 && (
        <ul className="grid grid-cols-2 gap-3" data-testid="m-kpis">
          {kpis.map((kpi) => (
            <li key={kpi.label}>
              <Link href={kpi.href} className="mob-card flex min-h-[92px] flex-col justify-between p-3">
                <span aria-hidden="true" className={`grid h-8 w-8 place-items-center rounded-lg ${kpi.tone}`}>
                  <kpi.icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-[22px] font-extrabold leading-tight tabular-nums">{kpi.value.toLocaleString("en-IN")}</span>
                  <span className="block text-[12px] font-semibold text-ink-muted">{kpi.label}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {actions.length > 0 && (
        <section aria-label="Quick actions">
          <ul className="grid grid-cols-4 gap-2">
            {actions.map((action) => (
              <li key={action.href}>
                {action.href === "#new-task" ? (
                  <QuickNewTask />
                ) : (
                <Link href={action.href} className="flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-xl bg-surface p-2 text-center text-[12px] font-semibold shadow-sm">
                  <action.icon aria-hidden="true" className="h-5 w-5 text-[color:var(--m-navy-text)]" />
                  {action.label}
                </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {approvals && (
        <Block title="Waiting for my approval" href="/users/approvals?tab=waiting" more={(waiting ?? 0) > (queue?.length ?? 0) ? `All ${waiting}` : "Open list"}>
          {queue && queue.length > 0 ? (
            <ul className="space-y-3">
              {queue.map((item) => {
                const fact = facts.get(item.requestId);
                return (
                  <li key={`${item.requestId}-${item.taskKey}`}>
                    <ApprovalCard
                      card={{
                        href: `/users/requests/${item.requestId}`,
                        title: item.title,
                        requestNo: item.requestNo,
                        requester: item.requesterName,
                        department: fact?.department,
                        amount: fact?.amount,
                        waiting: waitedFor(item.createdAt, now.getTime()),
                        priority: item.overdue ? { label: "Overdue", tone: "red" } : null,
                        requestPriority: fact?.priority ?? null, // v1.47.0
                        road: roads.get(item.requestId) ?? null,
                        status: item.onHold ? { label: "On hold", className: REQUEST_STATUS.ON_HOLD.style } : { label: item.work ? "Work to do" : "Your decision", className: WAITING_STYLE },
                      }}
                    />
                  </li>
                );
              })}
            </ul>
          ) : (
            <Quiet text="Nothing is waiting for your approval." />
          )}
        </Block>
      )}

      {tasks && (
        <Block title="My tasks today" href="/users/work/my-tasks" more="All tasks">
          {myTasks && myTasks.items.length > 0 ? (
            <ul className="mob-card divide-y divide-line overflow-hidden" data-testid="m-today-tasks">
              {myTasks.items.map((task) => {
                const due = dueLabel(task.dueAt, now, true);
                return (
                  <li key={task.id}>
                    <Link href={`/users/tasks/${task.id}`} className="flex min-h-[56px] items-center gap-3 px-4 py-2">
                      <CheckCircle2 aria-hidden="true" className="h-5 w-5 shrink-0 text-ink-faint" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold">
                          <SafeText text={task.title} />
                        </span>
                        <span className="block text-[12px] text-ink-muted">
                          {task.taskNo}
                          {task.approval ? ` · from ${task.approval.requestNo}` : ""}
                        </span>
                      </span>
                      {due && <span className={`shrink-0 text-[12px] font-semibold ${TONE_TEXT[due.tone]}`}>{due.text}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Quiet text="No tasks due today." />
          )}
        </Block>
      )}

      {approvals && openMine.length > 0 && (
        <Block title="My requests in progress" href="/users/approvals?tab=mine" more="All">
          <ul className="mob-card divide-y divide-line overflow-hidden">
            {openMine.map((item) => (
              <li key={item.id}>
                <Link href={`/users/requests/${item.id}`} className="block px-4 py-3">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[12px] font-semibold text-ink-muted">{item.requestNo}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {facts.get(item.id)?.priority && <RequestPriorityBadge priority={facts.get(item.id)!.priority!} />}
                      <span className={`badge ${REQUEST_STATUS[item.status].style}`}>{REQUEST_STATUS[item.status].label}</span>
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-[15px] font-semibold">
                    <SafeText text={item.title} />
                  </span>
                  <span className="block truncate text-[12px] text-ink-muted">{item.pendingWith ? `With ${item.pendingWith}` : `Submitted ${formatIndiaTime(item.submittedAt)}`}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Block>
      )}
    </div>
  );
}

function Block({ title, href, more, children }: { title: string; href: string; more: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="mob-section-title">{title}</h2>
        <Link href={href} className="min-h-11 content-center text-[13px] font-semibold text-[color:var(--m-navy-text)]">
          {more}
        </Link>
      </div>
      {children}
    </section>
  );
}

function Quiet({ text }: { text: string }) {
  return <p className="mob-card p-4 text-[14px] text-ink-muted">{text}</p>;
}
