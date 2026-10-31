"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { useState } from "react";
import { NavIcon, SectionIcon } from "@/features/shell/nav-icons";
import { CreateMenu } from "@/features/shell/CreateMenu";
import { SIDEBAR_COOKIE } from "@/features/shell/sidebar-cookie";

// D-229 (owner: "make the sidebar collapsible like Asana for the whole
// Application"): ☰ at the top folds the sidebar into a narrow rail of icons
// with small labels (Asana's), and opens it again. Kept in a cookie so the
// server draws the right width on the next page (no jump). A group's icon in
// the rail opens the sidebar with that group open.
const GROUPS_KEY = "ars.nav.groups"; // SideNav's remembered open groups

export type RailEntry = { kind: "item"; href: string; label: string } | { kind: "group"; section: string; href: string; label: string };

export function SidebarFrame({
  initialCollapsed,
  homeHref,
  homeLabel,
  rail,
  create,
  children,
}: {
  initialCollapsed: boolean;
  homeHref: string;
  homeLabel: string;
  rail: RailEntry[];
  create: { approval: boolean; task: boolean; information: boolean } | null;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const pathname = usePathname();
  const set = (value: boolean) => {
    setCollapsed(value);
    document.cookie = `${SIDEBAR_COOKIE}=${value ? "rail" : "open"}; path=/; max-age=31536000; samesite=lax`;
  };
  const openGroup = (section: string) => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(GROUPS_KEY) ?? "{}") as Record<string, boolean>;
      window.localStorage.setItem(GROUPS_KEY, JSON.stringify({ ...stored, [section]: true }));
    } catch {
      // storage blocked: the group opens when its page is shown
    }
    set(false);
  };
  const here = (href: string) => pathname === href || (href.split("/").length > 2 && pathname.startsWith(`${href}/`));

  return (
    <aside
      className={`hidden shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-150 motion-reduce:transition-none md:sticky md:top-0 md:flex md:h-dvh md:self-start ${collapsed ? "w-[4.5rem]" : "w-sidebar"}`}
      data-testid="sidebar"
      data-collapsed={collapsed ? "true" : undefined}
    >
      <div className={`flex h-topbar shrink-0 items-center gap-2 border-b border-line ${collapsed ? "justify-center px-2" : "px-3"}`}>
        <button
          type="button"
          onClick={() => set(!collapsed)}
          aria-label={collapsed ? "Open the sidebar" : "Collapse the sidebar"}
          aria-expanded={!collapsed}
          title={collapsed ? "Open the sidebar" : "Collapse the sidebar"}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink"
          data-testid="sidebar-toggle"
        >
          <Menu aria-hidden="true" className="h-5 w-5" />
        </button>
        {!collapsed && (
          // WEB-17 (v1.10.0): the logo goes to this space's first page.
          <Link href={homeHref} aria-label={homeLabel} className="rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600">
            {/* eslint-disable-next-line @next/next/no-img-element -- static SVG logo */}
            <img src="/brand/ars-green-steel.svg" alt="" width={77} height={36} className="h-9 w-auto" />
          </Link>
        )}
      </div>
      {collapsed ? (
        <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto px-1.5 py-3" data-testid="sidebar-rail">
          {create && <CreateMenu {...create} compact />}
          {rail.map((entry) => {
            const active = entry.kind === "item" ? here(entry.href) : false;
            const body = (
              <>
                {entry.kind === "item" ? <NavIcon href={entry.href} className="h-5 w-5" /> : <SectionIcon section={entry.section} className="h-5 w-5" />}
                <span className="line-clamp-2 w-full text-center text-[length:calc(10px*var(--text-scale,1))] leading-tight">{entry.label}</span>
              </>
            );
            const style = `flex w-full flex-col items-center gap-1 rounded-md px-1 py-1.5 ${active ? "bg-primary-50 text-primary-700" : "text-ink-muted hover:bg-surface-muted hover:text-ink"}`;
            return entry.kind === "item" ? (
              <Link key={entry.href} href={entry.href} aria-current={active ? "page" : undefined} title={entry.label} className={style}>
                {body}
              </Link>
            ) : (
              <button key={entry.section} type="button" title={`${entry.label}: open the sidebar`} onClick={() => openGroup(entry.section)} className={style}>
                {body}
              </button>
            );
          })}
        </nav>
      ) : (
        children
      )}
    </aside>
  );
}
