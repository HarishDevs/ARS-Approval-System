"use client";

import { groupMemberAction, saveGroupAction } from "@/app/admin/groups/actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import type { Option } from "@/features/admin/UserForm";

export function NewGroupForm() {
  const { result, pending, formRef, onSubmit } = useActionForm(saveGroupAction, { resetOnSuccess: true });
  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid items-start gap-3 px-5 py-4 md:grid-cols-[160px_minmax(0,1fr)_auto]">
      <div>
        <input aria-label="Code" name="code" placeholder="Code, e.g. FIN_CHECK" className="field-input" />
        <FieldError result={result} name="code" />
      </div>
      <div>
        <input aria-label="Group name" name="name" placeholder="Group name, e.g. Finance checkers" className="field-input" />
        <FieldError result={result} name="name" />
      </div>
      <SubmitButton pending={pending} className="btn-compact h-11">
        Add group
      </SubmitButton>
      {result && (
        <div className="md:col-span-3">
          <ResultMessage result={result} />
        </div>
      )}
    </form>
  );
}

export function GroupEditor({ group, people }: { group: { id: number; code: string; name: string; active: boolean; members: { id: number; name: string; active: boolean }[] }; people: Option[] }) {
  const details = useActionForm(saveGroupAction);
  const add = useActionForm(groupMemberAction, { resetOnSuccess: true });
  const remove = useActionForm(groupMemberAction, { confirm: "Remove this person from the group? Approvals already sent to them stay with them." });
  const memberIds = new Set(group.members.map((member) => member.id));

  return (
    <div className="space-y-3 px-5 py-4">
      <form onSubmit={details.onSubmit} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="id" value={group.id} />
        <span className="badge bg-surface-muted text-ink-muted">{group.code}</span>
        <input aria-label="Group name" name="name" defaultValue={group.name} className="field-input max-w-sm" />
        <label className="flex items-center gap-2 text-label">
          <input type="checkbox" name="active" defaultChecked={group.active} /> Active
        </label>
        <SubmitButton pending={details.pending} variant="secondary" className="btn-compact">
          Save
        </SubmitButton>
        <ResultMessage result={details.result} />
      </form>
      <ul className="flex flex-wrap gap-2">
        {group.members.length === 0 && <li className="text-label text-ink-muted">No members yet.</li>}
        {group.members.map((member) => (
          <li key={member.id}>
            <form onSubmit={remove.onSubmit} className="flex items-center gap-1 rounded-full border border-line py-0.5 pl-3 pr-1 text-label">
              <input type="hidden" name="groupId" value={group.id} />
              <input type="hidden" name="userId" value={member.id} />
              <input type="hidden" name="command" value="remove" />
              <span className={member.active ? "" : "text-ink-faint line-through"}>{member.name}</span>
              <button type="submit" aria-label={`Remove ${member.name}`} className="rounded-full px-1.5 text-ink-muted hover:bg-surface-muted hover:text-danger-600">
                ×
              </button>
            </form>
          </li>
        ))}
      </ul>
      {remove.confirmBar}
      <form ref={add.formRef} onSubmit={add.onSubmit} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="groupId" value={group.id} />
        <input type="hidden" name="command" value="add" />
        <select aria-label="Add a person" name="userId" defaultValue="" className="field-input max-w-sm">
          <option value="">Add a person…</option>
          {people
            .filter((person) => !memberIds.has(person.id))
            .map((person) => (
              <option key={person.id} value={person.id}>
                {person.label}
              </option>
            ))}
        </select>
        <SubmitButton pending={add.pending} variant="secondary" className="btn-compact">
          Add
        </SubmitButton>
        <ResultMessage result={add.result?.ok ? null : add.result} />
        <ResultMessage result={remove.result?.ok ? null : remove.result} />
      </form>
    </div>
  );
}
