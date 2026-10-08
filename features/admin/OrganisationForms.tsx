"use client";

import { saveDepartmentAction, saveDesignationAction } from "@/app/admin/organisation/actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import type { Option } from "@/features/admin/UserForm";

// Departments (with HOD) and designations, P1-01 / S2-03a.
export function DepartmentForm({
  department,
  people,
}: {
  department?: { id: number; code: string; name: string; hodUserId: number | null; active: boolean };
  people: Option[];
}) {
  // The empty "add" row clears after a save; existing rows keep their values.
  const { result, pending, formRef, onSubmit } = useActionForm(saveDepartmentAction, { resetOnSuccess: !department });
  const key = department?.id ?? "new";
  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid items-start gap-3 px-5 py-4 md:grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
      {department && <input type="hidden" name="id" value={department.id} />}
      <div>
        <input aria-label="Code" name="code" defaultValue={department?.code ?? ""} placeholder="Code" className="field-input" />
        <FieldError result={result} name="code" />
      </div>
      <div>
        <input aria-label="Department name" name="name" defaultValue={department?.name ?? ""} placeholder="Department name" className="field-input" />
        <FieldError result={result} name="name" />
      </div>
      <select aria-label="Head of department" name="hodUserId" defaultValue={department?.hodUserId ?? ""} className="field-input">
        <option value="">No HOD yet</option>
        {people.map((person) => (
          <option key={person.id} value={person.id}>
            {person.label}
          </option>
        ))}
      </select>
      {department ? (
        <label className="flex h-11 items-center gap-2 text-label">
          <input type="checkbox" name="active" defaultChecked={department.active} id={`active-${key}`} /> Active
        </label>
      ) : (
        <span />
      )}
      <SubmitButton pending={pending} variant={department ? "secondary" : "primary"} className="btn-compact h-11">
        {department ? "Save" : "Add"}
      </SubmitButton>
      {result && (
        <div className="md:col-span-5">
          <ResultMessage result={result} />
        </div>
      )}
    </form>
  );
}

// D-085: "Approver" = people with this designation can be chosen as approvers.
export function DesignationForm({ designation }: { designation?: { id: number; code: string; name: string; isApprover: boolean; active: boolean } }) {
  const { result, pending, formRef, onSubmit } = useActionForm(saveDesignationAction, { resetOnSuccess: !designation });
  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid items-start gap-3 px-5 py-4 md:grid-cols-[120px_minmax(0,1fr)_auto_auto_auto]">
      {designation && <input type="hidden" name="id" value={designation.id} />}
      <div>
        <input aria-label="Code" name="code" defaultValue={designation?.code ?? ""} placeholder="Code" className="field-input" />
        <FieldError result={result} name="code" />
      </div>
      <div>
        <input aria-label="Designation name" name="name" defaultValue={designation?.name ?? ""} placeholder="Designation" className="field-input" />
        <FieldError result={result} name="name" />
      </div>
      <label className="flex h-11 items-center gap-2 text-label" title="People with this designation can be chosen as approvers (Manager and above)">
        <input type="checkbox" name="isApprover" defaultChecked={designation?.isApprover ?? false} /> Approver
      </label>
      {designation ? (
        <label className="flex h-11 items-center gap-2 text-label">
          <input type="checkbox" name="active" defaultChecked={designation.active} /> Active
        </label>
      ) : (
        <span />
      )}
      <SubmitButton pending={pending} variant={designation ? "secondary" : "primary"} className="btn-compact h-11">
        {designation ? "Save" : "Add"}
      </SubmitButton>
      {result && (
        <div className="md:col-span-5">
          <ResultMessage result={result} />
        </div>
      )}
    </form>
  );
}
