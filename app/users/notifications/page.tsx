import Link from "next/link";
import { requireArea } from "@/server/authorization/guards";
import { EmptyState, PageHeader } from "@/features/shell/PageHeader";
import { MarkAllReadButton } from "@/features/shell/MarkAllReadButton";
import { listInbox } from "@/lib/db/repositories/collab.repository";
import { formatIndiaTime } from "@/server/notifications/security-messages";

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

export default async function NotificationsPage() {
  const { user } = await requireArea("users");
  const items = await listInbox(user.id, 50);
  return (
    <>
      <PageHeader title="Notifications" description="Everything we've told you by email or WhatsApp, in one place.">
        {items.some((item) => !item.read) && <MarkAllReadButton />}
      </PageHeader>
      {items.length === 0 ? (
        <EmptyState title="Nothing yet" body="Approvals, decisions and comments will show up here." />
      ) : (
        <ul className="card divide-y divide-line">
          {items.map((item) => {
            const path = appPath(item.deepLink);
            const body = (
              <>
                <p className="flex items-center gap-2 font-medium">
                  {!item.read && <span aria-label="Unread" className="h-2 w-2 rounded-full bg-primary-600" />}
                  {item.title}
                </p>
                <p className="text-label text-ink-muted">{item.message}</p>
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
    </>
  );
}
