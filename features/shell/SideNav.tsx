"use client";

import Link, { useLinkStatus } from "next/link";
import { useEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Spinner } from "@/features/ui/Spinner";
import { usePathname, useRouter } from "next/navigation";
import { NavIcon, SectionIcon } from "@/features/shell/nav-icons";
import { ChatList, type ChatSummary } from "@/features/shell/ChatList";

export interface NavItem {
  href: string;
  label: string;
  also?: readonly string[]; // other pages this entry stays highlighted on (the Profile tabs)
  count?: number; // e.g. how many approvals are waiting (from the server)
  section?: string; // v1.9.0: the module group this entry belongs to (My Approvals, Tasks, Information…)
  chats?: boolean; // D-180: the group shows the person's AI chats (with a search) instead of links
}

// v1.9.2 (owner): with `collapsible`, consecutive entries of one section
// form a group with a header button that opens and closes it like a
// dropdown (My Approvals, Tasks, Information). The group holding the current
// page opens by itself; other choices are remembered in this browser.
const STORAGE_KEY = "ars.nav.groups";
type Block = { kind: "item"; item: NavItem } | { kind: "group"; section: string; items: NavItem[] };

function blocks(items: NavItem[]): Block[] {
  const out: Block[] = [];
  for (const item of items) {
    const last = out[out.length - 1];
    if (item.section && last?.kind === "group" && last.section === item.section) last.items.push(item);
    else if (item.section) out.push({ kind: "group", section: item.section, items: [item] });
    else out.push({ kind: "item", item });
  }
  return out;
}

function readStored(): Record<string, boolean> {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as unknown;
    return value && typeof value === "object" ? (value as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function SideNav({ items, collapsible = false, chats = [] }: { items: NavItem[]; collapsible?: boolean; chats?: ChatSummary[] }) {
  const pathname = usePathname();
  // Only the most specific entry is highlighted (My tasks vs Assigned by me
  // under /users/tasks/assigned).
  const matches = (href: string) => pathname === href || (href.split("/").length > 2 && pathname.startsWith(`${href}/`));
  const best = items.filter((item) => matches(item.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const isActive = (item: NavItem) => item.href === best || (item.also ?? []).some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const list = blocks(items);
  const activeGroup = list.find((block) => block.kind === "group" && block.items.some(isActive));
  const activeName = activeGroup?.kind === "group" ? activeGroup.section : null;

  // Server render: only the group with the current page is open. After
  // loading, the person's remembered choices apply, and the current page's
  // group opens when they arrive on it.
  const [open, setOpen] = useState<Record<string, boolean>>(() => (activeName ? { [activeName]: true } : {}));
  useEffect(() => {
    setOpen((current) => ({ ...current, ...readStored(), ...(activeName ? { [activeName]: true } : {}) }));
  }, [activeName]);
  const toggle = (section: string) =>
    setOpen((current) => {
      const next = { ...current, [section]: !current[section] };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // storage blocked: the choice lasts for this page only
      }
      return next;
    });

  if (!collapsible) {
    return (
      <nav className="space-y-0.5 p-3" aria-label="Main">
        {items.map((item, index) => {
          const heading = item.section && item.section !== items[index - 1]?.section ? item.section : null;
          return (
            <div key={item.href}>
              {heading && <p className="px-3 pb-1 pt-4 text-caption font-semibold uppercase tracking-wider text-ink-faint first:pt-1">{heading}</p>}
              <EntryLink item={item} active={isActive(item)} />
            </div>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="space-y-0.5 p-3" aria-label="Main">
      {list.map((block) =>
        block.kind === "item" ? (
          <EntryLink key={block.item.href} item={block.item} active={isActive(block.item)} />
        ) : (
          <NavGroup key={block.section} section={block.section} items={block.items} chats={block.items.some((item) => item.chats) ? chats : null} open={Boolean(open[block.section])} current={activeName === block.section} onToggle={() => toggle(block.section)} isActive={isActive} />
        ),
      )}
    </nav>
  );
}

function NavGroup({ section, items, chats, open, current, onToggle, isActive }: { section: string; items: NavItem[]; chats: ChatSummary[] | null; open: boolean; current: boolean; onToggle: () => void; isActive: (item: NavItem) => boolean }) {
  const id = useId();
  // A waiting count inside a closed group shows on its header.
  const waiting = items.reduce((sum, item) => sum + (item.count ?? 0), 0);
  const router = useRouter();
  // D-180 (owner): the AI Assistant header starts a new chat and opens the
  // chat list at the same time; its arrow alone closes or opens the list.
  if (chats) {
    return (
      <div data-testid={`nav-group-${section}`}>
        <div className={`flex items-center rounded-md border-l-[3px] ${current && !open ? "border-primary-600 bg-primary-50 text-primary-700" : "border-transparent text-ink-muted hover:bg-surface-muted hover:text-ink"}`}>
          <button
            type="button"
            onClick={() => {
              if (!open) onToggle();
              router.push(items[0]?.href ?? "/users/ai/assistant");
            }}
            className={`flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-left text-body ${current ? "font-semibold" : ""}`}
          >
            <SectionIcon section={section} />
            <span className="flex-1">{section}</span>
          </button>
          <button type="button" aria-expanded={open} aria-controls={id} aria-label={open ? "Hide chats" : "Show chats"} title={open ? "Hide chats" : "Show chats"} onClick={onToggle} className="mr-1 rounded p-1.5 hover:text-ink">
            <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
        <div id={id} hidden={!open} className="ml-4 mt-0.5 border-l border-line pl-2">
          <ChatList chats={chats} />
        </div>
      </div>
    );
  }
  return (
    <div data-testid={`nav-group-${section}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
        className={`flex w-full items-center gap-2.5 rounded-md border-l-[3px] px-3 py-2 text-left text-body transition-colors ${current && !open ? "border-primary-600 bg-primary-50 text-primary-700" : "border-transparent text-ink-muted hover:bg-surface-muted hover:text-ink"} ${current ? "font-semibold" : ""}`}
      >
        <SectionIcon section={section} />
        <span className="flex-1">{section}</span>
        {!open && waiting > 0 && (
          <span className="rounded-full bg-primary-50 px-1.5 text-caption font-semibold text-primary-700">
            {waiting > 99 ? "99+" : waiting}
            <span className="sr-only"> waiting</span>
          </span>
        )}
        <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
      </button>
      {(
        <ul id={id} hidden={!open} className="ml-4 mt-0.5 space-y-0.5 border-l border-line pl-2">
          {items.map((item) => (
            <li key={item.href}>
              <EntryLink item={item} active={isActive(item)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EntryLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
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
  );
}

// While this link's page loads, a small spinner shows on it (QA session 14,
// DEF-01): before, a slow page change gave no sign the click had registered.
function PendingMark() {
  const { pending } = useLinkStatus();
  return pending ? <Spinner className="h-3.5 w-3.5 shrink-0" label="Loading" /> : null;
}
