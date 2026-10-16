import { TASK_PRIORITIES, type TaskPriority } from "@/server/modules/settings";
import { TASK_STATUSES, type TaskStatus } from "@/server/modules/task-rules";

// v1.9.0: the task lists (My tasks, Assigned by me, Team tasks): quick tabs,
// search, filters and sorting, all from the address. Pure: the values are
// checked here and only ever reach SQL as bound parameters.
export type TaskBase = "MINE" | "CREATED" | "TEAM";
export const TASK_TABS = ["open", "overdue", "due_soon", "blocked", "completed", "cancelled", "all"] as const;
export type TaskTab = (typeof TASK_TABS)[number];
export const TASK_TAB_LABEL: Record<TaskTab, string> = { open: "Open", overdue: "Overdue", due_soon: "Due in 2 days", blocked: "Blocked", completed: "Completed", cancelled: "Cancelled", all: "All" };
export const TASK_SORTS = ["due", "newest", "oldest", "priority", "updated"] as const;
export type TaskSort = (typeof TASK_SORTS)[number];
export const TASK_SORT_LABEL: Record<TaskSort, string> = { due: "Due first", newest: "Newest", oldest: "Oldest", priority: "Priority", updated: "Recently updated" };
export const PAGE_SIZES = [25, 50, 100] as const;

export interface TaskFilters {
  tab: TaskTab;
  q: string;
  typeId: number | null;
  priorities: TaskPriority[];
  statuses: TaskStatus[];
  personId: number | null; // the assignee (Assigned by me, Team) or the creator (My tasks)
  dueFrom: string | null;
  dueTo: string | null;
  createdFrom: string | null;
  createdTo: string | null;
  sort: TaskSort;
  size: number;
  page: number;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
const many = (value: string | string[] | undefined) => (Array.isArray(value) ? value : value ? value.split(",") : []);
const id = (value: string) => (/^\d{1,10}$/.test(value) ? Number(value) : null);
const date = (value: string) => (ISO.test(value) ? value : null);

export function parseTaskFilters(query: Record<string, string | string[] | undefined>): TaskFilters {
  const tab = one(query.tab) as TaskTab;
  const sort = one(query.sort) as TaskSort;
  const size = Number(one(query.size));
  let [dueFrom, dueTo] = [date(one(query.dueFrom)), date(one(query.dueTo))];
  if (dueFrom && dueTo && dueFrom > dueTo) [dueFrom, dueTo] = [dueTo, dueFrom];
  let [createdFrom, createdTo] = [date(one(query.createdFrom)), date(one(query.createdTo))];
  if (createdFrom && createdTo && createdFrom > createdTo) [createdFrom, createdTo] = [createdTo, createdFrom];
  return {
    tab: (TASK_TABS as readonly string[]).includes(tab) ? tab : "open",
    q: one(query.q).trim().slice(0, 100),
    typeId: id(one(query.type)),
    priorities: many(query.priority).filter((value): value is TaskPriority => (TASK_PRIORITIES as readonly string[]).includes(value)),
    statuses: many(query.status).filter((value): value is TaskStatus => (TASK_STATUSES as readonly string[]).includes(value)),
    personId: id(one(query.person)),
    dueFrom,
    dueTo,
    createdFrom,
    createdTo,
    sort: (TASK_SORTS as readonly string[]).includes(sort) ? sort : "due",
    size: (PAGE_SIZES as readonly number[]).includes(size) ? size : 25,
    page: Math.min(1000, Math.max(1, Number(one(query.page)) || 1)),
  };
}

// The address of a list with these filters (only what differs from the defaults).
export function taskQuery(filters: TaskFilters, change: Partial<TaskFilters> = {}): string {
  const f = { ...filters, page: 1, ...change };
  const params = new URLSearchParams();
  if (f.tab !== "open") params.set("tab", f.tab);
  if (f.q) params.set("q", f.q);
  if (f.typeId) params.set("type", String(f.typeId));
  if (f.priorities.length) params.set("priority", f.priorities.join(","));
  if (f.statuses.length) params.set("status", f.statuses.join(","));
  if (f.personId) params.set("person", String(f.personId));
  if (f.dueFrom) params.set("dueFrom", f.dueFrom);
  if (f.dueTo) params.set("dueTo", f.dueTo);
  if (f.createdFrom) params.set("createdFrom", f.createdFrom);
  if (f.createdTo) params.set("createdTo", f.createdTo);
  if (f.sort !== "due") params.set("sort", f.sort);
  if (f.size !== 25) params.set("size", String(f.size));
  if (f.page > 1) params.set("page", String(f.page));
  const text = params.toString();
  return text ? `?${text}` : "";
}

// India date (YYYY-MM-DD) → the UTC instant its day starts; ranges use
// "column >= start AND column < next day's start", so indexes stay usable.
export function indiaDayStartUtc(day: string): Date {
  return new Date(Date.parse(`${day}T00:00:00Z`) - 330 * 60_000);
}
const nextDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

const OPEN_SQL = "t.status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED')";

// WHERE parts and parameters for one list. `viewer.isAdmin` sees everyone's
// team tasks; others see the tasks of people who report to them.
export function taskListSql(
  f: TaskFilters,
  base: TaskBase,
  viewer: { id: number; isAdmin: boolean },
  searchableKeys: readonly string[],
  now: Date,
  tabOverride?: TaskTab,
): { where: string[]; params: unknown[]; orderBy: string } {
  const where: string[] = [];
  const params: unknown[] = [];
  if (base === "MINE") {
    where.push("t.assignee_id = ?");
    params.push(viewer.id);
  } else if (base === "CREATED") {
    where.push("(t.created_by = ? OR t.assigned_by = ?)");
    params.push(viewer.id, viewer.id);
  } else if (!viewer.isAdmin) {
    where.push("a.reporting_manager_id = ?");
    params.push(viewer.id);
  }
  const tab = tabOverride ?? f.tab;
  if (tab === "open") where.push(OPEN_SQL);
  else if (tab === "overdue") {
    where.push(`${OPEN_SQL} AND t.due_at IS NOT NULL AND t.due_at < ?`);
    params.push(now);
  } else if (tab === "due_soon") {
    where.push(`${OPEN_SQL} AND t.due_at >= ? AND t.due_at < ?`);
    params.push(now, new Date(now.getTime() + 48 * 3_600_000));
  } else if (tab === "blocked") where.push("t.status = 'BLOCKED'");
  else if (tab === "completed") where.push("t.status = 'COMPLETED'");
  else if (tab === "cancelled") where.push("t.status = 'CANCELLED'");
  if (tabOverride) return { where, params, orderBy: "t.id" };

  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
    const parts = ["t.task_no LIKE ?", "t.title LIKE ?", "t.description LIKE ?"];
    params.push(like, like, like);
    for (const key of searchableKeys.filter((key) => /^[a-z][a-z0-9_]{0,49}$/.test(key))) {
      parts.push("JSON_UNQUOTE(JSON_EXTRACT(t.form_data_json, ?)) LIKE ?");
      params.push(`$.${key}`, like);
    }
    where.push(`(${parts.join(" OR ")})`);
  }
  if (f.typeId) {
    where.push("v.type_id = ?");
    params.push(f.typeId);
  }
  if (f.priorities.length) {
    where.push("t.priority IN (?)");
    params.push(f.priorities);
  }
  if (f.statuses.length) {
    where.push("t.status IN (?)");
    params.push(f.statuses);
  }
  if (f.personId) {
    where.push(base === "MINE" ? "t.created_by = ?" : "t.assignee_id = ?");
    params.push(f.personId);
  }
  if (f.dueFrom) {
    where.push("t.due_at >= ?");
    params.push(indiaDayStartUtc(f.dueFrom));
  }
  if (f.dueTo) {
    where.push("t.due_at < ?");
    params.push(indiaDayStartUtc(nextDay(f.dueTo)));
  }
  if (f.createdFrom) {
    where.push("t.created_at >= ?");
    params.push(indiaDayStartUtc(f.createdFrom));
  }
  if (f.createdTo) {
    where.push("t.created_at < ?");
    params.push(indiaDayStartUtc(nextDay(f.createdTo)));
  }
  const orderBy =
    f.sort === "newest"
      ? "t.id DESC"
      : f.sort === "oldest"
        ? "t.id ASC"
        : f.sort === "priority"
          ? "FIELD(t.priority, 'URGENT', 'HIGH', 'NORMAL', 'LOW'), t.due_at IS NULL, t.due_at, t.id"
          : f.sort === "updated"
            ? "t.updated_at DESC, t.id DESC"
            : "t.due_at IS NULL, t.due_at, t.id";
  return { where, params, orderBy };
}
