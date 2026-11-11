"use client";

import { useState } from "react";
import { setPageRuleAction } from "@/app/superadmin/pages/actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { PersonSelect } from "@/features/ui/PersonSelect";
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
  choices?: { id: number; label: string; detail?: string }[]; // to add a new department or person rule
  label: string;
  removable?: boolean;
}) {
  // V181-A8 (AUD-25, REC-21): hiding a page from everyone asks first.
  const [chosen, setChosen] = useState<PageLevel>(level ?? "FULL");
  const hidingForEveryone = scope === "EVERYONE" && chosen === "HIDDEN" && level !== "HIDDEN";
  const { result, pending, onSubmit, formRef, confirmBar } = useActionForm(
    setPageRuleAction,
    hidingForEveryone
      ? {
          resetOnSuccess: Boolean(choices),
          confirmTitle: "Hide this page from everyone?",
          confirmLabel: "Yes, hide it",
          confirmTone: "danger",
          confirm: `Nobody except the Super Admin will see this page or be able to use it (its links disappear and opening it shows "not found"), unless a department or person rule gives them access.`,
        }
      : { resetOnSuccess: Boolean(choices) },
  );
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
          {scope === "USER" ? (
            <PersonSelect id={`${id}-who`} name="scopeId" options={choices} placeholder="Choose…" compact className="w-64" />
          ) : (
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
          )}
          <FieldError result={result} name="scopeId" />
        </div>
      )}
      <div>
        <label htmlFor={`${id}-level`} className={choices ? "field-label" : "sr-only"}>
          {label}
        </label>
        <select id={`${id}-level`} name="level" value={chosen} onChange={(event) => setChosen(event.target.value as PageLevel)} className="field-input h-9 w-56" aria-label={label}>
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
      {confirmBar}
    </form>
  );
}
