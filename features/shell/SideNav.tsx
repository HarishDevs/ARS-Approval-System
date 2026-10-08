"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
  soon?: boolean;
}

export function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-0.5 p-3" aria-label="Main">
      {items.map((item) => {
        const active = pathname === item.href || (item.href.split("/").length > 2 && pathname.startsWith(`${item.href}/`));
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
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
