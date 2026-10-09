import Link from "next/link";
import { requireArea } from "@/server/authorization/guards";
import { ProfileTabs } from "@/features/shell/ProfileTabs";
import { EmptyState, PageHeader } from "@/features/shell/PageHeader";
import { MarkAllReadButton } from "@/features/shell/MarkAllReadButton";
import { listInbox } from "@/lib/db/repositories/collab.repository";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import { SafeText } from "@/features/ui/SafeText";
import { PendingLink } from "@/features/ui/PendingLink";

const PAGE_SIZE = 50;

// In-app inbox (P1-44). Links are stored as full URLs for email; here they
// open inside the app.
function appPath(link: string | null): string | null {
  if (!link) return null;
  try {
    const url = new URL(link);
    return url.pathname.startsWith("/users/") ? `${url.pathname}${url.search}` : null;
  } catch {
    return null;
  }
}

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  const { user } = await requireArea("users");
  const before = (await searchParams).before;
  const beforeId = before && /^\d+$/.test(before) ? Number(before) : undefined;
  const items = await listInbox(user.id, PAGE_SIZE, beforeId);
  const last = items.at(-1);
  return (
    <>
      <PageHeader title="Notifications" description="Everything we've told you by email or WhatsApp, in one place.">
        <span className="flex flex-wrap items-center gap-3">
          <Link href="/users/notifications/settings" className="link text-label">
            Settings
          </Link>
          {items.some((item) => !item.read) && <MarkAllReadButton />}
        </span>
      </PageHeader>
      <ProfileTabs />
      {items.length === 0 ? (
        <EmptyState title="Nothing yet" body="Approvals, decisions and comments will show up here." />
      ) : (
        <ul className="card divide-y divide-line">
          {items.map((item) => {
            const path = appPath(item.deepLink);
            const body = (
              <>
                <p className="flex items-center gap-2 font-medium">
                  {!item.read && <span className="h-2 w-2 rounded-full bg-primary-600"><span className="sr-only">Unread</span></span>}
                  <SafeText text={item.title} />
                </p>
                <p className="text-label text-ink-muted">
                  <SafeText text={item.message} />
                </p>
                <p className="text-caption text-ink-faint">{formatIndiaTime(item.createdAt)}</p>
              </>
            );
            return (
              <li key={item.id} className={item.read ? "" : "bg-primary-50/40"}>
                {path ? (
                  <Link href={path} className="block px-5 py-3 hover:bg-surface-muted">
                    {body}
                  </Link>
                ) : (
                  <div className="px-5 py-3">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {(beforeId || (items.length === PAGE_SIZE && last)) && (
        <nav aria-label="Pages" className="mt-4 flex items-center gap-3 text-label">
          {beforeId ? (
            <PendingLink href="/users/notifications" className="btn-secondary btn-compact">
              ← Newest
            </PendingLink>
          ) : null}
          {items.length === PAGE_SIZE && last ? (
            <PendingLink href={`/users/notifications?before=${last.id}`} className="btn-secondary btn-compact">
              Older →
            </PendingLink>
          ) : null}
        </nav>
      )}
    </>
  );
}
