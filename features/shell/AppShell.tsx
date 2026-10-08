import Link from "next/link";
import { areasForUser } from "@/server/authorization/policy";
import { SideNav, type NavItem } from "@/features/shell/SideNav";
import { MobileNav } from "@/features/shell/MobileNav";
import { ProfileMenu } from "@/features/shell/ProfileMenu";
import { countUnread } from "@/lib/db/repositories/collab.repository";
import type { AppArea, AuthenticatedUser } from "@/types/auth";

// The three spaces of the one app (D-034, S9-03: called "spaces" on screen).
export const SPACE_LABEL: Record<AppArea, string> = { users: "My approvals", admin: "Admin", superadmin: "Super Admin" };

// "IT Admin (Super Admin)" → "IT Admin"; "Ravi Kumar (demo)" → "Ravi Kumar".
export function displayName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim() || name;
}

function initialsOf(name: string): string {
  return (
    displayName(name)
      .split(/\s+/)
      .map((part) => part.replace(/[^\p{L}]/gu, "")[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

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
  const spaces = areasForUser(user);
  const unread = await countUnread(user.id).catch(() => 0);

  return (
    <div className="flex min-h-full">
      <aside className="hidden w-sidebar shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="flex h-topbar items-center border-b border-line px-5">
          {/* eslint-disable-next-line @next/next/no-img-element -- static SVG logo */}
          <img src="/brand/ars-green-steel.svg" alt="ARS Green Steel" className="h-9 w-auto" />
        </div>
        <p className="px-6 pt-4 text-caption font-semibold uppercase tracking-wider text-ink-faint">{SPACE_LABEL[area]}</p>
        <SideNav items={nav} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-topbar items-center justify-between gap-4 border-b border-line bg-surface px-4 sm:px-6">
          <MobileNav items={nav} spaceLabel={SPACE_LABEL[area]} />
          <div className="ml-auto flex items-center gap-2">
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
            <ProfileMenu
              name={displayName(user.name)}
              email={user.email}
              initials={initialsOf(user.name)}
              spaceLabel={SPACE_LABEL[area]}
              otherSpaces={spaces.filter((other) => other !== area).map((other) => ({ href: `/${other}`, label: SPACE_LABEL[other] }))}
              unread={unread}
            />
          </div>
        </header>
        {user.isDemo && (
          <p role="status" className="border-b border-warning-600/30 bg-warning-50 px-4 py-2 text-label text-warning-600 sm:px-8">
            You&apos;re trying the app as {user.name}, a demo person. Sign out and sign in again to return to your own account.
          </p>
        )}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-8 sm:py-10">{children}</main>
      </div>
    </div>
  );
}
