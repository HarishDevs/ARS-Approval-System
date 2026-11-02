import type { NextRequest } from "next/server";
import { requireApiArea } from "@/server/authorization/guards";
import { canExport, featureOn } from "@/server/settings/features";
import { resolveScope } from "@/server/analytics/scope";
import { indiaToday, resolvePeriod } from "@/server/analytics/periods";
import { departmentRows, EMPLOYEE_SORTS, employeeRows, monthlyActivity, type EmployeeSort } from "@/lib/db/repositories/analytics-center.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { CSV_MIME, toCsv } from "@/server/import/csv";
import { overLimit, tooManyResponse } from "@/server/security/limits";
import { apiError } from "@/lib/http/api-response";
import { logError } from "@/lib/logging/logger";

// v1.12.0 (Analytics Center brief §14): CSV of a board's summary table, with
// the same scope, period and filters as the page (the scope is resolved on
// the server, so a hand-edited link can't widen it), the reporting period,
// the scope and the generation time at the top, and the metric dictionary
// named for definitions. Rate-limited and audited.
const KINDS = ["employees", "departments", "monthly"] as const;

export async function GET(request: NextRequest) {
  const query = Object.fromEntries(request.nextUrl.searchParams) as Record<string, string | undefined>;
  const admin = query.base === "admin";
  let session;
  try {
    session = await requireApiArea(admin ? "admin" : "users", { change: false, page: admin ? "admin.analytics" : "users.analytics" });
  } catch {
    return apiError("NOT_FOUND", "Not found.", 404);
  }
  const kind = KINDS.find((item) => item === query.kind);
  if (!kind || !(await featureOn("analytics", session.user))) return apiError("NOT_FOUND", "Not found.", 404);
  if (!(await canExport(session.user))) return apiError("FORBIDDEN", "Downloads are limited to people with the Can export permission. Ask IT.", 403);
  if (await overLimit(`report-export:${session.user.id}`, 20)) return tooManyResponse("Too many downloads. Wait a minute and try again.");
  try {
    const viewer = { id: session.user.id, roles: session.user.roles };
    const { scope } = await resolveScope(query.scope ?? (admin ? "ORGANISATION" : undefined), viewer);
    const now = new Date();
    const today = indiaToday(now);
    const period = resolvePeriod({ key: query.period, from: query.from, to: query.to }, today);
    let header: string[] = [];
    let rows: (string | number | null)[][] = [];
    if (kind === "employees") {
      const sort = ((EMPLOYEE_SORTS as readonly string[]).includes(query.sort ?? "") ? query.sort : "name") as EmployeeSort;
      const result = await employeeRows(scope, viewer, period, { search: (query.q ?? "").trim().slice(0, 60), sort, page: 1, size: 5000 });
      header = ["Person", "Department", "Requests raised", "Decisions", "Average decision hours", "Approvals waiting", "Approvals overdue", "Tasks assigned", "Tasks completed", "Tasks open", "Tasks overdue", "Tasks on time %", "Median task hours", "Information published", "Acknowledgements pending"];
      rows = result.rows.map((row) => [row.name, row.department, row.submitted, row.decisions, row.avgDecisionHours, row.pendingApprovals, row.overdueApprovals, row.tasksAssigned, row.tasksCompleted, row.tasksOpen, row.tasksOverdue, row.onTimeRate, row.medianTaskHours, row.infoPublished, row.acksPending]);
    } else if (kind === "departments") {
      const result = await departmentRows(scope, period);
      if (!result) return apiError("NOT_FOUND", "Not found.", 404);
      header = ["Department", "People", "Requests raised", "Requests open", "Requests overdue", "Average turnaround hours", "Tasks created", "Tasks completed", "Tasks open", "Tasks overdue", "Tasks on time %", "Information published", "Acknowledgement rate %", "Acknowledgements pending"];
      rows = result.map((row) => [row.name, row.people, row.requestsRaised, row.requestsOpen, row.requestsOverdue, row.avgCycleHours, row.tasksCreated, row.tasksCompleted, row.tasksOpen, row.tasksOverdue, row.taskOnTimeRate, row.infoPublished, row.ackRate, row.acksPending]);
    } else {
      const result = await monthlyActivity(scope, viewer, today, 24);
      header = ["Month", "Requests raised", "Requests completed", "Tasks created", "Tasks completed", "Information published", "Acknowledgements"];
      rows = result.map((row) => [row.month, row.requestsRaised, row.requestsClosed, row.tasksCreated, row.tasksCompleted, row.infoPublished, row.acknowledgements]);
    }
    const intro = toCsv(["ARS CMS analytics export"], [
      [`Board: ${kind}`],
      [`Scope: ${scope.label}`],
      [kind === "monthly" ? "Period: last 24 months (India time)" : `Period: ${period.from} to ${period.to} (India time)`],
      [`Filters: ${query.q ? `person "${query.q.slice(0, 60)}"` : "none"}`],
      [`Generated: ${now.toISOString()} by ${session.user.name}`],
      ["Definitions: Analytics → How these are worked out (docs/ANALYTICS_METRIC_DICTIONARY.md). Approvals, tasks and information are separate measures, never combined."],
    ]);
    const body = `${intro}\r\n${toCsv(header, rows).replace(/^﻿/, "")}`;
    await recordAudit({ actorUserId: session.user.id, action: "ANALYTICS_EXPORTED", entityType: "REPORT", entityId: `analytics:${kind}`, sessionId: session.sessionId, metadata: { scope: scope.kind, from: period.from, to: period.to, rows: rows.length } });
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": CSV_MIME,
        "Content-Disposition": `attachment; filename="ars-analytics-${kind}-${today}.csv"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    logError("analytics export failed", error);
    return apiError("SYSTEM_ERROR", "The export failed. Try again, or tell IT the reference below.", 500);
  }
}
