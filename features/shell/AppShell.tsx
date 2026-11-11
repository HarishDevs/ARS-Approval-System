import Link from "next/link";
import { BrandLockup, CmsMark } from "@/features/ui/Brand";
import { InstallInviteAccountSync } from "@/features/pwa/InstallInvite";
import { INSTALL_INVITE_FLAG } from "@/server/pwa/flags";
import { Search, Wrench } from "lucide-react";
import { Suspense } from "react";
import { areasForUser } from "@/server/authorization/policy";
import { SideNav, type NavItem } from "@/features/shell/SideNav";
import { CreateMenu } from "@/features/shell/CreateMenu";
import { NavigationProgress } from "@/features/shell/NavigationProgress";
import { SidebarFrame, type RailEntry } from "@/features/shell/SidebarFrame";
import { SIDEBAR_COOKIE } from "@/features/shell/sidebar-cookie";
import { cookies } from "next/headers";
import { isApproverDesignation, photoVersion } from "@/lib/db/repositories/profile.repository";
import { photoUrl } from "@/server/profile/photo";
import { MobileNav } from "@/features/shell/MobileNav";
import { ProfileMenu } from "@/features/shell/ProfileMenu";
import { countUnread } from "@/lib/db/repositories/collab.repository";
import { getUserSetting } from "@/lib/db/repositories/user-settings.repository";
import { ThemeSync } from "@/features/shell/ThemeControls";
import { OfflineBanner, SessionWatch, SlowNetworkNotice, UpdateNotice } from "@/features/shell/SessionWatch";
import { OnboardingTour } from "@/features/help/OnboardingTour";
import { tourStepsFor } from "@/features/help/tour-steps";
import { hasFlag } from "@/lib/db/repositories/user-flags.repository";
import { PicBot } from "@/features/ai/PicBot";
import { listConversations } from "@/lib/db/repositories/ai.repository";
import { chatAccess } from "@/server/ai/policy";
import { MODE_LABEL, offerOrder } from "@/server/ai/chat-access";
import { getSettingValue } from "@/server/settings/values";
import { buildId } from "@/server/ops/build";
import { BottomNav } from "@/features/shell/BottomNav";
import { MobileTabBar } from "@/features/mobile/MobileTabBar";
import { LayoutSync } from "@/features/mobile/LayoutSync";
import { layoutMode } from "@/server/ui/layout-mode";
import { CommandPalette, type PaletteLink, type PaletteSaved } from "@/features/shell/CommandPalette";
import { hasModule } from "@/server/modules/modules";
import { teamOf } from "@/server/work/task-access";
import { listSavedSearches } from "@/lib/db/repositories/work.repository";
import { countPendingTasksFor } from "@/lib/db/repositories/approvals.repository";
import { THEME_SETTING, parseTheme } from "@/server/ui/theme";
import { parseTextSize, parseWorkspaceView, TEXT_SCALE, TEXT_SIZE_SETTING, WORKSPACE_VIEW_SETTING } from "@/server/ui/workspace-view";
import { TextScale } from "@/features/shell/TextScale";
import { ClassicBar, ClassicForms } from "@/features/shell/Classic";
import { classicModules } from "@/features/shell/classic-modules";
import { NotificationBell } from "@/features/shell/NotificationBell";
import { isHiddenHref, navAccess } from "@/server/authorization/page-access";
import { ViewOnlyNote } from "@/features/shell/ViewOnlyNote";
import type { AppArea, AuthenticatedUser } from "@/types/auth";

// The three spaces of the one app (D-034, S9-03: called "spaces" on screen).
export const SPACE_LABEL: Record<AppArea, string> = { users: "Central Management System", admin: "Admin", superadmin: "Super Admin" };

// "IT Admin (Super Admin)" → "IT Admin"; "Ravi Kumar (demo)" → "Ravi Kumar".
export function displayName(name: string): string {
  return (
    name
      .replace(/\s*\([^)]*\)\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim() || name
  );
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

export async function AppShell({ area, user, nav, children }: { area: AppArea; user: AuthenticatedUser; nav: NavItem[]; children: React.ReactNode }) {
  const spaces = areasForUser(user);
  const [unread, theme, waiting, access, tourDone, picbot, chats, savedView, savedText] = await Promise.all([
    countUnread(user.id).catch(() => 0),
    getUserSetting(user.id, THEME_SETTING).catch(() => null),
    countPendingTasksFor(user.id).catch(() => 0),
    navAccess(user),
    // v1.14.0 (D-167): the tour opens by itself until it's finished or skipped.
    area === "users" ? hasFlag(user.id, "TOUR_DONE").catch(() => true) : true,
    // D-172: Pic bot's launcher, for people with at least one chat mode they may use now.
    Promise.all([chatAccess(user), getSettingValue("ai.launcher")])
      .then(([chat, launcher]) => (launcher === "OFF" ? [] : offerOrder(chat.modes).map((mode) => ({ mode, label: MODE_LABEL[mode] }))))
      .catch(() => []),
    // D-180: the person's AI chats for the sidebar's AI Assistant group.
    nav.some((item) => item.chats)
      ? listConversations(user.id, 200)
          .then((rows) => rows.map((row) => ({ id: row.id, title: row.title, pinned: row.pinned })))
          .catch(() => [])
      : Promise.resolve([]),
    // D-210: the person's workspace view (My approvals space only).
    area === "users" ? getUserSetting(user.id, WORKSPACE_VIEW_SETTING).catch(() => null) : Promise.resolve(null),
    // D-211: the Classic view's text size.
    area === "users" ? getUserSetting(user.id, TEXT_SIZE_SETTING).catch(() => null) : Promise.resolve(null),
  ]);
  const classic = area === "users" && parseWorkspaceView(savedView) === "CLASSIC";
  const textSize = parseTextSize(savedText);
  const textScale = classic ? TEXT_SCALE[textSize] : null;
  // v1.8.0: pages hidden from this person (Super Admin's page access) are
  // left out of the sidebar and the quick search; the server refuses them anyway.
  const visible = (href: string) => !isHiddenHref(href, access.hidden);
  // WS-03: everywhere the person can go, for the command palette.
  const userPages: PaletteLink[] = [
    { href: "/users", label: "Home", group: "My approvals" },
    { href: "/users/custom", label: "New request", group: "My approvals" },
    { href: "/users/requests", label: "My pending requests", group: "My approvals" },
    { href: "/users/approved", label: "My approved requests", group: "My approvals" },
    { href: "/users/queue", label: "Waiting for me", group: "My approvals" },
    { href: "/users/approved-by-me", label: "Approved by me", group: "My approvals" },
    { href: "/users/collaborating", label: "Collaborating", group: "My approvals" },
    { href: "/users/new", label: "Request templates", group: "My approvals" },
    { href: "/users/search", label: "Search requests", group: "My approvals" },
    { href: "/users/analytics", label: "Analytics", group: "My approvals" },
    { href: "/users/tasks/new", label: "New task", group: "Tasks" },
    { href: "/users/work/my-tasks", label: "My tasks", group: "Tasks" },
    { href: "/users/tasks", label: "My tasks (table with filters)", group: "Tasks" },
    { href: "/users/work/projects", label: "Projects", group: "Projects" },
    { href: "/users/work/search", label: "Task search", group: "Tasks" },
    { href: "/users/tasks/assigned", label: "Tasks assigned by me", group: "Tasks" },
    { href: "/users/tasks/team", label: "Team tasks", group: "Tasks" },
    { href: "/users/information", label: "Information inbox", group: "Information" },
    { href: "/users/information/sent", label: "Information sent by me", group: "Information" },
    { href: "/users/information/new", label: "New information", group: "Information" },
    { href: "/users/meetings", label: "Meetings", group: "Meetings" },
    { href: "/users/meetings/new", label: "Schedule a meeting", group: "Meetings" },
    { href: "/users/meetings/follow-ups", label: "Meeting follow-ups", group: "Meetings" },
    { href: "/users?home=meetings", label: "Meeting overview (dashboard)", group: "Meetings" },
    { href: "/users/inbox", label: "Inbox", group: "My approvals" },
    { href: "/users/notifications/settings", label: "Notifications (settings)", group: "Profile" },
    { href: "/users/delegation", label: "Out of office", group: "Profile" },
    { href: "/users/security", label: "Sign-in & devices", group: "Profile" },
    { href: "/users/profile/devices", label: "App & devices (install, notifications)", group: "Profile" },
    { href: "/users/profile", label: "Profile and theme", group: "Profile" },
    { href: "/users/help", label: "Help", group: "Profile" },
  ];
  const palettePages: PaletteLink[] = [
    ...(area === "users" ? [] : nav.filter((item) => visible(item.href)).map((item) => ({ href: item.href, label: item.label, group: SPACE_LABEL[area] }))),
    ...userPages.filter((item) => visible(item.href)),
    ...spaces.filter((other) => other !== area && other !== "users").map((other) => ({ href: `/${other}`, label: `${SPACE_LABEL[other]} space`, group: "Spaces" })),
  ];
  // v1.51.1 (owner): the global search's saved searches, only what this person may open.
  const tasksAllowed = area === "users" && hasModule(user, "TASK") && visible("/users/work/search");
  const [teamIds, ownSaved] = tasksAllowed ? await Promise.all([teamOf(user.id).catch(() => []), listSavedSearches(user.id).catch(() => [])]) : [[], []];
  const paletteSaved: PaletteSaved[] =
    area !== "users"
      ? []
      : [
          ...(tasksAllowed
            ? ([
                { label: "Tasks I've created", href: "/users/work/search?created_by=me&status=all", kind: "task" },
                { label: "Overdue tasks", href: "/users/work/search?overdue=1", kind: "task" },
                { label: "Tasks I follow", href: "/users/work/search?followed=1", kind: "task" },
                { label: "Periodic tasks", href: "/users/work/search?kind=periodic", kind: "task" },
                { label: "Recently completed tasks", href: "/users/work/search?status=completed", kind: "task" },
                ...(teamIds.length ? [{ label: "My team's tasks", href: "/users/work/search?team=1", kind: "task" }, { label: "My team: overdue", href: "/users/work/search?team=1&overdue=1", kind: "task" }] : []),
              ] as PaletteSaved[])
            : []),
          ...(hasModule(user, "APPROVAL") && visible("/users/requests") ? [{ label: "My pending requests", href: "/users/requests?tab=open", kind: "request" } as PaletteSaved] : []),
          ...(hasModule(user, "APPROVAL") && visible("/users/queue") && waiting > 0 ? [{ label: "Waiting for me", href: "/users/queue", kind: "request" } as PaletteSaved] : []),
          ...(hasModule(user, "MEETING") && visible("/users/meetings")
            ? ([
                { label: "Meetings to approve", href: "/users/meetings?tab=approve", kind: "meeting" },
                { label: "My meeting actions", href: "/users/meetings/follow-ups?view=mine", kind: "meeting" },
              ] as PaletteSaved[])
            : []),
          ...ownSaved.slice(0, 8).map((item) => ({ label: item.name, href: `/users/work/search?${item.query}`, kind: "mine" }) as PaletteSaved),
        ];
  // The "Waiting for me" entry shows the real count (RA-01).
  const items = nav.filter((item) => visible(item.href)).map((item) => (item.href === "/users/queue" ? { ...item, count: waiting } : item.href === "/users/inbox" ? { ...item, count: unread } : item));
  // D-221 / D-223 (owner): in the Compact view the Tasks pages become one
  // "Tasks & projects" group holding the Tasks bar's pages (the area has no
  // bar of its own any more); the Classic view keeps the Tasks module's
  // pages. + Create offers what the person can create.
  const tasksOn = items.some((item) => item.section === "Tasks");
  const projectsOn = tasksOn && visible("/users/work/projects/new");
  // D-307 (owner): Tasks and Projects are separate modules, so separate
  // groups; each link only when the person may open it.
  const workGroup: NavItem[] = [
    ...[
      { href: "/users/work/my-tasks", label: "My Tasks", also: ["/users/tasks"] },
      { href: "/users/work/periodic", label: "Periodic tasks" },
    ].map((item) => ({ ...item, section: "Tasks" })),
    ...[
      { href: "/users/work/projects", label: "All projects" },
      { href: "/users/work/projects/new", label: "New project" },
      { href: "/users/work/projects?show=templates", label: "Templates" },
    ].map((item) => ({ ...item, section: "Projects" })),
  ].filter((item) => visible(item.href));
  const sideItems: NavItem[] =
    area === "users" ? items.flatMap((item, index) => (item.section !== "Tasks" && item.section !== "Projects" ? [item] : items.findIndex((other) => other.section === "Tasks" || other.section === "Projects") === index ? workGroup : [])) : items;

  // D-229: the sidebar's rail (collapsed): top-level pages and each group once.
  const rail: RailEntry[] = [];
  for (const item of sideItems) {
    if (!item.section) rail.push({ kind: "item", href: item.href, label: item.label });
    else if (!rail.some((entry) => entry.kind === "group" && entry.section === item.section)) rail.push({ kind: "group", section: item.section, href: item.href, label: item.section });
  }
  const sidebarCollapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "rail";
  // D-233: IT's maintenance notice, if any (a failed read shows none).
  const maintenance = await getSettingValue("general.maintenance_notice").catch(() => null);
  // D-230: the person's photo in the account menu.
  const [photo, approverPicture] = await Promise.all([photoVersion(user.id).catch(() => null), isApproverDesignation(user.id).catch(() => false)]);

  // v1.43.0 (owner's mobile brief): phones get the mobile layout in the users
  // area (docs/mobile/MOBILE_REDESIGN_ARCHITECTURE.md); everything else, and
  // every window from 768 px, renders exactly as before.
  const layout = await layoutMode();
  const mobile = area === "users" && layout === "mobile";

  return (
    <div
      className="flex min-h-full"
      data-view={classic && !mobile ? "classic" : undefined}
      data-layout={mobile ? "mobile" : undefined}
      style={textScale && textScale !== 1 ? ({ "--text-scale": String(textScale) } as React.CSSProperties) : undefined}
    >
      <TextScale scale={textScale} />
      <LayoutSync current={layout} />
      {/* D-251: "Maybe later" said on another device (or before this browser's storage was cleared). */}
      <InstallInviteAccountSync dismissed={await hasFlag(user.id, INSTALL_INVITE_FLAG).catch(() => false)} />
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {theme && <ThemeSync theme={parseTheme(theme)} />}
      {!classic && !mobile && (
        <SidebarFrame
          initialCollapsed={sidebarCollapsed}
          homeHref={`/${area}`}
          homeLabel={`ARS Green Steel: ${SPACE_LABEL[area]} home`}
          rail={rail}
          create={area === "users" ? { approval: items.some((item) => item.href === "/users/custom"), task: tasksOn, project: projectsOn, information: items.some((item) => item.href === "/users/information/new") } : null}
        >
          {area === "users" && <CreateMenu approval={items.some((item) => item.href === "/users/custom")} task={tasksOn} project={projectsOn} information={items.some((item) => item.href === "/users/information/new")} />}
          <p className="shrink-0 px-6 pt-4 text-caption font-semibold uppercase tracking-wider text-ink-faint">{SPACE_LABEL[area]}</p>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-testid="sidebar-scroll">
            <SideNav items={sideItems} collapsible={area !== "admin"} chats={chats} />
          </div>
        </SidebarFrame>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {mobile ? (
          // The mobile top bar: the mark and name, search, notifications, account.
          <header
            className="mob-topbar sticky top-0 z-header flex h-14 items-center gap-2 border-b border-line bg-surface/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur"
            data-testid="mobile-topbar"
          >
            <Link href="/users" aria-label="ARS CMS home" className="flex min-w-0 flex-1 items-center gap-2">
              <CmsMark className="h-8 w-8" />
              <span className="truncate text-[17px] font-extrabold tracking-tight text-[color:var(--m-navy-text)]">ARS CMS</span>
            </Link>
            <Link href="/users/search" aria-label="Search" className="grid h-11 w-11 place-items-center rounded-full text-ink-muted hover:bg-surface-muted">
              <Search aria-hidden="true" className="h-5 w-5" />
            </Link>
            <NotificationBell initialUnread={unread} />
            <ProfileMenu
              name={displayName(user.name)}
              email={user.email}
              initials={initialsOf(user.name)}
              photo={photoUrl(user.id, photo)}
              approver={approverPicture}
              spaceLabel={SPACE_LABEL[area]}
              otherSpaces={spaces.filter((other) => other !== area).map((other) => ({ href: `/${other}`, label: SPACE_LABEL[other] }))}
              unread={unread}
              view={null}
              textSize={textSize}
            />
          </header>
        ) : null}
        {mobile ? null : (
          <header className="sticky top-0 z-header flex h-topbar items-center justify-between gap-4 border-b border-line bg-surface px-4 sm:px-6">
            <MobileNav items={sideItems} spaceLabel={SPACE_LABEL[area]} home={`/${area}`} collapsible={area !== "admin"} chats={chats} />
            {/* D-210: Classic has no sidebar, so the logo leads back to the Gateway from the top bar. */}
            {classic && (
              <Link href="/users" aria-label="ARS CMS: Central Management System" className="hidden items-center gap-3 rounded-md md:flex" data-testid="classic-home">
                <BrandLockup size="md" />
              </Link>
            )}
            {/* D-232: the universal search sits in the middle of the top bar (Asana). */}
            <div className="flex min-w-0 flex-1 justify-end sm:justify-center">
              <CommandPalette pages={palettePages} saved={paletteSaved} />
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell initialUnread={unread} />
              <ProfileMenu
                name={displayName(user.name)}
                email={user.email}
                initials={initialsOf(user.name)}
                photo={photoUrl(user.id, photo)}
              approver={approverPicture}
                spaceLabel={SPACE_LABEL[area]}
                otherSpaces={spaces.filter((other) => other !== area).map((other) => ({ href: `/${other}`, label: SPACE_LABEL[other] }))}
                unread={unread}
                view={area === "users" ? (classic ? "CLASSIC" : "COMPACT") : null}
                textSize={textSize}
              />
            </div>
          </header>
        )}
        {classic && !mobile && (
          <Suspense fallback={null}>
            <ClassicBar modules={classicModules(items)} />
          </Suspense>
        )}
        {classic && !mobile && <ClassicForms />}
        {maintenance && (
          <p role="status" data-testid="maintenance-notice" className="flex items-center gap-2 border-b border-info-600/30 bg-info-50 px-4 py-2 text-label text-info-600 sm:px-8">
            <Wrench aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>
              <strong>Planned maintenance:</strong> {maintenance}
            </span>
          </p>
        )}
        <OfflineBanner />
        <SlowNetworkNotice />
        {(!classic || mobile) && (
          <Suspense fallback={null}>
            <NavigationProgress mobile={mobile} />
          </Suspense>
        )}
        <UpdateNotice />
        <SessionWatch build={buildId()} />
        {/* Not by itself while IT tries the app as a demo person. */}
        {/* D-185: not in a view-only Try as window (it couldn't ask anyway). */}
        {picbot.length > 0 && !user.triedBy && <PicBot initialModes={picbot} />}
        {area === "users" && <OnboardingTour steps={tourStepsFor(visible)} autoStart={!tourDone && !user.isDemo && !user.triedBy} />}
        <ViewOnlyNote patterns={access.viewOnly} />
        {user.triedBy && (
          <p role="status" className="border-b border-warning-600/30 bg-warning-50 px-4 py-2 text-label text-warning-600 sm:px-8" data-testid="try-as-banner">
            Viewing as {displayName(user.name)}, view-only (opened by {displayName(user.triedBy)}). Nothing can be changed here. Close this window when you&apos;re done.
          </p>
        )}
        {user.isDemo && (
          <p role="status" className="border-b border-warning-600/30 bg-warning-50 px-4 py-2 text-label text-warning-600 sm:px-8">
            You&apos;re trying the app as {user.name}, a demo person. Sign out and sign in again to return to your own account.
          </p>
        )}
        <main
          id="main"
          tabIndex={-1}
          className={
            mobile
              ? "mob-main w-full flex-1 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-4 focus:outline-none"
              : `mx-auto w-full max-w-7xl flex-1 px-4 pt-6 focus:outline-none sm:px-8 sm:pt-10 md:pb-10 ${area === "users" ? "pb-28" : "pb-10"}`
          }
        >
          {children}
        </main>
        {/* WEB-15 (v1.10.0): the phone bar holds My approvals destinations, so it
            shows in that space only; Admin and Super Admin use the menu. */}
        {area === "users" && !mobile && <BottomNav waiting={waiting} hidden={["/users", "/users/queue", "/users/custom", "/users/search", "/users/profile"].filter((href) => !visible(href))} />}
        {mobile && (
          <MobileTabBar
            waiting={waiting}
            unread={unread}
            hidden={[
              ...(visible("/users") ? [] : ["home"]),
              ...(visible("/users/queue") || visible("/users/requests") ? [] : ["approvals"]),
              ...(tasksOn ? [] : ["tasks"]),
              ...(visible("/users/inbox") ? [] : ["inbox"]),
            ]}
          />
        )}
      </div>
    </div>
  );
}
