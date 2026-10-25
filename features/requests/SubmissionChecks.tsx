import { AlertTriangle, Info, Wallet } from "lucide-react";
import { Badge } from "@/features/ui/Display";
import { Hint } from "@/features/ui/Hint";
import { formatPaise } from "@/server/forms/dynamic";
import { fyLabel } from "@/server/workflows/type-settings";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import type { SubmissionCheck } from "@/lib/db/repositories/checks.repository";

// FN1/EN-09 on the request page: the warnings the requester confirmed when
// submitting, the reason given for a possible duplicate, and the budget
// position at that moment (a snapshot: later budget changes don't alter it).
export function SubmissionChecks({ check, department }: { check: SubmissionCheck | null; department: string | null }) {
  if (!check) return null;
  const warnings = check.items.filter((item) => item.severity === "WARNING" || item.severity === "INFO");
  const budget = check.budget;
  if (warnings.length === 0 && budget.state === "NOT_CHECKED") return null;
  return (
    <section className="card px-5 py-4" aria-labelledby="checks">
      <h2 id="checks" className="mb-2 flex items-center gap-1 font-semibold">
        Checked at submission
        <Hint text="The results at that moment: later changes (such as to the budget) don't alter them." align="start" />
      </h2>
      <p className="mb-2 text-caption text-ink-muted">{formatIndiaTime(check.createdAt)}</p>
      {budget.state !== "NOT_CHECKED" && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-label">
          <Wallet aria-hidden="true" className="h-4 w-4 text-ink-muted" />
          <span className="font-medium">Budget{department ? ` (${department}${budget.fy ? `, ${fyLabel(budget.fy)}` : ""})` : ""}:</span>
          {budget.state === "NO_BUDGET" ? (
            <Badge tone="neutral">No budget loaded</Badge>
          ) : budget.state === "OVER" ? (
            <Badge tone="danger">Over budget</Badge>
          ) : budget.state === "WARN" ? (
            <Badge tone="warning">Near the limit</Badge>
          ) : (
            <Badge tone="success">Within budget</Badge>
          )}
          {budget.budgetPaise !== null && budget.committedPaise !== null && budget.requestPaise !== null && (
            <span className="text-ink-muted">
              budget {formatPaise(budget.budgetPaise)} · already committed {formatPaise(budget.committedPaise)} · this request {formatPaise(budget.requestPaise)}
            </span>
          )}
        </div>
      )}
      {warnings.length > 0 && (
        <ul className="space-y-1.5 text-label">
          {warnings.map((item, index) => (
            <li key={index} className="flex items-start gap-2">
              {item.severity === "WARNING" ? <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warning-600" /> : <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-info-600" />}
              <span>{item.message}</span>
            </li>
          ))}
        </ul>
      )}
      {check.acknowledged && warnings.some((item) => item.severity === "WARNING") && <p className="mt-2 text-caption text-ink-muted">The requester confirmed these warnings before submitting.</p>}
      {check.overrideReason && (
        <p className="mt-1 text-label">
          <span className="font-medium">Why it isn&apos;t a duplicate:</span> {check.overrideReason}
        </p>
      )}
    </section>
  );
}
