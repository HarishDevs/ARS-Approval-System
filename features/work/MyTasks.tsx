"use client";

import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { myPlaceAction, mySectionAction } from "@/app/users/work/actions";
import { ProjectDot, TaskCheck, usePaneLink, useWorkCall } from "@/features/work/client";
import { Repeat } from "lucide-react";
import { dueLabel, TONE_TEXT } from "@/features/work/format";
import { AddTask, useAutoRefresh } from "@/features/work/ProjectWorkspace";
import { BulkBar } from "@/features/work/MoreParts";
import { TaskGrid, type GridView } from "@/features/work/TaskGrid";
import type { GridConfig, GridTask } from "@/server/work/grid";

// D-215: My Tasks. The person's own sections: Recently assigned, Today,
// Upcoming, Later (built in) and any they add. Drag a task between sections
// or reorder it (only the person sees this order); tasks move forward to
// Today and Upcoming by themselves as their due date comes near.
export interface MyTaskRow {
  id: number;
  title: string;
  status: string;
  dueAt: string | null;
  sectionId: number;
  position: number;
  assignedByName: string;
  selfAssigned: boolean;
  projects: { id: number; name: string; color: string }[];
  subtasks: number;
  subtasksOpen: number;
  comments: number;
  isPeriodic: boolean; // D-219
}
export interface MySectionRow {
  id: number;
  name: string;
  system: string | null;
}

export function MyTasks({ sections, tasks, layout, nowIso }: { sections: MySectionRow[]; tasks: MyTaskRow[]; layout: "LIST" | "BOARD"; nowIso: string }) {
  const { call } = useWorkCall();
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [dragging, setDragging] = useState<number | null>(null);
  const [newSection, setNewSection] = useState("");
  const [live, setLive] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const paneLink = usePaneLink();
  useAutoRefresh();
  const inSection = (id: number) => tasks.filter((task) => task.sectionId === id).sort((a, b) => a.position - b.position || a.id - b.id);

  const place = (taskId: number, sectionId: number, beforeId: number | null) => {
    const list = inSection(sectionId).filter((task) => task.id !== taskId);
    const index = beforeId === null ? list.length : Math.max(0, list.findIndex((task) => task.id === beforeId));
    const before = list[index - 1]?.position ?? null;
    const after = list[index]?.position ?? null;
    const position = before !== null && after !== null ? (before + after) / 2 : before !== null ? before + 1024 : after !== null ? after - 1024 : 1024;
    setLive(`Moved to ${sections.find((section) => section.id === sectionId)?.name ?? "section"}.`);
    void call(() => myPlaceAction(taskId, sectionId, position), { success: false });
  };
  const keyMove = (event: React.KeyboardEvent, task: MyTaskRow) => {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    const up = event.key === "ArrowUp";
    if (event.shiftKey) {
      const index = sections.findIndex((section) => section.id === task.sectionId);
      const target = sections[index + (up ? -1 : 1)];
      if (target) place(task.id, target.id, null);
      return;
    }
    const list = inSection(task.sectionId);
    const index = list.findIndex((item) => item.id === task.id);
    if (up && index > 0) place(task.id, task.sectionId, list[index - 1]!.id);
    if (!up && index < list.length - 1) place(task.id, task.sectionId, list[index + 2]?.id ?? null);
  };

  const row = (task: MyTaskRow, card: boolean) => {
    const open = ["OPEN", "IN_PROGRESS", "BLOCKED"].includes(task.status);
    const due = dueLabel(task.dueAt, now, open);
    return (
      <li
        key={task.id}
        tabIndex={-1}
        draggable
        onDragStart={() => setDragging(task.id)}
        onDragEnd={() => setDragging(null)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (dragging !== null && dragging !== task.id) place(dragging, task.sectionId, task.id);
          setDragging(null);
        }}
        onKeyDown={(event) => keyMove(event, task)}
        data-testid="my-task"
        className={`work-row ${card ? "rounded-md border border-line bg-surface p-2.5 shadow-sm" : "flex items-center gap-2 border-b border-line px-3 py-1.5 hover:bg-surface-muted"} ${dragging === task.id ? "opacity-50" : ""}`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <input
            type="checkbox"
            aria-label={`Select ${task.title}`}
            checked={selected.includes(task.id)}
            onChange={(event) => setSelected((value) => (event.target.checked ? [...value, task.id] : value.filter((one) => one !== task.id)))}
          />
          <TaskCheck taskId={task.id} done={task.status === "COMPLETED"} disabled={task.status === "CANCELLED"} label={task.title} />
          <Link href={paneLink(task.id)} scroll={false} className={`min-w-0 flex-1 truncate text-label hover:underline ${task.status === "COMPLETED" ? "text-ink-muted line-through" : ""}`}>
            {task.isPeriodic && <Repeat aria-label="Periodic" className="mr-1 inline h-3.5 w-3.5 text-info-600" />}
            {task.title}
          </Link>
        </div>
        <div className={`flex items-center gap-2 text-caption text-ink-muted ${card ? "mt-1.5 flex-wrap" : "shrink-0"}`}>
          {task.projects.slice(0, 2).map((project) => (
            <span key={project.id} className="inline-flex items-center gap-1">
              <ProjectDot color={project.color} />
              <span className="max-w-32 truncate">{project.name}</span>
            </span>
          ))}
          {!task.selfAssigned && <span className="hidden md:inline">from {task.assignedByName}</span>}
          {task.subtasks > 0 && (
            <span>
              {task.subtasks - task.subtasksOpen}/{task.subtasks} subtasks
            </span>
          )}
          {due && <span className={TONE_TEXT[due.tone]}>{due.text}</span>}
        </div>
      </li>
    );
  };

  const sectionHead = (section: MySectionRow, count: number) => <SectionTitle section={section} count={count} />;
  const addSection = (
    <form
      className={layout === "BOARD" ? "w-64 shrink-0" : "flex items-center gap-2 px-3 py-3"}
      onSubmit={(event) => {
        event.preventDefault();
        if (newSection.trim()) void call(() => mySectionAction("ADD", null, newSection)).then((result) => result?.ok && setNewSection(""));
      }}
    >
      <label htmlFor="my-new-section" className="sr-only">
        New section name
      </label>
      <input id="my-new-section" value={newSection} onChange={(event) => setNewSection(event.target.value)} placeholder="New section…" className="field-input h-8 text-label" />
      <button type="submit" className="btn-secondary btn-compact mt-1 shrink-0">
        Add section
      </button>
    </form>
  );
  const recent = sections.find((section) => section.system === "RECENT");
  return (
    <div>
      <span role="status" aria-live="polite" className="sr-only">
        {live}
      </span>
      {layout === "BOARD" ? (
        <div className="flex gap-3 overflow-x-auto pb-4" data-testid="my-board">
          {sections.map((section) => (
            <section
              key={section.id}
              aria-label={section.name}
              className="flex w-72 shrink-0 flex-col rounded-lg border border-line bg-surface-muted"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (dragging !== null) place(dragging, section.id, null);
                setDragging(null);
              }}
            >
              <div className="px-3 py-2">{sectionHead(section, inSection(section.id).length)}</div>
              <ul className="flex-1 space-y-2 px-2 pb-2">{inSection(section.id).map((task) => row(task, true))}</ul>
              <AddTask mySectionId={section.id} compact />
            </section>
          ))}
          {addSection}
        </div>
      ) : (
        <div className="card" data-testid="my-list">
          {sections.map((section) => (
            <section
              key={section.id}
              aria-label={section.name}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (dragging !== null) place(dragging, section.id, null);
                setDragging(null);
              }}
            >
              <div className="border-b border-line px-3 pb-1 pt-3">{sectionHead(section, inSection(section.id).length)}</div>
              <ul>{inSection(section.id).map((task) => row(task, false))}</ul>
              <AddTask mySectionId={section.id} placeholder={`Add a task to ${section.name}…`} />
            </section>
          ))}
          {addSection}
        </div>
      )}
      <BulkBar ids={selected.filter((one) => tasks.some((task) => task.id === one))} clear={() => setSelected([])} />
      {recent && <p className="mt-2 text-caption text-ink-muted">New tasks given to you land in {recent.name}. Tasks in Upcoming and Later move to Today on their due date.</p>}
    </div>
  );
}

function SectionTitle({ section, count }: { section: MySectionRow; count: number }) {
  const { call } = useWorkCall();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(section.name);
  if (editing)
    return (
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void call(() => mySectionAction("RENAME", section.id, name)).then((result) => result?.ok && setEditing(false));
        }}
      >
        <input autoFocus aria-label="Section name" value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === "Escape" && setEditing(false)} className="field-input h-8 text-label" />
        <button type="submit" className="btn-secondary btn-compact">
          Save
        </button>
      </form>
    );
  return (
    <div className="flex items-center gap-2">
      <h2 className="font-semibold">{section.name}</h2>
      <span className="text-caption text-ink-muted">{count}</span>
      <button type="button" aria-label={`Rename ${section.name}`} onClick={() => setEditing(true)} className="rounded p-1 text-ink-faint hover:bg-surface-muted">
        <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
      {!section.system && (
        <button type="button" aria-label={`Delete section ${section.name}`} onClick={() => void call(() => mySectionAction("DELETE", section.id, ""))} className="rounded p-1 text-ink-faint hover:bg-danger-50 hover:text-danger-600">
          <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// D-220: My Tasks as the shared table (owner's screenshot): your sections as
// groups by default, or any grouping; drag to place (your order only).
export function MyTasksGrid({ rows, sections, initial, view, people, projects, meId, nowIso }: { rows: GridTask[]; sections: MySectionRow[]; initial: GridConfig; view: GridView; people: { id: number; label: string }[]; projects: { id: number; name: string }[]; meId: number; nowIso: string }) {
  const { call } = useWorkCall();
  const place = (taskId: number, sectionId: number, beforeId: number | null) => {
    const list = rows.filter((task) => task.sectionId === sectionId && task.id !== taskId).sort((a, b) => a.position - b.position);
    const index = beforeId === null ? list.length : Math.max(0, list.findIndex((task) => task.id === beforeId));
    const before = list[index - 1]?.position ?? null;
    const after = list[index]?.position ?? null;
    const position = before !== null && after !== null ? (before + after) / 2 : before !== null ? before + 1024 : after !== null ? after - 1024 : 1024;
    void call(() => myPlaceAction(taskId, sectionId, position), { success: false });
  };
  return (
    <TaskGrid
      rows={rows}
      initial={initial}
      columns={["due", "collaborators", "createdBy", "projects", "visibility", "priority"]}
      groupsAllowed={["section", "assignee", "createdBy", "project", "due", "priority", "kind"]}
      sections={sections.map((section) => ({ id: section.id, name: section.name }))}
      sectionHeader={(section, count) => <SectionTitle section={sections.find((item) => item.id === section.id)!} count={count} />}
      onMove={place}
      addTo={{ mySections: true }}
      people={people}
      projects={projects}
      meId={meId}
      nowIso={nowIso}
      view={view}
      testId="my-grid"
      emptyText="Nothing here. Clear the filters, or add a task."
    />
  );
}
