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
}

export function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-0.5 p-3" aria-label="Main">
      {items.map((item) => {
        const active =
          pathname === item.href ||
          (item.href.split("/").length > 2 && pathname.startsWith(`${item.href}/`)) ||
          (item.also ?? []).some((path) => pathname === path || pathname.startsWith(`${path}/`));
        return (
          <Link
            key={item.href}
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
        );
      })}
    </nav>
  );
}

// While this link's page loads, a small spinner shows on it (QA session 14,
// DEF-01): before, a slow page change gave no sign the click had registered.
function PendingMark() {
  const { pending } = useLinkStatus();
  return pending ? <Spinner className="h-3.5 w-3.5 shrink-0" label="Loading" /> : null;
}
