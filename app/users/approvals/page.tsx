import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { COMPACT_COOKIE } from "@/lib/ui/layout";
import { CheckCheck, CheckSquare, FilePen, Plane, Plus, Search, Users } from "lucide-react";
import { ADD_CLASS } from "@/features/mobile/dock";
import { CompactToggle, ScreenTitle, SheetLink, ViewDock } from "@/features/mobile/BottomSheet";
import { requireArea } from "@/server/authorization/guards";
import { isHiddenHref, navAccess } from "@/server/authorization/page-access";
import { isMobileLayout } from "@/server/ui/layout-mode";
import { listMyRequests, listPendingTasksFor } from "@/lib/db/repositories/approvals.repository";
import { listDrafts } from "@/lib/db/repositories/drafts.repository";
import { cardFacts } from "@/server/mobile/card-facts";
import { miniRoads } from "@/server/approvals/road-view";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import { ApprovalCard, waitedFor, type ApprovalCardData } from "@/features/mobile/ApprovalCard";
import { WAITING_STYLE, REQUEST_STATUS, requestStatusDisplay } from "@/features/requests/StatusPill";
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
        requestPriority: fact?.priority ?? null, // v1.47.0
        status: item.onHold ? { label: "On hold", className: REQUEST_STATUS.ON_HOLD.style } : { label: item.work ? "Work to do" : "Your decision", className: WAITING_STYLE },
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
        requestPriority: fact?.priority ?? null, // v1.47.0
        // DR-05: an approval past its valid-until date shows as Expired.
        status: { label: requestStatusDisplay(item.status, item.validUntil).label, className: requestStatusDisplay(item.status, item.validUntil).style },
        road: roads.get(item.id) ?? null,
      };
    });
  }

  const compact = (await cookies()).get(COMPACT_COOKIE)?.value === "1";
  const views = tabs.map((item) => ({ href: `/users/approvals?tab=${item.key}`, label: item.label, current: item.key === tab, count: counts[item.key] ?? undefined }));
  const menu = (
    <nav aria-label="More approval pages">
      {canQueue && <SheetLink href="/users/approved-by-me" icon={<CheckCheck className="h-5 w-5" />} label="Approved by me" />}
      {!isHiddenHref("/users/collaborating", access.hidden) && <SheetLink href="/users/collaborating" icon={<Users className="h-5 w-5" />} label="Collaborating" />}
      {!isHiddenHref("/users/search", access.hidden) && <SheetLink href="/users/search" icon={<Search className="h-5 w-5" />} label="Search requests" />}
      {!isHiddenHref("/users/delegation", access.hidden) && <SheetLink href="/users/delegation" icon={<Plane className="h-5 w-5" />} label="Out of office" />}
    </nav>
  );

  // v1.45.0 (owner's Asana screens): big title and … menu; the lists in the
  // floating Choose view, Compact mode in Manage view, + for a new request.
  return (
    <div className="space-y-4 pb-20" data-testid="mobile-approvals">
      <ScreenTitle title="Approvals" menu={menu} menuLabel="More approval pages" />
      <ViewDock
        label="Approval lists"
        views={views}
        manage={<CompactToggle on={compact} />}
        add={
          canMine && !isHiddenHref("/users/new", access.hidden) ? (
            <Link href="/users/new" aria-label="New request" className={ADD_CLASS} data-testid="m-new-request">
              <Plus aria-hidden="true" className="h-6 w-6" strokeWidth={2.5} />
            </Link>
          ) : undefined
        }
      />

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
        <ul className={compact ? "-mx-4 border-t border-line" : "space-y-3"}>
          {cards.map((card, index) => (
            <li key={`${card.href}-${index}`}>
              <ApprovalCard card={card} compact={compact} />
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
