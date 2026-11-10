"use client";

import { saveManagementGroupAction, saveMeetingTypeAction } from "@/app/admin/meetings/actions";
import { PeoplePicker, type PersonOption } from "@/features/ui/PeoplePicker";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";

// v1.51.0 (D-300): Admin → Meeting settings forms.
export function MeetingTypeForm({ type }: { type: { id: number; name: string; template: string | null; position: number; active: boolean } | null }) {
  const { result, pending, onSubmit } = useActionForm(saveMeetingTypeAction, { resetOnSuccess: type === null });
  const key = type?.id ?? "new";
  return (
    <form onSubmit={onSubmit} className="space-y-3" aria-label={type ? `Meeting type ${type.name}` : "New meeting type"}>
      {type && <input type="hidden" name="id" value={type.id} />}
      <div className="grid gap-3 sm:grid-cols-[2fr_100px_140px]">
        <div>
          <label htmlFor={`mt-name-${key}`} className="field-label">
            Name
          </label>
          <input id={`mt-name-${key}`} name="name" defaultValue={type?.name ?? ""} required maxLength={100} className="field-input" />
          <FieldError result={result} name="name" />
        </div>
        <div>
          <label htmlFor={`mt-pos-${key}`} className="field-label">
            Order
          </label>
          <input id={`mt-pos-${key}`} name="position" type="number" min={0} max={999} defaultValue={type?.position ?? 50} className="field-input" />
        </div>
        <div>
          <label htmlFor={`mt-active-${key}`} className="field-label">
            In use
          </label>
          <select id={`mt-active-${key}`} name="active" defaultValue={type && !type.active ? "no" : "yes"} className="field-input">
            <option value="yes">Yes</option>
            <option value="no">No (hidden)</option>
          </select>
        </div>
      </div>
      <div>
        <label htmlFor={`mt-tpl-${key}`} className="field-label">
          Default meeting points (one per line)
        </label>
        <textarea id={`mt-tpl-${key}`} name="template" rows={3} defaultValue={type?.template ?? ""} maxLength={10000} className="field-input h-auto py-2" />
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton pending={pending} variant={type ? "secondary" : "primary"} className="btn-compact">
          {type ? "Save" : "Add type"}
        </SubmitButton>
        <ResultMessage result={result} />
      </div>
    </form>
  );
}

export function ManagementGroupForm({ people, members }: { people: PersonOption[]; members: number[] }) {
  const { result, pending, onSubmit } = useActionForm(saveManagementGroupAction);
  return (
    <form onSubmit={onSubmit} className="space-y-3" aria-label="Management group">
      <PeoplePicker name="members" options={people} label="Management group" help="They see every meeting, including Management-only meetings, and the full dashboard." max={50} initial={members} />
      <div className="flex items-center gap-3">
        <SubmitButton pending={pending} className="btn-compact">
          Save group
        </SubmitButton>
        <ResultMessage result={result} />
      </div>
    </form>
  );
}
