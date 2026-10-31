import type { Metadata } from "next";
import Link from "next/link";
import { requireArea } from "@/server/authorization/guards";
import { EmptyState, PageHeader } from "@/features/shell/PageHeader";
import { NotificationList } from "@/features/shell/NotificationList";
import { countUnreadByCategory, listInbox, type InboxState } from "@/lib/db/repositories/collab.repository";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import { appPath, CATEGORY_LABEL, CATEGORY_SLUG, parseCategory, type NotificationCategory } from "@/server/notifications/categories";
import { PendingLink } from "@/features/ui/PendingLink";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Inbox" };

const PAGE_SIZE = 50;

// D-237 (owner): one Inbox for everything (it was Notifications, P1-44, and
// the Task inbox, D-218). Views by module (v1.9.0, D-146), then Bookmarks and
// Archive. Opening this page marks nothing read; opening a notice marks it.
const VIEWS: { category: NotificationCategory | null; label: string }[] = [
  { category: null, label: "All" },
  { category: "APPROVAL", label: "Approvals" },
  { category: "TASK", label: "Tasks" },
  { category: "INFORMATION", label: "Information" },
  { category: "SYSTEM", label: "System" },
];
const STATES: { state: InboxState; label: string }[] = [
  { state: "bookmarks", label: "Bookmarks" },
  { state: "archive", label: "Archive" },
];
const hrefFor = (category: NotificationCategory | null, state: InboxState = "activity", before?: number, unread = false) => {
  const params = new URLSearchParams();
  if (category) params.set("type", CATEGORY_SLUG[category]);
  if (state !== "activity") params.set("state", state);
  if (unread) params.set("unread", "1");
  if (before) params.set("before", String(before));
  const text = params.toString();
  return `/users/inbox${text ? `?${text}` : ""}`;
};
const chip = (current: boolean) => `rounded-full border px-3 py-1 text-label ${current ? "border-primary-600 bg-primary-50 font-semibold text-primary-700" : "border-line text-ink-muted hover:bg-surface-muted"}`;

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ before?: string; type?: string; state?: string; unread?: string }> }) {
  const { user } = await requireArea("users");
  const query = await searchParams;
  const beforeId = query.before && /^\d+$/.test(query.before) ? Number(query.before) : undefined;
  const category = parseCategory(query.type);
  const state: InboxState = query.state === "bookmarks" || query.state === "archive" ? query.state : "activity";
  const unreadOnly = query.unread === "1";
  const [items, unread] = await Promise.all([listInbox(user.id, PAGE_SIZE, beforeId, undefined, category, state, unreadOnly), countUnreadByCategory(user.id)]);
  const last = items.at(-1);
  const total = Object.values(unread).reduce((sum, count) => sum + count, 0);
  const stateLabel = STATES.find((entry) => entry.state === state)?.label;
  return (
    <>
      <PageHeader
        title={stateLabel ? `Inbox: ${stateLabel}` : category ? `Inbox: ${VIEWS.find((view) => view.category === category)?.label ?? CATEGORY_LABEL[category]}` : "Inbox"}
        description="Everything we've told you, in one place: approvals, tasks, information and system messages. Bookmark what you'll come back to; archive what's done."
      >
        <Link href="/users/notifications/settings" className="btn-secondary btn-compact">
          Notification settings
        </Link>
      </PageHeader>
      <nav aria-label="Notification types" className="mb-4 flex flex-wrap items-center gap-2" data-testid="notification-views">
        {VIEWS.map((view) => {
          const count = view.category ? unread[view.category] : total;
          const current = state === "activity" && view.category === category;
          return (
            <Link key={view.label} href={hrefFor(view.category, "activity", undefined, unreadOnly)} aria-current={current ? "page" : undefined} className={chip(current)}>
              {view.label}
              {count > 0 && <span className="ml-1 tabular-nums">({count} unread)</span>}
            </Link>
          );
        })}
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
        {STATES.map((entry) => (
          <Link key={entry.state} href={hrefFor(category, entry.state)} aria-current={state === entry.state ? "page" : undefined} className={chip(state === entry.state)}>
            {entry.label}
          </Link>
        ))}
        {state === "activity" && (
          <Link href={hrefFor(category, "activity", undefined, !unreadOnly)} className="link ml-auto text-label">
            {unreadOnly ? "Show all" : "Hide the read ones"}
          </Link>
        )}
      </nav>
      {items.length === 0 ? (
        <EmptyState
          title={state === "archive" ? "Nothing archived" : state === "bookmarks" ? "No bookmarks" : unreadOnly ? "You're all caught up" : "Nothing yet"}
          body={
            state !== "activity"
              ? "Use the bookmark and archive buttons beside a notification."
              : category
                ? `No ${CATEGORY_LABEL[category].toLowerCase()} notifications.`
                : "Approvals, tasks, information and comments will show up here."
          }
        />
      ) : (
        <NotificationList
          showMarkAll={state === "activity"}
          manage
          items={items.map((item) => ({
            id: item.id,
            title: item.title,
            message: item.message,
            when: formatIndiaTime(item.createdAt),
            read: item.read,
            path: appPath(item.deepLink),
            type: category ? undefined : CATEGORY_LABEL[item.category],
            bookmarked: item.bookmarked,
            archived: item.archived,
          }))}
        />
      )}
      {(beforeId || (items.length === PAGE_SIZE && last)) && (
        <nav aria-label="Pages" className="mt-4 flex items-center gap-3 text-label">
          {beforeId ? (
            <PendingLink href={hrefFor(category, state, undefined, unreadOnly)} className="btn-secondary btn-compact">
              ← Newest
            </PendingLink>
          ) : null}
          {items.length === PAGE_SIZE && last ? (
            <PendingLink href={hrefFor(category, state, last.id, unreadOnly)} className="btn-secondary btn-compact">
              Older →
            </PendingLink>
          ) : null}
        </nav>
      )}
    </>
  );
}
