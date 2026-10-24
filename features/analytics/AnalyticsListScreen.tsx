import Link from "next/link";
import { notFound } from "next/navigation";
import { featureOn } from "@/server/settings/features";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { Breadcrumbs } from "@/features/ui/Display";
import { RequestStatusPill } from "@/features/requests/StatusPill";
import { resolveScope } from "@/server/analytics/scope";
import { indiaToday, resolvePeriod } from "@/server/analytics/periods";
import { DRILL_LABEL, loadDrill, type DrillKind } from "@/lib/db/repositories/analytics-more.repository";
import { dashboardChoices } from "@/lib/db/repositories/dashboards.repository";
import { readFilter, SLA_FILTER_LABEL, STATUS_FILTER_LABEL, withParams } from "@/server/analytics/query";
import { AGING_BUCKETS } from "@/server/analytics/semantics";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import { guardAnalyticsRate } from "@/server/analytics/rate";
import type { AnalyticsBase } from "@/features/analytics/AnalyticsScreen";
import type { InstanceStatus } from "@/server/engine/types";

// v1.7.0 (B01): the requests behind an Analytics number, with the same
// scope and filters (read the same way as the dashboard), so the list and
// the number agree. Scope is checked again on the server.
export async function AnalyticsListScreen({ searchParams, base }: { searchParams: Record<string, string | undefined>; base: AnalyticsBase }) {
  const { user } = await requireArea("users");
  if (!(await featureOn("analytics", user))) notFound();
  const query = searchParams;
  const kind = (query.kind && query.kind in DRILL_LABEL ? query.kind : null) as DrillKind | null;
  if (!kind) notFound();
  const viewer = { id: user.id, roles: user.roles };
  const { scope } = await resolveScope(query.scope, viewer);
  const period = resolvePeriod({ key: query.period, from: query.from, to: query.to }, indiaToday(new Date()));
  const choices = await dashboardChoices();
  const { filter, carried } = readFilter(query, { scope, period, typeIds: choices.types.map((type) => type.id), departmentIds: choices.departments.map((department) => department.id) });
  const back = withParams(base, carried);
  if (await guardAnalyticsRate(user.id)) {
    return (
      <p role="alert" className="card px-4 py-3 text-label text-warning-600">
        Analytics was opened many times in the last minute. Wait a minute, then reload the page.
      </p>
    );
  }
  const { rows, truncated } = await loadDrill(kind, scope, viewer, filter);
  const conditions = [
    carried.type && (carried.type === "-1" ? "custom approvals" : choices.types.find((type) => String(type.id) === carried.type)?.name),
    carried.department && choices.departments.find((department) => String(department.id) === carried.department)?.name,
    filter.status && `status ${STATUS_FILTER_LABEL[filter.status].toLowerCase()}`,
    filter.step && `step “${filter.step}”`,
    filter.approverId && "one approver",
    filter.sla && SLA_FILTER_LABEL[filter.sla].toLowerCase(),
    filter.aging && `open ${AGING_BUCKETS.find((bucket) => bucket.key === filter.aging)?.label.toLowerCase()}`,
  ].filter(Boolean);
  const periodBound = ["raised", "approved", "rejected", "withdrawn", "sent_back"].includes(kind);

  return (
    <>
      <Breadcrumbs items={[{ href: base === "/admin/analytics" ? "/admin" : "/users", label: "Overview" }, { href: back, label: "Analytics" }, { label: DRILL_LABEL[kind] }]} />
      <PageHeader title={DRILL_LABEL[kind]} meta={`${scope.label}${periodBound ? ` · ${period.label} (${period.from} to ${period.to})` : " · right now"}${conditions.length ? ` · ${conditions.join(" · ")}` : ""}`}>
        <Link href={back} className="link text-label">
          ← Back to Analytics
        </Link>
      </PageHeader>
      <p className="mb-2 text-caption text-ink-muted" role="status">
        {rows.length === 0 ? "No requests match." : `${rows.length.toLocaleString("en-IN")} request${rows.length === 1 ? "" : "s"}${truncated ? " (the first 500; narrow the filters to see the rest)" : ""}.`}
        {kind === "sent_back" ? " The number on Analytics counts send-backs; a request sent back twice is listed once." : ""}
      </p>
      {rows.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="data-table" data-testid="drill-table">
            <caption className="sr-only">{DRILL_LABEL[kind]}</caption>
            <thead>
              <tr>
                <th scope="col">Request</th>
                <th scope="col">Approval type</th>
                <th scope="col">Raised by</th>
                <th scope="col">Status</th>
                <th scope="col">Raised</th>
                <th scope="col">Closed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={`/users/requests/${row.id}`} className="link">
                      {row.requestNo}
                    </Link>
                    <span className="block max-w-80 truncate text-caption text-ink-muted">{row.title}</span>
                  </td>
                  <td>{row.workflowName}</td>
                  <td>{row.requesterName}</td>
                  <td>
                    <RequestStatusPill status={row.status as InstanceStatus} />
                  </td>
                  <td className="whitespace-nowrap">{formatIndiaTime(row.submittedAt)}</td>
                  <td className="whitespace-nowrap">{row.closedAt ? formatIndiaTime(row.closedAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
