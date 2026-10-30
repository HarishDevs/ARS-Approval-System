"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { isTyping } from "@/features/shell/shortcuts";

// D-215: the Task & Project Management tabs, and its keyboard: Q adds a task,
// G then H/M/P/S goes to a tab, J/K move through task rows, X completes the
// selected one, Enter opens it. Handled before the Classic view's own
// letters (capture phase) only when one of these keys is used here.
const TABS = [
  { href: "/users/work", label: "Home", key: "h" },
  { href: "/users/work/my-tasks", label: "My Tasks", key: "m" },
  { href: "/users/work/projects", label: "Projects", key: "p" },
  { href: "/users/work/search", label: "Search", key: "s" },
];

export function WorkNav() {
  const pathname = usePathname();
  const router = useRouter();
  const awaitingG = useRef(0);
  useEffect(() => {
    const rows = () => [...document.querySelectorAll<HTMLElement>(".work-row")];
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target) || document.querySelector("dialog[open]")) return;
      const key = event.key.toLowerCase();
      const take = () => {
        event.preventDefault();
        event.stopPropagation();
      };
      if (Date.now() - awaitingG.current < 1500) {
        awaitingG.current = 0;
        const tab = TABS.find((item) => item.key === key);
        if (tab) {
          take();
          router.push(tab.href);
        }
        return;
      }
      if (key === "g") {
        take();
        awaitingG.current = Date.now();
      } else if (key === "q") {
        const box = document.querySelector<HTMLInputElement>("[data-work-add]");
        if (box) {
          take();
          box.focus();
        }
      } else if (key === "j" || key === "k") {
        const list = rows();
        if (!list.length) return;
        take();
        const index = list.findIndex((row) => row === document.activeElement || row.contains(document.activeElement));
        const next = list[Math.max(0, Math.min(list.length - 1, index + (key === "j" ? 1 : -1)))] ?? list[0]!;
        next.tabIndex = -1;
        next.focus();
        next.scrollIntoView({ block: "nearest" });
      } else if (key === "x" || key === "enter") {
        const row = rows().find((item) => item === document.activeElement);
        if (!row) return;
        take();
        if (key === "x") row.querySelector<HTMLButtonElement>("[data-testid=task-check]")?.click();
        else row.querySelector<HTMLAnchorElement>("a[href]")?.click();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [router]);

  const active = (href: string) => (href === "/users/work" ? pathname === href : pathname.startsWith(href));
  return (
    <nav aria-label="Tasks and projects" className="mb-5 flex flex-wrap gap-1 border-b border-line" data-testid="work-nav">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={active(tab.href) ? "page" : undefined}
          aria-keyshortcuts={`G ${tab.key.toUpperCase()}`}
          className={`-mb-px border-b-2 px-3 py-2 text-label font-medium ${active(tab.href) ? "border-primary-600 text-primary-700" : "border-transparent text-ink-muted hover:text-ink"}`}
        >
          {tab.label}
        </Link>
      ))}
      <Link href="/users/tasks/new" className="-mb-px ml-auto border-b-2 border-transparent px-3 py-2 text-label text-ink-muted hover:text-ink">
        New task (with a type)
      </Link>
    </nav>
  );
}
