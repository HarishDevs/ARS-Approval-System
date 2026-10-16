"use client";

import { useState } from "react";
import { informationAction, saveInformationAction } from "@/app/users/information/actions";
import { DynamicFields } from "@/features/requests/DynamicFields";
import { PeoplePicker } from "@/features/ui/PeoplePicker";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { ACCEPT_ATTRIBUTE } from "@/server/attachments/files";
import { INFO_PRIORITIES, INFO_PRIORITY_LABEL, type AckRule, type InfoPriority } from "@/server/modules/settings";
import type { FieldLookups, FormField } from "@/server/forms/fields";
import type { InfoAction } from "@/server/modules/info-rules";

type Option = { id: number; label: string };

// v1.9.0 (D-143): write information, save it as a draft or publish it.
export function InfoForm({
  typeId,
  infoId,
  rowVersion,
  form,
  people,
  departments,
  groups,
  lookups,
  allow,
  ack,
  defaults,
}: {
  typeId: number;
  infoId: number | null;
  rowVersion: number | null;
  form: FormField[];
  people: Option[];
  departments: Option[];
  groups: Option[];
  lookups: FieldLookups;
  allow: { people: boolean; departments: boolean; groups: boolean; everyone: boolean };
  ack: AckRule;
  defaults: { title: string; body: string; priority: InfoPriority; askAck: boolean; effectiveOn: string; expiresOn: string; people: number[]; departments: number[]; groups: number[]; everyone: boolean; values: Record<string, string> };
}) {
  const { result, pending, onSubmit, confirmBar } = useActionForm(saveInformationAction);
  const [everyone, setEveryone] = useState(defaults.everyone);
  return (
    <form onSubmit={onSubmit} encType="multipart/form-data" className="card space-y-5 px-5 py-5" aria-label="Information">
      <input type="hidden" name="type" value={typeId} />
      {infoId && <input type="hidden" name="infoId" value={infoId} />}
      {rowVersion !== null && <input type="hidden" name="rowVersion" value={rowVersion} />}
      <div>
        <label htmlFor="info-title" className="field-label">
          Subject
        </label>
        <input id="info-title" name="title" defaultValue={defaults.title} required minLength={3} maxLength={200} className="field-input" />
        <FieldError result={result} name="title" />
      </div>
      <div>
        <label htmlFor="info-body" className="field-label">
          Message
        </label>
        <textarea id="info-body" name="body" defaultValue={defaults.body} required rows={8} maxLength={20000} className="field-input h-auto py-2.5" />
        <FieldError result={result} name="body" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label htmlFor="info-priority" className="field-label">
            Importance
          </label>
          <select id="info-priority" name="priority" defaultValue={defaults.priority} className="field-input">
            {INFO_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {INFO_PRIORITY_LABEL[priority]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="info-effective" className="field-label">
            Takes effect on <span className="font-normal text-ink-faint">(optional)</span>
          </label>
          <input id="info-effective" name="effective_on" type="date" defaultValue={defaults.effectiveOn} className="field-input" />
        </div>
        <div>
          <label htmlFor="info-expires" className="field-label">
            Expires on <span className="font-normal text-ink-faint">(optional)</span>
          </label>
          <input id="info-expires" name="expires_on" type="date" defaultValue={defaults.expiresOn} className="field-input" />
          <FieldError result={result} name="expires_on" />
        </div>
      </div>
      {ack === "SENDER_CHOOSES" && (
        <label className="flex items-center gap-2 text-label">
          <input type="checkbox" name="ack" value="yes" defaultChecked={defaults.askAck} />
          Ask recipients to acknowledge (a separate button; opening it only marks it read)
        </label>
      )}
      {ack === "ALWAYS" && <p className="text-label text-ink-muted">Recipients are asked to acknowledge (set by IT for this type).</p>}

      <fieldset className="space-y-3 rounded-md border border-line p-4">
        <legend className="px-1 font-semibold">Recipients</legend>
        <p className="text-caption text-ink-muted">The list is fixed when you publish: people who join a department later won&apos;t receive it. You are never a recipient of your own information.</p>
        {allow.everyone && (
          <label className="flex items-center gap-2 text-label">
            <input type="checkbox" name="everyone" value="yes" checked={everyone} onChange={(event) => setEveryone(event.target.checked)} />
            Everyone in the organisation
          </label>
        )}
        {!everyone && (
          <>
            {allow.people && <PeoplePicker name="people" label="People" options={people} initial={defaults.people} max={500} />}
            {allow.departments && <CheckGroup name="departments" label="Departments" options={departments} initial={defaults.departments} />}
            {allow.groups && <CheckGroup name="groups" label="Groups" options={groups} initial={defaults.groups} />}
          </>
        )}
        <FieldError result={result} name="recipients" />
      </fieldset>

      {form.length > 0 && <DynamicFields fields={form} mode={infoId ? "resubmit" : "submit"} initial={infoId ? defaults.values : undefined} people={people} lookups={lookups} result={result} />}
      <div>
        <label htmlFor="info-files" className="field-label">
          Files <span className="font-normal text-ink-faint">(optional, up to 5, 10 MB each)</span>
        </label>
        <input id="info-files" name="attachments" type="file" multiple accept={ACCEPT_ATTRIBUTE} className="block w-full text-label file:mr-3 file:rounded-md file:border-0 file:bg-surface-muted file:px-3 file:py-2" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" name="intent" value="publish" disabled={pending} className="btn-primary">
          Publish
        </button>
        <button type="submit" name="intent" value="draft" disabled={pending} className="btn-secondary">
          Save draft
        </button>
        <div className="min-w-0 flex-1">
          <ResultMessage result={result} />
        </div>
      </div>
      {confirmBar}
    </form>
  );
}

function CheckGroup({ name, label, options, initial }: { name: string; label: string; options: Option[]; initial: number[] }) {
  if (options.length === 0) return null;
  return (
    <div role="group" aria-label={label}>
      <p className="field-label">{label}</p>
      <div className="flex max-h-48 flex-wrap gap-x-5 gap-y-1 overflow-y-auto rounded-md border border-line p-3">
        {options.map((option) => (
          <label key={option.id} className="flex items-center gap-2 text-label">
            <input type="checkbox" name={name} value={option.id} defaultChecked={initial.includes(option.id)} />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );
}

const LABEL: Partial<Record<InfoAction, string>> = { PUBLISH: "Publish", DELETE_DRAFT: "Delete draft", WITHDRAW: "Withdraw", ARCHIVE: "Archive", ACKNOWLEDGE: "Acknowledge" };

export function InfoActionButton({ infoId, rowVersion, action, needsReason = false, confirm, danger = false }: { infoId: number; rowVersion: number; action: InfoAction; needsReason?: boolean; confirm?: string; danger?: boolean }) {
  const [open, setOpen] = useState(false);
  const label = LABEL[action] ?? action;
  const { result, pending, onSubmit, confirmBar } = useActionForm(informationAction, confirm ? { confirm, confirmTitle: `${label}?`, confirmLabel: label, confirmTone: danger ? "danger" : "primary" } : {});
  if (needsReason && !open)
    return (
      <button type="button" className={`btn-secondary btn-compact ${danger ? "text-danger-600" : ""}`} onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  return (
    <form onSubmit={onSubmit} className={needsReason ? "w-full space-y-2 rounded-md border border-line p-3" : ""} aria-label={label}>
      <input type="hidden" name="infoId" value={infoId} />
      <input type="hidden" name="rowVersion" value={rowVersion} />
      <input type="hidden" name="action" value={action} />
      {needsReason && (
        <div>
          <label htmlFor={`reason-${action}`} className="field-label">
            Reason
          </label>
          <textarea id={`reason-${action}`} name="reason" rows={2} maxLength={500} className="field-input h-auto py-2" />
          <FieldError result={result} name="reason" />
        </div>
      )}
      <SubmitButton pending={pending} variant={action === "ACKNOWLEDGE" || action === "PUBLISH" ? "primary" : "secondary"} className="btn-compact">
        {label}
      </SubmitButton>
      <ResultMessage result={result} />
      {confirmBar}
    </form>
  );
}

export function EditPublishedForm({ infoId, rowVersion, editable, values, expiresOn, people, lookups }: { infoId: number; rowVersion: number; editable: FormField[]; values: Record<string, string>; expiresOn: string; people: Option[]; lookups: FieldLookups }) {
  const [open, setOpen] = useState(false);
  const { result, pending, onSubmit } = useActionForm(informationAction, { confirm: "Recipients will be told it was updated. The history keeps what changed.", confirmTitle: "Save the changes?", confirmLabel: "Save changes" });
  if (!open)
    return (
      <button type="button" className="btn-secondary btn-compact" onClick={() => setOpen(true)}>
        Edit allowed fields
      </button>
    );
  return (
    <form
      onSubmit={(event) => {
        const form = event.currentTarget;
        const changed = editable.flatMap((field) => Array.from(form.querySelectorAll<HTMLInputElement>(`[name="${field.key}"]`)).map((element) => [element, field.key] as const));
        for (const [element, key] of changed) element.name = `field:${key}`;
        onSubmit(event);
        for (const [element, key] of changed) element.name = key;
      }}
      className="w-full space-y-3 rounded-md border border-line p-4"
      aria-label="Edit information"
    >
      <input type="hidden" name="infoId" value={infoId} />
      <input type="hidden" name="rowVersion" value={rowVersion} />
      <input type="hidden" name="action" value="EDIT_PUBLISHED" />
      <div>
        <label htmlFor="edit-expires" className="field-label">
          Expires on
        </label>
        <input id="edit-expires" name="expires_on" type="date" defaultValue={expiresOn} className="field-input w-auto" />
        <FieldError result={result} name="expires_on" />
      </div>
      {editable.length > 0 && <DynamicFields fields={editable} mode="resubmit" initial={values} people={people} lookups={lookups} result={result} />}
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
