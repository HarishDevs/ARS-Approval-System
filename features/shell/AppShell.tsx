import Link from "next/link";
import { areasForUser } from "@/server/authorization/policy";
import { SideNav, type NavItem } from "@/features/shell/SideNav";
import { MobileNav } from "@/features/shell/MobileNav";
import { ProfileMenu } from "@/features/shell/ProfileMenu";
import { countUnread } from "@/lib/db/repositories/collab.repository";
import { getUserSetting } from "@/lib/db/repositories/user-settings.repository";
import { ThemeSync } from "@/features/shell/ThemeControls";
import { OfflineBanner, SessionWatch, UpdateNotice } from "@/features/shell/SessionWatch";
import { OnboardingTour } from "@/features/help/OnboardingTour";
import { tourStepsFor } from "@/features/help/tour-steps";
import { hasFlag } from "@/lib/db/repositories/user-flags.repository";
import { buildId } from "@/server/ops/build";
import { BottomNav } from "@/features/shell/BottomNav";
import { CommandPalette, type PaletteLink } from "@/features/shell/CommandPalette";
import { countPendingTasksFor } from "@/lib/db/repositories/approvals.repository";
import { THEME_SETTING, parseTheme } from "@/server/ui/theme";
import { NotificationBell } from "@/features/shell/NotificationBell";
import { isHiddenHref, navAccess } from "@/server/authorization/page-access";
import { ViewOnlyNote } from "@/features/shell/ViewOnlyNote";
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
  const [unread, theme, waiting, access, tourDone] = await Promise.all([
    countUnread(user.id).catch(() => 0),
    getUserSetting(user.id, THEME_SETTING).catch(() => null),
    countPendingTasksFor(user.id).catch(() => 0),
    navAccess(user),
    // v1.14.0 (D-167): the tour opens by itself until it's finished or skipped.
    area === "users" ? hasFlag(user.id, "TOUR_DONE").catch(() => true) : true,
  ]);
  // v1.8.0: pages hidden from this person (Super Admin's page access) are
  // left out of the sidebar and the quick search; the server refuses them anyway.
  const visible = (href: string) => !isHiddenHref(href, access.hidden);
  // WS-03: everywhere the person can go, for the command palette.
  const userPages: PaletteLink[] = [
    { href: "/users", label: "Overview", group: "My approvals" },
    { href: "/users/queue", label: "Waiting for me", group: "My approvals" },
    { href: "/users/requests", label: "My requests", group: "My approvals" },
    { href: "/users/collaborating", label: "Collaborating", group: "My approvals" },
    { href: "/users/approved", label: "My approved requests", group: "My approvals" },
    { href: "/users/approved-by-me", label: "Approved by me", group: "My approvals" },
    { href: "/users/new", label: "New request", group: "My approvals" },
    { href: "/users/custom", label: "Custom approval", group: "My approvals" },
    { href: "/users/search", label: "Search requests", group: "My approvals" },
    { href: "/users/analytics", label: "Analytics", group: "My approvals" },
    { href: "/users/tasks", label: "My tasks", group: "Tasks" },
    { href: "/users/tasks/assigned", label: "Tasks assigned by me", group: "Tasks" },
    { href: "/users/tasks/team", label: "Team tasks", group: "Tasks" },
    { href: "/users/tasks/new", label: "New task", group: "Tasks" },
    { href: "/users/information", label: "Information inbox", group: "Information" },
    { href: "/users/information/sent", label: "Information sent by me", group: "Information" },
    { href: "/users/information/new", label: "New information", group: "Information" },
    { href: "/users/notifications", label: "Notifications", group: "Profile" },
    { href: "/users/notifications/settings", label: "Notification settings", group: "Profile" },
    { href: "/users/delegation", label: "Out of office", group: "Profile" },
    { href: "/users/security", label: "Sign-in & devices", group: "Profile" },
    { href: "/users/profile", label: "Profile and theme", group: "Profile" },
    { href: "/users/help", label: "Help", group: "Profile" },
  ];
  const palettePages: PaletteLink[] = [
    ...(area === "users" ? [] : nav.filter((item) => visible(item.href)).map((item) => ({ href: item.href, label: item.label, group: SPACE_LABEL[area] }))),
    ...userPages.filter((item) => visible(item.href)),
    ...spaces.filter((other) => other !== area && other !== "users").map((other) => ({ href: `/${other}`, label: `${SPACE_LABEL[other]} space`, group: "Spaces" })),
  ];
  // The "Waiting for me" entry shows the real count (RA-01).
  const items = nav.filter((item) => visible(item.href)).map((item) => (item.href === "/users/queue" ? { ...item, count: waiting } : item));

  return (
    <div className="flex min-h-full">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {theme && <ThemeSync theme={parseTheme(theme)} />}
      <aside className="hidden w-sidebar shrink-0 flex-col border-r border-line bg-surface md:sticky md:top-0 md:flex md:h-dvh md:self-start" data-testid="sidebar">
        <div className="flex h-topbar shrink-0 items-center border-b border-line px-5">
          {/* WEB-17 (v1.10.0): the logo goes to this space's first page. */}
          <Link href={`/${area}`} aria-label={`ARS Green Steel: ${SPACE_LABEL[area]} home`} className="rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600">
            {/* eslint-disable-next-line @next/next/no-img-element -- static SVG logo */}
            <img src="/brand/ars-green-steel.svg" alt="" width={77} height={36} className="h-9 w-auto" />
          </Link>
        </div>
        <p className="shrink-0 px-6 pt-4 text-caption font-semibold uppercase tracking-wider text-ink-faint">{SPACE_LABEL[area]}</p>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-testid="sidebar-scroll">
          <SideNav items={items} collapsible={area === "users"} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-header flex h-topbar items-center justify-between gap-4 border-b border-line bg-surface px-4 sm:px-6">
          <MobileNav items={items} spaceLabel={SPACE_LABEL[area]} home={`/${area}`} collapsible={area === "users"} />
          <div className="ml-auto flex items-center gap-2">
            <CommandPalette pages={palettePages} />
            <NotificationBell initialUnread={unread} />
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
        <UpdateNotice />
        <SessionWatch build={buildId()} />
        {/* Not by itself while IT tries the app as a demo person. */}
        {area === "users" && <OnboardingTour steps={tourStepsFor(visible)} autoStart={!tourDone && !user.isDemo} />}
        <ViewOnlyNote patterns={access.viewOnly} />
        {user.isDemo && (
          <p role="status" className="border-b border-warning-600/30 bg-warning-50 px-4 py-2 text-label text-warning-600 sm:px-8">
            You&apos;re trying the app as {user.name}, a demo person. Sign out and sign in again to return to your own account.
          </p>
        )}
        <main id="main" tabIndex={-1} className={`mx-auto w-full max-w-7xl flex-1 px-4 pt-6 focus:outline-none sm:px-8 sm:pt-10 md:pb-10 ${area === "users" ? "pb-28" : "pb-10"}`}>
          {children}
        </main>
        {/* WEB-15 (v1.10.0): the phone bar holds My approvals destinations, so it
            shows in that space only; Admin and Super Admin use the menu. */}
        {area === "users" && <BottomNav waiting={waiting} hidden={["/users", "/users/queue", "/users/new", "/users/search", "/users/profile"].filter((href) => !visible(href))} />}
      </div>
    </div>
  );
}
