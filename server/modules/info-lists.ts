import { INFO_PRIORITIES, type InfoPriority } from "@/server/modules/settings";
import { indiaDayStartUtc, PAGE_SIZES } from "@/server/modules/task-lists";

// v1.9.0: Information inbox and Sent by me: tabs, search, filters, sorting.
// Pure; values reach SQL only as bound parameters.
export type InfoBase = "INBOX" | "SENT";
export const INBOX_TABS = ["unread", "to_ack", "current", "expired", "withdrawn", "all"] as const;
export const SENT_TABS = ["drafts", "published", "withdrawn", "archived", "all"] as const;
export type InfoTab = (typeof INBOX_TABS)[number] | (typeof SENT_TABS)[number];
export const INFO_TAB_LABEL: Record<InfoTab, string> = {
  unread: "Unread",
  to_ack: "To acknowledge",
  current: "Current",
  expired: "Expired",
  withdrawn: "Withdrawn",
  all: "All",
  drafts: "Drafts",
  published: "Published",
  archived: "Archived",
};
export const tabsFor = (base: InfoBase): readonly InfoTab[] => (base === "INBOX" ? INBOX_TABS : SENT_TABS);

export interface InfoFilters {
  tab: InfoTab;
  q: string;
  typeId: number | null;
  priority: InfoPriority | null;
  senderId: number | null;
  from: string | null;
  to: string | null;
  sort: "newest" | "oldest" | "expiry";
  size: number;
  page: number;
}

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function parseInfoFilters(query: Record<string, string | string[] | undefined>, base: InfoBase): InfoFilters {
  const tabs = tabsFor(base);
  const tab = one(query.tab) as InfoTab;
  const size = Number(one(query.size));
  const sort = one(query.sort);
  let [from, to] = [ISO.test(one(query.from)) ? one(query.from) : null, ISO.test(one(query.to)) ? one(query.to) : null];
  if (from && to && from > to) [from, to] = [to, from];
  const priority = one(query.priority);
  return {
    tab: tabs.includes(tab) ? tab : tabs[base === "INBOX" ? 2 : 1]!,
    q: one(query.q).trim().slice(0, 100),
    typeId: /^\d{1,10}$/.test(one(query.type)) ? Number(one(query.type)) : null,
    priority: (INFO_PRIORITIES as readonly string[]).includes(priority) ? (priority as InfoPriority) : null,
    senderId: base === "INBOX" && /^\d{1,10}$/.test(one(query.sender)) ? Number(one(query.sender)) : null,
    from,
    to,
    sort: sort === "oldest" || sort === "expiry" ? sort : "newest",
    size: (PAGE_SIZES as readonly number[]).includes(size) ? size : 25,
    page: Math.min(1000, Math.max(1, Number(one(query.page)) || 1)),
  };
}

export function infoQuery(filters: InfoFilters, base: InfoBase, change: Partial<InfoFilters> = {}): string {
  const f = { ...filters, page: 1, ...change };
  const params = new URLSearchParams();
  params.set("tab", f.tab);
  if (f.q) params.set("q", f.q);
  if (f.typeId) params.set("type", String(f.typeId));
  if (f.priority) params.set("priority", f.priority);
  if (base === "INBOX" && f.senderId) params.set("sender", String(f.senderId));
  if (f.from) params.set("from", f.from);
  if (f.to) params.set("to", f.to);
  if (f.sort !== "newest") params.set("sort", f.sort);
  if (f.size !== 25) params.set("size", String(f.size));
  if (f.page > 1) params.set("page", String(f.page));
  return `?${params.toString()}`;
}

const nextDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

// `me` is the viewer's row in info_recipients (LEFT JOIN, alias me).
export function infoListSql(f: InfoFilters, base: InfoBase, viewerId: number, today: string, searchableKeys: readonly string[], tabOverride?: InfoTab): { where: string[]; params: unknown[]; orderBy: string } {
  const where: string[] = [];
  const params: unknown[] = [];
  if (base === "INBOX") where.push("me.user_id IS NOT NULL AND i.status <> 'DRAFT'");
  else {
    where.push("i.created_by = ?");
    params.push(viewerId);
  }
  const tab = tabOverride ?? f.tab;
  const notExpired = "(i.expires_on IS NULL OR i.expires_on >= ?)";
  switch (tab) {
    case "unread":
      where.push("i.status = 'PUBLISHED' AND me.read_at IS NULL");
      break;
    case "to_ack":
      where.push(`i.status = 'PUBLISHED' AND i.ack_required = TRUE AND me.acknowledged_at IS NULL AND ${notExpired}`);
      params.push(today);
      break;
    case "current":
      where.push(`i.status = 'PUBLISHED' AND ${notExpired}`);
      params.push(today);
      break;
    case "published":
      where.push("i.status = 'PUBLISHED'");
      break;
    case "expired":
      where.push("i.status = 'PUBLISHED' AND i.expires_on < ?");
      params.push(today);
      break;
    case "withdrawn":
      where.push("i.status = 'WITHDRAWN'");
      break;
    case "archived":
      where.push("i.status = 'ARCHIVED'");
      break;
    case "drafts":
      where.push("i.status = 'DRAFT'");
      break;
    default:
      break;
  }
  if (tabOverride) return { where, params, orderBy: "i.id" };
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
    const parts = ["i.info_no LIKE ?", "i.title LIKE ?", "i.body LIKE ?"];
    params.push(like, like, like);
    for (const key of searchableKeys.filter((key) => /^[a-z][a-z0-9_]{0,49}$/.test(key))) {
      parts.push("JSON_UNQUOTE(JSON_EXTRACT(i.form_data_json, ?)) LIKE ?");
      params.push(`$.${key}`, like);
    }
    where.push(`(${parts.join(" OR ")})`);
  }
  if (f.typeId) {
    where.push("v.type_id = ?");
    params.push(f.typeId);
  }
  if (f.priority) {
    where.push("i.priority = ?");
    params.push(f.priority);
  }
  if (f.senderId) {
    where.push("i.created_by = ?");
    params.push(f.senderId);
  }
  const column = base === "INBOX" ? "i.published_at" : "i.created_at";
  if (f.from) {
    where.push(`${column} >= ?`);
    params.push(indiaDayStartUtc(f.from));
  }
  if (f.to) {
    where.push(`${column} < ?`);
    params.push(indiaDayStartUtc(nextDay(f.to)));
  }
  const orderBy = f.sort === "oldest" ? "i.id ASC" : f.sort === "expiry" ? "i.expires_on IS NULL, i.expires_on, i.id DESC" : "COALESCE(i.published_at, i.created_at) DESC, i.id DESC";
  return { where, params, orderBy };
}
