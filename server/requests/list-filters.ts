// v1.7.2: one filter engine for the request lists people use every day
// (My requests and Collaborating). Pure: parses the address bar, builds the
// SQL conditions with bound values only, and writes the address back.
// Anything unexpected is dropped, never passed on. The base condition (whose
// requests these are) is always added by the caller and can't be widened by
// any filter.
export const LIST_STATUSES = ["IN_PROGRESS", "ON_HOLD", "CHANGES_REQUIRED", "APPROVED", "REJECTED", "CANCELLED"] as const;
export type ListStatus = (typeof LIST_STATUSES)[number];
export const LIST_SORTS = ["newest", "oldest", "activity", "due", "number", "added"] as const;
export type ListSort = (typeof LIST_SORTS)[number];
export const LIST_SIZES = [25, 50, 100] as const;
export const VALIDITY = ["valid", "expiring", "expired"] as const;
export type ListBase = "MINE" | "COLLAB";

export const STATUS_LABEL: Record<ListStatus, string> = {
  IN_PROGRESS: "In progress",
  ON_HOLD: "On hold",
  CHANGES_REQUIRED: "Changes required",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Withdrawn",
};
export const SORT_LABEL: Record<ListSort, string> = {
  newest: "Newest raised first",
  oldest: "Oldest raised first",
  activity: "Latest activity first",
  due: "Due soonest first",
  number: "Request number",
  added: "Latest added first",
};
export const VALIDITY_LABEL: Record<(typeof VALIDITY)[number], string> = { valid: "Approval still valid", expiring: "Expires within 7 days", expired: "Approval expired" };

// Quick tabs: a named set of statuses (or overdue).
export const QUICK_TABS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "waiting", label: "Waiting for approvers" },
  { key: "sentback", label: "Sent back" },
  { key: "hold", label: "On hold" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "withdrawn", label: "Withdrawn" },
  { key: "overdue", label: "Overdue" },
] as const;
export type QuickTab = (typeof QUICK_TABS)[number]["key"];
const TAB_STATUSES: Record<QuickTab, ListStatus[]> = {
  all: [],
  open: ["IN_PROGRESS", "ON_HOLD", "CHANGES_REQUIRED"],
  waiting: ["IN_PROGRESS"],
  sentback: ["CHANGES_REQUIRED"],
  hold: ["ON_HOLD"],
  approved: ["APPROVED"],
  rejected: ["REJECTED"],
  withdrawn: ["CANCELLED"],
  overdue: [],
};

export interface ListFilters {
  tab: QuickTab;
  q: string;
  statuses: ListStatus[];
  typeId: number | null; // -1 = custom approvals
  requesterId: number | null; // COLLAB only
  departmentId: number | null; // requester's department (COLLAB only)
  addedById: number | null; // COLLAB only
  step: string | null; // a step waiting now
  waitingWithId: number | null; // a person a step is waiting on now
  overdue: boolean;
  dueWithinDays: number | null;
  hasFiles: boolean | null;
  validity: (typeof VALIDITY)[number] | null;
  raisedFrom: string | null;
  raisedTo: string | null;
  addedFrom: string | null; // COLLAB only
  addedTo: string | null;
  closedFrom: string | null;
  closedTo: string | null;
  activityFrom: string | null;
  activityTo: string | null;
  sort: ListSort;
  size: (typeof LIST_SIZES)[number];
  page: number;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (value: unknown) => (typeof value === "string" ? value : Array.isArray(value) && typeof value[0] === "string" ? value[0] : undefined);
const idOf = (value: unknown) => {
  const text = str(value);
  return text && /^-?\d{1,10}$/.test(text) ? Number(text) : null;
};
const dateOf = (value: unknown) => {
  const text = str(value);
  return text && DATE.test(text) ? text : null;
};
const range = (from: string | null, to: string | null): [string | null, string | null] => (from && to && to < from ? [to, from] : [from, to]);

export function parseListFilters(params: Record<string, unknown>, base: ListBase): ListFilters {
  const collab = base === "COLLAB";
  const rawStatuses = ([] as unknown[]).concat(params.status ?? []).flatMap((value) => (typeof value === "string" ? value.split(",") : []));
  const statuses = [...new Set(rawStatuses.filter((value): value is ListStatus => (LIST_STATUSES as readonly string[]).includes(value)))];
  const tab = (QUICK_TABS.some((item) => item.key === str(params.tab)) ? str(params.tab) : "all") as QuickTab;
  const sort = (LIST_SORTS as readonly string[]).includes(str(params.sort) ?? "") ? (str(params.sort) as ListSort) : "newest";
  const size = LIST_SIZES.find((value) => String(value) === str(params.size)) ?? 25;
  const due = idOf(params.due);
  const page = idOf(params.page);
  const [raisedFrom, raisedTo] = range(dateOf(params.raisedFrom), dateOf(params.raisedTo));
  const [addedFrom, addedTo] = collab ? range(dateOf(params.addedFrom), dateOf(params.addedTo)) : [null, null];
  const [closedFrom, closedTo] = range(dateOf(params.closedFrom), dateOf(params.closedTo));
  const [activityFrom, activityTo] = range(dateOf(params.activityFrom), dateOf(params.activityTo));
  const files = str(params.files);
  const step = str(params.step)?.trim().slice(0, 200) || null;
  const type = idOf(params.type);
  return {
    tab,
    q: (str(params.q) ?? "").replace(/\s+/g, " ").trim().slice(0, 100),
    statuses,
    typeId: type !== null && (type === -1 || type > 0) ? type : null,
    requesterId: collab ? positive(idOf(params.raisedBy)) : null,
    departmentId: collab ? positive(idOf(params.dept)) : null,
    addedById: collab ? positive(idOf(params.addedBy)) : null,
    step,
    waitingWithId: positive(idOf(params.waitingWith)),
    overdue: str(params.overdue) === "1" || tab === "overdue",
    dueWithinDays: due !== null && due >= 1 && due <= 90 ? due : null,
    hasFiles: files === "yes" ? true : files === "no" ? false : null,
    validity: (VALIDITY as readonly string[]).includes(str(params.validity) ?? "") ? (str(params.validity) as ListFilters["validity"]) : null,
    raisedFrom,
    raisedTo,
    addedFrom,
    addedTo,
    closedFrom,
    closedTo,
    activityFrom,
    activityTo,
    sort: sort === "added" && !collab ? "newest" : sort,
    size,
    page: page && page > 0 && page <= 10000 ? page : 1,
  };
}

const positive = (value: number | null) => (value !== null && value > 0 ? value : null);

// Back to the address bar (only what differs from the defaults).
export function listQuery(filters: Partial<ListFilters>, changes: Partial<ListFilters> = {}): Record<string, string> {
  const f = { ...filters, ...changes };
  const out: Record<string, string> = {};
  const put = (key: string, value: unknown) => {
    if (value !== null && value !== undefined && value !== "" && value !== false) out[key] = String(value);
  };
  if (f.tab && f.tab !== "all") put("tab", f.tab);
  put("q", f.q);
  if (f.statuses?.length) put("status", f.statuses.join(","));
  put("type", f.typeId);
  put("raisedBy", f.requesterId);
  put("dept", f.departmentId);
  put("addedBy", f.addedById);
  put("step", f.step);
  put("waitingWith", f.waitingWithId);
  if (f.overdue && f.tab !== "overdue") put("overdue", "1");
  put("due", f.dueWithinDays);
  if (f.hasFiles === true) put("files", "yes");
  if (f.hasFiles === false) put("files", "no");
  put("validity", f.validity);
  put("raisedFrom", f.raisedFrom);
  put("raisedTo", f.raisedTo);
  put("addedFrom", f.addedFrom);
  put("addedTo", f.addedTo);
  put("closedFrom", f.closedFrom);
  put("closedTo", f.closedTo);
  put("activityFrom", f.activityFrom);
  put("activityTo", f.activityTo);
  if (f.sort && f.sort !== "newest") put("sort", f.sort);
  if (f.size && f.size !== 25) put("size", f.size);
  if (f.page && f.page > 1) put("page", f.page);
  return out;
}

export function listHref(path: string, filters: Partial<ListFilters>, changes: Partial<ListFilters> = {}): string {
  const text = new URLSearchParams(listQuery(filters, changes)).toString();
  return text ? `${path}?${text}` : path;
}

// How many filters (beyond the tab, sort and paging) are in use.
export function activeCount(f: ListFilters): number {
  return [f.q, f.statuses.length, f.typeId, f.requesterId, f.departmentId, f.addedById, f.step, f.waitingWithId, f.overdue && f.tab !== "overdue", f.dueWithinDays, f.hasFiles !== null, f.validity, f.raisedFrom || f.raisedTo, f.addedFrom || f.addedTo, f.closedFrom || f.closedTo, f.activityFrom || f.activityTo].filter(Boolean).length;
}

const INDIA = (column: string) => `DATE(DATE_ADD(${column}, INTERVAL 330 MINUTE))`;
const PENDING = "EXISTS (SELECT 1 FROM approval_tasks pt WHERE pt.request_id = r.id AND pt.status = 'PENDING' AND pt.round = r.round";

// Conditions on r (request), w (workflow), u (requester) and, for COLLAB,
// k (the person's collaborator row). Values are always parameters.
export function listFilterSql(f: ListFilters, base: ListBase): { where: string[]; params: unknown[]; orderBy: string } {
  const where: string[] = [];
  const params: unknown[] = [];
  const tabStatuses = TAB_STATUSES[f.tab];
  if (tabStatuses.length) {
    where.push("r.status IN (?)");
    params.push(tabStatuses);
  }
  if (f.statuses.length) {
    where.push("r.status IN (?)");
    params.push(f.statuses);
  }
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
    where.push("(r.request_no LIKE ? OR r.title LIKE ? OR u.name LIKE ?)");
    params.push(like, like, like);
  }
  if (f.typeId === -1) where.push("w.kind = 'CUSTOM'");
  else if (f.typeId !== null) {
    where.push("w.id = ?");
    params.push(f.typeId);
  }
  if (base === "COLLAB") {
    if (f.requesterId !== null) {
      where.push("r.requester_id = ?");
      params.push(f.requesterId);
    }
    if (f.departmentId !== null) {
      where.push("u.department_id = ?");
      params.push(f.departmentId);
    }
    if (f.addedById !== null) {
      where.push("k.added_by = ?");
      params.push(f.addedById);
    }
    if (f.addedFrom) {
      where.push(`${INDIA("k.added_at")} >= ?`);
      params.push(f.addedFrom);
    }
    if (f.addedTo) {
      where.push(`${INDIA("k.added_at")} <= ?`);
      params.push(f.addedTo);
    }
  }
  if (f.step) {
    where.push(`${PENDING} AND pt.node_label = ?)`);
    params.push(f.step);
  }
  if (f.waitingWithId !== null) {
    where.push(`${PENDING} AND pt.approver_id = ?)`);
    params.push(f.waitingWithId);
  }
  if (f.overdue) where.push(`r.status = 'IN_PROGRESS' AND ${PENDING} AND pt.due_at < CURRENT_TIMESTAMP)`);
  if (f.dueWithinDays !== null) {
    where.push(`r.status = 'IN_PROGRESS' AND ${PENDING} AND pt.due_at >= CURRENT_TIMESTAMP AND pt.due_at < DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? DAY))`);
    params.push(f.dueWithinDays);
  }
  if (f.hasFiles !== null) where.push(`${f.hasFiles ? "" : "NOT "}EXISTS (SELECT 1 FROM request_attachments ra WHERE ra.request_id = r.id)`);
  if (f.validity === "valid") where.push("r.status = 'APPROVED' AND r.valid_until > DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 7 DAY)");
  if (f.validity === "expiring") where.push("r.status = 'APPROVED' AND r.valid_until > CURRENT_TIMESTAMP AND r.valid_until <= DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 7 DAY)");
  if (f.validity === "expired") where.push("r.status = 'APPROVED' AND r.valid_until <= CURRENT_TIMESTAMP");
  for (const [value, sql] of [
    [f.raisedFrom, `${INDIA("r.submitted_at")} >= ?`],
    [f.raisedTo, `${INDIA("r.submitted_at")} <= ?`],
    [f.closedFrom, `r.closed_at IS NOT NULL AND ${INDIA("r.closed_at")} >= ?`],
    [f.closedTo, `r.closed_at IS NOT NULL AND ${INDIA("r.closed_at")} <= ?`],
    [f.activityFrom, `${INDIA("r.updated_at")} >= ?`],
    [f.activityTo, `${INDIA("r.updated_at")} <= ?`],
  ] as const) {
    if (!value) continue;
    where.push(sql);
    params.push(value);
  }
  const due = "(SELECT MIN(d.due_at) FROM approval_tasks d WHERE d.request_id = r.id AND d.status = 'PENDING')";
  const orderBy =
    f.sort === "oldest"
      ? "r.submitted_at ASC, r.id ASC"
      : f.sort === "activity"
        ? "r.updated_at DESC, r.id DESC"
        : f.sort === "due"
          ? `${due} IS NULL, ${due}, r.id DESC`
          : f.sort === "number"
            ? "r.request_no ASC"
            : f.sort === "added" && base === "COLLAB"
              ? "k.added_at DESC, r.id DESC"
              : "r.submitted_at DESC, r.id DESC";
  return { where, params, orderBy };
}
