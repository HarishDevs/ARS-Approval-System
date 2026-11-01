"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckSquare, Home, Inbox, ListChecks, Menu } from "lucide-react";

// v1.43.0 (owner's mobile brief §2): five places at the bottom, in thumb
// reach: Home, Approvals, Tasks, Inbox, More. A tab the person can't open is
// left out; counts come from the server (their own work only).
const TABS = [
  { key: "home", href: "/users", label: "Home", icon: Home, match: (path: string) => path === "/users" },
  {
    key: "approvals",
    href: "/users/approvals",
    label: "Approvals",
    icon: CheckSquare,
    match: (path: string) => /^\/users\/(approvals|queue|requests|approved|approved-by-me|collaborating|new|custom|search)(\/|$)/.test(path),
  },
  { key: "tasks", href: "/users/work/my-tasks", label: "Tasks", icon: ListChecks, match: (path: string) => /^\/users\/(work|tasks)(\/|$)/.test(path) },
  { key: "inbox", href: "/users/inbox", label: "Inbox", icon: Inbox, match: (path: string) => /^\/users\/(inbox|notifications)(\/|$)/.test(path) },
  { key: "more", href: "/users/more", label: "More", icon: Menu, match: (path: string) => /^\/users\/(more|menu|information|calendar|analytics|ai|reports|profile|help|delegation|security|people)(\/|$)/.test(path) },
] as const;

export function MobileTabBar({ waiting, unread, hidden }: { waiting: number; unread: number; hidden: string[] }) {
  const pathname = usePathname();
  const tabs = TABS.filter((tab) => !hidden.includes(tab.key));
  return (
    <nav aria-label="Main" className="mob-tabbar fixed inset-x-0 bottom-0 z-header border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur" data-testid="mobile-tabbar">
      <ul className="grid h-16" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((tab) => {
          const active = tab.match(pathname);
          const count = tab.key === "approvals" ? waiting : tab.key === "inbox" ? unread : 0;
          const Icon = tab.icon;
          return (
            <li key={tab.key}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${active ? "text-[color:var(--m-navy-text)]" : "text-ink-muted"}`}
              >
                {active && <span aria-hidden="true" className="absolute inset-x-5 top-0 h-[3px] rounded-b-full bg-[color:var(--m-red)]" />}
                <Icon aria-hidden="true" className="h-[22px] w-[22px]" strokeWidth={active ? 2.4 : 1.9} />
                {tab.label}
                {count > 0 && (
                  <span className="absolute left-1/2 top-2 ml-2 min-w-[18px] rounded-full bg-[color:var(--m-red)] px-1 text-center text-[10px] font-bold leading-[18px] text-white">
                    {count > 99 ? "99+" : count}
                    <span className="sr-only"> {tab.key === "inbox" ? "unread" : "waiting"}</span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
