import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BarChart3,
  Bell,
  BellRing,
  Eye,
  FileText,
  Palette,
  CalendarDays,
  ChevronRight,
  FileStack,
  FolderKanban,
  HelpCircle,
  KeyRound,
  Layers,
  type LucideIcon,
  MessagesSquare,
  Newspaper,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  User,
  UserCog,
} from "lucide-react";
import { requireArea } from "@/server/authorization/guards";
import { isHiddenHref, navAccess } from "@/server/authorization/page-access";
import { usersNav } from "@/features/shell/users-nav";
import { isMobileLayout } from "@/server/ui/layout-mode";
import { personProfile } from "@/lib/db/repositories/profile.repository";
import { photoUrl } from "@/server/profile/photo";
import { initials } from "@/features/ui/Display";
import { MoreSignOut } from "@/features/mobile/MoreSignOut";
import { getUserSetting } from "@/lib/db/repositories/user-settings.repository";
import { listDelegationsInvolving } from "@/lib/db/repositories/collab.repository";
import { THEME_SETTING, parseTheme } from "@/server/ui/theme";
import packageJson from "@/package.json";

export const metadata: Metadata = { title: "More" };

// v1.43.0 (owner's mobile brief §2, §7): More holds everything that isn't
// one of the four main tabs, grouped, with the person's profile on top. Only
// pages the person can open are listed (the sidebar's own list and page
// access). On a computer the sidebar does this job, so the address opens Home.
type Entry = { href: string; label: string; icon: LucideIcon; hint?: string; value?: string };
const THEME_LABEL = { system: "System", light: "Light", dark: "Dark" } as const;

export default async function MorePage() {
  const { user } = await requireArea("users");
  if (!(await isMobileLayout())) redirect("/users");
  const [nav, access, profile, themeSetting, delegations] = await Promise.all([
    usersNav(user),
    navAccess(user),
    personProfile(user.id).catch(() => null),
    getUserSetting(user.id, THEME_SETTING).catch(() => null),
    listDelegationsInvolving(user.id).catch(() => []),
  ]);
  const theme = parseTheme(themeSetting);
  // v1.45.0: the Out of office tile says whether it is on (own cover only).
  const away = delegations.find((item) => item.userId === user.id && (item.state === "ACTIVE" || item.state === "UPCOMING")) ?? null;
  const has = (href: string) => nav.some((item) => item.href === href) && !isHiddenHref(href, access.hidden);
  const open = (href: string) => !isHiddenHref(href, access.hidden);
  const pick = (entries: (Entry | false)[]) => entries.filter((entry): entry is Entry => Boolean(entry));
  const groups: { title: string; entries: Entry[] }[] = [
    {
      title: "Work",
      entries: pick([
        has("/users/information") && { href: "/users/information", label: "Information", icon: Newspaper, hint: "Received, sent by me, new" },
        has("/users/work/projects") && { href: "/users/work/projects", label: "Projects", icon: FolderKanban },
        has("/users/work/periodic") && { href: "/users/work/periodic", label: "Periodic tasks", icon: RefreshCw },
        has("/users/calendar") && { href: "/users/calendar", label: "Calendar", icon: CalendarDays },
      ]),
    },
    {
      title: "Intelligence",
      entries: pick([
        has("/users/ai/assistant") && { href: "/users/ai/assistant", label: "AI Assistant", icon: MessagesSquare },
        has("/users/analytics") && { href: "/users/analytics", label: "Analytics", icon: BarChart3 },
      ]),
    },
    {
      title: "Tools",
      entries: pick([
        open("/users/search") && { href: "/users/search", label: "Search", icon: Search },
        has("/users/new") && { href: "/users/new", label: "Request templates", icon: FileStack },
        has("/users/work/projects") && { href: "/users/work/projects?show=templates", label: "Project templates", icon: Layers },
        has("/users/information/sent") && { href: "/users/information/sent", label: "Information sent by me", icon: Send },
      ]),
    },
    {
      title: "Settings",
      entries: pick([
        open("/users/profile") && { href: "/users/profile", label: "Profile & photo", icon: User },
        open("/users/notifications/settings") && { href: "/users/notifications/settings", label: "Notifications", icon: Bell },
        open("/users/profile/devices") && { href: "/users/profile/devices", label: "Push notifications", icon: Smartphone, hint: "Install the app, phone notifications" },
        open("/users/profile") && { href: "/users/profile", label: "Colour mode", icon: Palette, value: THEME_LABEL[theme] },
        open("/users/security") && { href: "/users/security", label: "Sign-in & devices", icon: KeyRound },
      ]),
    },
    {
      title: "Support",
      entries: pick([
        open("/users/help") && { href: "/users/help", label: "Help centre", icon: HelpCircle },
        { href: "/terms", label: "Terms of use", icon: FileText },
        { href: "/privacy", label: "Privacy policy", icon: Eye },
      ]),
    },
    {
      title: "Spaces",
      entries: pick([
        (user.roles.includes("IT_ADMIN") || user.roles.includes("SUPER_ADMIN")) && { href: "/admin", label: "Admin space", icon: UserCog },
        user.roles.includes("SUPER_ADMIN") && { href: "/superadmin", label: "Super Admin space", icon: ShieldCheck },
      ]),
    },
  ].filter((group) => group.entries.length > 0);
  const photo = photoUrl(user.id, profile?.photoUpdatedAt);

  // v1.45.0 (owner's Asana Account screen): photo, name and email in the
  // middle; Out of office and Notifications as two tiles; then flat groups.
  return (
    <div className="pb-6" data-testid="mobile-more">
      <h1 className="sr-only">More</h1>
      <Link href="/users/profile" className="flex flex-col items-center gap-2 pt-2 text-center" data-testid="more-profile">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- the person's own photo (private, cached by version)
          <img src={photo} alt="" className="h-24 w-24 rounded-full object-cover" />
        ) : (
          <span aria-hidden="true" className="grid h-24 w-24 place-items-center rounded-full bg-[color:var(--m-navy)] text-[28px] font-bold text-white">
            {initials(user.name)}
          </span>
        )}
        <span className="flex items-center gap-1 text-[22px] font-semibold">
          {user.name}
          <ChevronRight aria-hidden="true" className="h-5 w-5 text-ink-muted" />
        </span>
        <span className="text-[14px] text-ink-muted">{user.email}</span>
        {(profile?.designationName || profile?.departmentName) && <span className="text-[13px] text-ink-muted">{[profile?.designationName, profile?.departmentName].filter(Boolean).join(" · ")}</span>}
      </Link>
      <div className="mt-5 grid grid-cols-2 gap-3">
        {open("/users/delegation") && (
          <Link href="/users/delegation" className="mob-card flex min-h-[96px] flex-col items-center justify-center gap-1.5 p-3 text-center" data-testid="more-away">
            <CalendarDays aria-hidden="true" className="h-6 w-6 text-ink-muted" />
            <span className="text-[15px] font-medium">Out of office</span>
            <span className="text-[12px] text-ink-muted">{away ? `${away.state === "ACTIVE" ? "On" : "From " + dayText(away.startsOn)} until ${dayText(away.endsOn)}` : "Off"}</span>
          </Link>
        )}
        {open("/users/notifications/settings") && (
          <Link href="/users/notifications/settings" className="mob-card flex min-h-[96px] flex-col items-center justify-center gap-1.5 p-3 text-center">
            <BellRing aria-hidden="true" className="h-6 w-6 text-ink-muted" />
            <span className="text-[15px] font-medium">Notifications</span>
            <span className="text-[12px] text-ink-muted">Email, WhatsApp, phone</span>
          </Link>
        )}
      </div>
      {groups.map((group) => (
        <section key={group.title} aria-label={group.title} className="-mx-4 mt-5 border-t-8 border-[color:var(--m-bg)]">
          <h2 className="px-4 pb-1 pt-4 text-[14px] text-ink-muted">{group.title}</h2>
          <ul>
            {group.entries.map((entry) => (
              <li key={`${entry.href}-${entry.label}`}>
                <Link href={entry.href} className="flex min-h-[56px] items-center gap-4 px-4 py-2 hover:bg-surface-muted">
                  <entry.icon aria-hidden="true" className="h-[22px] w-[22px] shrink-0 text-ink-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px]">{entry.label}</span>
                    {entry.hint && <span className="block truncate text-[12px] text-ink-muted">{entry.hint}</span>}
                  </span>
                  {entry.value && <span className="text-[14px] text-ink-muted">{entry.value}</span>}
                  <ChevronRight aria-hidden="true" className="h-5 w-5 text-ink-faint" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <div className="-mx-4 mt-5 border-t-8 border-[color:var(--m-bg)]">
        <MoreSignOut />
        <p className="flex min-h-[52px] items-center gap-4 px-4 text-[16px]" data-testid="more-version">
          <Smartphone aria-hidden="true" className="h-[22px] w-[22px] text-ink-muted" />
          <span className="flex-1">App version</span>
          <span className="text-[14px] tabular-nums text-ink-muted">{packageJson.version}</span>
        </p>
      </div>
    </div>
  );
}

const DAY_TEXT = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const dayText = (ymd: string) => DAY_TEXT.format(new Date(`${ymd}T00:00:00Z`));
