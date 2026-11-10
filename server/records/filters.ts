// D-191 (owner): the Admin "records" registers: every approval request, task
// and information item, whoever raised it, in one spreadsheet-like table each.
// This file reads the filters from the address (pure, unit-tested); every
// value is checked against a fixed list or pattern before it reaches SQL.
export type RecordKind = "requests" | "tasks" | "information";

export const REQUEST_STATUSES = ["IN_PROGRESS", "ON_HOLD", "CHANGES_REQUIRED", "APPROVED", "REJECTED", "CANCELLED"] as const;
export const TASK_STATUSES = ["OPEN", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"] as const;
export const INFO_STATUSES = ["DRAFT", "PUBLISHED", "WITHDRAWN", "ARCHIVED"] as const;
export const TASK_PRIORITIES = ["URGENT", "HIGH", "IMPORTANT", "NORMAL", "LOW"] as const; // v1.50.1: IMPORTANT added
export const INFO_PRIORITIES = ["NORMAL", "IMPORTANT", "URGENT"] as const;

// The sortable columns of each register (column key → SQL expression).
export const SORTS: Record<RecordKind, Record<string, string>> = {
  requests: { no: "r.id", title: "r.title", type: "type_name", raisedBy: "requester_name", department: "department_name", status: "r.status", submitted: "r.submitted_at", closed: "r.closed_at" },
  tasks: { no: "t.id", title: "t.title", type: "type_name", priority: "FIELD(t.priority, 'LOW', 'NORMAL', 'IMPORTANT', 'HIGH', 'URGENT')", status: "t.status", assignee: "assignee_name", department: "department_name", created: "t.created_at", due: "t.due_at", completed: "t.completed_at" },
  information: { no: "i.id", title: "i.title", type: "type_name", priority: "FIELD(i.priority, 'NORMAL', 'IMPORTANT', 'URGENT')", status: "i.status", createdBy: "creator_name", department: "department_name", created: "i.created_at", published: "i.published_at" },
};

export interface RecordFilter {
  q: string;
  status: string;
  type: number | null;
  department: number | null;
  person: number | null; // requests: raised by; tasks: assignee; information: created by
  waitingOn: number | null; // requests only
  priority: string;
  overdue: boolean; // tasks only
  from: string | null; // India dates, YYYY-MM-DD
  to: string | null;
  sort: string;
  dir: "asc" | "desc";
  page: number;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const id = (value: string | undefined) => (value && /^\d{1,12}$/.test(value) ? Number(value) : null);
const oneOf = (value: string | undefined, list: readonly string[]) => (value && list.includes(value) ? value : "");

export function readRecordFilter(kind: RecordKind, query: Record<string, string | undefined>): RecordFilter {
  const statuses = kind === "requests" ? REQUEST_STATUSES : kind === "tasks" ? TASK_STATUSES : INFO_STATUSES;
  const priorities = kind === "tasks" ? TASK_PRIORITIES : kind === "information" ? INFO_PRIORITIES : [];
  const from = query.from && DAY.test(query.from) ? query.from : null;
  const to = query.to && DAY.test(query.to) ? query.to : null;
  const sort = query.sort && query.sort in SORTS[kind] ? query.sort : "no";
  return {
    q: (query.q ?? "").trim().slice(0, 100),
    status: oneOf(query.status, statuses),
    type: id(query.type),
    department: id(query.department),
    person: id(query.person),
    waitingOn: kind === "requests" ? id(query.waiting) : null,
    priority: oneOf(query.priority, priorities),
    overdue: kind === "tasks" && query.overdue === "1",
    from,
    to: from && to && to < from ? from : to,
    sort,
    dir: query.dir === "asc" ? "asc" : "desc",
    page: Math.max(1, Math.min(100_000, Number(query.page) || 1)),
  };
}

// The address of the same register with some filters changed (links, paging, sorting).
export function recordQuery(filter: RecordFilter, changes: Partial<Record<string, string | number | null>> = {}): string {
  const values: Record<string, string | number | null> = {
    q: filter.q || null,
    status: filter.status || null,
    type: filter.type,
    department: filter.department,
    person: filter.person,
    waiting: filter.waitingOn,
    priority: filter.priority || null,
    overdue: filter.overdue ? "1" : null,
    from: filter.from,
    to: filter.to,
    sort: filter.sort === "no" ? null : filter.sort,
    dir: filter.dir === "desc" ? null : filter.dir,
    page: filter.page > 1 ? filter.page : null,
    ...changes,
  };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== null && value !== undefined && value !== "") params.set(key, String(value));
  const text = params.toString();
  return text ? `?${text}` : "";
}

// India date (YYYY-MM-DD) → the UTC instant its day starts.
export const indiaDayStartUtc = (day: string): Date => new Date(Date.parse(`${day}T00:00:00Z`) - 330 * 60_000);
export const nextIndiaDayStartUtc = (day: string): Date => new Date(indiaDayStartUtc(day).getTime() + 86_400_000);

export const likeOf = (text: string) => `%${text.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
