"use client";

import { ChevronDown, ChevronRight, GitBranch, GripVertical, Heart, Lock, MessageSquare, Plus, Trash2, Diamond } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { addSectionAction, moveTaskAction, quickAddAction, quickAddManyAction, sectionAction, taskFieldsAction } from "@/app/users/work/actions";
import { TaskCheck, useWorkCall } from "@/features/work/client";
import { dueLabel, indiaDayOf, TONE_TEXT } from "@/features/work/format";

// D-215: a project's List and Board. Sections hold tasks in the order the
// team set (drag, or Alt+↑/↓ on a row); a sort other than "Manual" only
// changes what this person sees and turns dragging off. Add a task with the
// box at the end of a section (Enter adds and keeps the box for the next one;
// pasting several lines adds one task per line).
export interface BoardTask {
  id: number;
  taskNo: string;
  title: string;
  status: "OPEN" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED" | "CANCELLED";
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  assigneeId: number;
  assigneeName: string;
  dueAt: string | null;
  sectionId: number;
  position: number;
  subtasks: number;
  subtasksOpen: number;
  comments: number;
  likes: number;
  blockedBy: number;
  isMilestone: boolean;
  tags: { id: number; name: string }[];
}
export interface BoardSection {
  id: number;
  name: string;
}
type Sort = "manual" | "due" | "priority" | "title" | "assignee";
const OPEN = new Set(["OPEN", "IN_PROGRESS", "BLOCKED"]);
const PRIORITY_RANK = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 } as const;
const PRIORITY_CLASS = { URGENT: "bg-danger-50 text-danger-600", HIGH: "bg-warning-50 text-warning-600", NORMAL: "", LOW: "" } as const;

export function ProjectWorkspace({
  projectId,
  layout,
  sections,
  tasks,
  canEdit,
  meId,
  people,
  nowIso,
}: {
  projectId: number;
  layout: "LIST" | "BOARD";
  sections: BoardSection[];
  tasks: BoardTask[];
  canEdit: boolean;
  meId: number;
  people: { id: number; label: string }[];
  nowIso: string;
}) {
  const { call } = useWorkCall();
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [showDone, setShowDone] = useState(false);
  const [filter, setFilter] = useState("");
  const [mine, setMine] = useState(false);
  const [sort, setSort] = useState<Sort>("manual");
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [dragging, setDragging] = useState<number | null>(null);
  const [live, setLive] = useState("");
  useAutoRefresh();

  const visible = useMemo(() => {
    const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
    const list = tasks.filter(
      (task) =>
        (showDone || OPEN.has(task.status)) &&
        (!mine || task.assigneeId === meId) &&
        words.every((word) => `${task.title} ${task.taskNo} ${task.assigneeName} ${task.tags.map((tag) => tag.name).join(" ")}`.toLowerCase().includes(word)),
    );
    const by: Record<Sort, (a: BoardTask, b: BoardTask) => number> = {
      manual: (a, b) => a.position - b.position || a.id - b.id,
      due: (a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"),
      priority: (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
      title: (a, b) => a.title.localeCompare(b.title),
      assignee: (a, b) => a.assigneeName.localeCompare(b.assigneeName),
    };
    return [...list].sort(by[sort]);
  }, [tasks, showDone, mine, meId, filter, sort]);
  const manual = sort === "manual" && !filter && !mine;
  const canDrag = canEdit && manual;

  const inSection = (sectionId: number) => visible.filter((task) => task.sectionId === sectionId);

  // A move: into `sectionId`, before `beforeId` (null: at the end).
  const move = async (taskId: number, sectionId: number, beforeId: number | null) => {
    const list = tasks.filter((task) => task.sectionId === sectionId && task.id !== taskId).sort((a, b) => a.position - b.position);
    const index = beforeId === null ? list.length : list.findIndex((task) => task.id === beforeId);
    const afterId = index > 0 ? list[index - 1]!.id : null;
    const task = tasks.find((item) => item.id === taskId);
    const section = sections.find((item) => item.id === sectionId);
    setLive(`Moved ${task?.title ?? "task"} to ${section?.name ?? "section"}.`);
    await call(() => moveTaskAction({ taskId, projectId, sectionId, beforeId: index >= 0 && index < list.length ? list[index]!.id : null, afterId }), { success: false });
  };
  // Alt+↑/↓ moves a row; Alt+Shift+↑/↓ moves it to the previous/next section.
  const keyMove = (event: React.KeyboardEvent, task: BoardTask) => {
    if (!event.altKey || !canDrag || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    const up = event.key === "ArrowUp";
    if (event.shiftKey) {
      const index = sections.findIndex((section) => section.id === task.sectionId);
      const target = sections[index + (up ? -1 : 1)];
      if (target) void move(task.id, target.id, null);
      return;
    }
    const list = inSection(task.sectionId);
    const index = list.findIndex((item) => item.id === task.id);
    if (up && index > 0) void move(task.id, task.sectionId, list[index - 1]!.id);
    if (!up && index < list.length - 1) void move(task.id, task.sectionId, list[index + 2]?.id ?? null);
  };

  const toolbar = (
    <div className="mb-3 flex flex-wrap items-center gap-2" role="toolbar" aria-label="View options">
      <label className="sr-only" htmlFor="project-filter">
        Filter tasks
      </label>
      <input id="project-filter" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter tasks…" className="field-input h-8 w-48 text-label" />
      <label className="flex items-center gap-1.5 text-label">
        <input type="checkbox" checked={mine} onChange={(event) => setMine(event.target.checked)} /> Only mine
      </label>
      <label className="flex items-center gap-1.5 text-label">
        <input type="checkbox" checked={showDone} onChange={(event) => setShowDone(event.target.checked)} data-testid="show-completed" /> Show completed
      </label>
      <label className="flex items-center gap-1.5 text-label">
        Sort
        <select value={sort} onChange={(event) => setSort(event.target.value as Sort)} className="field-input h-8 w-auto py-0 text-label">
          <option value="manual">Manual</option>
          <option value="due">Due date</option>
          <option value="priority">Priority</option>
          <option value="assignee">Assignee</option>
          <option value="title">Name</option>
        </select>
      </label>
      {canEdit && !manual && <span className="text-caption text-ink-muted">Clear the sort and filters to drag tasks.</span>}
      <span role="status" aria-live="polite" className="sr-only">
        {live}
      </span>
    </div>
  );

  if (layout === "BOARD") {
    return (
      <div>
        {toolbar}
        <div className="flex gap-3 overflow-x-auto pb-4" data-testid="board">
          {sections.map((section) => (
            <section
              key={section.id}
              aria-label={section.name}
              className="flex w-72 shrink-0 flex-col rounded-lg border border-line bg-surface-muted"
              onDragOver={(event) => canDrag && event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (dragging !== null) void move(dragging, section.id, null);
                setDragging(null);
              }}
            >
              <SectionHeader section={section} sections={sections} count={inSection(section.id).length} canEdit={canEdit} />
              <ul className="flex-1 space-y-2 px-2 pb-2" aria-label={`Tasks in ${section.name}`}>
                {inSection(section.id).map((task) => (
                  <li
                    key={task.id}
                    draggable={canDrag}
                    onDragStart={() => setDragging(task.id)}
                    onDragEnd={() => setDragging(null)}
                    onDragOver={(event) => canDrag && event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (dragging !== null && dragging !== task.id) void move(dragging, section.id, task.id);
                      setDragging(null);
                    }}
                    onKeyDown={(event) => keyMove(event, task)}
                    className={`rounded-md border border-line bg-surface p-3 shadow-sm ${dragging === task.id ? "opacity-50" : ""}`}
                    data-testid="board-card"
                  >
                    <div className="flex items-start gap-2">
                      <TaskCheck taskId={task.id} done={task.status === "COMPLETED"} disabled={!(canEdit || task.assigneeId === meId) || task.status === "CANCELLED"} label={task.title} size="sm" />
                      <Link href={`/users/tasks/${task.id}?project=${projectId}`} className="min-w-0 flex-1 text-label font-medium text-ink hover:underline">
                        {task.isMilestone && <Diamond aria-label="Milestone" className="mr-1 inline h-3.5 w-3.5 text-primary-600" />}
                        <span className={task.status === "COMPLETED" ? "text-ink-muted line-through" : ""}>{task.title}</span>
                      </Link>
                    </div>
                    <TaskMeta task={task} now={now} />
                  </li>
                ))}
              </ul>
              {canEdit && <AddTask projectId={projectId} sectionId={section.id} compact />}
            </section>
          ))}
          {canEdit && <AddSection projectId={projectId} afterId={sections.at(-1)?.id ?? null} board />}
        </div>
      </div>
    );
  }

  return (
    <div>
      {toolbar}
      <div className="card overflow-x-auto" data-testid="project-list">
        <div role="table" aria-label="Tasks" className="min-w-[760px]">
          <div role="row" className="grid grid-cols-[minmax(0,1fr)_170px_130px_110px] border-b border-line bg-surface-muted px-3 py-2 text-caption font-semibold uppercase tracking-wide text-ink-faint">
            <span role="columnheader">Task</span>
            <span role="columnheader">Assignee</span>
            <span role="columnheader">Due date</span>
            <span role="columnheader">Priority</span>
          </div>
          {sections.map((section) => {
            const rows = inSection(section.id);
            const closed = collapsed.has(section.id);
            return (
              <div
                key={section.id}
                role="rowgroup"
                aria-label={section.name}
                onDragOver={(event) => canDrag && event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragging !== null) void move(dragging, section.id, null);
                  setDragging(null);
                }}
              >
                <div className="flex items-center gap-1 border-b border-line px-1 pt-3">
                  <button
                    type="button"
                    aria-expanded={!closed}
                    aria-label={`${closed ? "Show" : "Hide"} ${section.name}`}
                    onClick={() => setCollapsed((current) => new Set(current.has(section.id) ? [...current].filter((item) => item !== section.id) : [...current, section.id]))}
                    className="rounded p-1 text-ink-muted hover:bg-surface-muted"
                  >
                    {closed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  <SectionHeader section={section} sections={sections} count={rows.length} canEdit={canEdit} plain />
                </div>
                {!closed &&
                  rows.map((task) => (
                    <div
                      key={task.id}
                      role="row"
                      tabIndex={-1}
                      draggable={canDrag}
                      onDragStart={() => setDragging(task.id)}
                      onDragEnd={() => setDragging(null)}
                      onDragOver={(event) => canDrag && event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (dragging !== null && dragging !== task.id) void move(dragging, section.id, task.id);
                        setDragging(null);
                      }}
                      onKeyDown={(event) => keyMove(event, task)}
                      data-testid="task-row"
                      data-task-id={task.id}
                      className={`work-row group grid grid-cols-[minmax(0,1fr)_170px_130px_110px] items-center border-b border-line px-1 py-1.5 hover:bg-surface-muted ${dragging === task.id ? "opacity-50" : ""}`}
                    >
                      <div role="cell" className="flex min-w-0 items-center gap-2">
                        <span aria-hidden="true" className={`text-ink-faint ${canDrag ? "cursor-grab opacity-0 group-hover:opacity-100" : "invisible"}`} title="Drag to move (or Alt+↑/↓)">
                          <GripVertical className="h-4 w-4" />
                        </span>
                        <TaskCheck taskId={task.id} done={task.status === "COMPLETED"} disabled={!(canEdit || task.assigneeId === meId) || task.status === "CANCELLED"} label={task.title} />
                        <Link
                          href={`/users/tasks/${task.id}?project=${projectId}`}
                          className="min-w-0 truncate text-label text-ink hover:underline"
                          aria-keyshortcuts={canDrag ? "Alt+ArrowUp Alt+ArrowDown" : undefined}
                        >
                          {task.isMilestone && <Diamond aria-label="Milestone" className="mr-1 inline h-3.5 w-3.5 text-primary-600" />}
                          <span className={task.status === "COMPLETED" ? "text-ink-muted line-through" : ""}>{task.title}</span>
                        </Link>
                        <RowBadges task={task} />
                      </div>
                      <div role="cell">
                        {canEdit ? (
                          <select
                            aria-label={`Assignee of ${task.title}`}
                            value={task.assigneeId}
                            disabled={!OPEN.has(task.status)}
                            onChange={(event) => void call(() => taskFieldsAction(task.id, { assigneeId: Number(event.target.value) }))}
                            className="field-input h-8 w-[160px] truncate py-0 text-label"
                          >
                            {!people.some((person) => person.id === task.assigneeId) && <option value={task.assigneeId}>{task.assigneeName}</option>}
                            {people.map((person) => (
                              <option key={person.id} value={person.id}>
                                {person.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-label text-ink-muted">{task.assigneeName}</span>
                        )}
                      </div>
                      <div role="cell">
                        {canEdit || task.assigneeId === meId ? (
                          <input
                            key={task.dueAt ?? "none"}
                            type="date"
                            aria-label={`Due date of ${task.title}`}
                            defaultValue={task.dueAt ? indiaDayOf(new Date(task.dueAt)) : ""}
                            disabled={!OPEN.has(task.status)}
                            onBlur={(event) => {
                              const before = task.dueAt ? indiaDayOf(new Date(task.dueAt)) : "";
                              const input = event.target;
                              const picked = input.value;
                              if (picked !== before)
                                void call((choice) => taskFieldsAction(task.id, { dueDay: choice?.moveTo ?? picked, holidayOk: choice?.holidayOk }), { success: false }).then((result) => {
                                  if (!result?.ok) input.value = before; // refused or cancelled: show the saved date again
                                });
                            }}
                            className={`field-input h-8 w-[124px] py-0 text-label ${TONE_TEXT[dueLabel(task.dueAt, now, OPEN.has(task.status))?.tone ?? "neutral"]}`}
                          />
                        ) : (
                          <span className="text-label">{dueLabel(task.dueAt, now, OPEN.has(task.status))?.text ?? "—"}</span>
                        )}
                      </div>
                      <div role="cell">
                        {canEdit ? (
                          <select
                            aria-label={`Priority of ${task.title}`}
                            value={task.priority}
                            disabled={!OPEN.has(task.status)}
                            onChange={(event) => void call(() => taskFieldsAction(task.id, { priority: event.target.value }), { success: false })}
                            className={`field-input h-8 w-[100px] py-0 text-label ${PRIORITY_CLASS[task.priority]}`}
                          >
                            <option value="LOW">Low</option>
                            <option value="NORMAL">Normal</option>
                            <option value="HIGH">High</option>
                            <option value="URGENT">Urgent</option>
                          </select>
                        ) : (
                          <span className="text-label">{task.priority.charAt(0) + task.priority.slice(1).toLowerCase()}</span>
                        )}
                      </div>
                    </div>
                  ))}
                {!closed && canEdit && <AddTask projectId={projectId} sectionId={section.id} />}
              </div>
            );
          })}
          {canEdit && <AddSection projectId={projectId} afterId={sections.at(-1)?.id ?? null} />}
        </div>
      </div>
    </div>
  );
}

function RowBadges({ task }: { task: BoardTask }) {
  return (
    <span className="ml-1 flex shrink-0 items-center gap-2 text-caption text-ink-muted">
      {task.blockedBy > 0 && (
        <span title={`Waiting for ${task.blockedBy} task${task.blockedBy === 1 ? "" : "s"}`} className="inline-flex items-center gap-0.5 text-warning-600">
          <Lock aria-hidden="true" className="h-3 w-3" />
          <span className="sr-only">Waiting for {task.blockedBy}</span>
        </span>
      )}
      {task.subtasks > 0 && (
        <span title="Subtasks done / all" className="inline-flex items-center gap-0.5">
          <GitBranch aria-hidden="true" className="h-3 w-3" />
          {task.subtasks - task.subtasksOpen}/{task.subtasks}
        </span>
      )}
      {task.comments > 0 && (
        <span title="Comments" className="inline-flex items-center gap-0.5">
          <MessageSquare aria-hidden="true" className="h-3 w-3" />
          {task.comments}
        </span>
      )}
      {task.likes > 0 && (
        <span title="Likes" className="inline-flex items-center gap-0.5">
          <Heart aria-hidden="true" className="h-3 w-3" />
          {task.likes}
        </span>
      )}
      {task.tags.slice(0, 2).map((tag) => (
        <span key={tag.id} className="rounded bg-surface-muted px-1.5 text-caption">
          #{tag.name}
        </span>
      ))}
    </span>
  );
}

function TaskMeta({ task, now }: { task: BoardTask; now: Date }) {
  const due = dueLabel(task.dueAt, now, OPEN.has(task.status));
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-caption text-ink-muted">
      <span className="truncate">{task.assigneeName}</span>
      {due && <span className={TONE_TEXT[due.tone]}>{due.text}</span>}
      {task.priority !== "NORMAL" && task.priority !== "LOW" && <span className={`rounded px-1.5 ${PRIORITY_CLASS[task.priority]}`}>{task.priority === "URGENT" ? "Urgent" : "High"}</span>}
      <RowBadges task={task} />
    </div>
  );
}

function SectionHeader({ section, sections, count, canEdit, plain }: { section: BoardSection; sections: BoardSection[]; count: number; canEdit: boolean; plain?: boolean }) {
  const { call } = useWorkCall();
  const [name, setName] = useState(section.name);
  const [deleting, setDeleting] = useState(false);
  const [moveTo, setMoveTo] = useState<number>(sections.find((item) => item.id !== section.id)?.id ?? 0);
  useEffect(() => setName(section.name), [section.name]);
  return (
    <div className={`flex min-w-0 flex-1 flex-wrap items-center gap-2 ${plain ? "pb-1" : "px-3 py-2"}`}>
      {canEdit ? (
        <input
          aria-label={`Section name: ${section.name}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && (event.target as HTMLInputElement).blur()}
          onBlur={() => name.trim() && name.trim() !== section.name && void call(() => sectionAction(section.id, { name }), { success: false })}
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 font-semibold text-ink hover:border-line focus:border-primary-600 focus:outline-none"
        />
      ) : (
        <h3 className="font-semibold">{section.name}</h3>
      )}
      <span className="text-caption text-ink-muted">{count}</span>
      {canEdit && sections.length > 1 && (
        <button type="button" aria-label={`Delete section ${section.name}`} title="Delete section" onClick={() => setDeleting((value) => !value)} className="rounded p-1 text-ink-faint hover:bg-danger-50 hover:text-danger-600">
          <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      )}
      {deleting && (
        <div className="flex w-full flex-wrap items-center gap-2 rounded-md bg-danger-50 p-2 text-label" role="group" aria-label="Delete section">
          <span>Move its tasks to</span>
          <select aria-label="Move its tasks to" value={moveTo} onChange={(event) => setMoveTo(Number(event.target.value))} className="field-input h-8 w-auto py-0 text-label">
            {sections
              .filter((item) => item.id !== section.id)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
          <button type="button" className="btn-danger btn-compact" onClick={() => void call(() => sectionAction(section.id, { deleteMoveTo: moveTo }), { success: "Section deleted." })}>
            Delete section
          </button>
          <button type="button" className="btn-secondary btn-compact" onClick={() => setDeleting(false)}>
            Keep it
          </button>
        </div>
      )}
    </div>
  );
}

export function AddTask({ projectId, sectionId, parentId, mySectionId, compact, placeholder }: { projectId?: number; sectionId?: number; parentId?: number; mySectionId?: number; compact?: boolean; placeholder?: string }) {
  const { call } = useWorkCall();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const add = async (titles: string[]) => {
    if (!titles.length || busy) return;
    setBusy(true);
    const target = { projectId: projectId ?? null, sectionId: sectionId ?? null, parentId: parentId ?? null, mySectionId: mySectionId ?? null };
    const result = titles.length === 1 ? await call(() => quickAddAction({ ...target, title: titles[0]! }), { success: false }) : await call(() => quickAddManyAction({ ...target, titles }));
    if (result?.ok) setValue("");
    setBusy(false);
    input.current?.focus();
  };
  return (
    <div className={compact ? "px-2 pb-2" : "flex items-center gap-2 border-b border-line px-3 py-1.5"}>
      {!compact && <Plus aria-hidden="true" className="h-4 w-4 text-ink-faint" />}
      <input
        ref={input}
        value={value}
        disabled={busy}
        onChange={(event) => setValue(event.target.value)}
        onPaste={(event) => {
          const lines = event.clipboardData.getData("text").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
          if (lines.length > 1) {
            event.preventDefault();
            void add(lines);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (value.trim()) void add([value.trim()]);
          } else if (event.key === "Escape") setValue("");
        }}
        aria-label={placeholder ?? "Add a task"}
        placeholder={placeholder ?? "Add a task… (Enter to add)"}
        data-work-add
        className={compact ? "field-input h-8 w-full text-label" : "h-8 w-full bg-transparent text-label focus:outline-none"}
      />
    </div>
  );
}

function AddSection({ projectId, afterId, board }: { projectId: number; afterId: number | null; board?: boolean }) {
  const { call } = useWorkCall();
  const [name, setName] = useState("");
  return (
    <form
      className={board ? "w-64 shrink-0 rounded-lg border border-dashed border-line p-2" : "flex items-center gap-2 px-3 py-3"}
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) void call(() => addSectionAction(projectId, name, afterId), { success: "Section added." }).then((result) => result?.ok && setName(""));
      }}
    >
      <label className="sr-only" htmlFor={`add-section-${board ? "b" : "l"}`}>
        New section name
      </label>
      <input id={`add-section-${board ? "b" : "l"}`} value={name} onChange={(event) => setName(event.target.value)} placeholder="New section…" className="field-input h-8 text-label" />
      <button type="submit" className="btn-secondary btn-compact mt-0 shrink-0">
        Add section
      </button>
    </form>
  );
}

// Open views stay fresh: the page asks the server again every 30 seconds
// while the tab is visible, and when the person comes back to it.
export function useAutoRefresh(ms = 30_000) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible" && !document.querySelector("input:focus, textarea:focus, select:focus, dialog[open]")) router.refresh();
    };
    const timer = window.setInterval(tick, ms);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, ms]);
}
