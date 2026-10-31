"use client";

import { FilePlus2, FileSearch, Home, Inbox, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// RA-01: on phones the main destinations sit at the bottom, in thumb reach.
// The waiting count comes from the server (only the person's own work).
const ITEMS = [
  { href: "/users", label: "Home", icon: Home, exact: true },
  { href: "/users/queue", label: "Waiting", icon: Inbox },
  { href: "/users/new", label: "New", icon: FilePlus2 },
  { href: "/users/search", label: "Search", icon: FileSearch },
  { href: "/users/profile", label: "Profile", icon: User, also: ["/users/notifications", "/users/delegation", "/users/security"] },
];

export function BottomNav({ waiting, hidden = [] }: { waiting: number; hidden?: string[] }) {
  const pathname = usePathname();
  // v1.8.0: pages hidden from this person (page access) are left out.
  const items = ITEMS.filter((item) => !hidden.includes(item.href));
  return (
    <nav aria-label="Quick" className="fixed inset-x-0 bottom-0 z-header border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`) || (item.also ?? []).some((path) => pathname.startsWith(path));
          const Icon = item.icon;
          const count = item.href === "/users/queue" ? waiting : 0;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[length:calc(11px*var(--text-scale,1))] font-medium ${active ? "text-primary-700" : "text-ink-muted"}`}
              >
                <Icon aria-hidden="true" className="h-5 w-5" />
                {item.label}
                {count > 0 && (
                  <span className="absolute right-[calc(50%-1.4rem)] top-1.5 min-w-[18px] rounded-full bg-danger-solid px-1 text-center text-[length:calc(10px*var(--text-scale,1))] font-semibold leading-[18px] text-on-solid">
                    {count > 99 ? "99+" : count}
                    <span className="sr-only"> waiting</span>
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
