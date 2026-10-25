"use client";

import { useMemo, useState } from "react";
import { createTaskAction, taskAction } from "@/app/users/tasks/actions";
import { DynamicFields } from "@/features/requests/DynamicFields";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { Hint } from "@/features/ui/Hint";
import { ACCEPT_ATTRIBUTE } from "@/server/attachments/files";
import { PRIORITY_LABEL, TASK_PRIORITIES, type TaskPriority } from "@/server/modules/settings";
import type { FieldLookups, FormField } from "@/server/forms/fields";
import type { TaskAction } from "@/server/modules/task-rules";

type Option = { id: number; label: string };

// v1.9.0 (D-143): create a task of a chosen type.
export function CreateTaskForm({
  typeId,
  form,
  people,
  assignable,
  lookups,
  defaultPriority,
  defaultDue,
  requireDue,
  allowRelated,
  relatedDefault,
  selfId,
}: {
  typeId: number;
  form: FormField[];
  people: Option[];
  assignable: Option[];
  lookups: FieldLookups;
  defaultPriority: TaskPriority;
  defaultDue: string;
  requireDue: boolean;
  allowRelated: boolean;
  relatedDefault: string;
  selfId: number;
}) {
  const submissionKey = useMemo(() => crypto.randomUUID(), []);
  const { result, pending, onSubmit } = useActionForm(createTaskAction);
  return (
    <form onSubmit={onSubmit} className="card space-y-5 px-5 py-5" encType="multipart/form-data" aria-label="New task">
      <input type="hidden" name="type" value={typeId} />
      <input type="hidden" name="submission_key" value={submissionKey} />
      <div>
        <label htmlFor="task-title" className="field-label">
          Title
        </label>
        <input id="task-title" name="title" required minLength={3} maxLength={200} className="field-input" aria-invalid={result && !result.ok && result.fieldErrors?.title ? true : undefined} />
        <FieldError result={result} name="title" />
      </div>
      <div>
        <label htmlFor="task-description" className="field-label">
          Description <span className="font-normal text-ink-faint">(optional)</span>
        </label>
        <textarea id="task-description" name="description" rows={4} maxLength={4000} className="field-input h-auto py-2.5" />
        <FieldError result={result} name="description" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label htmlFor="task-assignee" className="field-label">
            Assign to
          </label>
          <select id="task-assignee" name="assignee" required defaultValue="" className="field-input">
            <option value="" disabled>
              Choose a person…
            </option>
            {assignable.map((person) => (
              <option key={person.id} value={person.id}>
                {person.id === selfId ? `${person.label} (me)` : person.label}
              </option>
            ))}
          </select>
          <FieldError result={result} name="assignee" />
        </div>
        <div>
          <label htmlFor="task-priority" className="field-label">
            Priority
          </label>
          <select id="task-priority" name="priority" defaultValue={defaultPriority} className="field-input">
            {TASK_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABEL[priority]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="task-due" className="field-label">
            Due {!requireDue && <span className="font-normal text-ink-faint">(optional)</span>}
          </label>
          <input id="task-due" name="due" type="datetime-local" defaultValue={defaultDue} required={requireDue} className="field-input" />
          <FieldError result={result} name="due" />
        </div>
        <div>
          <label htmlFor="task-start" className="field-label">
            Start on <span className="font-normal text-ink-faint">(optional)</span>
          </label>
          <input id="task-start" name="starts_on" type="date" className="field-input" />
        </div>
        {allowRelated && (
          <div className="md:col-span-2">
            <div className="flex items-center gap-1">
              <label htmlFor="task-related" className="field-label">
                Related approval request <span className="font-normal text-ink-faint">(optional)</span>
              </label>
              <Hint text="Its request number. The task stays separate: completing it doesn't approve the request." align="start" className="mb-1.5" />
            </div>
            <input id="task-related" name="related" defaultValue={relatedDefault} maxLength={40} placeholder="e.g. PUR-2026-000012" className="field-input font-mono" />
            <FieldError result={result} name="related" />
          </div>
        )}
      </div>
      {form.length > 0 && <DynamicFields fields={form} mode="submit" people={people} lookups={lookups} result={result} />}
      <div>
        <div className="flex items-center gap-1">
          <label htmlFor="task-files" className="field-label">
            Files <span className="font-normal text-ink-faint">(optional)</span>
          </label>
          <Hint text="Up to 5 files, 10 MB each." align="start" className="mb-1.5" />
        </div>
        <input id="task-files" name="attachments" type="file" multiple accept={ACCEPT_ATTRIBUTE} className="block w-full text-label file:mr-3 file:rounded-md file:border-0 file:bg-surface-muted file:px-3 file:py-2" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending}>Create task</SubmitButton>
        <div className="min-w-0 flex-1">
          <ResultMessage result={result} />
        </div>
      </div>
    </form>
  );
}

const ACTION_LABEL: Partial<Record<TaskAction, string>> = {
  START: "Start",
  BLOCK: "Mark blocked",
  UNBLOCK: "Back in progress",
  COMPLETE: "Complete",
  REOPEN: "Reopen",
  CANCEL: "Cancel task",
};

// One lifecycle action. Actions that need a reason or evidence open a small form first.
export function TaskActionButton({
  taskId,
  rowVersion,
  action,
  needsText,
  textLabel,
  allowFiles = false,
  danger = false,
  confirm,
}: {
  taskId: number;
  rowVersion: number;
  action: TaskAction;
  needsText: boolean;
  textLabel?: string;
  allowFiles?: boolean;
  danger?: boolean;
  confirm?: string;
}) {
  const [open, setOpen] = useState(false);
  const { result, pending, onSubmit, confirmBar } = useActionForm(taskAction, confirm ? { confirm, confirmTitle: `${ACTION_LABEL[action]}?`, confirmLabel: ACTION_LABEL[action], confirmTone: danger ? "danger" : "primary" } : {});
  const label = ACTION_LABEL[action] ?? action;
  if ((needsText || allowFiles) && !open) {
    return (
      <button type="button" className={danger ? "btn-secondary btn-compact text-danger-600" : action === "COMPLETE" ? "btn-primary btn-compact" : "btn-secondary btn-compact"} onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  }
  return (
    <form onSubmit={onSubmit} encType="multipart/form-data" className={needsText || allowFiles ? "w-full space-y-2 rounded-md border border-line p-3" : ""} aria-label={label}>
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="rowVersion" value={rowVersion} />
      <input type="hidden" name="action" value={action} />
      {(needsText || allowFiles) && textLabel && (
        <div>
          <label htmlFor={`text-${action}`} className="field-label">
            {textLabel}
          </label>
          <textarea id={`text-${action}`} name="reason" rows={2} maxLength={2000} className="field-input h-auto py-2" />
          <FieldError result={result} name="reason" />
        </div>
      )}
      {allowFiles && <input aria-label="Evidence files" name="attachments" type="file" multiple accept={ACCEPT_ATTRIBUTE} className="block w-full text-label" />}
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pending={pending} variant={action === "COMPLETE" ? "primary" : "secondary"} className="btn-compact">
          {label}
        </SubmitButton>
        {(needsText || allowFiles) && (
          <button type="button" className="btn-secondary btn-compact" onClick={() => setOpen(false)}>
            Back
          </button>
        )}
      </div>
      <ResultMessage result={result} />
      {confirmBar}
    </form>
  );
}

export function ReassignForm({ taskId, rowVersion, assignable }: { taskId: number; rowVersion: number; assignable: Option[] }) {
  const { result, pending, onSubmit } = useActionForm(taskAction, { resetOnSuccess: true });
  return (
    <form onSubmit={onSubmit} className="space-y-2" aria-label="Reassign">
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="rowVersion" value={rowVersion} />
      <input type="hidden" name="action" value="REASSIGN" />
      <div className="grid gap-2 sm:grid-cols-2">
        <select aria-label="New assignee" name="assignee" defaultValue="" className="field-input">
          <option value="" disabled>
            Reassign to…
          </option>
          {assignable.map((person) => (
            <option key={person.id} value={person.id}>
              {person.label}
            </option>
          ))}
        </select>
        <input aria-label="Reason for reassigning" name="reason" maxLength={500} placeholder="Reason" className="field-input" />
      </div>
      <FieldError result={result} name="assignee" />
      <FieldError result={result} name="reason" />
      <SubmitButton pending={pending} variant="secondary" className="btn-compact">
        Reassign
      </SubmitButton>
      <ResultMessage result={result} />
    </form>
  );
}

export function CommentForm({ taskId }: { taskId: number }) {
  const { result, pending, onSubmit } = useActionForm(taskAction, { resetOnSuccess: true });
  return (
    <form onSubmit={onSubmit} encType="multipart/form-data" className="space-y-2" aria-label="Comment">
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="action" value="COMMENT" />
      <label htmlFor="task-comment" className="field-label">
        Add a comment or files
      </label>
      <textarea id="task-comment" name="reason" rows={3} maxLength={2000} className="field-input h-auto py-2" />
      <input aria-label="Files to add" name="attachments" type="file" multiple accept={ACCEPT_ATTRIBUTE} className="block w-full text-label" />
      <FieldError result={result} name="reason" />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending} variant="secondary" className="btn-compact">
          Post
        </SubmitButton>
        <ResultMessage result={result} />
      </div>
    </form>
  );
}

export function EditTaskForm({
  taskId,
  rowVersion,
  title,
  description,
  priority,
  due,
  editable,
  values,
  people,
  lookups,
}: {
  taskId: number;
  rowVersion: number;
  title: string;
  description: string;
  priority: TaskPriority;
  due: string;
  editable: FormField[];
  values: Record<string, string>;
  people: Option[];
  lookups: FieldLookups;
}) {
  const [open, setOpen] = useState(false);
  const { result, pending, onSubmit } = useActionForm(taskAction);
  if (!open)
    return (
      <button type="button" className="btn-secondary btn-compact" onClick={() => setOpen(true)}>
        Edit details
      </button>
    );
  // Editable custom fields travel as "field:<key>" so they can't collide with the standard ones.
  const renamed = editable.map((field) => ({ ...field }));
  return (
    <form
      onSubmit={(event) => {
        // The form's data is read during onSubmit; the names go back right after.
        const form = event.currentTarget;
        const changed = renamed.flatMap((field) => Array.from(form.querySelectorAll<HTMLInputElement>(`[name="${field.key}"]`)).map((element) => [element, field.key] as const));
        for (const [element, key] of changed) element.name = `field:${key}`;
        onSubmit(event);
        for (const [element, key] of changed) element.name = key;
      }}
      className="w-full space-y-3 rounded-md border border-line p-4"
      aria-label="Edit task"
    >
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="rowVersion" value={rowVersion} />
      <input type="hidden" name="action" value="EDIT" />
      <div>
        <label htmlFor="edit-title" className="field-label">
          Title
        </label>
        <input id="edit-title" name="title" defaultValue={title} required minLength={3} maxLength={200} className="field-input" />
        <FieldError result={result} name="title" />
      </div>
      <div>
        <label htmlFor="edit-description" className="field-label">
          Description
        </label>
        <textarea id="edit-description" name="description" defaultValue={description} rows={3} maxLength={4000} className="field-input h-auto py-2" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="edit-priority" className="field-label">
            Priority
          </label>
          <select id="edit-priority" name="priority" defaultValue={priority} className="field-input">
            {TASK_PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {PRIORITY_LABEL[value]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="edit-due" className="field-label">
            Due
          </label>
          <input id="edit-due" name="due" type="datetime-local" defaultValue={due} className="field-input" />
          <FieldError result={result} name="due" />
        </div>
      </div>
      {renamed.length > 0 && <DynamicFields fields={renamed} mode="resubmit" initial={values} people={people} lookups={lookups} result={result} />}
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pending={pending} className="btn-compact">
          Save changes
        </SubmitButton>
        <button type="button" className="btn-secondary btn-compact" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <ResultMessage result={result} />
    </form>
  );
}
