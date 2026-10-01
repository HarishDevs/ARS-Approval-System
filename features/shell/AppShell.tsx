import Link from "next/link";
import { areasForUser } from "@/server/authorization/policy";
import { SignOutButton } from "@/features/shell/SignOutButton";
import { SideNav, type NavItem } from "@/features/shell/SideNav";
import { countUnread } from "@/lib/db/repositories/collab.repository";
import type { AppArea, AuthenticatedUser } from "@/types/auth";

const AREA_LABEL: Record<AppArea, string> = { users: "My approvals", admin: "Admin", superadmin: "Super Admin" };

export async function AppShell({
  area,
  user,
  nav,
  children,
}: {
  area: AppArea;
  user: AuthenticatedUser;
  nav: NavItem[];
  children: React.ReactNode;
}) {
  const areas = areasForUser(user);
  const unread = await countUnread(user.id).catch(() => 0);
  const initials =
    user.name
      .split(/\s+/)
      .map((part) => part.replace(/[^\p{L}]/gu, "")[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

  return (
    <div className="flex min-h-full">
      <aside className="hidden w-sidebar shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="flex h-topbar items-center border-b border-line px-5">
          {/* eslint-disable-next-line @next/next/no-img-element -- static SVG logo */}
          <img src="/brand/ars-green-steel.svg" alt="ARS Green Steel" className="h-9 w-auto" />
        </div>
        <SideNav items={nav} />
        {areas.length > 1 && (
          <div className="border-t border-line p-3">
            <p className="px-2 pb-2 text-caption font-semibold uppercase tracking-wider text-ink-faint">Switch area</p>
            {areas
              .filter((other) => other !== area)
              .map((other) => (
                <Link key={other} href={`/${other}`} className="block rounded-md px-2 py-1.5 text-label text-ink-muted hover:bg-surface-muted hover:text-ink">
                  {AREA_LABEL[other]}
                </Link>
              ))}
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-topbar items-center justify-between gap-4 border-b border-line bg-surface px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-primary-50 px-3 py-1 text-caption font-semibold text-primary-600">{AREA_LABEL[area]}</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/users/notifications"
              aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
              className="relative flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface-muted hover:text-ink"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.7 21a2 2 0 0 1-3.4 0" />
              </svg>
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-danger-600 px-1 text-center text-[11px] font-semibold leading-[18px] text-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
            <div className="hidden text-right sm:block">
              <p className="text-label font-semibold leading-tight">{user.name}</p>
              <p className="text-caption leading-tight text-ink-muted">{user.email}</p>
            </div>
            <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-600 text-caption font-semibold text-white">
              {initials}
            </span>
            <SignOutButton />
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
