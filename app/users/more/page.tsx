import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BarChart3,
  Bell,
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
  Plane,
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

export const metadata: Metadata = { title: "More" };

// v1.43.0 (owner's mobile brief §2, §7): More holds everything that isn't
// one of the four main tabs, grouped, with the person's profile on top. Only
// pages the person can open are listed (the sidebar's own list and page
// access). On a computer the sidebar does this job, so the address opens Home.
type Entry = { href: string; label: string; icon: LucideIcon; hint?: string };

export default async function MorePage() {
  const { user } = await requireArea("users");
  if (!(await isMobileLayout())) redirect("/users");
  const [nav, access, profile] = await Promise.all([usersNav(user), navAccess(user), personProfile(user.id).catch(() => null)]);
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
      title: "Account",
      entries: pick([
        open("/users/profile") && { href: "/users/profile", label: "Profile & theme", icon: User },
        open("/users/notifications/settings") && { href: "/users/notifications/settings", label: "Notifications", icon: Bell },
        open("/users/profile/devices") && { href: "/users/profile/devices", label: "App & devices", icon: Smartphone, hint: "Install, phone notifications" },
        open("/users/delegation") && { href: "/users/delegation", label: "Out of office", icon: Plane },
        open("/users/security") && { href: "/users/security", label: "Sign-in & devices", icon: KeyRound },
        open("/users/help") && { href: "/users/help", label: "Help & support", icon: HelpCircle },
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

  return (
    <div className="space-y-5" data-testid="mobile-more">
      <h1 className="mob-screen-title">More</h1>
      <Link href="/users/profile" className="mob-card flex items-center gap-3 p-4" data-testid="more-profile">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- the person's own photo (private, cached by version)
          <img src={photo} alt="" className="h-12 w-12 rounded-full object-cover" />
        ) : (
          <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-full bg-[color:var(--m-navy)] text-[15px] font-bold text-white">
            {initials(user.name)}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold">{user.name}</span>
          <span className="block truncate text-[13px] text-ink-muted">{[profile?.designationName, profile?.departmentName].filter(Boolean).join(" · ") || user.email}</span>
        </span>
        <ChevronRight aria-hidden="true" className="h-5 w-5 text-ink-faint" />
      </Link>
      {groups.map((group) => (
        <section key={group.title} aria-label={group.title}>
          <h2 className="mb-2 px-1 text-[12px] font-bold uppercase tracking-wider text-ink-muted">{group.title}</h2>
          <ul className="mob-card divide-y divide-line overflow-hidden">
            {group.entries.map((entry) => (
              <li key={entry.href}>
                <Link href={entry.href} className="flex min-h-[52px] items-center gap-3 px-4 py-2 hover:bg-surface-muted">
                  <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-50 text-primary-700">
                    <entry.icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold">{entry.label}</span>
                    {entry.hint && <span className="block truncate text-[12px] text-ink-muted">{entry.hint}</span>}
                  </span>
                  <ChevronRight aria-hidden="true" className="h-5 w-5 text-ink-faint" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <div className="mob-card overflow-hidden">
        <MoreSignOut />
      </div>
    </div>
  );
}
