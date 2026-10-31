"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { isTyping } from "@/features/shell/shortcuts";
import { CREATE_TASK_EVENT } from "@/features/work/client";

// D-219: the Tasks area's keyboard: Q creates a task, G then H/I/M/P/R/S
// goes, J/K move through rows, X ticks, Enter opens, Esc closes the task
// pane. Keys are taken before the Classic view's letters only when they are
// used here. D-223 (owner): the area's own left bar is gone; its pages are
// the sidebar's "Tasks & projects" group, and + Create makes tasks.
const MAIN = [
  { href: "/users/work", key: "h" },
  { href: "/users/work/inbox", key: "i" },
  { href: "/users/work/my-tasks", key: "m" },
  { href: "/users/work/projects", key: "p" },
  { href: "/users/work/periodic", key: "r" },
  { href: "/users/work/search", key: "s" },
];

export function WorkKeys() {
  const router = useRouter();
  const awaitingG = useRef(0);
  // D-221: the Draft task panel lives at app level (TaskCreator); this asks for it.
  const openCreate = () => {
    const project = /\/users\/work\/projects\/(\d+)/.exec(window.location.pathname)?.[1];
    window.dispatchEvent(new CustomEvent(CREATE_TASK_EVENT, { detail: { projectId: project ? Number(project) : null } }));
  };

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

  return null;
}
