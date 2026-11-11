import type { Metadata } from "next";
import { Inbox } from "lucide-react";
import Link from "next/link";
import { requireArea } from "@/server/authorization/guards";
import { EmptyState, PageHeader } from "@/features/shell/PageHeader";
import { NotificationList } from "@/features/shell/NotificationList";
import { countUnreadByCategory, listInbox, type InboxState } from "@/lib/db/repositories/collab.repository";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import { appPath, CATEGORY_LABEL, CATEGORY_SLUG, parseCategory, type NotificationCategory } from "@/server/notifications/categories";
import { PendingLink } from "@/features/ui/PendingLink";
import { isMobileLayout } from "@/server/ui/layout-mode";
import { Check, Settings, Smartphone } from "lucide-react";
import { ScreenTitle, SheetChoices, SheetLink, ViewDock } from "@/features/mobile/BottomSheet";

// v1.45.0: the phone's day groups and times ("Today", "Today at 12:45 am").
const IST_DAY = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(date);
const IST_TIME = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true });
const IST_DATE = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
function phoneDay(date: Date, now = new Date()): string {
  const day = IST_DAY(date);
  if (day === IST_DAY(now)) return "Today";
  if (day === IST_DAY(new Date(now.getTime() - 86_400_000))) return "Yesterday";
  return IST_DATE.format(date);
}
function phoneWhen(date: Date): string {
  const day = phoneDay(date);
  return `${day === "Today" || day === "Yesterday" ? day : IST_DATE.format(date)} at ${IST_TIME.format(date)}`;
}

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
  { category: "MEETING", label: "Meetings" },
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

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ before?: string; type?: string; state?: string; unread?: string; mentions?: string }> }) {
  const { user } = await requireArea("users");
  const query = await searchParams;
  const beforeId = query.before && /^\d+$/.test(query.before) ? Number(query.before) : undefined;
  const category = parseCategory(query.type);
  const state: InboxState = query.state === "bookmarks" || query.state === "archive" ? query.state : "activity";
  const unreadOnly = query.unread === "1";
  // v1.43.0: on a phone, tabs All, Approvals, Tasks, Information, Mentions.
  const mobile = await isMobileLayout();
  const mentions = mobile && query.mentions === "1";
  const [items, unread] = await Promise.all([listInbox(user.id, PAGE_SIZE, beforeId, undefined, mentions ? null : category, state, unreadOnly, mentions), countUnreadByCategory(user.id)]);
  const last = items.at(-1);
  const total = Object.values(unread).reduce((sum, count) => sum + count, 0);
  const stateLabel = STATES.find((entry) => entry.state === state)?.label;
  const list =
    items.length === 0 ? (
      <EmptyState
        title={state === "archive" ? "Nothing archived" : state === "bookmarks" ? "No bookmarks" : mentions ? "No mentions" : unreadOnly ? "You're all caught up" : "Nothing yet"}
        body={
          state !== "activity"
            ? "Use the bookmark and archive buttons beside a notification."
            : mentions
              ? "When someone mentions you on a request or a task, it shows here."
              : category
                ? `No ${CATEGORY_LABEL[category].toLowerCase()} notifications.`
                : "Approvals, tasks, information and comments will show up here."
        }
      />
    ) : (
      <NotificationList
        showMarkAll={state === "activity" && !mentions}
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
    );
  const pages = (beforeId || (items.length === PAGE_SIZE && last)) && (
    <nav aria-label="Pages" className="mt-4 flex items-center gap-3 text-label">
      {beforeId ? (
        <PendingLink href={mentions ? "/users/inbox?mentions=1" : hrefFor(category, state, undefined, unreadOnly)} className="btn-secondary btn-compact">
          ← Newest
        </PendingLink>
      ) : null}
      {items.length === PAGE_SIZE && last ? (
        <PendingLink href={mentions ? `/users/inbox?mentions=1&before=${last.id}` : hrefFor(category, state, last.id, unreadOnly)} className="btn-secondary btn-compact">
          Older →
        </PendingLink>
      ) : null}
    </nav>
  );

  if (mobile) {
    // v1.45.0 (owner's Asana screens): one list grouped by day; Choose view
    // (All activity, Bookmarks, Archived) and Manage view (filters, read
    // status, sort) in the floating switcher; settings in the … menu.
    const mobileHref = (next: { category?: NotificationCategory | null; state?: InboxState; unread?: boolean; mentions?: boolean }) => {
      if (next.mentions ?? mentions) return "/users/inbox?mentions=1";
      return hrefFor(next.category === undefined ? category : next.category, next.state ?? state, undefined, next.unread ?? unreadOnly);
    };
    const filters = [
      ...VIEWS.map((view) => ({
        href: mobileHref({ category: view.category, mentions: false }),
        label: view.category ? view.label : "Everything",
        current: !mentions && view.category === category,
        count: view.category ? unread[view.category] : total,
      })),
      { href: "/users/inbox?mentions=1", label: "@Mentioned", current: mentions },
    ];
    const manage = (
      <div>
        <p className="pt-2 text-[13px] font-semibold uppercase tracking-wide text-ink-muted">Filters</p>
        <SheetChoices label="Show" items={filters} />
        {!mentions && (
          <>
            <p className="pt-4 text-[13px] font-semibold uppercase tracking-wide text-ink-muted">Read status</p>
            <SheetChoices
              label="Read status"
              items={[
                { href: mobileHref({ unread: false }), label: "Read and unread", current: !unreadOnly },
                { href: mobileHref({ unread: true }), label: "Unread only", current: unreadOnly },
              ]}
            />
          </>
        )}
        <p className="pt-4 text-[13px] font-semibold uppercase tracking-wide text-ink-muted">Sort</p>
        <p className="flex min-h-[56px] items-center gap-3 text-[16px]">
          <span className="min-w-0 flex-1">
            Newest
            <span className="block text-[13px] text-ink-muted">See recent notifications first</span>
          </span>
          <Check aria-hidden="true" className="h-5 w-5 text-[color:var(--brand-accent-text)]" />
        </p>
      </div>
    );
    const menu = (
      <nav aria-label="Inbox options">
        <SheetLink href="/users/notifications/settings" icon={<Settings className="h-5 w-5" />} label="Notification settings" />
        <SheetLink href="/users/profile/devices" icon={<Smartphone className="h-5 w-5" />} label="Phone notifications" />
      </nav>
    );
    const views = [
      { href: mobileHref({ state: "activity", mentions: false }), label: "All activity", current: state === "activity" },
      { href: hrefFor(null, "bookmarks"), label: "Bookmarks", current: state === "bookmarks" },
      { href: hrefFor(null, "archive"), label: "Archived", current: state === "archive" },
    ];
    const filterNote = mentions ? "@Mentioned" : [category ? VIEWS.find((view) => view.category === category)?.label : null, unreadOnly ? "Unread only" : null].filter(Boolean).join(" · ");
    return (
      <div className="pb-20" data-testid="mobile-inbox">
        <ScreenTitle title={stateLabel === "Archive" ? "Archived" : (stateLabel ?? "Inbox")} menu={menu} menuLabel="Inbox options" />
        {filterNote && (
          <p className="pt-3 text-[14px] text-ink-muted" data-testid="m-inbox-filter">
            Showing: {filterNote} ·{" "}
            <Link href={state === "activity" ? "/users/inbox" : hrefFor(null, state)} className="font-semibold text-[color:var(--m-navy-text)]">
              Clear
            </Link>
          </p>
        )}
        {items.length === 0 ? (
          <div className="pt-4">{list}</div>
        ) : (
          <NotificationList
            variant="mobile"
            showMarkAll={state === "activity" && !mentions}
            manage
            items={items.map((item) => ({
              id: item.id,
              title: item.title,
              message: item.message,
              when: phoneWhen(item.createdAt),
              day: phoneDay(item.createdAt),
              read: item.read,
              path: appPath(item.deepLink),
              type: CATEGORY_LABEL[item.category],
              bookmarked: item.bookmarked,
              archived: item.archived,
            }))}
          />
        )}
        {pages}
        <ViewDock label="Inbox views" views={views} manage={manage} />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        icon={Inbox}
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
      {list}
      {pages}
    </>
  );
}
