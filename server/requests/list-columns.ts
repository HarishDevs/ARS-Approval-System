// D-256: the optional columns of the request lists. The request itself is
// always shown; the rest can be hidden per person (saved on the account).
export const LIST_KEYS = ["my_requests", "collaborating", "my_approved", "approved_by_me"] as const;
export const LIST_COLUMN_KEYS = ["status", "waiting", "raiser", "raised", "activity", "progress", "added", "actions"] as const;
export type ListColumn = (typeof LIST_COLUMN_KEYS)[number];

export const COLUMN_LABEL: Record<ListColumn, string> = {
  status: "Status",
  waiting: "Waiting on / approval",
  raiser: "Raised by",
  raised: "Raised date",
  activity: "Last activity",
  progress: "Progress",
  added: "Added me",
  actions: "Actions",
};

export function parseColumns(raw: string | null, available: readonly ListColumn[]): ListColumn[] {
  if (!raw) return [...available];
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [...available];
    const chosen = available.filter((column) => value.includes(column));
    return chosen.length ? chosen : [...available];
  } catch {
    return [...available];
  }
}
