"use client";

import { CheckSquare, FileCheck2, FolderKanban, Megaphone, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CREATE_TASK_EVENT } from "@/features/work/client";

// D-221 (owner: "the new button should be at the top; on clicking it asks
// create Approval, Task, Project"): the sidebar's + Create, as in Asana.
// Approval opens New request; Task opens the Draft task panel; Project opens
// the new-project steps; Information (when the person has it) opens its form.
// D-229: `compact` is the collapsed sidebar's round + (the menu opens beside it).
export function CreateMenu({ approval, task, information, compact = false }: { approval: boolean; task: boolean; information: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (!open) return;
    box.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const close = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const items = [
    approval && { key: "approval", label: "Approval request", hint: "Ask people to approve, at any levels", icon: FileCheck2, run: () => router.push("/users/custom") },
    task && { key: "task", label: "Task", hint: "Ad hoc or periodic", icon: CheckSquare, run: () => window.dispatchEvent(new CustomEvent(CREATE_TASK_EVENT, { detail: { projectId: null } })) },
    task && { key: "project", label: "Project", hint: "Blank or from a template", icon: FolderKanban, run: () => router.push("/users/work/projects/new") },
    information && { key: "information", label: "Information", hint: "Tell people something", icon: Megaphone, run: () => router.push("/users/information/new") },
  ].filter(Boolean) as { key: string; label: string; hint: string; icon: typeof Plus; run: () => void }[];
  if (!items.length) return null;
  return (
    <div ref={box} className={compact ? "relative mb-2" : "relative px-3 pt-3"} data-testid="create-menu">
      {compact ? (
        <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label="Create" title="Create" onClick={() => setOpen((value) => !value)} className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary-solid text-on-solid shadow-button hover:bg-primary-solid-hover">
          <Plus aria-hidden="true" className="h-5 w-5" />
        </button>
      ) : (
        <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="btn-primary inline-flex w-full items-center justify-center gap-1.5">
          <Plus aria-hidden="true" className="h-4 w-4" /> Create
        </button>
      )}
      {open && (
        <div
          role="menu"
          aria-label="Create"
          className={`absolute z-50 rounded-lg border border-line bg-raised p-1 shadow-overlay ${compact ? "left-full top-0 ml-2 w-64" : "left-3 right-3 mt-1"}`}
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            event.preventDefault();
            const list = [...(box.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
            const index = list.indexOf(document.activeElement as HTMLElement);
            list[(index + (event.key === "ArrowDown" ? 1 : list.length - 1)) % list.length]?.focus();
          }}
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.run();
              }}
              className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-surface-muted focus:bg-surface-muted focus:outline-none"
            >
              <item.icon aria-hidden="true" className="h-5 w-5 shrink-0 text-primary-700" />
              <span>
                <span className="block text-label font-semibold text-ink">{item.label}</span>
                <span className="block text-caption text-ink-muted">{item.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
