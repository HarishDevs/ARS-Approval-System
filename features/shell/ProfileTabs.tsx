"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The Profile page groups the personal pages under one sidebar entry. Each
// tab keeps its own address, so links in emails and WhatsApp still work.
export const PROFILE_TABS = [
  { href: "/users/profile", label: "Profile" },
  { href: "/users/notifications", label: "Notifications" },
  { href: "/users/delegation", label: "Out of office" },
  { href: "/users/security", label: "Sign-in & devices" },
] as const;

export function ProfileTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Profile" className="-mx-4 mb-6 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {PROFILE_TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`-mb-px block whitespace-nowrap border-b-2 px-3 py-2.5 text-label ${active ? "border-primary-600 font-semibold text-primary-700" : "border-transparent text-ink-muted hover:border-line hover:text-ink"}`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
