import type { Metadata } from "next";
import Link from "next/link";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { BudgetForm } from "@/features/admin/BudgetForm";
import { Badge } from "@/features/ui/Display";
import { listBudgets } from "@/lib/db/repositories/budgets.repository";
import { budgetPosition, financialYear, fyLabel } from "@/server/workflows/type-settings";
import { formatPaise } from "@/server/forms/dynamic";
import { formatIndiaTime } from "@/server/notifications/security-messages";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Budgets" };

// EN-09 department budgets. Committed = amounts of open and approved
// requests checked against the budget at submit. A department without a
// budget shows "No budget loaded", never "unlimited".
export default async function BudgetsPage({ searchParams }: { searchParams: Promise<{ fy?: string }> }) {
  await requireArea("admin");
  const current = financialYear(new Date());
  const raw = Number((await searchParams).fy);
  const fy = Number.isInteger(raw) && raw >= current - 5 && raw <= current + 1 ? raw : current;
  const rows = await listBudgets(fy);
  return (
    <>
      <PageHeader title="Budgets" description={`Department budgets for ${fyLabel(fy)} (April to March, India time). Approval types with the budget check switched on warn requesters and approvers.`}>
        <nav aria-label="Financial year" className="flex flex-wrap gap-2 text-label">
          {[current - 1, current, current + 1].map((year) => (
            <Link key={year} href={`/admin/budgets?fy=${year}`} aria-current={year === fy ? "page" : undefined} className={year === fy ? "btn-primary btn-compact" : "btn-secondary btn-compact"}>
              {fyLabel(year)}
            </Link>
          ))}
        </nav>
      </PageHeader>
      <div className="card overflow-x-auto">
        <table className="data-table">
          <caption className="sr-only">Department budgets for {fyLabel(fy)}</caption>
          <thead>
            <tr>
              <th scope="col">Department</th>
              <th scope="col" className="text-right">
                Committed
              </th>
              <th scope="col" className="text-right">
                Available
              </th>
              <th scope="col">Status</th>
              <th scope="col">Budget (₹) · warn at %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const position = budgetPosition({ budgetPaise: row.budgetPaise, warnPercent: row.warnPercent, committedPaise: row.committedPaise, requestPaise: 0 });
              return (
                <tr key={row.departmentId}>
                  <td>
                    {row.departmentName}
                    <span className="block text-caption text-ink-muted">{row.updatedAt ? `Updated ${formatIndiaTime(row.updatedAt)} by ${row.updatedByName ?? "IT"}` : "No budget loaded"}</span>
                  </td>
                  <td className="text-right tabular-nums">
                    {formatPaise(row.committedPaise)}
                    <span className="block text-caption text-ink-muted">{row.requests} request(s)</span>
                  </td>
                  <td className="text-right tabular-nums">{row.budgetPaise === null ? <span className="text-ink-faint">—</span> : formatPaise(row.budgetPaise - row.committedPaise)}</td>
                  <td>
                    {position.state === "NO_BUDGET" ? (
                      <Badge tone="neutral">No budget loaded</Badge>
                    ) : position.state === "OVER" ? (
                      <Badge tone="danger">Over budget · {position.usedPercent}%</Badge>
                    ) : position.state === "WARN" ? (
                      <Badge tone="warning">{position.usedPercent}% used</Badge>
                    ) : (
                      <Badge tone="success">{position.usedPercent ?? 0}% used</Badge>
                    )}
                  </td>
                  <td>
                    <BudgetForm departmentId={row.departmentId} departmentName={row.departmentName} fy={fy} amountRupees={row.budgetPaise === null ? "" : String(row.budgetPaise / 100)} warnPercent={row.warnPercent} />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="text-ink-muted">
                  No departments yet. Add them under Departments.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
