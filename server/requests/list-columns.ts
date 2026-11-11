// D-256: the optional columns of the request lists. The request itself is
// always shown; the rest can be hidden per person (saved on the account).
// v1.52.3 (owner): the order is the person's too (drag a column title), and
// Waiting for me ("queue") keeps its own order.
export const LIST_KEYS = ["my_requests", "collaborating", "my_approved", "approved_by_me", "queue"] as const;
export const LIST_COLUMN_KEYS = ["status", "priority", "waiting", "raiser", "raised", "activity", "progress", "added", "actions", "from", "step", "since", "due"] as const;
export const QUEUE_COLUMNS: readonly ListColumn[] = ["priority", "from", "step", "since", "due"];
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
  from: "From",
  step: "Your step",
  since: "Waiting since",
  due: "Due date",
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
    // The saved order first; a late column the person never saw goes in its usual place.
    const chosen: ListColumn[] = (value as unknown[]).filter((column): column is ListColumn => typeof column === "string" && available.includes(column as ListColumn));
    for (const late of LATE_COLUMNS) {
      if (!available.includes(late) || chosen.includes(late) || value.includes(`!${late}`)) continue;
      const before = available.slice(0, available.indexOf(late));
      // Right after the last shown column that normally comes before it.
      const at = Math.max(-1, ...chosen.map((column, index) => (before.includes(column) ? index : -1))) + 1;
      chosen.splice(at, 0, late);
    }
    const unique = [...new Set(chosen)];
    return unique.length ? unique : [...available];
  } catch {
    return [...available];
  }
}
