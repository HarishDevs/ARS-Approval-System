import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/features/shell/PageHeader";
import { EmptyState } from "@/features/ui/Display";
import { InboxList } from "@/features/work/MoreParts";
import { listInbox, type InboxTab } from "@/lib/db/repositories/work.repository";
import { indiaDateTimeText } from "@/server/modules/settings";
import { workPage } from "@/server/work/page-context";
import { dayText, indiaDayOf } from "@/features/work/format";

export const metadata: Metadata = { title: "Task inbox" };
export const dynamic = "force-dynamic";

const TABS: { key: InboxTab; label: string }[] = [
  { key: "activity", label: "Activity" },
  { key: "bookmarks", label: "Bookmarks" },
  { key: "archive", label: "Archive" },
];

// D-218: the task notifications (assigned, mentioned, comments, changes,
// project news, the morning summary) with read, bookmark and archive.
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ tab?: string; unread?: string }> }) {
  const { user } = await workPage();
  const params = await searchParams;
  const tab: InboxTab = params.tab === "bookmarks" || params.tab === "archive" ? params.tab : "activity";
  const unread = params.unread === "1";
  const items = await listInbox(user.id, tab, unread);
  return (
    <>
      <div className="mx-auto max-w-[700px]">
      <PageHeader title="Inbox" description="Everything about your tasks and projects. Archive what's done; bookmark what you'll come back to.">
        <Link href="/users/notifications/settings" className="btn-secondary btn-compact">
          Manage notifications
        </Link>
      </PageHeader>
      <div className="mb-3 flex flex-wrap items-center gap-1">
        {TABS.map((item) => (
          <Link key={item.key} href={`/users/work/inbox${item.key === "activity" ? "" : `?tab=${item.key}`}`} aria-current={tab === item.key ? "page" : undefined} className={`rounded-md px-3 py-1.5 text-label ${tab === item.key ? "bg-primary-50 font-semibold text-primary-700" : "text-ink-muted hover:bg-surface-muted"}`}>
            {item.label}
          </Link>
        ))}
        <Link href={`/users/work/inbox?${new URLSearchParams({ ...(tab !== "activity" ? { tab } : {}), ...(unread ? {} : { unread: "1" }) })}`} className="ml-auto text-label link">
          {unread ? "Show all" : "Only unread"}
        </Link>
      </div>
      {items.length === 0 ? (
        <EmptyState
          title={tab === "archive" ? "Nothing archived" : tab === "bookmarks" ? "No bookmarks" : "You're all caught up"}
          body="Task news appears here: assignments, mentions, comments, changes and project updates."
          action={
            tab !== "activity" ? (
              <Link href="/users/work/inbox" className="btn-secondary btn-compact">
                Back to Activity
              </Link>
            ) : undefined
          }
        />
      ) : (
        <InboxList
          tab={tab}
          items={items.map((item) => ({ id: item.id, title: item.title, message: item.message, link: item.link, when: indiaDateTimeText(item.createdAt), day: dayText(indiaDayOf(item.createdAt), indiaDayOf(new Date())), read: item.readAt !== null, archived: item.archivedAt !== null, bookmarked: item.bookmarkedAt !== null }))}
        />
      )}
      </div>
    </>
  );
}
