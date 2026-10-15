"use client";

import { setPageRuleAction } from "@/app/superadmin/pages/actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { LEVEL_LABEL, PAGE_LEVELS, type PageLevel } from "@/server/authorization/pages";

// v1.8.0: one page-access rule: everyone, a department or a person.
export function PageRuleForm({
  pageKey,
  scope,
  scopeId,
  level,
  neverHidden,
  choices,
  label,
  removable,
}: {
  pageKey: string;
  scope: "EVERYONE" | "DEPARTMENT" | "USER";
  scopeId?: number;
  level: PageLevel | null;
  neverHidden?: boolean;
  choices?: { id: number; label: string }[]; // to add a new department or person rule
  label: string;
  removable?: boolean;
}) {
  const { result, pending, onSubmit, formRef } = useActionForm(setPageRuleAction, { resetOnSuccess: Boolean(choices) });
  const id = `${pageKey}-${scope}-${scopeId ?? "new"}`.replace(/\W/g, "-");
  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="pageKey" value={pageKey} />
      <input type="hidden" name="scope" value={scope} />
      {scopeId !== undefined && <input type="hidden" name="scopeId" value={scopeId} />}
      {choices && (
        <div>
          <label htmlFor={`${id}-who`} className="field-label">
            {scope === "USER" ? "Person" : "Department"}
          </label>
          <select id={`${id}-who`} name="scopeId" defaultValue="" className="field-input h-9 w-64">
            <option value="" disabled>
              Choose…
            </option>
            {choices.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.label}
              </option>
            ))}
          </select>
          <FieldError result={result} name="scopeId" />
        </div>
      )}
      <div>
        <label htmlFor={`${id}-level`} className={choices ? "field-label" : "sr-only"}>
          {label}
        </label>
        <select id={`${id}-level`} name="level" defaultValue={level ?? "FULL"} className="field-input h-9 w-56" aria-label={label}>
          {PAGE_LEVELS.filter((value) => !(neverHidden && value === "HIDDEN")).map((value) => (
            <option key={value} value={value}>
              {LEVEL_LABEL[value]}
            </option>
          ))}
        </select>
      </div>
      <SubmitButton pending={pending} variant="secondary" className="btn-compact">
        {choices ? "Add" : "Save"}
      </SubmitButton>
      {removable && (
        <button type="submit" name="remove" value="1" className="link text-label text-danger-600" disabled={pending}>
          Remove
        </button>
      )}
      {result && (result.ok || !result.fieldErrors) && <ResultMessage result={result} />}
    </form>
  );
}
