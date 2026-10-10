import type { FormField } from "@/server/forms/fields";

// Needed-by calendar rules (v1.7.0, A2), free of the database.
export interface CalendarItem {
  id: number;
  requestNo: string;
  title: string;
  status: "IN_PROGRESS" | "ON_HOLD" | "CHANGES_REQUIRED" | "APPROVED";
  requesterName: string;
  workflowName: string;
  date: string; // YYYY-MM-DD
}

// The request's needed-by date: the value of the form's one DATE field
// marked "needed by", when it is a real date.
export function neededByOf(form: readonly FormField[] | null | undefined, data: Record<string, unknown> | null | undefined): string | null {
  const field = form?.find((item) => item.type === "DATE" && item.neededBy);
  if (!field || !data) return null;
  const value = data[field.key];
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

// "2026-10" from a query value; this month (India) when missing or wrong.
export function parseMonth(value: string | undefined, now: Date = new Date()): string {
  if (value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return value;
  const india = new Date(now.getTime() + 330 * 60_000);
  return `${india.getUTCFullYear()}-${String(india.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(month: string, by: number): string {
  const [year, mon] = month.split("-").map(Number) as [number, number];
  const date = new Date(Date.UTC(year, mon - 1 + by, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Weeks (Monday first) of the month; days outside it are null.
export function monthGrid(month: string): (string | null)[][] {
  const [year, mon] = month.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(year, mon - 1, 1));
  const days = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= days; day += 1) cells.push(`${month}-${String(day).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
  return weeks;
}
