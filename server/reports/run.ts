import "server-only";
import { resolveScope, type Scope, type Viewer } from "@/server/analytics/scope";
import { indiaToday, resolvePeriod } from "@/server/analytics/periods";
import { dashboardChoices } from "@/lib/db/repositories/dashboards.repository";
import { REPORT, type ReportDefinition, type ReportResult } from "@/server/reports/catalogue";
import type { AnalyticsFilter } from "@/lib/db/repositories/analytics.repository";

// One way to turn a query (from the page, an export link or a saved
// schedule) into a scoped, checked report run (D-123). The scope is always
// re-resolved for the viewer: a saved query can't widen what they may see.
export interface ReportQuery {
  scope?: string;
  period?: string;
  from?: string;
  to?: string;
  type?: string;
  department?: string;
}

export const QUERY_KEYS = ["scope", "period", "from", "to", "type", "department"] as const;

export function cleanQuery(raw: Record<string, unknown>): ReportQuery {
  const out: ReportQuery = {};
  for (const key of QUERY_KEYS) {
    const value = raw[key];
    if (typeof value === "string" && value.length <= 40 && /^[A-Za-z0-9_-]*$/.test(value) && value) out[key] = value;
  }
  return out;
}

export async function prepareReport(key: string, query: ReportQuery, viewer: Viewer, now = new Date()): Promise<{ report: ReportDefinition; scope: Scope; scopes: Scope[]; filter: AnalyticsFilter } | null> {
  const report = REPORT[key];
  if (!report) return null;
  const { scopes } = await resolveScope(undefined, viewer);
  const allowed = scopes.filter((scope) => report.scopes.includes(scope.kind));
  if (!allowed.length) return null;
  const scope = allowed.find((item) => item.kind === query.scope) ?? allowed.find((item) => item.kind === "ORGANISATION") ?? allowed[allowed.length - 1]!;
  const choices = await dashboardChoices();
  const period = resolvePeriod({ key: query.period, from: query.from, to: query.to }, indiaToday(now));
  const workflowId = query.type === "-1" ? -1 : choices.types.some((type) => String(type.id) === query.type) ? Number(query.type) : null;
  const departmentId = scope.kind === "ORGANISATION" && choices.departments.some((department) => String(department.id) === query.department) ? Number(query.department) : null;
  return { report, scope, scopes: allowed, filter: { period, workflowId, departmentId } };
}

export async function runReport(key: string, query: ReportQuery, viewer: Viewer, now = new Date()): Promise<{ report: ReportDefinition; scope: Scope; scopes: Scope[]; filter: AnalyticsFilter; result: ReportResult } | null> {
  const prepared = await prepareReport(key, query, viewer, now);
  if (!prepared) return null;
  return { ...prepared, result: await prepared.report.run(prepared.scope, viewer, prepared.filter) };
}
