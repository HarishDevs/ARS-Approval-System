"use client";

import { checkReadinessAction, resubmitAction, submitAmendmentAction, submitRequestAction } from "@/app/users/actions";
import { ReadinessPanel } from "@/features/requests/ReadinessPanel";
import type { Readiness } from "@/server/approvals/readiness";
import { actionErrorMessage, guardAction } from "@/features/ui/form";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DynamicFields } from "@/features/requests/DynamicFields";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { ErrorSummary } from "@/features/ui/Field";
import { Hint } from "@/features/ui/Hint";
import { PeoplePicker, type PersonOption } from "@/features/ui/PeoplePicker";
import { NO_LOOKUPS, type FieldLookups, type FormField } from "@/server/forms/fields";
import { ACCEPT_ATTRIBUTE } from "@/server/attachments/files";
import { DraftStatus, useDraftAutosave } from "@/features/requests/useDraftAutosave";

// A saved draft for this form (#3): what was restored, and its version.
export interface DraftInfo {
  key: string;
  version: number | null;
  savedAt: string | null;
}

// Raise a request, or edit and resubmit one (F-14). The server re-checks
// every field against the workflow version's form (D-055).
const NO_FILES: Record<string, number> = {};

export function RequestForm({
  mode,
  workflowId,
  requestId,
  fields,
  people,
  approverPeople,
  approverFields = [],
  lookups = NO_LOOKUPS,
  initial,
  initialTitle,
  followUpOf,
  draft,
  sources = {},
  amendment,
  existingFiles = NO_FILES,
  collaboratorOptions,
  preview = false,
  expiredSource,
}: {
  mode: "submit" | "resubmit";
  workflowId?: number;
  requestId?: number;
  fields: FormField[];
  people: { id: number; label: string }[];
  // D-085: person fields that decide an approver list approvers only.
  approverPeople?: { id: number; label: string }[];
  approverFields?: string[];
  // Department / designation lists for "from the list" fields (D-088).
  lookups?: FieldLookups;
  initial?: Record<string, string>;
  initialTitle?: string;
  followUpOf?: number; // EN-08: linked to this approved request on submit
  sources?: Record<string, string>; // FN4: where a starting value came from
  draft?: DraftInfo;
  // FN5: amending an approved request; only these fields can change.
  amendment?: { originalId: number; originalNo: string; title: string; amendable: string[] };
  // v1.6.1: files already in each attachment field (resubmit, amend).
  existingFiles?: Record<string, number>;
  // v1.6.1: people the requester can add to follow the request (new requests).
  collaboratorOptions?: PersonOption[];
  // v1.7.0 (A4): the form builder's preview. Rules and formulas work; nothing is sent.
  preview?: boolean;
  // DR-05 (owner, 2 Nov 2026): amending or following up an expired approval asks why.
  expiredSource?: { requestNo: string; expiredOn: string };
}) {
  const { result, pending, onSubmit } = useActionForm(amendment ? submitAmendmentAction : mode === "submit" ? submitRequestAction : resubmitAction);
  const locked = (key: string) => Boolean(amendment && !amendment.amendable.includes(key));
  const restoredAt = draft?.savedAt ? new Date(draft.savedAt) : null;
  const autosave = useDraftAutosave({ draftKey: draft?.key ?? "", initialVersion: draft?.version ?? null, savedAt: null, disabled: !draft });
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);
  // D-QA-01: one key per form; a retried submit returns the same request.
  const [submissionKey] = useState(() => crypto.randomUUID());
  // FN1 readiness: from "Check before submitting", or the server's answer
  // to a submit that needs fixing or confirming.
  const [checked, setChecked] = useState<{ readiness: Readiness; signature: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkFailed, setCheckFailed] = useState<string | null>(null);
  const [signature, setSignature] = useState("");
  const [previewTried, setPreviewTried] = useState(false);
  const fileCount = useCallback((form: HTMLFormElement, key: string) => ((form.elements.namedItem(`file:${key}`) as HTMLInputElement | null)?.files?.length ?? 0) + (existingFiles[key] ?? 0), [existingFiles]);
  const attachmentFields = useMemo(() => fields.filter((field) => field.type === "ATTACHMENT"), [fields]);
  const signatureOf = useCallback((form: HTMLFormElement) => {
    const entries = [...new FormData(form).entries()].filter(([key, value]) => typeof value === "string" && !["submissionKey", "acknowledged", "allowDuplicate", "overrideReason"].includes(key)).map(([key, value]) => `${key}=${value as string}`);
    const files = (form.elements.namedItem("attachments") as HTMLInputElement | null)?.files?.length ?? 0;
    return `${entries.sort().join("&")}|${files}|${attachmentFields.map((field) => fileCount(form, field.key)).join(",")}`;
  }, [attachmentFields, fileCount]);
  const submitted = result && !result.ok ? (result.data as { readiness?: Readiness } | undefined)?.readiness : undefined;
  useEffect(() => {
    if (submitted && autosave.formRef.current) setChecked({ readiness: submitted, signature: signatureOf(autosave.formRef.current) });
  }, [submitted, autosave.formRef, signatureOf]);
  const runCheck = async () => {
    const form = autosave.formRef.current;
    if (!form || !workflowId) return;
    setChecking(true);
    setCheckFailed(null);
    const data = new FormData(form);
    data.delete("attachments");
    // Attachment fields: the check needs how many files, not the files.
    for (const field of attachmentFields) {
      data.delete(`file:${field.key}`);
      data.set(`fileCount:${field.key}`, String(fileCount(form, field.key)));
    }
    data.set("attachmentCount", String((form.elements.namedItem("attachments") as HTMLInputElement | null)?.files?.length ?? 0));
    const answer = await guardAction(checkReadinessAction)(null, data);
    setChecking(false);
    const readiness = (answer.data as { readiness?: Readiness } | undefined)?.readiness;
    if (readiness) setChecked({ readiness, signature: signatureOf(form) });
    else setCheckFailed(answer.message ?? "The check couldn't run.");
  };
  const readiness = checked?.readiness ?? null;
  const onlyRecentDuplicate = Boolean(readiness?.needsConfirmation && readiness.items.filter((item) => item.severity === "WARNING").every((item) => item.code === "RECENT_DUPLICATE"));
  const possibleDuplicate = Boolean(result && !result.ok && result.fieldErrors?.allowDuplicate && (!readiness || onlyRecentDuplicate));
  // FB-06: every field problem listed at the top, linked to the field.
  const summaryErrors = result && !result.ok && result.fieldErrors ? Object.fromEntries(Object.entries(result.fieldErrors).filter(([key]) => key !== "allowDuplicate").map(([key, message]) => [key === "title" || key === "attachments" ? key : `f-${key}`, message])) : undefined;
  const summaryLabels: Record<string, string> = { title: "Title", attachments: "Attachments", "f-amendReason": "Why it needs amending", "f-amendment": "Amendment", "f-expiredReason": "Why use an expired approval", ...Object.fromEntries(fields.map((field) => [`f-${field.key}`, field.label])) };

  const nudge = autosave.nudge;

  return (
    <form
      ref={autosave.formRef}
      onSubmit={
        preview
          ? (event) => {
              event.preventDefault();
              setPreviewTried(true);
            }
          : onSubmit
      }
      aria-label={preview ? "Form preview" : undefined}
      onInput={(event) => setSignature(signatureOf(event.currentTarget))}
      onChange={(event) => setSignature(signatureOf(event.currentTarget))}
      className="card request-form"
    >
      {draft && restoredAt && (
        <p role="status" className="border-b border-line bg-primary-50/50 px-5 py-2 text-label text-primary-700">
          Restored your draft from {restoredAt.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}. Files aren&apos;t kept in drafts: add them again before submitting.
        </p>
      )}
      {workflowId && <input type="hidden" name="workflowId" value={workflowId} />}
      {requestId && <input type="hidden" name="requestId" value={requestId} />}
      {mode === "submit" && <input type="hidden" name="submissionKey" value={submissionKey} />}
      {followUpOf && <input type="hidden" name="followUpOf" value={followUpOf} />}
      {amendment && <input type="hidden" name="amendmentOf" value={amendment.originalId} />}
      <div className="request-form-body space-y-5 px-5 py-5">
        <ErrorSummary errors={summaryErrors} labels={summaryLabels} />
        {amendment && (
          <div id="f-amendment" tabIndex={-1} className="space-y-3">
            <p className="flex items-center gap-1 text-label">
              <span className="font-semibold">Amendment: {amendment.title}</span>
              <Hint text={`Changes ${amendment.originalNo} once approved. Its approvals and history stay as they are; this goes through the approval steps again.`} align="start" />
            </p>
            <div>
              <label htmlFor="f-amendReason" className="field-label">
                Why does it need amending?
              </label>
              <textarea id="f-amendReason" name="amendReason" defaultValue={initial?.amendReason ?? ""} rows={3} maxLength={1000} aria-required="true" aria-invalid={result && !result.ok && result.fieldErrors?.amendReason ? true : undefined} className="field-input h-auto py-2.5" placeholder="e.g. The vendor revised the quote" />
              <FieldError result={result} name="amendReason" />
              <FieldError result={result} name="amendment" />
            </div>
          </div>
        )}
        {expiredSource && (
          <div className="rounded-md bg-danger-50 px-3 py-3">
            <label htmlFor="f-expiredReason" className="field-label text-danger-600">
              {expiredSource.requestNo} expired on {expiredSource.expiredOn}. Why are you using it?
              <span aria-hidden="true"> *</span>
            </label>
            <textarea
              id="f-expiredReason"
              name="expiredReason"
              rows={2}
              maxLength={1000}
              required
              aria-required="true"
              aria-invalid={result && !result.ok && result.fieldErrors?.expiredReason ? true : undefined}
              className="field-input h-auto py-2.5"
              placeholder="e.g. The work is still going on; renewing the approval"
            />
            <p className="mt-1 text-caption text-ink-muted">Kept on the expired request&apos;s history.</p>
            <FieldError result={result} name="expiredReason" />
          </div>
        )}
        {mode === "submit" && !amendment && (
          <div>
            <label htmlFor="title" className="field-label">
              Title
              <span className="text-danger-600" aria-hidden="true">
                {" "}
                *
              </span>
            </label>
            <input id="title" name="title" defaultValue={initialTitle ?? ""} placeholder="e.g. New motor for crane 3" className="field-input" aria-required="true" />
            <FieldError result={result} name="title" />
          </div>
        )}
        <DynamicFields
          fields={fields}
          mode={mode}
          people={people}
          approverPeople={approverPeople}
          approverFields={approverFields}
          lookups={lookups}
          initial={initial}
          existingFiles={existingFiles}
          sources={sources}
          locked={locked}
          result={result}
          onLinesChange={nudge}
        />
        <div>
          <div className="flex items-center gap-1">
            <label htmlFor="f-attachments" className="field-label">
              {mode === "submit" ? "Attachments" : "Add files"} <span className="font-normal text-ink-faint">(optional)</span>
            </label>
            <Hint text="Quotes, invoices, photos: PDF, images, Word, Excel, PowerPoint, CSV or text. Up to 5 files of 10 MB each." align="start" className="mb-1.5" />
          </div>
          <input id="f-attachments" name="attachments" type="file" multiple accept={ACCEPT_ATTRIBUTE} className="block w-full text-label file:mr-3 file:rounded-md file:border-0 file:bg-surface-muted file:px-3 file:py-2" />
          <FieldError result={result} name="attachments" />
        </div>
        {mode === "submit" && !amendment && collaboratorOptions && (
          <div>
            <PeoplePicker name="collaborator" label="Collaborators (optional)" options={collaboratorOptions} help="Anyone in the organisation who should follow this request: they can see it, comment and add files, and are told how it goes. They don't approve anything." invalid={Boolean(result && !result.ok && result.fieldErrors?.collaborator)} />
            <FieldError result={result} name="collaborator" />
          </div>
        )}
      </div>
      {mode === "submit" && workflowId && (
        <div className="mx-5 mb-4 space-y-3">
          <ReadinessPanel readiness={readiness} labels={{ title: "Title", attachments: "Attachments", ...Object.fromEntries(fields.map((field) => [field.key, field.label])) }} stale={Boolean(checked && signature && signature !== checked.signature)} checking={checking} failed={checkFailed} onCheck={runCheck} />
          {readiness?.needsConfirmation && !onlyRecentDuplicate && (
            <label className="flex items-start gap-2 rounded-md border border-warning-600/40 bg-warning-50 px-3 py-2 text-label text-warning-600">
              <input type="checkbox" name="acknowledged" className="mt-0.5" />
              <span>I&apos;ve read the warnings and want to submit.</span>
            </label>
          )}
          {readiness?.needsReason && (
            <div>
              <label htmlFor="overrideReason" className="field-label">
                Why is this not a duplicate?
              </label>
              <input id="overrideReason" name="overrideReason" maxLength={500} className="field-input" placeholder="e.g. A second order for a different site" />
              <FieldError result={result} name="overrideReason" />
            </div>
          )}
        </div>
      )}
      {possibleDuplicate && (
        <label className="mx-5 mb-4 flex items-start gap-2 rounded-md border border-warning-600/40 bg-warning-50 px-3 py-2 text-label text-warning-600">
          <input type="checkbox" name="allowDuplicate" className="mt-0.5" />
          <span>This is a separate request: raise it anyway.</span>
        </label>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4">
        <SubmitButton pending={pending} className="btn-compact">
          {amendment ? "Submit amendment" : mode === "submit" ? "Submit request" : "Resubmit"}
        </SubmitButton>
        <div className="min-w-0 flex-1">
          {preview ? (
            <p role="status" className="text-label text-ink-muted">
              {previewTried ? "Preview only: nothing was submitted. Required fields and checks are applied by the server on a real submit." : "Preview: try the fields and rules. Nothing is saved or sent."}
            </p>
          ) : (
            <ResultMessage result={result} />
          )}
        </div>
      </div>
      {draft && (
        <div className="space-y-2 border-t border-line px-5 py-3">
          <DraftStatus state={autosave.state} restoredAt={restoredAt} onDiscard={() => setConfirmDiscard(true)} />
          {confirmDiscard && (
            <div role="alertdialog" aria-label="Discard draft" className="flex flex-wrap items-center gap-2 rounded-md border border-warning-600/40 bg-warning-50 px-3 py-2 text-label">
              <span>Discard this draft? What you typed is cleared.</span>
              <button
                type="button"
                className="btn-primary btn-compact"
                onClick={async () => {
                  const done = await autosave.discard().catch((error: unknown) => ({ ok: false, message: actionErrorMessage(error) ?? "Couldn't reach the server. Try again." }));
                  if (done.ok) window.location.reload();
                  else setDiscardError(done.message);
                }}
              >
                Yes, discard
              </button>
              <button type="button" className="btn-secondary btn-compact" onClick={() => setConfirmDiscard(false)}>
                Cancel
              </button>
              {discardError && <span className="text-danger-600">{discardError}</span>}
            </div>
          )}
        </div>
      )}
    </form>
  );
}
