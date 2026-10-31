"use client";

import { useState } from "react";
import { createModuleTypeAction, moduleTypeCommandAction, saveModuleTypeDraftAction } from "@/app/admin/module-types/actions";
import { FormFieldsEditor } from "@/features/admin/FormFieldsEditor";
import { DynamicFields } from "@/features/requests/DynamicFields";
import { PeoplePicker } from "@/features/ui/PeoplePicker";
import { Hint } from "@/features/ui/Hint";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { NO_LOOKUPS, type FieldLookups, type FormField } from "@/server/forms/fields";
import { UnsavedGuard } from "@/features/ui/UnsavedGuard";
import {
  ACK_LABEL,
  ACK_RULES,
  ASSIGN_SCOPE_LABEL,
  ASSIGN_SCOPES,
  COMPLETION_LABEL,
  COMPLETION_RULES,
  INFO_PRIORITIES,
  INFO_PRIORITY_LABEL,
  PRIORITY_LABEL,
  TASK_PRIORITIES,
  type CreateAccess,
  type InfoSettings,
  type ModuleKind,
  type TaskSettings,
} from "@/server/modules/settings";

// v1.9.0 (D-144): IT's editor for a Task type or an Information type: the
// details, the form (same builder as approval types), the behaviour, who may
// create, a preview, and Save draft. Publishing is a separate command.
type Option = { id: number; label: string };

export function NewModuleTypeForm({ module }: { module: ModuleKind }) {
  const { result, pending, onSubmit } = useActionForm(createModuleTypeAction);
  return (
    <form onSubmit={onSubmit} className="card grid gap-4 px-5 py-4 md:grid-cols-[1fr_200px_auto] md:items-end">
      <input type="hidden" name="module" value={module} />
      <div>
        <label htmlFor="type-name" className="field-label">
          Name
        </label>
        <input id="type-name" name="name" required minLength={3} maxLength={120} placeholder={module === "TASK" ? "e.g. IT support task" : "e.g. HR circular"} className="field-input" />
      </div>
      <div>
        <label htmlFor="type-code" className="field-label">
          Code
        </label>
        <input id="type-code" name="code" required maxLength={40} placeholder="e.g. IT_SUPPORT" className="field-input font-mono uppercase" />
      </div>
      <SubmitButton pending={pending} className="btn-compact h-11">
        Create type
      </SubmitButton>
      <div className="md:col-span-3">
        <label htmlFor="type-description" className="field-label">
          Description <span className="font-normal text-ink-faint">(optional)</span>
        </label>
        <input id="type-description" name="description" maxLength={500} className="field-input" />
      </div>
      <div className="md:col-span-3">
        <ResultMessage result={result} />
      </div>
    </form>
  );
}

function AccessEditor({ access, onChange, departments, people, verb }: { access: CreateAccess; onChange: (access: CreateAccess) => void; departments: Option[]; people: Option[]; verb: string }) {
  return (
    <fieldset className="space-y-2">
      <legend className="field-label">Who may {verb}</legend>
      <select aria-label={`Who may ${verb}`} value={access.mode} onChange={(event) => onChange({ ...access, mode: event.target.value as CreateAccess["mode"] })} className="field-input w-auto">
        <option value="EVERYONE">Everyone</option>
        <option value="DEPARTMENTS">People in chosen departments</option>
        <option value="PEOPLE">Chosen people</option>
      </select>
      {access.mode === "DEPARTMENTS" && <CheckList label="Departments" options={departments} value={access.departmentIds} onChange={(departmentIds) => onChange({ ...access, departmentIds })} />}
      {access.mode === "PEOPLE" && <PeoplePicker label="People who may do this" options={people} value={access.userIds} onChange={(userIds) => onChange({ ...access, userIds })} max={200} />}
    </fieldset>
  );
}

function CheckList({ label, options, value, onChange }: { label: string; options: Option[]; value: number[]; onChange: (ids: number[]) => void }) {
  if (options.length === 0) return <p className="text-caption text-ink-muted">None to choose yet.</p>;
  return (
    <div role="group" aria-label={label} className="flex max-h-48 flex-wrap gap-x-5 gap-y-1 overflow-y-auto rounded-md border border-line p-3">
      {options.map((option) => (
        <label key={option.id} className="flex items-center gap-2 text-label">
          <input type="checkbox" checked={value.includes(option.id)} onChange={(event) => onChange(event.target.checked ? [...value, option.id] : value.filter((id) => id !== option.id))} />
          {option.label}
        </label>
      ))}
    </div>
  );
}

// `blank`: what an empty box means, as a hover hint (D-179).
function NumberOrBlank({ label, value, onChange, min, max, suffix, blank }: { label: string; value: number | null; onChange: (value: number | null) => void; min: number; max: number; suffix: string; blank: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <label className="flex flex-wrap items-center gap-2 text-label">
        {label}
        <input
          aria-label={label}
          type="number"
          min={min}
          max={max}
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value === "" ? null : Math.min(max, Math.max(min, Math.round(Number(event.target.value)))))}
          placeholder="—"
          className="field-input w-24"
        />
        <span className="text-ink-faint">{suffix}</span>
      </label>
      <Hint text={`Leave empty for ${blank}.`} align="start" />
    </div>
  );
}

function Toggle({ label, checked, onChange, help }: { label: string; checked: boolean; onChange: (checked: boolean) => void; help?: string }) {
  return (
    <div className="flex items-start gap-1.5">
      <label className="flex items-start gap-2 text-label">
        <input type="checkbox" className="mt-1" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <span>{label}</span>
      </label>
      <Hint text={help} align="start" />
    </div>
  );
}

function TaskSettingsEditor({ settings, set, departments, groups, people }: { settings: TaskSettings; set: (change: Partial<TaskSettings>) => void; departments: Option[]; groups: Option[]; people: Option[] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <AccessEditor verb="create these tasks" access={settings.access} onChange={(access) => set({ access })} departments={departments} people={people} />
      <fieldset className="space-y-2">
        <legend className="field-label">
          Who can be assigned <Hint text="The creator can always assign to themselves; IT can assign to anyone active." align="start" />
        </legend>
        <select aria-label="Who can be assigned" value={settings.assignScope} onChange={(event) => set({ assignScope: event.target.value as TaskSettings["assignScope"] })} className="field-input w-auto">
          {ASSIGN_SCOPES.map((scope) => (
            <option key={scope} value={scope}>
              {ASSIGN_SCOPE_LABEL[scope]}
            </option>
          ))}
        </select>
        {settings.assignScope === "GROUPS" && <CheckList label="Groups whose members can be assigned" options={groups} value={settings.assignGroupIds} onChange={(assignGroupIds) => set({ assignGroupIds })} />}
        {settings.assignScope === "PEOPLE" && <PeoplePicker label="People who can be assigned" options={people} value={settings.assignUserIds} onChange={(assignUserIds) => set({ assignUserIds })} max={200} />}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="field-label">Steps and rules</legend>
        <Toggle label="Blocked is allowed" help="The assignee can mark the task blocked (with a reason) and back to in progress." checked={settings.allowBlocked} onChange={(allowBlocked) => set({ allowBlocked })} />
        <Toggle label="Completed tasks can be reopened" help="By the creator or IT, with a reason." checked={settings.allowReopen} onChange={(allowReopen) => set({ allowReopen })} />
        <Toggle label="Tasks can be reassigned" help="By the creator, the person who assigned it, or IT, within the scope above." checked={settings.allowReassign} onChange={(allowReassign) => set({ allowReassign })} />
        <Toggle label="The assignee may cancel" help="The creator and IT always may." checked={settings.assigneeMayCancel} onChange={(assigneeMayCancel) => set({ assigneeMayCancel })} />
        <Toggle label="Can point to an approval request" help="The task stays separate; completing it never approves the request." checked={settings.allowRelatedRequest} onChange={(allowRelatedRequest) => set({ allowRelatedRequest })} />
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="field-label">Completion, priority and dates</legend>
        <label className="flex flex-wrap items-center gap-2 text-label">
          To complete, the assignee gives
          <select aria-label="Completion evidence" value={settings.completion} onChange={(event) => set({ completion: event.target.value as TaskSettings["completion"] })} className="field-input w-auto">
            {COMPLETION_RULES.map((rule) => (
              <option key={rule} value={rule}>
                {COMPLETION_LABEL[rule]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-wrap items-center gap-2 text-label">
          Default priority
          <select aria-label="Default priority" value={settings.defaultPriority} onChange={(event) => set({ defaultPriority: event.target.value as TaskSettings["defaultPriority"] })} className="field-input w-auto">
            {TASK_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABEL[priority]}
              </option>
            ))}
          </select>
        </label>
        <Toggle label="A due date is required" checked={settings.requireDueDate} onChange={(requireDueDate) => set({ requireDueDate })} />
        <NumberOrBlank label="Default due in" value={settings.defaultDueDays} onChange={(defaultDueDays) => set({ defaultDueDays })} min={0} max={365} suffix="days" blank="none" />
        <NumberOrBlank label="Remind the assignee" value={settings.reminderHoursBefore} onChange={(reminderHoursBefore) => set({ reminderHoursBefore })} min={1} max={168} suffix="hours before it's due" blank="no reminder" />
        <Toggle label="Tell the assignee and creator once when it's overdue" checked={settings.overdueReminder} onChange={(overdueReminder) => set({ overdueReminder })} />
      </fieldset>
    </div>
  );
}

function InfoSettingsEditor({ settings, set, departments, people }: { settings: InfoSettings; set: (change: Partial<InfoSettings>) => void; departments: Option[]; people: Option[] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <AccessEditor verb="send these" access={settings.access} onChange={(access) => set({ access })} departments={departments} people={people} />
      <fieldset className="space-y-2">
        <legend className="field-label">
          Who it can be sent to <Hint text="Recipients are fixed when it is published: people who join a department later don't receive it." align="start" />
        </legend>
        <Toggle label="Chosen people" checked={settings.allowPeople} onChange={(allowPeople) => set({ allowPeople })} />
        <Toggle label="Whole departments" checked={settings.allowDepartments} onChange={(allowDepartments) => set({ allowDepartments })} />
        <Toggle label="Groups" checked={settings.allowGroups} onChange={(allowGroups) => set({ allowGroups })} />
        <Toggle label="Everyone in the organisation" checked={settings.allowEveryone} onChange={(allowEveryone) => set({ allowEveryone })} />
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="field-label">
          Acknowledgement <Hint text="Acknowledging is a separate button; opening it only marks it read." align="start" />
        </legend>
        <select aria-label="Acknowledgement" value={settings.ack} onChange={(event) => set({ ack: event.target.value as InfoSettings["ack"] })} className="field-input w-auto">
          {ACK_RULES.map((rule) => (
            <option key={rule} value={rule}>
              {ACK_LABEL[rule]}
            </option>
          ))}
        </select>
        <NumberOrBlank label="Remind people who haven't acknowledged after" value={settings.ackReminderDays} onChange={(ackReminderDays) => set({ ackReminderDays })} min={1} max={60} suffix="days" blank="no reminder" />
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="field-label">Priority, expiry and editing</legend>
        <label className="flex flex-wrap items-center gap-2 text-label">
          Default importance
          <select aria-label="Default importance" value={settings.defaultPriority} onChange={(event) => set({ defaultPriority: event.target.value as InfoSettings["defaultPriority"] })} className="field-input w-auto">
            {INFO_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {INFO_PRIORITY_LABEL[priority]}
              </option>
            ))}
          </select>
        </label>
        <NumberOrBlank label="Expires after" value={settings.expiryDays} onChange={(expiryDays) => set({ expiryDays })} min={1} max={3650} suffix="days by default" blank="no expiry" />
        <Toggle label="Fields marked 'can be changed' can be edited after publishing" help="Recipients are told it was updated; the history keeps what changed." checked={settings.editableAfterPublish} onChange={(editableAfterPublish) => set({ editableAfterPublish })} />
        <Toggle label="Show on calendars" help="Information of this type with an effective date appears on recipients' ARS calendars (and in Google Calendar for people who connected it). Acknowledging is still done in ARS." checked={settings.calendar} onChange={(calendar) => set({ calendar })} />
      </fieldset>
    </div>
  );
}

export function ModuleTypeEditor({
  module,
  typeId,
  initialName,
  initialDescription,
  initialForm,
  initialSettings,
  lookups = NO_LOOKUPS,
  people,
  departments,
  groups,
}: {
  module: ModuleKind;
  typeId: number;
  initialName: string;
  initialDescription: string;
  initialForm: FormField[];
  initialSettings: TaskSettings | InfoSettings;
  lookups?: FieldLookups;
  people: Option[];
  departments: Option[];
  groups: Option[];
}) {
  const [form, setForm] = useState<FormField[]>(initialForm);
  const [settings, setSettings] = useState<TaskSettings | InfoSettings>(initialSettings);
  const [previewing, setPreviewing] = useState(false);
  const { result, pending, onSubmit } = useActionForm(saveModuleTypeDraftAction);
  const set = (change: Partial<TaskSettings> | Partial<InfoSettings>) => setSettings((current) => ({ ...current, ...change }) as TaskSettings | InfoSettings);
  const noun = module === "TASK" ? "task" : "information";

  return (
    <form onSubmit={onSubmit} className="space-y-6" aria-label="Draft set-up">
      <UnsavedGuard />
      <input type="hidden" name="module" value={module} />
      <input type="hidden" name="typeId" value={typeId} />
      <input type="hidden" name="form" value={JSON.stringify(form)} />
      <input type="hidden" name="settings" value={JSON.stringify(settings)} />
      <section className="card grid gap-4 px-5 py-4 md:grid-cols-2" aria-labelledby="details-heading">
        <h2 id="details-heading" className="font-semibold md:col-span-2">
          Details
        </h2>
        <div>
          <label htmlFor="draft-name" className="field-label">
            Name
          </label>
          <input id="draft-name" name="name" defaultValue={initialName} required minLength={3} maxLength={120} className="field-input" />
          <FieldError result={result} name="name" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <label htmlFor="draft-description" className="field-label">
              Description
            </label>
            <Hint text="Shown when people choose a type." align="start" className="mb-1.5" />
          </div>
          <input id="draft-description" name="description" defaultValue={initialDescription} maxLength={500} className="field-input" />
        </div>
      </section>

      <FormFieldsEditor
        form={form}
        setForm={setForm}
        lockedKeys={[]}
        recordOptions
        intro={
          module === "TASK"
            ? "Fields the creator fills in besides title, description, assignee, priority and due date. Mark fields to show in lists, to match the list search, or to be changeable later."
            : "Fields the sender fills in besides subject, message, importance and recipients. Mark fields to show in lists, to match the search, or to be changeable after publishing."
        }
      />

      <section className="card space-y-4 px-5 py-4" aria-labelledby="behaviour-heading">
        <div className="flex items-center gap-1.5">
          <h2 id="behaviour-heading" className="font-semibold">
            How it works
          </h2>
          <Hint text={`These apply to new ${noun} records once this version is published; earlier ones keep their own version.`} align="start" />
        </div>
        {module === "TASK" ? (
          <TaskSettingsEditor settings={settings as TaskSettings} set={set} departments={departments} groups={groups} people={people} />
        ) : (
          <InfoSettingsEditor settings={settings as InfoSettings} set={set} departments={departments} people={people} />
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-secondary btn-compact" aria-expanded={previewing} onClick={() => setPreviewing((open) => !open)}>
          {previewing ? "Hide preview" : "Preview the form"}
        </button>
        <SubmitButton pending={pending} className="btn-compact">
          Save draft
        </SubmitButton>
        <div className="min-w-0 flex-1">
          <ResultMessage result={result} />
        </div>
      </div>
      {previewing && (
        <section aria-label="Preview of the form" className="rounded-lg border-2 border-dashed border-primary-200 p-4">
          <h2 className="mb-3 font-semibold">
            Preview <Hint text="Unsaved changes included; nothing is sent." align="start" />
          </h2>
          <div className="card px-5 py-5">
            {form.length === 0 ? <p className="text-label text-ink-muted">No extra fields: people fill in only the standard ones.</p> : <DynamicFields key={JSON.stringify(form)} fields={form} mode="submit" people={people} lookups={lookups} result={null} />}
          </div>
        </section>
      )}
    </form>
  );
}

export function ModuleTypeCommand({
  module,
  typeId,
  command,
  label,
  confirm,
  confirmTitle,
  tone = "primary",
  variant = "secondary",
}: {
  module: ModuleKind;
  typeId: number;
  command: "publish" | "new-draft" | "discard" | "retire" | "reactivate";
  label: string;
  confirm?: string;
  confirmTitle?: string;
  tone?: "primary" | "danger";
  variant?: "primary" | "secondary";
}) {
  const { result, pending, onSubmit, confirmBar } = useActionForm(moduleTypeCommandAction, confirm ? { confirm, confirmTitle, confirmLabel: label, confirmTone: tone } : {});
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <input type="hidden" name="module" value={module} />
      <input type="hidden" name="typeId" value={typeId} />
      <input type="hidden" name="command" value={command} />
      <SubmitButton pending={pending} variant={variant} className="btn-compact">
        {label}
      </SubmitButton>
      <ResultMessage result={result} />
      {confirmBar}
    </form>
  );
}
