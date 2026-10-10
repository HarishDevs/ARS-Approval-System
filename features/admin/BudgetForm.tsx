"use client";

import { saveBudgetAction } from "@/app/admin/budgets/actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";

export function BudgetForm({ departmentId, departmentName, fy, amountRupees, warnPercent }: { departmentId: number; departmentName: string; fy: number; amountRupees: string; warnPercent: number }) {
  const { result, pending, onSubmit } = useActionForm(saveBudgetAction);
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-start gap-2">
      <input type="hidden" name="departmentId" value={departmentId} />
      <input type="hidden" name="fy" value={fy} />
      <div>
        <input name="amount" defaultValue={amountRupees} inputMode="decimal" aria-label={`Budget for ${departmentName} (₹)`} placeholder="₹ budget" className="field-input h-9 w-36" />
        <FieldError result={result} name="amount" />
      </div>
      <div>
        <input name="warnPercent" type="number" min={50} max={100} defaultValue={warnPercent} aria-label={`Warn at percent used for ${departmentName}`} className="field-input h-9 w-20" />
        <FieldError result={result} name="warnPercent" />
      </div>
      <SubmitButton pending={pending} variant="secondary" className="btn-compact">
        Save
      </SubmitButton>
      {result && (result.ok || !result.fieldErrors) && <ResultMessage result={result} />}
    </form>
  );
}
