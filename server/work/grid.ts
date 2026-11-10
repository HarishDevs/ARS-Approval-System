import { z } from "zod";

// D-220 (owner: "the compact screen like this, table format… filters, sort,
// groups like Asana in all the screens"): one task table for every list in
// Tasks: numbered rows, grouping, Filters (quick filters + field filters),
// Sort, Groups, Options (columns) and Search. Pure and unit-tested; the
// table (features/work/TaskGrid.tsx) draws what this returns.
export const GRID_COLUMNS = ["due", "assignee", "collaborators", "createdBy", "projects", "visibility", "priority", "tags"] as const;
export type GridColumn = (typeof GRID_COLUMNS)[number];
export const COLUMN_LABEL: Record<GridColumn, string> = {
  due: "Due date",
  assignee: "Assignee",
  collaborators: "Collaborators",
  createdBy: "Created by",
  projects: "Projects",
  visibility: "Task visibility",
  priority: "Priority",
  tags: "Tags",
};
export const SORTS = ["none", "due", "start", "assignee", "createdBy", "createdOn", "completedOn", "likes", "alpha", "priority"] as const;
export type GridSort = (typeof SORTS)[number];
export const SORT_LABEL: Record<GridSort, string> = {
  none: "None",
  due: "Due date",
  start: "Start date",
  assignee: "Assignee",
  createdBy: "Created by",
  createdOn: "Created on",
  completedOn: "Completed on",
  likes: "Likes",
  alpha: "Alphabetical",
  priority: "Priority",
};
export const GROUPS = ["none", "section", "assignee", "createdBy", "project", "due", "priority", "kind"] as const;
export type GridGroup = (typeof GROUPS)[number];
export const GROUP_LABEL: Record<GridGroup, string> = { none: "None", section: "Sections", assignee: "Assignee", createdBy: "Created by", project: "Project", due: "Due date", priority: "Priority", kind: "Periodic or ad hoc" };
export const FILTER_FIELDS = ["completion", "assignee", "createdBy", "project", "priority", "kind", "due", "tag"] as const;
export type FilterField = (typeof FILTER_FIELDS)[number];
export const FILTER_LABEL: Record<FilterField, string> = {
  completion: "Completion status",
  assignee: "Assignee",
  createdBy: "Created by",
  project: "Project",
  priority: "Priority",
  kind: "Periodic or ad hoc",
  due: "Due date",
  tag: "Tag",
};
export const COMPLETED_RANGES = ["none", "all", "today", "week", "month"] as const;

export const gridConfigSchema = z.object({
  incomplete: z.boolean().default(true),
  completed: z.enum(COMPLETED_RANGES).default("none"),
  dueThisWeek: z.boolean().default(false),
  dueNextWeek: z.boolean().default(false),
  filters: z.array(z.object({ field: z.enum(FILTER_FIELDS), value: z.string().max(100) })).max(10).default([]),
  sort: z.enum(SORTS).default("none"),
  group: z.enum(GROUPS).default("none"),
  hidden: z.array(z.enum(GRID_COLUMNS)).max(8).default([]),
  search: z.string().max(100).default(""),
});
export type GridConfig = z.infer<typeof gridConfigSchema>;
export const DEFAULT_GRID: GridConfig = gridConfigSchema.parse({});
export function parseGridConfig(raw: unknown): GridConfig {
  const parsed = gridConfigSchema.safeParse(typeof raw === "string" ? safeJson(raw) : raw);
  return parsed.success ? parsed.data : DEFAULT_GRID;
}

export interface GridTask {
  id: number;
  taskNo: string;
  title: string;
  status: string;
  priority: "LOW" | "NORMAL" | "IMPORTANT" | "HIGH" | "URGENT";
  assigneeId: number;
  assigneeName: string;
  createdBy: number;
  createdByName: string;
  dueAt: string | null; // ISO
  startsOn: string | null;
  createdAt: string;
  completedAt: string | null;
  likes: number;
  comments: number;
  subtasks: number;
  isPeriodic: boolean;
  isMilestone: boolean;
  projects: { id: number; name: string; color: string }[];
  tags: { id: number; name: string }[];
  followers: { id: number; name: string }[];
  sectionId: number | null;
  position: number;
  canEdit: boolean; // may change its dates and fields here
  canComplete: boolean;
  approval?: { requestId: number; requestNo: string; workStep: boolean; linked?: boolean } | null; // v1.42.1: from an approval request
}

const OPEN = new Set(["OPEN", "IN_PROGRESS", "BLOCKED"]);
const PRIORITY_RANK = { URGENT: 0, HIGH: 1, IMPORTANT: 2, NORMAL: 3, LOW: 4 } as const;
const PRIORITY_NAME = { URGENT: "Critical", HIGH: "Most Important", IMPORTANT: "Important", NORMAL: "Normal", LOW: "Low" } as const;
export const indiaDay = (iso: string) => new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 10);
const shift = (day: string, days: number) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const weekStart = (day: string) => shift(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));

// How many filters are on (the "Filters: N" count).
export function filterCount(config: GridConfig): number {
  return Number(!config.incomplete || config.completed !== "none") + Number(config.dueThisWeek) + Number(config.dueNextWeek) + config.filters.length;
}

function passes(task: GridTask, config: GridConfig, today: string, meId: number): boolean {
  const open = OPEN.has(task.status);
  const done = task.status === "COMPLETED";
  let completionOk = (config.incomplete && open) || false;
  if (done && config.completed !== "none") {
    const day = task.completedAt ? indiaDay(task.completedAt) : null;
    completionOk ||=
      config.completed === "all" || (day !== null && (config.completed === "today" ? day === today : config.completed === "week" ? day >= shift(today, -7) : day >= shift(today, -30)));
  }
  if (!completionOk) return false;
  const due = task.dueAt ? indiaDay(task.dueAt) : null;
  const start = weekStart(today);
  if (config.dueThisWeek && !(due && due >= start && due < shift(start, 7))) return false;
  if (config.dueNextWeek && !(due && due >= shift(start, 7) && due < shift(start, 14))) return false;
  for (const filter of config.filters) {
    const value = filter.value;
    switch (filter.field) {
      case "completion":
        if (value === "incomplete" && !open) return false;
        if (value === "completed" && !done) return false;
        break;
      case "assignee":
        if (String(value === "me" ? meId : value) !== String(task.assigneeId)) return false;
        break;
      case "createdBy":
        if (String(value === "me" ? meId : value) !== String(task.createdBy)) return false;
        break;
      case "project":
        if (value === "none" ? task.projects.length > 0 : !task.projects.some((project) => String(project.id) === value)) return false;
        break;
      case "priority":
        if (task.priority !== value) return false;
        break;
      case "kind":
        if ((value === "periodic") !== task.isPeriodic) return false;
        break;
      case "due":
        if (value === "none" && due) return false;
        if (value === "overdue" && !(due && due < today && open)) return false;
        if (value === "today" && due !== today) return false;
        if (value === "next7" && !(due && due >= today && due <= shift(today, 7))) return false;
        break;
      case "tag":
        if (!task.tags.some((tag) => String(tag.id) === value || tag.name === value)) return false;
        break;
    }
  }
  const words = config.search.toLowerCase().split(/\s+/).filter(Boolean);
  return words.every((word) => `${task.title} ${task.taskNo} ${task.assigneeName} ${task.tags.map((tag) => tag.name).join(" ")} ${task.projects.map((project) => project.name).join(" ")}`.toLowerCase().includes(word));
}

function sorter(sort: GridSort): (a: GridTask, b: GridTask) => number {
  const text = (value: string | null) => value ?? "￿";
  switch (sort) {
    case "none":
      return (a, b) => a.position - b.position || a.id - b.id;
    case "due":
      return (a, b) => text(a.dueAt).localeCompare(text(b.dueAt));
    case "start":
      return (a, b) => text(a.startsOn).localeCompare(text(b.startsOn));
    case "assignee":
      return (a, b) => a.assigneeName.localeCompare(b.assigneeName);
    case "createdBy":
      return (a, b) => a.createdByName.localeCompare(b.createdByName);
    case "createdOn":
      return (a, b) => b.createdAt.localeCompare(a.createdAt);
    case "completedOn":
      return (a, b) => text(b.completedAt).localeCompare(text(a.completedAt));
    case "likes":
      return (a, b) => b.likes - a.likes;
    case "alpha":
      return (a, b) => a.title.localeCompare(b.title);
    case "priority":
      return (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  }
}

export interface GridGroupOut {
  key: string;
  name: string;
  sectionId: number | null; // set when grouped by section (adding and moving work there)
  person: string | null; // grouped by a person: their name (for the avatar)
  rows: GridTask[];
}

// Filter, sort and group the rows. `sections` keeps empty sections visible.
export function applyGrid(rows: readonly GridTask[], config: GridConfig, context: { today: string; meId: number; sections?: readonly { id: number; name: string }[] }): GridGroupOut[] {
  const kept = rows.filter((task) => passes(task, config, context.today, context.meId)).sort(sorter(config.sort));
  if (config.group === "none") return [{ key: "all", name: "", sectionId: null, person: null, rows: kept }];
  if (config.group === "section") {
    const sections = context.sections ?? [];
    const out = sections.map((section) => ({ key: `s${section.id}`, name: section.name, sectionId: section.id, person: null, rows: kept.filter((task) => task.sectionId === section.id) }));
    const loose = kept.filter((task) => !sections.some((section) => section.id === task.sectionId));
    return loose.length ? [...out, { key: "s-none", name: "No section", sectionId: null, person: null, rows: loose }] : out;
  }
  const bucket = (task: GridTask): [string, number, string | null][] => {
    switch (config.group) {
      case "assignee":
        return [[task.assigneeName, 0, task.assigneeName]];
      case "createdBy":
        return [[task.createdByName, 0, task.createdByName]];
      case "project":
        return task.projects.length ? task.projects.map((project) => [project.name, 0, null] as [string, number, null]) : [["No project", 9, null]];
      case "priority":
        return [[PRIORITY_NAME[task.priority], PRIORITY_RANK[task.priority], null]];
      case "kind":
        return [[task.isPeriodic ? "Periodic" : "Ad hoc", task.isPeriodic ? 0 : 1, null]];
      default: {
        if (!task.dueAt) return [["No due date", 6, null]];
        const due = indiaDay(task.dueAt);
        if (due < context.today) return [["Overdue", 0, null]];
        if (due === context.today) return [["Today", 1, null]];
        if (due <= shift(context.today, 7)) return [["Next 7 days", 2, null]];
        if (due <= shift(context.today, 30)) return [["Next 30 days", 3, null]];
        return [["Later", 4, null]];
      }
    }
  };
  const map = new Map<string, { order: number; person: string | null; rows: GridTask[] }>();
  for (const task of kept)
    for (const [name, order, person] of bucket(task)) {
      const entry = map.get(name) ?? { order, person, rows: [] };
      entry.rows.push(task);
      map.set(name, entry);
    }
  return [...map.entries()].sort((a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0])).map(([name, entry]) => ({ key: `g${name}`, name, sectionId: null, person: entry.person, rows: entry.rows }));
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
