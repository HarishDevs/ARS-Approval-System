import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckSquare, FilePen, Plus } from "lucide-react";
import { requireArea } from "@/server/authorization/guards";
import { isHiddenHref, navAccess } from "@/server/authorization/page-access";
import { isMobileLayout } from "@/server/ui/layout-mode";
import { listMyRequests, listPendingTasksFor } from "@/lib/db/repositories/approvals.repository";
import { listDrafts } from "@/lib/db/repositories/drafts.repository";
import { cardFacts } from "@/server/mobile/card-facts";
import { miniRoads } from "@/server/approvals/road-view";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import { ApprovalCard, waitedFor, type ApprovalCardData } from "@/features/mobile/ApprovalCard";
import { REQUEST_STATUS } from "@/features/requests/StatusPill";
import { EmptyState } from "@/features/ui/Display";
import { SafeText } from "@/features/ui/SafeText";

export const metadata: Metadata = { title: "Approvals" };

export const dynamic = "force-dynamic";

// v1.43.0 (owner's mobile brief §4): the mobile Approvals hub. Four tabs on
// the same lists the computer shows (Waiting for me, My requests, Approved,
// Drafts) as cards. On a computer the address opens Waiting for me.
const TABS = [
  { key: "waiting", label: "Waiting for me" },
  { key: "mine", label: "My requests" },
  { key: "approved", label: "Approved" },
  { key: "drafts", label: "Drafts" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const DAY = 24 * 60 * 60 * 1000;

export default async function ApprovalsHub({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { user } = await requireArea("users");
  if (!(await isMobileLayout())) redirect("/users/queue");
  const access = await navAccess(user);
  const canQueue = !isHiddenHref("/users/queue", access.hidden);
  const canMine = !isHiddenHref("/users/requests", access.hidden);
  const asked = (await searchParams).tab;
  const tab: Tab = TABS.some((item) => item.key === asked) ? (asked as Tab) : canQueue ? "waiting" : "mine";
  const tabs = TABS.filter((item) => (item.key === "waiting" ? canQueue : canMine));

  const [waiting, mine, drafts] = await Promise.all([
    canQueue ? listPendingTasksFor(user.id, { limit: 100, offset: 0 }) : Promise.resolve([]),
    canMine ? listMyRequests(user.id) : Promise.resolve([]),
    canMine && tab === "drafts" ? listDrafts(user.id, 50) : Promise.resolve([]),
  ]);
  const now = Date.now();
  const counts: Record<Tab, number | null> = {
    waiting: waiting.length,
    mine: mine.filter((item) => item.status !== "APPROVED").length,
    approved: null,
    drafts: null,
  };

  let cards: ApprovalCardData[] = [];
  if (tab === "waiting") {
    const [facts, roads] = await Promise.all([cardFacts(waiting.map((item) => item.requestId)), miniRoads(waiting.map((item) => item.requestId))]);
    cards = waiting.map((item) => {
      const fact = facts.get(item.requestId);
      const dueSoon = !item.overdue && item.dueAt !== null && item.dueAt.getTime() - now < DAY;
      return {
        href: `/users/requests/${item.requestId}`,
        title: item.title,
        requestNo: item.requestNo,
        requester: item.requesterName,
        department: fact?.department,
        amount: fact?.amount,
        approver: item.forName ? `You, covering ${item.forName}` : `You · ${item.nodeLabel}`,
        submitted: fact?.submittedAt ? formatIndiaTime(fact.submittedAt) : null,
        waiting: waitedFor(item.createdAt, now),
        priority: item.overdue ? { label: "Overdue", tone: "red" } : dueSoon ? { label: "Due soon", tone: "amber" } : null,
        status: item.onHold ? { label: "On hold", className: REQUEST_STATUS.ON_HOLD.style } : { label: item.work ? "Work to do" : "Your decision", className: "bg-primary-50 text-primary-600" },
        road: roads.get(item.requestId) ?? null,
      };
    });
  } else if (tab === "mine" || tab === "approved") {
    const list = mine.filter((item) => (tab === "approved" ? item.status === "APPROVED" : item.status !== "APPROVED"));
    const [facts, roads] = await Promise.all([cardFacts(list.map((item) => item.id)), miniRoads(list.map((item) => item.id))]);
    cards = list.map((item) => {
      const fact = facts.get(item.id);
      const open = item.status === "IN_PROGRESS" || item.status === "ON_HOLD";
      return {
        href: `/users/requests/${item.id}`,
        title: item.title,
        requestNo: item.requestNo,
        type: item.workflowName,
        amount: fact?.amount,
        approver: open ? item.pendingWith : null,
        submitted: formatIndiaTime(item.submittedAt),
        waiting: open ? waitedFor(item.submittedAt, now) : null,
        status: { label: REQUEST_STATUS[item.status].label, className: REQUEST_STATUS[item.status].style },
        road: roads.get(item.id) ?? null,
      };
    });
  }

  return (
    <div className="space-y-4" data-testid="mobile-approvals">
      <div className="flex items-center justify-between gap-3">
        <h1 className="mob-screen-title">Approvals</h1>
        {canMine && !isHiddenHref("/users/new", access.hidden) && (
          <Link href="/users/new" className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[color:var(--m-navy)] px-4 text-[14px] font-semibold text-white">
            <Plus aria-hidden="true" className="h-4 w-4" /> New
          </Link>
        )}
      </div>
      <nav aria-label="Approval lists" className="mob-chips -mx-4 overflow-x-auto px-4">
        <ul className="flex gap-2">
          {tabs.map((item) => {
            const active = item.key === tab;
            const count = counts[item.key];
            return (
              <li key={item.key} className="shrink-0">
                <Link
                  href={`/users/approvals?tab=${item.key}`}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-[14px] font-semibold ${active ? "border-transparent bg-[color:var(--m-navy)] text-white" : "border-line bg-surface text-ink"}`}
                >
                  {item.label}
                  {count ? <span className={`rounded-full px-1.5 text-[12px] ${active ? "bg-white/20" : "bg-surface-muted"}`}>{count}</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {tab === "drafts" ? (
        drafts.length === 0 ? (
          <EmptyState title="No drafts" body="A request you start and leave is kept here for a while." icon={<FilePen className="h-6 w-6" />} />
        ) : (
          <ul className="space-y-3">
            {drafts.map((draft) => (
              <li key={draft.key}>
                <Link href={draft.href} className="mob-card block p-4" data-testid="m-draft-card">
                  <p className="text-[12px] font-semibold text-ink-muted">{draft.typeName}</p>
                  <p className="mt-0.5 text-[16px] font-bold">
                    <SafeText text={draft.title || "Untitled draft"} />
                  </p>
                  <p className="mt-2 text-[13px] text-ink-muted">Saved {formatIndiaTime(draft.updatedAt)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : cards.length === 0 ? (
        <EmptyState
          title={tab === "waiting" ? "Nothing waiting for you" : tab === "approved" ? "Nothing approved yet" : "No open requests"}
          body={tab === "waiting" ? "When someone needs your decision, it shows here and on your phone." : "Requests you raise show here with where they are."}
          icon={<CheckSquare className="h-6 w-6" />}
        />
      ) : (
        <ul className="space-y-3">
          {cards.map((card, index) => (
            <li key={`${card.href}-${index}`}>
              <ApprovalCard card={card} />
            </li>
          ))}
        </ul>
      )}
      {tab !== "drafts" && cards.length >= 100 && (
        <p className="text-center text-[13px] text-ink-muted">Showing the first 100. Use Search to find an older one.</p>
      )}
    </div>
  );
}
