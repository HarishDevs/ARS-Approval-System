// Admin dashboards (S11-11/12, D-087, F-74): filters and small maths. Pure.
// Dates are India dates (YYYY-MM-DD). The default period is the current
// Indian financial year (1 April – today).
export interface DashboardFilter {
  from: string;
  to: string;
  workflowId: number | null; // null = every type; -1 = custom approvals
  departmentId: number | null;
}

export const CUSTOM_TYPE = -1;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function financialYearStart(today: string): string {
  const [year, month] = today.split("-").map(Number) as [number, number];
  return `${month >= 4 ? year : year - 1}-04-01`;
}

function validDate(value: string | undefined): value is string {
  if (!value || !DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseDashboardFilter(params: Record<string, string | undefined>, today: string): DashboardFilter {
  let from = validDate(params.from) ? params.from : financialYearStart(today);
  let to = validDate(params.to) ? params.to : today;
  if (from > to) [from, to] = [to, from];
  const id = (value: string | undefined) => (value && /^-?\d+$/.test(value) ? Number(value) : null);
  const workflowId = id(params.type);
  return { from, to, workflowId: workflowId !== null && (workflowId > 0 || workflowId === CUSTOM_TYPE) ? workflowId : null, departmentId: id(params.dept) };
}

export function filterQuery(filter: DashboardFilter): string {
  const query = new URLSearchParams({ from: filter.from, to: filter.to });
  if (filter.workflowId !== null) query.set("type", String(filter.workflowId));
  if (filter.departmentId !== null) query.set("dept", String(filter.departmentId));
  return query.toString();
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function presets(today: string): { label: string; from: string; to: string }[] {
  return [
    { label: "This month", from: `${today.slice(0, 7)}-01`, to: today },
    { label: "Last 90 days", from: addDays(today, -89), to: today },
    { label: "This financial year", from: financialYearStart(today), to: today },
    { label: "Last financial year", from: `${Number(financialYearStart(today).slice(0, 4)) - 1}-04-01`, to: addDays(financialYearStart(today), -1) },
  ];
}

// Approved out of everything decided (approved + rejected); null if none decided.
export function approvalRate(approved: number, rejected: number): number | null {
  const decided = approved + rejected;
  return decided === 0 ? null : Math.round((approved / decided) * 100);
}

export function percent(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.round((part / whole) * 100);
}

export function hoursText(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  if (value * 60 < 1) return "under 1 min";
  if (value < 1) return `${Math.round(value * 60)} min`;
  if (value < 48) return `${value.toFixed(1)} h`;
  return `${(value / 24).toFixed(1)} days`;
}
