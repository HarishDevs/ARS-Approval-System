"use client";

import { UserPlus, Users } from "lucide-react";
import { addCollaboratorsAction, removeCollaboratorAction } from "@/app/users/collab-actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { Hint } from "@/features/ui/Hint";
import { PeoplePicker, type PersonOption } from "@/features/ui/PeoplePicker";

// v1.6.1 collaborators on the request page: who follows it; the requester
// or IT adds and removes people; a collaborator can stop following.
interface Row {
  userId: number;
  name: string;
  loginId: string;
  addedByName: string;
  addedAt: string;
}

function RemoveButton({ requestId, row, self }: { requestId: number; row: Row; self: boolean }) {
  const { result, pending, onSubmit, confirmBar } = useActionForm(removeCollaboratorAction, {
    confirmTitle: self ? "Stop following this request?" : `Remove ${row.name}?`,
    confirm: self ? "You won't see it any more unless you are also an approver on it." : `${row.name} won't see this request any more unless they are also an approver on it.`,
    confirmLabel: self ? "Stop following" : "Remove",
    confirmTone: "danger",
  });
  return (
    <form onSubmit={onSubmit} className="inline">
      {confirmBar}
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="userId" value={row.userId} />
      <button type="submit" disabled={pending} className="link text-caption" aria-label={self ? "Stop following this request" : `Remove ${row.name}`}>
        {self ? "Stop following" : "Remove"}
      </button>
      {result && !result.ok && <ResultMessage result={result} />}
    </form>
  );
}

export function CollaboratorsCard({ requestId, rows, canManage, viewerId, options }: { requestId: number; rows: Row[]; canManage: boolean; viewerId: number; options: PersonOption[] }) {
  const { result, pending, formRef, onSubmit } = useActionForm(addCollaboratorsAction, { resetOnSuccess: true });
  const chosen = new Set(rows.map((row) => row.userId));
  return (
    <section aria-labelledby="collaborators-title" className="card px-5 py-4">
      <h2 id="collaborators-title" className="mb-3 flex items-center gap-2 font-semibold">
        <Users aria-hidden="true" className="h-4 w-4 text-ink-muted" />
        Collaborators
        <Hint text="People following this request: they can see it, comment and add files, and are told how it goes. They don't approve." align="start" />
      </h2>
      {rows.length === 0 ? (
        <p className="mb-3 text-label text-ink-muted">Nobody yet.</p>
      ) : (
        <ul className="mb-3 space-y-2">
          {rows.map((row) => (
            <li key={row.userId} className="flex flex-wrap items-baseline justify-between gap-2 text-label">
              <span>
                <span className="font-medium">{row.name}</span> <span className="text-caption text-ink-muted">({row.loginId}) · added by {row.addedByName}, {row.addedAt}</span>
              </span>
              {(canManage || row.userId === viewerId) && <RemoveButton requestId={requestId} row={row} self={row.userId === viewerId} />}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <form ref={formRef} onSubmit={onSubmit} className="space-y-2">
          <input type="hidden" name="requestId" value={requestId} />
          <PeoplePicker key={rows.length} name="collaborator" label="Add people" options={options.filter((option) => !chosen.has(option.id))} max={Math.max(1, 20 - rows.length)} help={`A request can have up to 20 collaborators (${rows.length} now).`} />
          <FieldError result={result} name="collaborator" />
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton pending={pending} variant="secondary" className="btn-compact">
              <span className="inline-flex items-center gap-1.5">
                <UserPlus aria-hidden="true" className="h-4 w-4" />
                Add
              </span>
            </SubmitButton>
            {result && (result.ok || !result.fieldErrors) && <ResultMessage result={result} />}
          </div>
        </form>
      )}
    </section>
  );
}
