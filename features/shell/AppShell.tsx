import Link from "next/link";
import { areasForUser } from "@/server/authorization/policy";
import { SideNav, type NavItem } from "@/features/shell/SideNav";
import { MobileNav } from "@/features/shell/MobileNav";
import { ProfileMenu } from "@/features/shell/ProfileMenu";
import { countUnread } from "@/lib/db/repositories/collab.repository";
import { getUserSetting } from "@/lib/db/repositories/user-settings.repository";
import { ThemeSync } from "@/features/shell/ThemeControls";
import { OfflineBanner, SessionWatch } from "@/features/shell/SessionWatch";
import { BottomNav } from "@/features/shell/BottomNav";
import { CommandPalette, type PaletteLink } from "@/features/shell/CommandPalette";
import { countPendingTasksFor } from "@/lib/db/repositories/approvals.repository";
import { THEME_SETTING, parseTheme } from "@/server/ui/theme";
import { Bell } from "lucide-react";
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
  const [unread, theme, waiting] = await Promise.all([
    countUnread(user.id).catch(() => 0),
    getUserSetting(user.id, THEME_SETTING).catch(() => null),
    countPendingTasksFor(user.id).catch(() => 0),
  ]);
  // WS-03: everywhere the person can go, for the command palette.
  const userPages: PaletteLink[] = [
    { href: "/users", label: "My work", group: "My approvals" },
    { href: "/users/queue", label: "Waiting for me", group: "My approvals" },
    { href: "/users/requests", label: "My requests", group: "My approvals" },
    { href: "/users/new", label: "New request", group: "My approvals" },
    { href: "/users/custom", label: "Custom approval", group: "My approvals" },
    { href: "/users/search", label: "Search requests", group: "My approvals" },
    { href: "/users/analytics", label: "Analytics", group: "My approvals" },
    { href: "/users/notifications", label: "Notifications", group: "Profile" },
    { href: "/users/notifications/settings", label: "Notification settings", group: "Profile" },
    { href: "/users/delegation", label: "Out of office", group: "Profile" },
    { href: "/users/security", label: "Sign-in & devices", group: "Profile" },
    { href: "/users/profile", label: "Profile and theme", group: "Profile" },
    { href: "/users/help", label: "Help", group: "My approvals" },
  ];
  const palettePages: PaletteLink[] = [
    ...(area === "users" ? [] : nav.map((item) => ({ href: item.href, label: item.label, group: SPACE_LABEL[area] }))),
    ...userPages,
    ...spaces.filter((other) => other !== area && other !== "users").map((other) => ({ href: `/${other}`, label: `${SPACE_LABEL[other]} space`, group: "Spaces" })),
  ];
  // The "Waiting for me" entry shows the real count (RA-01).
  const items = nav.map((item) => (item.href === "/users/queue" ? { ...item, count: waiting } : item));

  return (
    <div className="flex min-h-full">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {theme && <ThemeSync theme={parseTheme(theme)} />}
      <aside className="hidden w-sidebar shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="flex h-topbar items-center border-b border-line px-5">
          {/* eslint-disable-next-line @next/next/no-img-element -- static SVG logo */}
          <img src="/brand/ars-green-steel.svg" alt="ARS Green Steel" className="h-9 w-auto" />
        </div>
        <p className="px-6 pt-4 text-caption font-semibold uppercase tracking-wider text-ink-faint">{SPACE_LABEL[area]}</p>
        <SideNav items={items} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-header flex h-topbar items-center justify-between gap-4 border-b border-line bg-surface px-4 sm:px-6">
          <MobileNav items={items} spaceLabel={SPACE_LABEL[area]} />
          <div className="ml-auto flex items-center gap-2">
            <CommandPalette pages={palettePages} />
            <Link
              href="/users/notifications"
              aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
              className="relative flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface-muted hover:text-ink"
            >
              <Bell aria-hidden="true" className="h-5 w-5" />
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-danger-solid px-1 text-center text-[11px] font-semibold leading-[18px] text-on-solid">
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
        <OfflineBanner />
        <SessionWatch />
        {user.isDemo && (
          <p role="status" className="border-b border-warning-600/30 bg-warning-50 px-4 py-2 text-label text-warning-600 sm:px-8">
            You&apos;re trying the app as {user.name}, a demo person. Sign out and sign in again to return to your own account.
          </p>
        )}
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 pb-28 pt-6 focus:outline-none sm:px-8 sm:pt-10 md:pb-10">
          {children}
        </main>
        <BottomNav waiting={waiting} />
      </div>
    </div>
  );
}
