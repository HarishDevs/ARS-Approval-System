// v1.7.2: one filter engine for the request lists people use every day.
// v1.8.0: also My approved requests and Approved by me. Pure: parses the
// address bar, builds the SQL conditions with bound values only, and writes
// the address back. Anything unexpected is dropped, never passed on. The
// base condition (whose requests these are) is always added by the caller
// and can't be widened by any filter.
export const LIST_STATUSES = ["IN_PROGRESS", "ON_HOLD", "CHANGES_REQUIRED", "APPROVED", "REJECTED", "CANCELLED"] as const;
export type ListStatus = (typeof LIST_STATUSES)[number];
export const LIST_SORTS = ["newest", "oldest", "activity", "due", "number", "added", "approved", "mine"] as const;
export type ListSort = (typeof LIST_SORTS)[number];
export const LIST_SIZES = [25, 50, 100] as const;
// D-226: the list's rows in groups (the page shown).
export const LIST_GROUPS = ["status", "type", "month", "raiser"] as const;
export type ListGroup = (typeof LIST_GROUPS)[number];
export const GROUP_LABEL: Record<ListGroup, string> = { status: "Status", type: "Approval type", month: "Month raised", raiser: "Raised by" };
export const groupsFor = (base: ListBase): ListGroup[] => LIST_GROUPS.filter((group) => group !== "raiser" || BASE_FEATURES[base].people);
export const VALIDITY = ["valid", "expiring", "expired"] as const;
// MINE: raised by me. COLLAB: I'm a collaborator. APPROVED_MINE: raised by me
// and approved. APPROVED_BY_ME: I approved a step (myself or for someone).
export type ListBase = "MINE" | "COLLAB" | "APPROVED_MINE" | "APPROVED_BY_ME";

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
  approved: "Latest approved first",
  mine: "My latest approval first",
};
export const VALIDITY_LABEL: Record<(typeof VALIDITY)[number], string> = { valid: "Approval still valid", expiring: "Expires within 7 days", expired: "Approval expired" };

// What each list may filter or sort by, beyond the common filters.
export const BASE_FEATURES: Record<ListBase, { people: boolean; collab: boolean; approvedBy: boolean; mine: boolean; amended: boolean; status: boolean; waiting: boolean; sorts: readonly ListSort[] }> = {
  MINE: { people: false, collab: false, approvedBy: false, mine: false, amended: false, status: true, waiting: true, sorts: ["newest", "oldest", "activity", "due", "number"] },
  COLLAB: { people: true, collab: true, approvedBy: false, mine: false, amended: false, status: true, waiting: true, sorts: ["newest", "oldest", "activity", "due", "number", "added"] },
  APPROVED_MINE: { people: false, collab: false, approvedBy: true, mine: false, amended: true, status: false, waiting: false, sorts: ["approved", "newest", "oldest", "activity", "number"] },
  APPROVED_BY_ME: { people: true, collab: false, approvedBy: false, mine: true, amended: false, status: true, waiting: true, sorts: ["mine", "newest", "oldest", "activity", "approved", "due", "number"] },
};

// Quick tabs: a named condition, per list.
type TabDef = { key: string; label: string; statuses?: ListStatus[]; overdue?: boolean; validity?: (typeof VALIDITY)[number] | "none"; amended?: boolean; onBehalf?: boolean };
const STATUS_TABS: TabDef[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open", statuses: ["IN_PROGRESS", "ON_HOLD", "CHANGES_REQUIRED"] },
  { key: "waiting", label: "Waiting for approvers", statuses: ["IN_PROGRESS"] },
  { key: "sentback", label: "Sent back", statuses: ["CHANGES_REQUIRED"] },
  { key: "hold", label: "On hold", statuses: ["ON_HOLD"] },
  { key: "approved", label: "Approved", statuses: ["APPROVED"] },
  { key: "rejected", label: "Rejected", statuses: ["REJECTED"] },
  { key: "withdrawn", label: "Withdrawn", statuses: ["CANCELLED"] },
  { key: "overdue", label: "Overdue", overdue: true },
];
export const TABS: Record<ListBase, readonly TabDef[]> = {
  MINE: STATUS_TABS,
  COLLAB: STATUS_TABS,
  APPROVED_MINE: [
    { key: "all", label: "All" },
    { key: "valid", label: "Still valid", validity: "valid" },
    { key: "expiring", label: "Expiring soon", validity: "expiring" },
    { key: "expired", label: "Expired", validity: "expired" },
    { key: "noexpiry", label: "No expiry", validity: "none" },
    { key: "amended", label: "Amended", amended: true },
  ],
  APPROVED_BY_ME: [
    { key: "all", label: "All" },
    { key: "open", label: "Still in progress", statuses: ["IN_PROGRESS", "ON_HOLD", "CHANGES_REQUIRED"] },
    { key: "approved", label: "Fully approved", statuses: ["APPROVED"] },
    { key: "rejected", label: "Rejected later", statuses: ["REJECTED"] },
    { key: "withdrawn", label: "Withdrawn", statuses: ["CANCELLED"] },
    { key: "behalf", label: "For someone else", onBehalf: true },
  ],
};
export type QuickTab = string;
export const tabsFor = (base: ListBase) => TABS[base];

export interface ListFilters {
  tab: QuickTab;
  q: string;
  statuses: ListStatus[];
  typeId: number | null; // -1 = custom approvals
  requesterId: number | null; // COLLAB, APPROVED_BY_ME
  departmentId: number | null; // requester's department (COLLAB, APPROVED_BY_ME)
  addedById: number | null; // COLLAB only
  approvedById: number | null; // APPROVED_MINE: someone who approved it
  myStep: string | null; // APPROVED_BY_ME: the step I approved
  onBehalf: boolean | null; // APPROVED_BY_ME: approved for someone else (yes) / myself (no)
  amended: boolean | null; // APPROVED_MINE
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
  closedFrom: string | null; // "approved on" for APPROVED_MINE
  closedTo: string | null;
  mineFrom: string | null; // APPROVED_BY_ME: when I approved
  mineTo: string | null;
  activityFrom: string | null;
  activityTo: string | null;
  sort: ListSort;
  size: (typeof LIST_SIZES)[number];
  group: ListGroup | null;
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
const positive = (value: number | null) => (value !== null && value > 0 ? value : null);
const yesNo = (value: unknown) => (str(value) === "yes" ? true : str(value) === "no" ? false : null);

export function parseListFilters(params: Record<string, unknown>, base: ListBase): ListFilters {
  const can = BASE_FEATURES[base];
  const rawStatuses = ([] as unknown[]).concat(params.status ?? []).flatMap((value) => (typeof value === "string" ? value.split(",") : []));
  const statuses = can.status ? [...new Set(rawStatuses.filter((value): value is ListStatus => (LIST_STATUSES as readonly string[]).includes(value)))] : [];
  const tab = tabsFor(base).some((item) => item.key === str(params.tab)) ? str(params.tab)! : "all";
  const sort = can.sorts.includes(str(params.sort) as ListSort) ? (str(params.sort) as ListSort) : can.sorts[0]!;
  const size = LIST_SIZES.find((value) => String(value) === str(params.size)) ?? 25;
  const due = idOf(params.due);
  const page = idOf(params.page);
  const [raisedFrom, raisedTo] = range(dateOf(params.raisedFrom), dateOf(params.raisedTo));
  const [addedFrom, addedTo] = can.collab ? range(dateOf(params.addedFrom), dateOf(params.addedTo)) : [null, null];
  const [closedFrom, closedTo] = range(dateOf(params.closedFrom), dateOf(params.closedTo));
  const [mineFrom, mineTo] = can.mine ? range(dateOf(params.mineFrom), dateOf(params.mineTo)) : [null, null];
  const [activityFrom, activityTo] = range(dateOf(params.activityFrom), dateOf(params.activityTo));
  const type = idOf(params.type);
  const tabDef = tabsFor(base).find((item) => item.key === tab);
  return {
    tab,
    q: (str(params.q) ?? "").replace(/\s+/g, " ").trim().slice(0, 100),
    statuses,
    typeId: type !== null && (type === -1 || type > 0) ? type : null,
    requesterId: can.people ? positive(idOf(params.raisedBy)) : null,
    departmentId: can.people ? positive(idOf(params.dept)) : null,
    addedById: can.collab ? positive(idOf(params.addedBy)) : null,
    approvedById: can.approvedBy ? positive(idOf(params.approvedBy)) : null,
    myStep: can.mine ? str(params.myStep)?.trim().slice(0, 200) || null : null,
    onBehalf: can.mine ? yesNo(params.onBehalf) : null,
    amended: can.amended ? yesNo(params.amended) : null,
    step: can.waiting ? str(params.step)?.trim().slice(0, 200) || null : null,
    waitingWithId: can.waiting ? positive(idOf(params.waitingWith)) : null,
    overdue: can.waiting && (str(params.overdue) === "1" || Boolean(tabDef?.overdue)),
    dueWithinDays: can.waiting && due !== null && due >= 1 && due <= 90 ? due : null,
    hasFiles: yesNo(params.files),
    validity: (VALIDITY as readonly string[]).includes(str(params.validity) ?? "") ? (str(params.validity) as ListFilters["validity"]) : null,
    raisedFrom,
    raisedTo,
    addedFrom,
    addedTo,
    closedFrom,
    closedTo,
    mineFrom,
    mineTo,
    activityFrom,
    activityTo,
    sort,
    size,
    group: groupsFor(base).find((value) => value === str(params.group)) ?? null,
    page: page && page > 0 && page <= 10000 ? page : 1,
  };
}

// Back to the address bar (only what differs from the defaults).
export function listQuery(filters: Partial<ListFilters>, changes: Partial<ListFilters> = {}, base?: ListBase): Record<string, string> {
  const f = { ...filters, ...changes };
  const out: Record<string, string> = {};
  const put = (key: string, value: unknown) => {
    if (value !== null && value !== undefined && value !== "" && value !== false) out[key] = String(value);
  };
  const yn = (key: string, value: boolean | null | undefined) => {
    if (value === true) put(key, "yes");
    if (value === false) put(key, "no");
  };
  const tabOverdue = base ? Boolean(tabsFor(base).find((item) => item.key === f.tab)?.overdue) : f.tab === "overdue";
  if (f.tab && f.tab !== "all") put("tab", f.tab);
  put("q", f.q);
  if (f.statuses?.length) put("status", f.statuses.join(","));
  put("type", f.typeId);
  put("raisedBy", f.requesterId);
  put("dept", f.departmentId);
  put("addedBy", f.addedById);
  put("approvedBy", f.approvedById);
  put("myStep", f.myStep);
  yn("onBehalf", f.onBehalf);
  yn("amended", f.amended);
  put("step", f.step);
  put("waitingWith", f.waitingWithId);
  if (f.overdue && !tabOverdue) put("overdue", "1");
  put("due", f.dueWithinDays);
  yn("files", f.hasFiles);
  put("validity", f.validity);
  put("raisedFrom", f.raisedFrom);
  put("raisedTo", f.raisedTo);
  put("addedFrom", f.addedFrom);
  put("addedTo", f.addedTo);
  put("closedFrom", f.closedFrom);
  put("closedTo", f.closedTo);
  put("mineFrom", f.mineFrom);
  put("mineTo", f.mineTo);
  put("activityFrom", f.activityFrom);
  put("activityTo", f.activityTo);
  const defaultSort = base ? BASE_FEATURES[base].sorts[0] : "newest";
  if (f.sort && f.sort !== defaultSort) put("sort", f.sort);
  if (f.size && f.size !== 25) put("size", f.size);
  put("group", f.group);
  if (f.page && f.page > 1) put("page", f.page);
  return out;
}

export function listHref(path: string, filters: Partial<ListFilters>, changes: Partial<ListFilters> = {}, base?: ListBase): string {
  const text = new URLSearchParams(listQuery(filters, changes, base)).toString();
  return text ? `${path}?${text}` : path;
}

// How many filters (beyond the tab, sort and paging) are in use.
export function activeCount(f: ListFilters, base?: ListBase): number {
  const tabOverdue = base ? Boolean(tabsFor(base).find((item) => item.key === f.tab)?.overdue) : f.tab === "overdue";
  return [
    f.q,
    f.statuses.length,
    f.typeId,
    f.requesterId,
    f.departmentId,
    f.addedById,
    f.approvedById,
    f.myStep,
    f.onBehalf !== null,
    f.amended !== null,
    f.step,
    f.waitingWithId,
    f.overdue && !tabOverdue,
    f.dueWithinDays,
    f.hasFiles !== null,
    f.validity,
    f.raisedFrom || f.raisedTo,
    f.addedFrom || f.addedTo,
    f.closedFrom || f.closedTo,
    f.mineFrom || f.mineTo,
    f.activityFrom || f.activityTo,
  ].filter(Boolean).length;
}

const INDIA = (column: string) => `DATE(DATE_ADD(${column}, INTERVAL 330 MINUTE))`;
const PENDING = "EXISTS (SELECT 1 FROM approval_tasks pt WHERE pt.request_id = r.id AND pt.status = 'PENDING' AND pt.round = r.round";
// My approvals on a request (APPROVED_BY_ME); the caller binds my id first.
const MY_APPROVAL = "EXISTS (SELECT 1 FROM approval_tasks ma WHERE ma.request_id = r.id AND ma.task_type = 'APPROVAL' AND ma.status = 'APPROVED' AND ma.decided_by = ?";
const VALIDITY_SQL: Record<(typeof VALIDITY)[number] | "none", string> = {
  valid: "r.status = 'APPROVED' AND r.valid_until > DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 7 DAY)",
  expiring: "r.status = 'APPROVED' AND r.valid_until > CURRENT_TIMESTAMP AND r.valid_until <= DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 7 DAY)",
  expired: "r.status = 'APPROVED' AND r.valid_until <= CURRENT_TIMESTAMP",
  none: "r.valid_until IS NULL",
};
const AMENDED_SQL = "EXISTS (SELECT 1 FROM request_amendments am WHERE am.original_id = r.id)";

// Conditions on r (request), w (workflow), u (requester) and, for COLLAB,
// k (the person's collaborator row). Values are always parameters. userId
// is needed for the "my approval" conditions (APPROVED_BY_ME).
export function listFilterSql(f: ListFilters, base: ListBase, userId = 0): { where: string[]; params: unknown[]; orderBy: string } {
  const where: string[] = [];
  const params: unknown[] = [];
  const tab = tabsFor(base).find((item) => item.key === f.tab);
  if (tab?.statuses?.length) {
    where.push("r.status IN (?)");
    params.push(tab.statuses);
  }
  if (tab?.validity) where.push(VALIDITY_SQL[tab.validity]);
  if (tab?.amended) where.push(AMENDED_SQL);
  if (tab?.onBehalf) {
    where.push(`${MY_APPROVAL} AND ma.on_behalf_of IS NOT NULL)`);
    params.push(userId);
  }
  if (f.statuses.length) {
    where.push("r.status IN (?)");
    params.push(f.statuses);
  }
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
    // D-256: also the approval type and the people it is waiting on now.
    where.push("(r.request_no LIKE ? OR r.title LIKE ? OR u.name LIKE ? OR w.name LIKE ? OR EXISTS (SELECT 1 FROM approval_tasks qt JOIN users qp ON qp.id = qt.approver_id WHERE qt.request_id = r.id AND qt.status = 'PENDING' AND qp.name LIKE ?))");
    params.push(like, like, like, like, like);
  }
  if (f.typeId === -1) where.push("w.kind = 'CUSTOM'");
  else if (f.typeId !== null) {
    where.push("w.id = ?");
    params.push(f.typeId);
  }
  if (f.requesterId !== null) {
    where.push("r.requester_id = ?");
    params.push(f.requesterId);
  }
  if (f.departmentId !== null) {
    where.push("u.department_id = ?");
    params.push(f.departmentId);
  }
  if (base === "COLLAB") {
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
  if (f.approvedById !== null) {
    where.push("EXISTS (SELECT 1 FROM approval_tasks ab2 WHERE ab2.request_id = r.id AND ab2.status = 'APPROVED' AND ab2.task_type = 'APPROVAL' AND (ab2.decided_by = ? OR ab2.approver_id = ?))");
    params.push(f.approvedById, f.approvedById);
  }
  if (base === "APPROVED_BY_ME") {
    if (f.myStep) {
      where.push(`${MY_APPROVAL} AND ma.node_label = ?)`);
      params.push(userId, f.myStep);
    }
    if (f.onBehalf !== null) {
      where.push(`${MY_APPROVAL} AND ma.on_behalf_of IS ${f.onBehalf ? "NOT " : ""}NULL)`);
      params.push(userId);
    }
    if (f.mineFrom) {
      where.push(`${MY_APPROVAL} AND ${INDIA("ma.decided_at")} >= ?)`);
      params.push(userId, f.mineFrom);
    }
    if (f.mineTo) {
      where.push(`${MY_APPROVAL} AND ${INDIA("ma.decided_at")} <= ?)`);
      params.push(userId, f.mineTo);
    }
  }
  if (f.amended !== null) where.push(`${f.amended ? "" : "NOT "}${AMENDED_SQL}`);
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
  if (f.validity) where.push(VALIDITY_SQL[f.validity]);
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
  const mine = `(SELECT MAX(md.decided_at) FROM approval_tasks md WHERE md.request_id = r.id AND md.task_type = 'APPROVAL' AND md.status = 'APPROVED' AND md.decided_by = ${Number(userId) | 0})`;
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
              : f.sort === "approved"
                ? "r.closed_at IS NULL, r.closed_at DESC, r.id DESC"
                : f.sort === "mine" && base === "APPROVED_BY_ME"
                  ? `${mine} DESC, r.id DESC`
                  : "r.submitted_at DESC, r.id DESC";
  return { where, params, orderBy };
}
