// WS-01 Waiting for me: filters and order, from the address bar. Pure.
export const QUEUE_SHOWS = ["all", "overdue", "soon", "approvals", "work", "held"] as const;
export const QUEUE_SORTS = ["oldest", "newest", "due"] as const;
export type QueueShow = (typeof QUEUE_SHOWS)[number];
export type QueueSort = (typeof QUEUE_SORTS)[number];

export interface QueueFilter {
  show: QueueShow;
  typeId: number | null;
  sort: QueueSort;
}

export const QUEUE_SHOW_LABEL: Record<QueueShow, string> = {
  all: "Everything",
  overdue: "Overdue",
  soon: "Due within 24 hours",
  approvals: "Approvals",
  work: "Work tasks (To do)",
  held: "On hold",
};
export const QUEUE_SORT_LABEL: Record<QueueSort, string> = { oldest: "Oldest first", newest: "Newest first", due: "Due soonest" };

const pick = <T extends string>(allowed: readonly T[], value: unknown, fallback: T): T => (typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback);

export function parseQueueFilter(params: Record<string, unknown>): QueueFilter {
  const type = typeof params.type === "string" && /^\d{1,10}$/.test(params.type) ? Number(params.type) : null;
  return { show: pick(QUEUE_SHOWS, params.show, "all"), typeId: type, sort: pick(QUEUE_SORTS, params.sort, "oldest") };
}

// Extra WHERE conditions (on t = approval_tasks, r = approval_requests,
// v = workflow_versions) and the ORDER BY. Values are always parameters.
export function queueFilterSql(filter: QueueFilter): { where: string; params: unknown[]; orderBy: string } {
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
  const orderBy = filter.sort === "newest" ? "t.created_at DESC, t.id DESC" : filter.sort === "due" ? "t.due_at IS NULL, t.due_at, t.id" : "t.created_at, t.id";
  return { where: where.length ? ` AND ${where.join(" AND ")}` : "", params, orderBy };
}

// The address for a filter (defaults left out), for links and chips.
export function queueHref(filter: Partial<QueueFilter>, page?: number): string {
  const query = new URLSearchParams();
  if (filter.show && filter.show !== "all") query.set("show", filter.show);
  if (filter.typeId) query.set("type", String(filter.typeId));
  if (filter.sort && filter.sort !== "oldest") query.set("sort", filter.sort);
  if (page && page > 1) query.set("page", String(page));
  const text = query.toString();
  return text ? `/users/queue?${text}` : "/users/queue";
}
