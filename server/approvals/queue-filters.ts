// WS-01 Waiting for me: filters and order, from the address bar. Pure.
// v1.7.2: the full filter set (search, raised by, department, step, mine or
// covering, due within N days, files, raised and waiting-since dates, rows
// per page). Filters only narrow what already waits for the person.
import { priorityRankSql } from "@/server/approvals/priority";

export const QUEUE_SHOWS = ["all", "overdue", "soon", "approvals", "work", "held"] as const;
export const QUEUE_SORTS = ["oldest", "newest", "due", "raised", "number", "priority"] as const; // v1.47.0: + priority
export const QUEUE_SIZES = [25, 50, 100] as const;
export const QUEUE_FOR = ["me", "covering"] as const;
export type QueueShow = (typeof QUEUE_SHOWS)[number];
export type QueueSort = (typeof QUEUE_SORTS)[number];

export interface QueueFilter {
  show: QueueShow;
  typeId: number | null;
  sort: QueueSort;
  q?: string;
  requesterId?: number | null;
  departmentId?: number | null;
  step?: string | null;
  forWhom?: (typeof QUEUE_FOR)[number] | null;
  dueWithinDays?: number | null;
  hasFiles?: boolean | null;
  raisedFrom?: string | null;
  raisedTo?: string | null;
  waitingFrom?: string | null;
  waitingTo?: string | null;
  size?: (typeof QUEUE_SIZES)[number];
}

export const QUEUE_SHOW_LABEL: Record<QueueShow, string> = {
  all: "Everything",
  overdue: "Overdue",
  soon: "Due within 24 hours",
  approvals: "Approvals",
  work: "Work tasks (To do)",
  held: "On hold",
};
export const QUEUE_SORT_LABEL: Record<QueueSort, string> = { oldest: "Oldest first", newest: "Newest first", due: "Due soonest", raised: "Raised most recently", number: "Request number", priority: "Priority (highest first)" };

const pick = <T extends string>(allowed: readonly T[], value: unknown, fallback: T): T => (typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (value: unknown) => (typeof value === "string" ? value : undefined);
const id = (value: unknown) => (typeof value === "string" && /^\d{1,10}$/.test(value) && Number(value) > 0 ? Number(value) : null);
const date = (value: unknown) => (typeof value === "string" && DATE.test(value) ? value : null);
const ordered = (from: string | null, to: string | null): [string | null, string | null] => (from && to && to < from ? [to, from] : [from, to]);

export function parseQueueFilter(params: Record<string, unknown>): QueueFilter {
  const type = typeof params.type === "string" && /^\d{1,10}$/.test(params.type) ? Number(params.type) : null;
  const due = id(params.due);
  const files = str(params.files);
  const [raisedFrom, raisedTo] = ordered(date(params.raisedFrom), date(params.raisedTo));
  const [waitingFrom, waitingTo] = ordered(date(params.waitingFrom), date(params.waitingTo));
  return {
    show: pick(QUEUE_SHOWS, params.show, "all"),
    typeId: type,
    sort: pick(QUEUE_SORTS, params.sort, "oldest"),
    q: (str(params.q) ?? "").replace(/\s+/g, " ").trim().slice(0, 100),
    requesterId: id(params.raisedBy),
    departmentId: id(params.dept),
    step: str(params.step)?.trim().slice(0, 200) || null,
    forWhom: (QUEUE_FOR as readonly string[]).includes(str(params.for) ?? "") ? (str(params.for) as "me" | "covering") : null,
    dueWithinDays: due !== null && due <= 90 ? due : null,
    hasFiles: files === "yes" ? true : files === "no" ? false : null,
    raisedFrom,
    raisedTo,
    waitingFrom,
    waitingTo,
    size: QUEUE_SIZES.find((value) => String(value) === str(params.size)) ?? 25,
  };
}

// Is anything beyond the default view chosen? (Bulk approval hides then.)
export function queueFiltered(filter: QueueFilter): boolean {
  return filter.show !== "all" || filter.typeId !== null || Boolean(filter.q) || [filter.requesterId, filter.departmentId, filter.step, filter.forWhom, filter.dueWithinDays, filter.hasFiles, filter.raisedFrom, filter.raisedTo, filter.waitingFrom, filter.waitingTo].some((value) => value !== null && value !== undefined);
}

const INDIA = (column: string) => `DATE(DATE_ADD(${column}, INTERVAL 330 MINUTE))`;

// Extra WHERE conditions (on t = approval_tasks, r = approval_requests,
// v = workflow_versions, u = the requester) and the ORDER BY. Values are
// always parameters. userId is the person whose queue it is ("mine" vs
// "covering for someone").
export function queueFilterSql(filter: QueueFilter, userId?: number): { where: string; params: unknown[]; orderBy: string } {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.show === "overdue") where.push("t.due_at IS NOT NULL AND t.due_at < CURRENT_TIMESTAMP AND r.status = 'IN_PROGRESS'");
  if (filter.show === "soon") where.push("t.due_at IS NOT NULL AND t.due_at >= CURRENT_TIMESTAMP AND t.due_at < DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 24 HOUR)");
  if (filter.show === "approvals") where.push("t.task_type = 'APPROVAL'");
  if (filter.show === "work") where.push("t.task_type = 'WORK'");
  if (filter.show === "held") where.push("r.status = 'ON_HOLD'");
  if (filter.typeId !== null) {
    where.push("v.workflow_id = ?");
    params.push(filter.typeId);
  }
  if (filter.q) {
    const like = `%${filter.q.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
    where.push("(r.request_no LIKE ? OR r.title LIKE ? OR u.name LIKE ?)");
    params.push(like, like, like);
  }
  if (filter.requesterId) {
    where.push("r.requester_id = ?");
    params.push(filter.requesterId);
  }
  if (filter.departmentId) {
    where.push("u.department_id = ?");
    params.push(filter.departmentId);
  }
  if (filter.step) {
    where.push("t.node_label = ?");
    params.push(filter.step);
  }
  if (filter.forWhom && userId !== undefined) {
    where.push(filter.forWhom === "me" ? "t.approver_id = ?" : "t.approver_id <> ?");
    params.push(userId);
  }
  if (filter.dueWithinDays) {
    where.push("t.due_at IS NOT NULL AND t.due_at >= CURRENT_TIMESTAMP AND t.due_at < DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? DAY)");
    params.push(filter.dueWithinDays);
  }
  if (filter.hasFiles === true || filter.hasFiles === false) where.push(`${filter.hasFiles ? "" : "NOT "}EXISTS (SELECT 1 FROM request_attachments qa WHERE qa.deleted_at IS NULL AND qa.request_id = r.id)`);
  for (const [value, sql] of [
    [filter.raisedFrom, `${INDIA("r.submitted_at")} >= ?`],
    [filter.raisedTo, `${INDIA("r.submitted_at")} <= ?`],
    [filter.waitingFrom, `${INDIA("t.created_at")} >= ?`],
    [filter.waitingTo, `${INDIA("t.created_at")} <= ?`],
  ] as const) {
    if (!value) continue;
    where.push(sql);
    params.push(value);
  }
  const orderBy =
    filter.sort === "newest"
      ? "t.created_at DESC, t.id DESC"
      : filter.sort === "due"
        ? "t.due_at IS NULL, t.due_at, t.id"
        : filter.sort === "raised"
          ? "r.submitted_at DESC, t.id DESC"
          : filter.sort === "number"
            ? "r.request_no, t.id"
            : filter.sort === "priority"
              ? `${priorityRankSql("r", "v")} IS NULL, ${priorityRankSql("r", "v")}, t.created_at, t.id`
            : "t.created_at, t.id";
  return { where: where.length ? ` AND ${where.join(" AND ")}` : "", params, orderBy };
}

// The address for a filter (defaults left out), for links and chips.
export function queueHref(filter: Partial<QueueFilter>, page?: number): string {
  const query = new URLSearchParams();
  if (filter.show && filter.show !== "all") query.set("show", filter.show);
  if (filter.typeId) query.set("type", String(filter.typeId));
  if (filter.q) query.set("q", filter.q);
  if (filter.requesterId) query.set("raisedBy", String(filter.requesterId));
  if (filter.departmentId) query.set("dept", String(filter.departmentId));
  if (filter.step) query.set("step", filter.step);
  if (filter.forWhom) query.set("for", filter.forWhom);
  if (filter.dueWithinDays) query.set("due", String(filter.dueWithinDays));
  if (filter.hasFiles === true) query.set("files", "yes");
  if (filter.hasFiles === false) query.set("files", "no");
  for (const key of ["raisedFrom", "raisedTo", "waitingFrom", "waitingTo"] as const) if (filter[key]) query.set(key, filter[key]!);
  if (filter.sort && filter.sort !== "oldest") query.set("sort", filter.sort);
  if (filter.size && filter.size !== 25) query.set("size", String(filter.size));
  if (page && page > 1) query.set("page", String(page));
  const text = query.toString();
  return text ? `/users/queue?${text}` : "/users/queue";
}
