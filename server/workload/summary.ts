// #12 workload: who has how much waiting right now, how old it is, and how
// much is overdue. Pure (unit-tested); the repository supplies one row per
// pending task.
export interface PendingTaskAge {
  approverId: number;
  name: string;
  ageHours: number;
  overdue: boolean;
  onHold: boolean;
}

export const AGE_BANDS = [
  { key: "day", label: "Under 1 day", maxHours: 24 },
  { key: "three", label: "1–3 days", maxHours: 72 },
  { key: "week", label: "3–7 days", maxHours: 168 },
  { key: "older", label: "Over 7 days", maxHours: Number.POSITIVE_INFINITY },
] as const;

export type AgeBand = (typeof AGE_BANDS)[number]["key"];

export interface WorkloadRow {
  approverId: number;
  name: string;
  pending: number;
  overdue: number;
  onHold: number;
  bands: Record<AgeBand, number>;
  medianHours: number;
  oldestHours: number;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export const bandOf = (hours: number): AgeBand => AGE_BANDS.find((band) => hours < band.maxHours)!.key;

export function summarizeWorkload(tasks: readonly PendingTaskAge[]): { rows: WorkloadRow[]; total: number; overdue: number; medianHours: number } {
  const byPerson = new Map<number, PendingTaskAge[]>();
  for (const task of tasks) byPerson.set(task.approverId, [...(byPerson.get(task.approverId) ?? []), task]);
  const rows = [...byPerson.values()].map((items) => {
    const bands: Record<AgeBand, number> = { day: 0, three: 0, week: 0, older: 0 };
    for (const item of items) bands[bandOf(item.ageHours)] += 1;
    return {
      approverId: items[0]!.approverId,
      name: items[0]!.name,
      pending: items.length,
      overdue: items.filter((item) => item.overdue).length,
      onHold: items.filter((item) => item.onHold).length,
      bands,
      medianHours: median(items.map((item) => item.ageHours)),
      oldestHours: Math.max(...items.map((item) => item.ageHours)),
    };
  });
  // Most overdue first, then most waiting, then the oldest.
  rows.sort((a, b) => b.overdue - a.overdue || b.pending - a.pending || b.oldestHours - a.oldestHours || a.name.localeCompare(b.name));
  return { rows, total: tasks.length, overdue: tasks.filter((task) => task.overdue).length, medianHours: median(tasks.map((task) => task.ageHours)) };
}

// Handover suggestions: eligible people with the fewest approvals waiting.
export function suggestHandover(candidates: readonly { id: number; label: string }[], pendingByUser: ReadonlyMap<number, number>, exclude: number, count = 3) {
  return candidates
    .filter((candidate) => candidate.id !== exclude)
    .map((candidate) => ({ ...candidate, pending: pendingByUser.get(candidate.id) ?? 0 }))
    .sort((a, b) => a.pending - b.pending || a.label.localeCompare(b.label))
    .slice(0, count);
}

export function ageText(hours: number): string {
  if (hours < 1) return "under 1 h";
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} days`;
}
