"use client";

import { ListPlus, Plus } from "lucide-react";
import { CREATE_TASK_EVENT } from "@/features/work/client";
import { ADD_CLASS } from "@/features/mobile/dock";

const open = () => window.dispatchEvent(new CustomEvent(CREATE_TASK_EVENT, { detail: { projectId: null } }));

// v1.43.0: the mobile ways to start a task; both open the app's one Create
// task window (TaskCreator), so there is no second form.
export function QuickNewTask() {
  return (
    <button type="button" onClick={open} className="flex min-h-[72px] w-full flex-col items-center justify-center gap-1.5 rounded-xl bg-surface p-2 text-center text-[12px] font-semibold shadow-sm">
      <ListPlus aria-hidden="true" className="h-5 w-5 text-[color:var(--m-navy-text)]" />
      New task
    </button>
  );
}

// v1.45.0: the red + in the Tasks screen's floating view switcher.
export function TaskDockAdd() {
  return (
    <button type="button" onClick={open} aria-label="New task" data-testid="m-task-fab" className={ADD_CLASS}>
      <Plus aria-hidden="true" className="h-6 w-6" strokeWidth={2.5} />
    </button>
  );
}
