"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { quickAddAction, taskFieldsAction } from "@/app/users/work/actions";
import { TaskCheck, usePaneLink, useWorkCall } from "@/features/work/client";
import { indiaDayOf } from "@/features/work/format";

// D-215: tasks on a month grid by due date (India time). Drag a task to
// another day to move its due date; "+" on a day adds a task due that day.
// Undated tasks wait in "No due date".
export interface CalendarTask {
  id: number;
  title: string;
  status: string;
  dueAt: string | null;
  assigneeId: number;
  isMilestone: boolean;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function TaskCalendar({ tasks, month, todayDay, canEdit, meId, projectId, monthHref, holidays = {} }: { tasks: CalendarTask[]; month: string; todayDay: string; canEdit: boolean; meId: number; projectId?: number; monthHref: string; holidays?: Record<string, string> }) {
  const hrefFor = (value: string) => `${monthHref}${value}`;
  const { call, pending: busy } = useWorkCall();
  const paneLink = usePaneLink();
  const [dragging, setDragging] = useState<number | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [year, monthIndex] = month.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(year, monthIndex - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const days = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  const cells = Math.ceil((lead + days) / 7) * 7;
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarTask[]>();
    for (const task of tasks) if (task.dueAt) map.set(indiaDayOf(new Date(task.dueAt)), [...(map.get(indiaDayOf(new Date(task.dueAt))) ?? []), task]);
    return map;
  }, [tasks]);
  const undated = tasks.filter((task) => !task.dueAt && task.status !== "COMPLETED" && task.status !== "CANCELLED");
  const shift = (delta: number) => {
    const date = new Date(Date.UTC(year, monthIndex - 1 + delta, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const may = (task: CalendarTask) => canEdit || task.assigneeId === meId;
  const drop = (day: string) => {
    const task = tasks.find((item) => item.id === dragging);
    setDragging(null);
    if (task && may(task)) void call((choice) => taskFieldsAction(task.id, { dueDay: choice?.moveTo ?? day, holidayOk: choice?.holidayOk }), { success: "Due date moved." });
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]" data-testid="task-calendar">
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Link href={hrefFor(shift(-1))} className="btn-secondary btn-compact" aria-label="Previous month">
            ‹
          </Link>
          <h2 className="min-w-0 text-center font-semibold sm:min-w-40">
            {MONTH_NAMES[monthIndex - 1]} {year}
          </h2>
          <Link href={hrefFor(shift(1))} className="btn-secondary btn-compact" aria-label="Next month">
            ›
          </Link>
          <Link href={hrefFor(todayDay.slice(0, 7))} className="btn-secondary btn-compact">
            Today
          </Link>
        </div>
        <div role="grid" aria-label={`${MONTH_NAMES[monthIndex - 1]} ${year}`} className="grid grid-cols-7 overflow-hidden rounded-lg border border-line">
          {WEEKDAYS.map((day) => (
            <div key={day} role="columnheader" className="border-b border-line bg-surface-muted px-2 py-1 text-caption font-semibold text-ink-faint">
              {day}
            </div>
          ))}
          {Array.from({ length: cells }, (_, index) => {
            const date = index - lead + 1;
            if (date < 1 || date > days) return <div key={index} role="gridcell" className="min-h-24 border-b border-r border-line bg-surface-muted/50" />;
            const day = `${month}-${String(date).padStart(2, "0")}`;
            const list = byDay.get(day) ?? [];
            return (
              <div
                key={index}
                role="gridcell"
                aria-label={day}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  drop(day);
                }}
                className={`group min-h-24 border-b border-r border-line p-1 ${day === todayDay ? "bg-primary-50" : holidays[day] ? "bg-warning-50" : "bg-surface"}`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-caption ${day === todayDay ? "bg-primary-solid font-bold text-white" : "text-ink-muted"}`}>{date}</span>
                  {holidays[day] && (
                    <span className="min-w-0 flex-1 truncate text-caption text-warning-600" title={`Holiday: ${holidays[day]}`} data-testid="calendar-holiday">
                      {holidays[day]}
                    </span>
                  )}
                  {canEdit && (
                    <button type="button" aria-label={`Add a task due ${day}`} onClick={() => setAdding(day)} className="rounded px-1 text-caption text-ink-faint opacity-0 hover:bg-surface-muted group-hover:opacity-100 focus:opacity-100">
                      +
                    </button>
                  )}
                </div>
                <ul className="space-y-0.5">
                  {list.map((task) => (
                    <li key={task.id} draggable={may(task)} onDragStart={() => setDragging(task.id)} className="flex items-center gap-1 rounded bg-surface-muted px-1 py-0.5 text-caption">
                      <TaskCheck taskId={task.id} done={task.status === "COMPLETED"} disabled={!may(task)} label={task.title} size="sm" />
                      <Link href={paneLink(task.id)} scroll={false} className={`min-w-0 truncate hover:underline ${task.status === "COMPLETED" ? "text-ink-muted line-through" : ""}`}>
                        {task.isMilestone ? "◆ " : ""}
                        {task.title}
                      </Link>
                    </li>
                  ))}
                </ul>
                {adding === day && (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!title.trim() || busy) return;
                      void call((choice) => quickAddAction({ title, projectId: projectId ?? null, dueDay: choice?.moveTo ?? day, holidayOk: choice?.holidayOk }), { success: "Added." }).then((result) => {
                        if (result?.ok) {
                          setTitle("");
                          setAdding(null);
                        }
                      });
                    }}
                  >
                    <input autoFocus aria-label={`New task due ${day}`} aria-busy={busy || undefined} readOnly={busy} value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => event.key === "Escape" && setAdding(null)} className="field-input h-7 text-caption" placeholder="Task name, Enter" />
                  </form>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <aside aria-label="No due date" className="card h-fit px-3 py-2" onDragOver={(event) => event.preventDefault()}>
        <h3 className="mb-1 text-label font-semibold">No date ({undated.length})</h3>
        <p className="mb-2 text-caption text-ink-muted">Drag one onto a day to give it a due date.</p>
        <ul className="space-y-1">
          {undated.slice(0, 50).map((task) => (
            <li key={task.id} draggable={may(task)} onDragStart={() => setDragging(task.id)} className="truncate rounded bg-surface-muted px-2 py-1 text-caption">
              <Link href={paneLink(task.id)} scroll={false} className="hover:underline">
                {task.title}
              </Link>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
