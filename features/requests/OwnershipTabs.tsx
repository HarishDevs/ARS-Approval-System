import Link from "next/link";
import { UserRound, UsersRound } from "lucide-react";

// D-256 (owner's My Requests design): Raised by me / Shared with me, each
// with how many requests it holds in all.
export function OwnershipTabs({ current, mine, shared }: { current: "mine" | "shared"; mine: number; shared: number }) {
  const tabs = [
    { key: "mine", href: "/users/requests", label: "Raised by me", count: mine, icon: UserRound },
    { key: "shared", href: "/users/collaborating", label: "Shared with me", count: shared, icon: UsersRound },
  ] as const;
  return (
    <nav aria-label="Which requests" className="mb-4 border-b border-line" data-testid="ownership-tabs">
      <ul className="flex gap-1">
        {tabs.map((tab) => {
          const active = current === tab.key;
          return (
            <li key={tab.key}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-label ${active ? "border-primary-600 font-semibold text-primary-700" : "border-transparent text-ink-muted hover:text-ink"}`}
              >
                <tab.icon className="h-4 w-4" aria-hidden="true" />
                {tab.label}
                <span className={`rounded-full px-2 py-0.5 text-caption tabular-nums ${active ? "bg-primary-50 text-primary-700" : "bg-surface-muted text-ink-muted"}`}>{tab.count.toLocaleString("en-IN")}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
