"use client";

import Link, { useLinkStatus } from "next/link";
import { Spinner } from "@/features/ui/Spinner";
import { usePathname } from "next/navigation";
import { NavIcon } from "@/features/shell/nav-icons";

export interface NavItem {
  href: string;
  label: string;
  also?: readonly string[]; // other pages this entry stays highlighted on (the Profile tabs)
  count?: number; // e.g. how many approvals are waiting (from the server)
  section?: string; // v1.9.0: the module group this entry belongs to (Approvals, Tasks, Information…)
}

export function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  // v1.9.0: only the most specific entry is highlighted (My tasks vs
  // Assigned by me under /users/tasks/assigned).
  const matches = (href: string) => pathname === href || (href.split("/").length > 2 && pathname.startsWith(`${href}/`));
  const best = items.filter((item) => matches(item.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav className="space-y-0.5 p-3" aria-label="Main">
      {items.map((item, index) => {
        const heading = item.section && item.section !== items[index - 1]?.section ? item.section : null;
        const active = item.href === best || (item.also ?? []).some((path) => pathname === path || pathname.startsWith(`${path}/`));
        return (
          <div key={item.href}>
            {heading && (
              <p className="px-3 pb-1 pt-4 text-caption font-semibold uppercase tracking-wider text-ink-faint first:pt-1">
                {heading}
              </p>
            )}
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`block rounded-md border-l-[3px] px-3 py-2 text-body transition-colors ${active ? "border-primary-600 bg-primary-50 font-semibold text-primary-700" : "border-transparent text-ink-muted hover:bg-surface-muted hover:text-ink"}`}
            >
              <span className="flex items-center gap-2.5">
                <NavIcon href={item.href} />
                <span className="flex-1">{item.label}</span>
                {item.count ? (
                  <span className="rounded-full bg-primary-50 px-1.5 text-caption font-semibold text-primary-700">
                    {item.count > 99 ? "99+" : item.count}
                    <span className="sr-only"> waiting</span>
                  </span>
                ) : null}
                <PendingMark />
              </span>
            </Link>
          </div>
        );
      })}
    </nav>
  );
}

// While this link's page loads, a small spinner shows on it (QA session 14,
// DEF-01): before, a slow page change gave no sign the click had registered.
function PendingMark() {
  const { pending } = useLinkStatus();
  return pending ? (
    <Spinner className="h-3.5 w-3.5 shrink-0" label="Loading" />
  ) : null;
}
