"use client";

import { ChevronDown, FolderKanban, Home, Inbox, LayoutTemplate, ListChecks, Plus, Repeat, Search, Star } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { isTyping } from "@/features/shell/shortcuts";
import { CREATE_TASK_EVENT, ProjectDot } from "@/features/work/client";

// D-219 (owner: "the skeleton that matches Asana"): the Tasks area's own
// left bar: + Create, Home, My Tasks, Inbox, Periodic tasks, Search, then
// Starred and every project the person can see by department, Templates.
// Its keyboard: Q creates a task, G then H/M/I/P/S goes, J/K move through
// rows, X ticks, Enter opens, Esc closes the task pane. Keys are taken
// before the Classic view's letters only when they are used here.
export interface RailProject {
  id: number;
  name: string;
  color: string;
  starred: boolean;
  department: string | null;
}

// The catalog's sidebar order (SCREEN_DESIGN_CATALOG §2): Home, Inbox, then
// My tasks and Projects; Periodic tasks and Search are ours.
const MAIN = [
  { href: "/users/work", label: "Home", key: "h", icon: Home, group: 1 },
  { href: "/users/work/inbox", label: "Inbox", key: "i", icon: Inbox, group: 1 },
  { href: "/users/work/my-tasks", label: "My Tasks", key: "m", icon: ListChecks, group: 2 },
  { href: "/users/work/projects", label: "All projects", key: "p", icon: FolderKanban, group: 2 },
  { href: "/users/work/periodic", label: "Periodic tasks", key: "r", icon: Repeat, group: 2 },
  { href: "/users/work/search", label: "Search", key: "s", icon: Search, group: 2 },
];

export function WorkRail({ unread, projects }: { unread: number; projects: RailProject[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const awaitingG = useRef(0);
  // D-221: the Draft task panel lives at app level (TaskCreator); this asks for it.
  const openCreate = () => {
    const project = /\/users\/work\/projects\/(\d+)/.exec(window.location.pathname)?.[1];
    window.dispatchEvent(new CustomEvent(CREATE_TASK_EVENT, { detail: { projectId: project ? Number(project) : null } }));
  };
  const [open, setOpen] = useState(false); // the bar on small screens

  useEffect(() => {
    const rows = () => [...document.querySelectorAll<HTMLElement>(".work-row")];
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target) || document.querySelector("dialog[open]")) return;
      const key = event.key.toLowerCase();
      const take = () => {
        event.preventDefault();
        event.stopPropagation();
      };
      if (key === "escape") {
        const pane = document.querySelector<HTMLElement>("[data-task-pane]");
        if (pane?.dataset.closeHref) {
          take();
          router.push(pane.dataset.closeHref, { scroll: false });
        }
        return;
      }
      if (Date.now() - awaitingG.current < 1500) {
        awaitingG.current = 0;
        const item = MAIN.find((entry) => entry.key === key);
        if (item) {
          take();
          router.push(item.href);
        }
        return;
      }
      if (key === "g") {
        take();
        awaitingG.current = Date.now();
      } else if (key === "q") {
        take();
        openCreate();
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

  const active = (href: string) => (href === "/users/work" ? pathname === href : pathname.startsWith(href) && !(href === "/users/work/projects" && /\/projects\/\d+/.test(pathname)));
  const starred = projects.filter((project) => project.starred);
  const groups = new Map<string, RailProject[]>();
  for (const project of projects) groups.set(project.department ?? "Other projects", [...(groups.get(project.department ?? "Other projects") ?? []), project]);
  const currentProject = /\/users\/work\/projects\/(\d+)/.exec(pathname)?.[1];
  const projectLink = (project: RailProject) => (
    <li key={project.id}>
      <Link
        href={`/users/work/projects/${project.id}`}
        aria-current={currentProject === String(project.id) ? "page" : undefined}
        className={`flex items-center gap-2 rounded-md px-2 py-1 text-label ${currentProject === String(project.id) ? "bg-primary-50 font-semibold text-primary-700" : "text-ink hover:bg-surface-muted"}`}
      >
        <ProjectDot color={project.color} className="h-3 w-3" />
        <span className="truncate">{project.name}</span>
        <span className="sr-only">, Project</span>
      </Link>
    </li>
  );

  return (
    <>
      <nav aria-label="Tasks and projects" data-testid="work-rail" className="mb-4 lg:sticky lg:top-4 lg:mb-0 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
        <div className="flex items-center gap-2">
          <button type="button" onClick={openCreate} aria-keyshortcuts="Q" className="btn-primary btn-compact inline-flex flex-1 items-center justify-center gap-1" data-testid="create-task">
            <Plus aria-hidden="true" className="h-4 w-4" /> Create task
          </button>
          <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="btn-secondary btn-compact lg:hidden" aria-label="Show the Tasks menu">
            <ChevronDown aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        <div className={`${open ? "block" : "hidden"} mt-3 space-y-4 lg:block`}>
          <ul className="space-y-0.5">
            {MAIN.map((item, index) => (
              <li key={item.href} className={index > 0 && MAIN[index - 1]!.group !== item.group ? "mt-2 border-t border-line pt-2" : undefined}>
                <Link
                  href={item.href}
                  aria-current={active(item.href) ? "page" : undefined}
                  aria-keyshortcuts={`G ${item.key.toUpperCase()}`}
                  className={`flex h-8 items-center gap-2 rounded-md px-2 text-label ${active(item.href) ? "bg-primary-50 font-semibold text-primary-700" : "text-ink hover:bg-surface-muted"}`}
                >
                  <item.icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {item.key === "i" && unread > 0 && (
                    <span className="rounded-full bg-primary-solid px-1.5 text-caption text-white" aria-label={`${unread} unread`}>
                      {unread}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
          {starred.length > 0 && (
            <RailSection title="Starred" icon={<Star aria-hidden="true" className="h-3 w-3" />}>
              <ul className="space-y-0.5">{starred.map(projectLink)}</ul>
            </RailSection>
          )}
          {[...groups.entries()].map(([group, items]) => (
            <RailSection key={group} title={group} addHref="/users/work/projects/new">
              <ul className="space-y-0.5" data-testid="rail-projects">
                {items.map(projectLink)}
              </ul>
            </RailSection>
          ))}
          <ul className="space-y-0.5 border-t border-line pt-3">
            <li>
              <Link href="/users/work/projects/new" className="flex items-center gap-2 rounded-md px-2 py-1 text-label text-ink-muted hover:bg-surface-muted hover:text-ink">
                <Plus aria-hidden="true" className="h-4 w-4" /> New project
              </Link>
            </li>
            <li>
              <Link href="/users/work/projects?show=templates" className="flex items-center gap-2 rounded-md px-2 py-1 text-label text-ink-muted hover:bg-surface-muted hover:text-ink">
                <LayoutTemplate aria-hidden="true" className="h-4 w-4" /> Templates
              </Link>
            </li>
            <li>
              <Link href="/users/tasks/new" className="flex items-center gap-2 rounded-md px-2 py-1 text-label text-ink-muted hover:bg-surface-muted hover:text-ink">
                <Plus aria-hidden="true" className="h-4 w-4" /> Task with a type (form)
              </Link>
            </li>
          </ul>
        </div>
      </nav>
    </>
  );
}

// A collapsible sidebar section (Starred, each department), remembered on this device.
function RailSection({ title, icon, addHref, children }: { title: string; icon?: React.ReactNode; addHref?: string; children: React.ReactNode }) {
  const key = `ars.rail.${title}`;
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(key) === "0") setOpen(false);
    } catch {
      /* storage may be blocked */
    }
  }, [key]);
  const toggle = () => {
    setOpen((value) => {
      try {
        window.localStorage.setItem(key, value ? "0" : "1");
      } catch {
        /* storage may be blocked */
      }
      return !value;
    });
  };
  return (
    <div>
      <div className="group flex items-center px-1">
        <button type="button" aria-expanded={open} onClick={toggle} className="flex flex-1 items-center gap-1 rounded px-1 py-1 text-left text-caption font-semibold uppercase tracking-wide text-ink-faint hover:text-ink">
          <ChevronDown aria-hidden="true" className={`h-3 w-3 transition ${open ? "" : "-rotate-90"}`} />
          {icon}
          <span className="truncate">{title}</span>
        </button>
        {addHref && (
          <Link href={addHref} aria-label={`New project in ${title}`} className="rounded p-1 text-ink-faint opacity-0 hover:bg-surface-muted hover:text-ink focus:opacity-100 group-hover:opacity-100">
            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      {open && children}
    </div>
  );
}
