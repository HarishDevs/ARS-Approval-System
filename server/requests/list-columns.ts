// D-256: the optional columns of the request lists. The request itself is
// always shown; the rest can be hidden per person (saved on the account).
export const LIST_KEYS = ["my_requests", "collaborating", "my_approved", "approved_by_me"] as const;
export const LIST_COLUMN_KEYS = ["status", "priority", "waiting", "raiser", "raised", "activity", "progress", "added", "actions"] as const;
export type ListColumn = (typeof LIST_COLUMN_KEYS)[number];

export const COLUMN_LABEL: Record<ListColumn, string> = {
  status: "Status",
  priority: "Priority",
  waiting: "Waiting on / approval",
  raiser: "Raised by",
  raised: "Raised date",
  activity: "Last activity",
  progress: "Progress",
  added: "Added me",
  actions: "Actions",
};

// v1.47.0: columns added after people saved their choice. They show unless
// the person hid them ("!priority" is kept when the box is unticked), so a
// list saved before Priority existed still shows it.
export const LATE_COLUMNS: readonly ListColumn[] = ["priority"];

// What to save for the ticked columns (late columns left unticked are noted as hidden).
export const columnsToSave = (chosen: readonly string[]): string[] => {
  const clean = [...new Set(chosen.filter((column) => (LIST_COLUMN_KEYS as readonly string[]).includes(column)))];
  return [...clean, ...LATE_COLUMNS.filter((column) => !clean.includes(column)).map((column) => `!${column}`)];
};

export function parseColumns(raw: string | null, available: readonly ListColumn[]): ListColumn[] {
  if (!raw) return [...available];
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [...available];
    const chosen = available.filter((column) => value.includes(column) || (LATE_COLUMNS.includes(column) && !value.includes(`!${column}`)));
    return chosen.length ? chosen : [...available];
  } catch {
    return [...available];
  }
}
