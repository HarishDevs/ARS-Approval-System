"use client";

import Link, { useLinkStatus } from "next/link";
import { Spinner } from "@/features/ui/Spinner";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
  soon?: boolean;
  also?: readonly string[]; // other pages this entry stays highlighted on (the Profile tabs)
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
        return item.soon ? (
          <span key={item.href} className="flex items-center justify-between rounded-md px-3 py-2 text-body text-ink-faint">
            {item.label}
            <span className="text-caption">soon</span>
          </span>
        ) : (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`block rounded-md border-l-[3px] px-3 py-2 text-body transition-colors ${active ? "border-primary-600 bg-primary-50 font-semibold text-primary-700" : "border-transparent text-ink-muted hover:bg-surface-muted hover:text-ink"}`}
          >
            <span className="flex items-center justify-between gap-2">
              {item.label}
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
