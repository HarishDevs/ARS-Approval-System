// Global search (#4, D-109): the filters a search accepts, parsed from the
// address bar or a saved view. Pure and unit-tested. Anything unexpected is
// dropped, never passed on.
export const SEARCH_STATUSES = ["IN_PROGRESS", "ON_HOLD", "CHANGES_REQUIRED", "APPROVED", "REJECTED", "CANCELLED"] as const;
export const SEARCH_ROLES = ["any", "raised", "approver"] as const; // my part in it
export const SEARCH_SORTS = ["newest", "oldest", "due"] as const;
export const SEARCH_PAGE_SIZE = 25;

export interface SearchFilters {
  q: string; // request number or title (and requester name)
  status: (typeof SEARCH_STATUSES)[number] | null;
  role: (typeof SEARCH_ROLES)[number];
  typeId: number | null;
  departmentId: number | null; // the requester's department (admins only)
  from: string | null; // submitted on or after (India date)
  to: string | null;
  overdue: boolean; // a pending step is past its due time
  sort: (typeof SEARCH_SORTS)[number];
  page: number;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const pick = <T extends readonly string[]>(list: T, value: unknown): T[number] | null => (typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T[number]) : null);
const id = (value: unknown) => (typeof value === "string" && /^\d{1,10}$/.test(value) ? Number(value) : null);

// D-234 (Postel): a request number typed loosely ("pur2026123",
// "PUR 2026 123", "pur/2026/000123") is read as the number it means
// (PUR-2026-000123). Anything else is searched as typed.
export function normaliseRecordNumber(text: string): string {
  const match = /^([A-Za-z]{2,6})[\s\-_/.]*(\d{4})[\s\-_/.]*(\d{1,6})$/.exec(text.trim());
  return match ? `${match[1]!.toUpperCase()}-${match[2]}-${match[3]!.padStart(6, "0")}` : text;
}

export function parseSearchFilters(params: Record<string, unknown>): SearchFilters {
  const q = normaliseRecordNumber(typeof params.q === "string" ? params.q.replace(/\s+/g, " ").trim().slice(0, 100) : "");
  const from = typeof params.from === "string" && DATE.test(params.from) ? params.from : null;
  const to = typeof params.to === "string" && DATE.test(params.to) ? params.to : null;
  const page = id(params.page);
  return {
    q,
    status: pick(SEARCH_STATUSES, params.status),
    role: pick(SEARCH_ROLES, params.role) ?? "any",
    typeId: id(params.type),
    departmentId: id(params.dept),
    from,
    to: from && to && to < from ? from : to,
    overdue: params.overdue === "1",
    sort: pick(SEARCH_SORTS, params.sort) ?? "newest",
    page: page && page > 0 && page <= 1000 ? page : 1,
  };
}

// Back to address-bar form (only what differs from the defaults), for links
// and for saving as a view.
export function searchQuery(filters: Partial<SearchFilters>): Record<string, string> {
  const out: Record<string, string> = {};
  if (filters.q) out.q = filters.q;
  if (filters.status) out.status = filters.status;
  if (filters.role && filters.role !== "any") out.role = filters.role;
  if (filters.typeId) out.type = String(filters.typeId);
  if (filters.departmentId) out.dept = String(filters.departmentId);
  if (filters.from) out.from = filters.from;
  if (filters.to) out.to = filters.to;
  if (filters.overdue) out.overdue = "1";
  if (filters.sort && filters.sort !== "newest") out.sort = filters.sort;
  if (filters.page && filters.page > 1) out.page = String(filters.page);
  return out;
}

// LIKE patterns: % _ and \ in what people type match themselves.
export const likeEscape = (text: string) => `%${text.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
