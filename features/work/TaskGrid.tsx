"use client";

import { ApprovalBadge, approvalRowClass } from "@/features/work/ApprovalLink";
import { ArrowUpDown, CalendarDays, ChevronDown, ChevronRight, Filter, GitBranch, Layers, Lock, MessageSquare, Plus, Repeat, Search, Settings2, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { deleteViewAction, saveViewAction, taskFieldsAction, updateViewAction } from "@/app/users/work/actions";
import { initials } from "@/features/ui/Display";
import { Drop } from "@/features/ui/Drop";
import { CREATE_TASK_EVENT, COLOR_HEX, TaskCheck, usePaneLink, useWorkCall } from "@/features/work/client";
import { dueLabel, indiaDayOf, TONE_TEXT } from "@/features/work/format";
import { BulkBar, FieldInput, type FieldView } from "@/features/work/MoreParts";
import { AddTask } from "@/features/work/ProjectWorkspace";
import { CollaboratorsCell, TagsCell } from "@/features/work/GridCellEditors";
import {
  applyGrid,
  COLUMN_LABEL,
  COMPLETED_RANGES,
  FILTER_FIELDS,
  FILTER_LABEL,
  filterCount,
  GROUP_LABEL,
  SORT_LABEL,
  SORTS,
  type FilterField,
  type GridColumn,
  type GridConfig,
  type GridGroup,
  type GridTask,
} from "@/server/work/grid";

// D-220 (owner's Asana screenshots): the one task table of the Tasks area.
// Toolbar: "+ Add task ▾" on the left; Filters: N ×, Sort, Groups: N ×,
// Options, Search on the right. Body: numbered rows in groups (with an
// avatar when grouped by a person), a tick, the name with its comment count,
// then the chosen columns. A tab can be saved from Options.
export interface GridView {
  scope: "MY_TASKS" | "PROJECT";
  scopeId: number;
  canSave: boolean;
  current: { id: number; name: string } | null;
}

const PRIORITY_CLASS = { URGENT: "bg-danger-50 text-danger-600", HIGH: "bg-warning-50 text-warning-600", NORMAL: "bg-surface-muted text-ink-muted", LOW: "bg-surface-muted text-ink-muted" } as const;
const COMPLETED_LABEL: Record<(typeof COMPLETED_RANGES)[number], string> = { none: "Hide", all: "All completed", today: "Completed today", week: "Past 7 days", month: "Past 30 days" };
const WIDTH: Record<GridColumn, string> = { due: "130px", assignee: "190px", collaborators: "150px", createdBy: "160px", projects: "210px", visibility: "180px", priority: "110px", tags: "150px" };

export function TaskGrid({
  rows,
  initial,
  columns,
  groupsAllowed,
  sections,
  sectionHeader,
  onMove,
  addTo,
  people = [],
  projects = [],
  fields = [],
  values = {},
  meId,
  nowIso,
  view,
  testId = "task-grid",
  bulk = true,
  // D-260 (owner): cells are editable wherever the person may change the task
  // (each task's canEdit, checked again on the server); a table can turn it off.
  editAssignee = true,
  editPriority = true,
  emptyText = "No tasks here.",
}: {
  rows: GridTask[];
  initial: GridConfig;
  columns: GridColumn[];
  groupsAllowed: GridGroup[];
  sections?: { id: number; name: string }[];
  sectionHeader?: (section: { id: number; name: string }, count: number) => React.ReactNode;
  onMove?: (taskId: number, sectionId: number, beforeId: number | null) => void;
  addTo?: { projectId?: number; mySections?: boolean };
  people?: { id: number; label: string }[];
  projects?: { id: number; name: string }[];
  fields?: FieldView[];
  values?: Record<number, Record<number, string>>;
  meId: number;
  nowIso: string;
  view?: GridView;
  testId?: string;
  bulk?: boolean;
  editAssignee?: boolean;
  editPriority?: boolean;
  emptyText?: string;
}) {
  const { call } = useWorkCall();
  const router = useRouter();
  const paneLink = usePaneLink();
  const [config, setConfig] = useState<GridConfig>(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<number[]>([]);
  const [dragging, setDragging] = useState<number | null>(null);
  const [searching, setSearching] = useState(Boolean(initial.search));
  const openTask = useSearchParams().get("task");
  useEffect(() => {
    setConfig(initial);
    setSaved(JSON.stringify(initial));
  }, [initial]);
  const today = indiaDayOf(new Date(nowIso));
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const groups = useMemo(() => applyGrid(rows, config, { today, meId, sections }), [rows, config, today, meId, sections]);
  const shown = config.hidden.length ? columns.filter((column) => !config.hidden.includes(column)) : columns;
  const canDrag = Boolean(onMove) && config.group === "section" && config.sort === "none" && filterCount(config) === 0 && !config.search;
  const gridColumns = { gridTemplateColumns: `${bulk ? "28px " : ""}40px minmax(260px,1fr)${shown.map((column) => ` ${WIDTH[column]}`).join("")}${fields.map(() => " 150px").join("")}` };
  const set = (changes: Partial<GridConfig>) => setConfig((value) => ({ ...value, ...changes }));
  const dirty = JSON.stringify(config) !== saved;
  const count = filterCount(config);
  const allShown = groups.flatMap((group) => group.rows);

  const saveTab = async () => {
    if (!view) return;
    const name = window.prompt("Name of the new tab", "")?.trim();
    if (!name) return;
    const result = await call(() => saveViewAction(view.scope, view.scopeId, name, config));
    if (result?.ok && result.value) {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", String(result.value));
      url.searchParams.delete("task");
      router.push(`${url.pathname}?${url.searchParams}`);
    }
  };

  return (
    <div data-testid={testId}>
      <div className="mb-2 flex flex-wrap items-center gap-2" role="toolbar" aria-label="View options">
        <span className="inline-flex">
          <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(CREATE_TASK_EVENT, { detail: { projectId: addTo?.projectId ?? null } }))} className="tb-split rounded-l-md">
            <Plus aria-hidden="true" className="h-4 w-4" /> Add task
          </button>
          <Drop label="More ways to add" icon={<ChevronDown aria-hidden="true" className="h-4 w-4" />} buttonClass="tb-split rounded-r-md border-l-0 px-1.5">
            <Link href="/users/tasks/new" className="block rounded px-2 py-1.5 text-label hover:bg-surface-muted">
              Task with a type (form)
            </Link>
            {addTo?.projectId && (
              <button type="button" className="block w-full rounded px-2 py-1.5 text-left text-label hover:bg-surface-muted" onClick={() => document.querySelector<HTMLInputElement>("#add-section-l")?.focus()}>
                Add section
              </button>
            )}
          </Drop>
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-0.5">
          <span className={count ? "tb-pill" : "inline-flex items-center"}>
            <Drop
              label={count ? `Filters: ${count}` : "Filter"}
              icon={
                <>
                  <Filter aria-hidden="true" className="h-4 w-4" /> {count ? `Filters: ${count}` : "Filter"}
                </>
              }
              buttonClass="tb-btn"
              panelClass="w-[min(560px,90vw)] right-0"
              testId="filter-menu"
            >
              <FilterPanel config={config} set={set} people={people} projects={projects} />
            </Drop>
            {count > 0 && (
              <button type="button" aria-label="Clear filters" onClick={() => set({ incomplete: true, completed: "none", dueThisWeek: false, dueNextWeek: false, filters: [] })} className="tb-x">
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
          <span className={config.sort !== "none" ? "tb-pill" : "inline-flex items-center"}>
            <Drop
              label="Sort"
              icon={
                <>
                  <ArrowUpDown aria-hidden="true" className="h-4 w-4" /> {config.sort === "none" ? "Sort" : `Sort: ${SORT_LABEL[config.sort]}`}
                </>
              }
              buttonClass="tb-btn"
              panelClass="right-0 w-52"
            >
              {SORTS.map((sort) => (
                <label key={sort} className="flex items-center gap-2 rounded px-2 py-1 text-label hover:bg-surface-muted">
                  <input type="radio" name={`${testId}-sort`} checked={config.sort === sort} onChange={() => set({ sort })} /> {SORT_LABEL[sort]}
                </label>
              ))}
            </Drop>
            {config.sort !== "none" && (
              <button type="button" aria-label="Default order" onClick={() => set({ sort: "none" })} className="tb-x">
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
          <span className={config.group !== "none" ? "tb-pill" : "inline-flex items-center"}>
            <Drop
              label="Group"
              icon={
                <>
                  <Layers aria-hidden="true" className="h-4 w-4" /> {config.group === "none" ? "Group" : "Groups: 1"}
                </>
              }
              buttonClass="tb-btn"
              panelClass="right-0 w-56"
              testId="group-menu"
            >
              <p className="mb-1 px-2 text-label font-semibold">Groups</p>
              {(["none", ...groupsAllowed] as GridGroup[]).map((group) => (
                <label key={group} className="flex items-center gap-2 rounded px-2 py-1 text-label hover:bg-surface-muted">
                  <input type="radio" name={`${testId}-group`} checked={config.group === group} onChange={() => set({ group })} /> {GROUP_LABEL[group]}
                </label>
              ))}
            </Drop>
            {config.group !== "none" && (
              <button type="button" aria-label="Remove grouping" onClick={() => set({ group: "none" })} className="tb-x">
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
          <span aria-hidden="true" className="tb-sep" />
          <Drop
            label="Options"
            icon={
              <>
                <Settings2 aria-hidden="true" className="h-4 w-4" /> Options
              </>
            }
            buttonClass="tb-btn"
            panelClass="right-0 w-60"
          >
            <p className="mb-1 px-2 text-label font-semibold">Columns</p>
            {columns.map((column) => (
              <label key={column} className="flex items-center gap-2 rounded px-2 py-1 text-label hover:bg-surface-muted">
                <input
                  type="checkbox"
                  checked={!config.hidden.includes(column)}
                  onChange={(event) => set({ hidden: event.target.checked ? config.hidden.filter((item) => item !== column) : [...config.hidden, column] })}
                />{" "}
                {COLUMN_LABEL[column]}
              </label>
            ))}
            {view?.canSave && (
              <div className="mt-2 space-y-1 border-t border-line pt-2">
                <button type="button" className="block w-full rounded px-2 py-1 text-left text-label hover:bg-surface-muted" onClick={() => void saveTab()}>
                  Save as a new tab…
                </button>
                {view.current && (
                  <button
                    type="button"
                    className="block w-full rounded px-2 py-1 text-left text-label text-danger-600 hover:bg-danger-50"
                    onClick={() => void call(() => deleteViewAction(view.current!.id)).then((result) => result?.ok && router.push(window.location.pathname))}
                  >
                    Delete tab “{view.current.name}”
                  </button>
                )}
              </div>
            )}
          </Drop>
          {searching ? (
            <input
              autoFocus
              type="search"
              aria-label="Search this view"
              placeholder="Search this view"
              value={config.search}
              onChange={(event) => set({ search: event.target.value })}
              onBlur={() => !config.search && setSearching(false)}
              className="field-input h-7 w-48 text-label"
            />
          ) : (
            <button type="button" aria-label="Search this view" onClick={() => setSearching(true)} className="tb-btn">
              <Search aria-hidden="true" className="h-4 w-4" />
            </button>
          )}
          {dirty && view?.canSave && view.current && (
            <button type="button" className="btn-primary btn-compact" onClick={() => void call(() => updateViewAction(view.current!.id, config)).then((result) => result?.ok && setSaved(JSON.stringify(config)))}>
              Save view
            </button>
          )}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <div role="table" aria-label="Tasks" className="min-w-max">
          <div role="row" style={gridColumns} className="sticky top-0 z-10 grid border-b border-line bg-surface text-caption font-medium text-ink-muted">
            {bulk && (
              <span role="columnheader" className="flex items-center justify-center">
                <input
                  type="checkbox"
                  aria-label="Select all shown tasks"
                  checked={allShown.length > 0 && allShown.every((task) => selected.includes(task.id))}
                  onChange={(event) => setSelected(event.target.checked ? allShown.map((task) => task.id) : [])}
                />
              </span>
            )}
            <span role="columnheader" className="px-2 py-2">
              #
            </span>
            <span role="columnheader" className="border-r border-line px-2 py-2">
              Name
            </span>
            {shown.map((column) => (
              <span key={column} role="columnheader" className="truncate border-r border-line px-2 py-2">
                {COLUMN_LABEL[column]}
              </span>
            ))}
            {fields.map((field) => (
              <span key={field.id} role="columnheader" className="truncate border-r border-line px-2 py-2">
                {field.name}
              </span>
            ))}
          </div>
          {allShown.length === 0 && !(config.group === "section" && sections?.length) && <p className="px-4 py-8 text-center text-label text-ink-muted">{emptyText}</p>}
          {groups.map((group) => {
            const closed = collapsed.has(group.key);
            const section = group.sectionId !== null ? (sections?.find((item) => item.id === group.sectionId) ?? null) : null;
            return (
              <div
                key={group.key}
                role="rowgroup"
                aria-label={group.name || "Tasks"}
                onDragOver={(event) => canDrag && event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragging !== null && section && onMove) onMove(dragging, section.id, null);
                  setDragging(null);
                }}
              >
                {group.name && (
                  <div className="flex items-center gap-2 border-b border-line px-2 pb-2 pt-5">
                    <button
                      type="button"
                      aria-expanded={!closed}
                      aria-label={`${closed ? "Show" : "Hide"} ${group.name}`}
                      onClick={() => setCollapsed((value) => new Set(value.has(group.key) ? [...value].filter((item) => item !== group.key) : [...value, group.key]))}
                      className="rounded p-0.5 text-ink-muted hover:bg-surface-muted"
                    >
                      {closed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    {group.person && <PersonDot name={group.person} size="md" />}
                    {section && sectionHeader ? (
                      sectionHeader(section, group.rows.length)
                    ) : (
                      <h3 className="flex items-center gap-2 text-card-title font-semibold">
                        {group.name} <span className="text-caption font-normal text-ink-muted">{group.rows.length}</span>
                      </h3>
                    )}
                  </div>
                )}
                {!closed &&
                  group.rows.map((task, index) => {
                    const open = ["OPEN", "IN_PROGRESS", "BLOCKED"].includes(task.status);
                    const due = dueLabel(task.dueAt, now, open);
                    const isOpen = openTask === String(task.id);
                    return (
                      <div
                        key={`${group.key}-${task.id}`}
                        role="row"
                        tabIndex={-1}
                        style={gridColumns}
                        draggable={canDrag}
                        onDragStart={() => setDragging(task.id)}
                        onDragEnd={() => setDragging(null)}
                        onDragOver={(event) => canDrag && event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (dragging !== null && dragging !== task.id && section && onMove) onMove(dragging, section.id, task.id);
                          setDragging(null);
                        }}
                        data-testid="task-row"
                        data-task-id={task.id}
                        className={`work-row group grid min-h-9 items-center border-b border-line text-label hover:bg-surface-muted ${approvalRowClass(task.approval)} ${isOpen ? "bg-primary-50 outline outline-1 -outline-offset-1 outline-primary-600" : ""} ${selected.includes(task.id) ? "bg-primary-50/60" : ""} ${dragging === task.id ? "opacity-50" : ""}`}
                      >
                        {bulk && (
                          <span role="cell" className="flex items-center justify-center">
                            <input
                              type="checkbox"
                              aria-label={`Select ${task.title}`}
                              checked={selected.includes(task.id)}
                              onChange={(event) => setSelected((value) => (event.target.checked ? [...value, task.id] : value.filter((one) => one !== task.id)))}
                            />
                          </span>
                        )}
                        <span role="cell" className="px-2 text-caption text-ink-faint">
                          {index + 1}
                        </span>
                        <span role="cell" className="flex min-w-0 items-center gap-2 border-r border-line px-2 py-1">
                          <TaskCheck taskId={task.id} done={task.status === "COMPLETED"} disabled={!task.canComplete} label={task.title} />
                          <Link href={paneLink(task.id)} scroll={false} className={`min-w-0 truncate hover:underline ${task.status === "COMPLETED" ? "text-ink-muted line-through" : "text-ink"}`}>
                            {task.title}
                          </Link>
                          <span className="flex shrink-0 items-center gap-2 text-caption text-ink-muted">
                            <ApprovalBadge approval={task.approval} size="sm" />
                            {task.isPeriodic && (
                              <span role="img" aria-label="Periodic" title="Periodic: repeats" className="text-info-600">
                                <Repeat aria-hidden="true" className="h-3.5 w-3.5" />
                              </span>
                            )}
                            {task.subtasks > 0 && (
                              <span title="Subtasks" className="inline-flex items-center gap-0.5">
                                {task.subtasks} <GitBranch aria-hidden="true" className="h-3 w-3" />
                              </span>
                            )}
                            {task.comments > 0 && (
                              <span title={`${task.comments} comment${task.comments === 1 ? "" : "s"}`} className="inline-flex items-center gap-0.5">
                                {task.comments} <MessageSquare aria-hidden="true" className="h-3 w-3" />
                              </span>
                            )}
                          </span>
                        </span>
                        {shown.map((column) => (
                          <span key={column} role="cell" className="flex min-w-0 items-center border-r border-line px-2 py-1">
                            {column === "due" &&
                              (task.canEdit && open ? (
                                <DueInput task={task} toneClass={due ? TONE_TEXT[due.tone] : ""} />
                              ) : (
                                <span className={due ? TONE_TEXT[due.tone] : "text-ink-faint"}>{due?.text ?? <CalendarDays aria-hidden="true" className="h-4 w-4" />}</span>
                              ))}
                            {column === "assignee" &&
                              (editAssignee && people.length > 0 && task.canEdit && open ? (
                                <span className="flex min-w-0 items-center gap-1.5">
                                  <PersonDot name={task.assigneeName} />
                                  <select
                                    aria-label={`Assignee of ${task.title}`}
                                    value={task.assigneeId}
                                    onChange={(event) => void call(() => taskFieldsAction(task.id, { assigneeId: Number(event.target.value) }))}
                                    className="min-w-0 flex-1 truncate border-0 bg-transparent text-label focus:outline-none"
                                  >
                                    {!people.some((person) => person.id === task.assigneeId) && <option value={task.assigneeId}>{task.assigneeName}</option>}
                                    {people.map((person) => (
                                      <option key={person.id} value={person.id}>
                                        {person.label}
                                      </option>
                                    ))}
                                  </select>
                                </span>
                              ) : (
                                <span className="flex min-w-0 items-center gap-1.5">
                                  <PersonDot name={task.assigneeName} />
                                  <span className="truncate">{task.assigneeName}</span>
                                </span>
                              ))}
                            {column === "collaborators" && <CollaboratorsCell taskId={task.id} title={task.title} followers={task.followers} people={people} canEdit={task.canEdit && open && people.length > 0} />}
                            {column === "createdBy" && (
                              <span className="truncate text-ink-muted" title="Who made the task (can't be changed)">
                                {task.createdByName}
                              </span>
                            )}
                            {column === "projects" && (
                              <span className="flex min-w-0 gap-1">
                                {task.projects.slice(0, 2).map((project) => (
                                  <Link
                                    key={project.id}
                                    href={`/users/work/projects/${project.id}`}
                                    className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-line bg-surface-muted px-1.5 py-0.5 hover:border-line-strong"
                                  >
                                    <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: COLOR_HEX[project.color] ?? COLOR_HEX.gray }} />
                                    <span className="truncate">{project.name}</span>
                                  </Link>
                                ))}
                              </span>
                            )}
                            {column === "visibility" && (
                              <span className="flex min-w-0 items-center gap-1.5 text-ink-muted">
                                {task.projects.length ? <Users aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /> : <Lock aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />}
                                <span className="truncate">{task.projects.length ? `${task.projects[0]!.name} members` : "Collaborators"}</span>
                              </span>
                            )}
                            {column === "priority" &&
                              (editPriority && task.canEdit && open ? (
                                <select
                                  aria-label={`Priority of ${task.title}`}
                                  value={task.priority}
                                  onChange={(event) => void call(() => taskFieldsAction(task.id, { priority: event.target.value }), { success: false })}
                                  className={`rounded-full border-0 px-2 py-0.5 text-caption ${PRIORITY_CLASS[task.priority]}`}
                                >
                                  <option value="LOW">Low</option>
                                  <option value="NORMAL">Normal</option>
                                  <option value="HIGH">High</option>
                                  <option value="URGENT">Urgent</option>
                                </select>
                              ) : (
                                <span className={`rounded-full px-2 py-0.5 text-caption ${PRIORITY_CLASS[task.priority]}`}>{task.priority.charAt(0) + task.priority.slice(1).toLowerCase()}</span>
                              ))}
                            {column === "tags" && <TagsCell taskId={task.id} title={task.title} tags={task.tags} canEdit={task.canEdit && open} />}
                          </span>
                        ))}
                        {fields.map((field) => (
                          <span key={field.id} role="cell" className="border-r border-line px-1">
                            <FieldInput taskId={task.id} field={{ ...field, name: `${field.name} of ${task.title}` }} value={values[task.id]?.[field.id] ?? ""} canChange={task.canEdit} compact />
                          </span>
                        ))}
                      </div>
                    );
                  })}
                {!closed && section && addTo?.projectId && <AddTask projectId={addTo.projectId} sectionId={section.id} />}
                {!closed && group.sectionId !== null && addTo?.mySections && <AddTask mySectionId={group.sectionId} placeholder={`Add a task to ${group.name}…`} />}
              </div>
            );
          })}
        </div>
      </div>
      {bulk && (
        <BulkBar
          ids={selected.filter((one) => rows.some((task) => task.id === one))}
          clear={() => setSelected([])}
          people={people.length ? people : undefined}
          sections={addTo?.projectId ? sections : undefined}
          projectId={addTo?.projectId}
        />
      )}
    </div>
  );
}

// The Filters panel (screenshot): Quick filters as chips, then field filters.
function FilterPanel({ config, set, people, projects }: { config: GridConfig; set: (changes: Partial<GridConfig>) => void; people: { id: number; label: string }[]; projects: { id: number; name: string }[] }) {
  const chip = (on: boolean) => `inline-flex items-center gap-1 rounded-full border px-3 py-1 text-label ${on ? "border-primary-600 bg-primary-50 text-primary-700" : "border-line text-ink hover:border-line-strong"}`;
  const options = (field: FilterField): [string, string][] => {
    switch (field) {
      case "completion":
        return [
          ["incomplete", "Incomplete tasks"],
          ["completed", "Completed tasks"],
        ];
      case "assignee":
      case "createdBy":
        return [["me", "Me"], ...people.map((person) => [String(person.id), person.label] as [string, string])];
      case "project":
        return [["none", "No project"], ...projects.map((project) => [String(project.id), project.name] as [string, string])];
      case "priority":
        return [
          ["URGENT", "Urgent"],
          ["HIGH", "High"],
          ["NORMAL", "Normal"],
          ["LOW", "Low"],
        ];
      case "kind":
        return [
          ["periodic", "Periodic"],
          ["adhoc", "Ad hoc"],
        ];
      case "due":
        return [
          ["overdue", "Overdue"],
          ["today", "Today"],
          ["next7", "Next 7 days"],
          ["none", "No due date"],
        ];
      case "tag":
        return [];
    }
  };
  return (
    <div className="space-y-4">
      <p className="flex items-center justify-between font-semibold">
        Filters
        <button type="button" className="link text-caption font-normal" onClick={() => set({ incomplete: true, completed: "none", dueThisWeek: false, dueNextWeek: false, filters: [] })}>
          Clear
        </button>
      </p>
      <div>
        <p className="mb-2 text-caption font-semibold text-ink-muted">Quick filters</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={config.incomplete} className={chip(config.incomplete)} onClick={() => set({ incomplete: !config.incomplete })}>
            Incomplete tasks
          </button>
          <span className="inline-flex items-center">
            <button
              type="button"
              aria-pressed={config.completed !== "none"}
              data-testid="show-completed"
              className={`${chip(config.completed !== "none")} rounded-r-none`}
              onClick={() => set({ completed: config.completed === "none" ? "all" : "none" })}
            >
              Completed tasks
            </button>
            <select
              aria-label="Which completed tasks"
              value={config.completed}
              onChange={(event) => set({ completed: event.target.value as GridConfig["completed"] })}
              className={`${chip(config.completed !== "none")} rounded-l-none border-l-0 py-1 pr-6`}
            >
              {COMPLETED_RANGES.map((range) => (
                <option key={range} value={range}>
                  {COMPLETED_LABEL[range]}
                </option>
              ))}
            </select>
          </span>
          <button type="button" aria-pressed={config.dueThisWeek} className={chip(config.dueThisWeek)} onClick={() => set({ dueThisWeek: !config.dueThisWeek, dueNextWeek: false })}>
            Due this week
          </button>
          <button type="button" aria-pressed={config.dueNextWeek} className={chip(config.dueNextWeek)} onClick={() => set({ dueNextWeek: !config.dueNextWeek, dueThisWeek: false })}>
            Due next week
          </button>
        </div>
      </div>
      <div>
        <p className="mb-2 text-caption font-semibold text-ink-muted">All filters</p>
        <div className="space-y-2">
          {config.filters.map((filter, index) => (
            <div key={index} className="flex items-center gap-2">
              <select
                aria-label="Filter field"
                value={filter.field}
                onChange={(event) =>
                  set({ filters: config.filters.map((item, at) => (at === index ? { field: event.target.value as FilterField, value: options(event.target.value as FilterField)[0]?.[0] ?? "" } : item)) })
                }
                className="field-input h-9 w-48"
              >
                {FILTER_FIELDS.map((field) => (
                  <option key={field} value={field}>
                    {FILTER_LABEL[field]}
                  </option>
                ))}
              </select>
              {filter.field === "tag" ? (
                <input
                  aria-label="Tag"
                  value={filter.value}
                  onChange={(event) => set({ filters: config.filters.map((item, at) => (at === index ? { ...item, value: event.target.value } : item)) })}
                  className="field-input h-9 flex-1"
                />
              ) : (
                <select
                  aria-label="Filter value"
                  value={filter.value}
                  onChange={(event) => set({ filters: config.filters.map((item, at) => (at === index ? { ...item, value: event.target.value } : item)) })}
                  className="field-input h-9 flex-1"
                >
                  {options(filter.field).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              )}
              <button type="button" aria-label="Remove this filter" onClick={() => set({ filters: config.filters.filter((_, at) => at !== index) })} className="rounded p-1.5 text-ink-muted hover:bg-surface-muted">
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="inline-flex items-center gap-1 text-label text-ink-muted hover:text-ink"
            onClick={() => set({ filters: [...config.filters, { field: "assignee", value: "me" }] })}
            disabled={config.filters.length >= 10}
          >
            <Plus aria-hidden="true" className="h-4 w-4" /> Add filter
          </button>
        </div>
      </div>
    </div>
  );
}

function DueInput({ task, toneClass }: { task: GridTask; toneClass: string }) {
  const { call } = useWorkCall();
  const before = task.dueAt ? indiaDayOf(new Date(task.dueAt)) : "";
  return (
    <input
      key={task.dueAt ?? "none"}
      type="date"
      aria-label={`Due date of ${task.title}`}
      defaultValue={before}
      onBlur={(event) => {
        const input = event.target;
        const picked = input.value;
        if (picked !== before)
          void call((choice) => taskFieldsAction(task.id, { dueDay: choice?.moveTo ?? picked, holidayOk: choice?.holidayOk }), { success: false }).then((result) => {
            if (!result?.ok) input.value = before;
          });
      }}
      className={`w-full border-0 bg-transparent text-label focus:outline-none ${toneClass} ${before ? "" : "text-ink-faint"}`}
    />
  );
}

export function PersonDot({ name, size = "sm", ring }: { name: string; size?: "sm" | "md"; ring?: boolean }) {
  return (
    <span
      title={name}
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-primary-50 font-semibold text-primary-700 ${ring ? "border-2 border-surface" : ""} ${size === "md" ? "h-8 w-8 text-caption" : "h-6 w-6 text-[length:calc(10px*var(--text-scale,1))]"}`}
    >
      {initials(name)}
    </span>
  );
}
