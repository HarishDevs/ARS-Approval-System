import Link from "next/link";
import { requireArea } from "@/server/authorization/guards";
import { ProfileTabs } from "@/features/shell/ProfileTabs";
import { EmptyState, PageHeader } from "@/features/shell/PageHeader";
import { NotificationList } from "@/features/shell/NotificationList";
import { countUnreadByCategory, listInbox } from "@/lib/db/repositories/collab.repository";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import { appPath, CATEGORY_LABEL, CATEGORY_SLUG, parseCategory, type NotificationCategory } from "@/server/notifications/categories";
import { PendingLink } from "@/features/ui/PendingLink";

const PAGE_SIZE = 50;

// In-app inbox (P1-44). v1.9.0 (owner, D-146): views for All, Approvals,
// Tasks, Information (and System messages). Opening this page marks nothing
// read; opening a notification marks that one.
const VIEWS: { category: NotificationCategory | null; label: string }[] = [
  { category: null, label: "All" },
  { category: "APPROVAL", label: "Approvals" },
  { category: "TASK", label: "Tasks" },
  { category: "INFORMATION", label: "Information" },
  { category: "SYSTEM", label: "System" },
];
const hrefFor = (category: NotificationCategory | null, before?: number) => {
  const params = new URLSearchParams();
  if (category) params.set("type", CATEGORY_SLUG[category]);
  if (before) params.set("before", String(before));
  const text = params.toString();
  return `/users/notifications${text ? `?${text}` : ""}`;
};

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ before?: string; type?: string }> }) {
  const { user } = await requireArea("users");
  const query = await searchParams;
  const beforeId = query.before && /^\d+$/.test(query.before) ? Number(query.before) : undefined;
  const category = parseCategory(query.type);
  const [items, unread] = await Promise.all([listInbox(user.id, PAGE_SIZE, beforeId, undefined, category), countUnreadByCategory(user.id)]);
  const last = items.at(-1);
  const total = Object.values(unread).reduce((sum, count) => sum + count, 0);
  return (
    <>
      <PageHeader title={category ? `${CATEGORY_LABEL[category]} notifications` : "Notifications"} description="Everything we've told you by email or WhatsApp, in one place.">
        <span className="flex flex-wrap items-center gap-3">
          <Link href="/users/notifications/settings" className="link text-label">
            Settings
          </Link>
        </span>
      </PageHeader>
      <ProfileTabs />
      <nav aria-label="Notification types" className="mb-4 flex flex-wrap gap-2" data-testid="notification-views">
        {VIEWS.map((view) => {
          const count = view.category ? unread[view.category] : total;
          const current = view.category === category;
          return (
            <Link
              key={view.label}
              href={hrefFor(view.category)}
              aria-current={current ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-label ${current ? "border-primary-600 bg-primary-50 font-semibold text-primary-700" : "border-line text-ink-muted hover:bg-surface-muted"}`}
            >
              {view.label}
              {count > 0 && <span className="ml-1 tabular-nums">({count} unread)</span>}
            </Link>
          );
        })}
      </nav>
      {items.length === 0 ? (
        <EmptyState title="Nothing yet" body={category ? `No ${CATEGORY_LABEL[category].toLowerCase()} notifications.` : "Approvals, tasks, information and comments will show up here."} />
      ) : (
        <NotificationList
          showMarkAll
          items={items.map((item) => ({ id: item.id, title: item.title, message: item.message, when: formatIndiaTime(item.createdAt), read: item.read, path: appPath(item.deepLink), type: category ? undefined : CATEGORY_LABEL[item.category] }))}
        />
      )}
      {(beforeId || (items.length === PAGE_SIZE && last)) && (
        <nav aria-label="Pages" className="mt-4 flex items-center gap-3 text-label">
          {beforeId ? (
            <PendingLink href={hrefFor(category)} className="btn-secondary btn-compact">
              ← Newest
            </PendingLink>
          ) : null}
          {items.length === PAGE_SIZE && last ? (
            <PendingLink href={hrefFor(category, last.id)} className="btn-secondary btn-compact">
              Older →
            </PendingLink>
          ) : null}
        </nav>
      )}
    </>
  );
}
