"use client";

import Link from "next/link";
import { answerConsultAction, consultAction, linkAction } from "@/app/users/collab-actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { Hint } from "@/features/ui/Hint";
import { SafeText } from "@/features/ui/SafeText";

// EN-06 advice and EN-08 links on the request page.
export interface ConsultRow {
  id: number;
  byName: string;
  consulteeName: string;
  question: string;
  answer: string | null;
  status: string;
  askedAt: string;
  mine: boolean; // the viewer is the consultee and it is still open
}

export function Advice({ requestId, rows, canAsk, people }: { requestId: number; rows: ConsultRow[]; canAsk: boolean; people: { id: number; label: string }[] }) {
  if (rows.length === 0 && !canAsk) return null;
  return (
    <section className="card px-5 py-4" aria-labelledby="advice">
      <h2 id="advice" className="mb-3 flex items-center gap-1 font-semibold">
        Advice
        <Hint text="People asked for their view. They can read the request and answer; the decision stays with the approver." align="start" />
      </h2>
      {rows.length > 0 && (
        <ul className="mb-4 space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-md border border-line px-3 py-2 text-label">
              <p>
                <span className="font-medium">{row.byName}</span> asked <span className="font-medium">{row.consulteeName}</span> <span className="text-caption text-ink-faint">· {row.askedAt}</span>
              </p>
              <p className="mt-0.5 whitespace-pre-wrap">
                <SafeText text={row.question} />
              </p>
              {row.answer ? (
                <p className="mt-2 whitespace-pre-wrap border-l-2 border-success-600 pl-2">
                  <SafeText text={row.answer} />
                </p>
              ) : row.mine ? (
                <AnswerAdvice requestId={requestId} consultationId={row.id} />
              ) : (
                <p className="mt-1 text-caption text-ink-muted">Waiting for an answer.</p>
              )}
            </li>
          ))}
        </ul>
      )}
      {canAsk && <AskAdvice requestId={requestId} people={people} />}
    </section>
  );
}

function AskAdvice({ requestId, people }: { requestId: number; people: { id: number; label: string }[] }) {
  const { result, pending, formRef, onSubmit } = useActionForm(consultAction, { resetOnSuccess: true });
  return (
    <details>
      <summary className="cursor-pointer text-label font-semibold text-primary-600">Ask someone for advice</summary>
      <form ref={formRef} onSubmit={onSubmit} className="mt-3 space-y-2">
        <input type="hidden" name="requestId" value={requestId} />
        <label htmlFor="consult-who" className="field-label">
          Colleague
        </label>
        <select id="consult-who" name="consulteeId" defaultValue="" className="field-input">
          <option value="">Choose…</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.label}
            </option>
          ))}
        </select>
        <FieldError result={result} name="consulteeId" />
        <label htmlFor="consult-question" className="field-label">
          Your question
        </label>
        <textarea id="consult-question" name="question" rows={2} maxLength={2000} className="field-input h-auto py-2" />
        <FieldError result={result} name="question" />
        <SubmitButton pending={pending} variant="secondary" className="btn-compact">
          Ask
        </SubmitButton>
        {result && (result.ok || !result.fieldErrors) && <ResultMessage result={result} />}
      </form>
    </details>
  );
}

function AnswerAdvice({ requestId, consultationId }: { requestId: number; consultationId: number }) {
  const { result, pending, onSubmit } = useActionForm(answerConsultAction);
  return (
    <form onSubmit={onSubmit} className="mt-2 space-y-2">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="consultationId" value={consultationId} />
      <label htmlFor={`advice-${consultationId}`} className="field-label">
        Your advice
      </label>
      <textarea id={`advice-${consultationId}`} name="answer" rows={2} maxLength={2000} className="field-input h-auto py-2" />
      <FieldError result={result} name="answer" />
      <SubmitButton pending={pending} className="btn-compact">
        Send advice
      </SubmitButton>
      {result && (result.ok || !result.fieldErrors) && <ResultMessage result={result} />}
    </form>
  );
}

export interface LinkRow {
  id: number;
  requestNo: string;
  title: string;
  status: string;
  relation: string;
}

export function Links({ requestId, rows, followUpHref }: { requestId: number; rows: LinkRow[]; followUpHref: string | null }) {
  const { result, pending, formRef, onSubmit } = useActionForm(linkAction, { resetOnSuccess: true });
  return (
    <section className="card px-5 py-4" aria-labelledby="links">
      <h2 id="links" className="mb-3 font-semibold">
        Linked requests
      </h2>
      {rows.length === 0 ? (
        <p className="mb-3 text-label text-ink-muted">None yet.</p>
      ) : (
        <ul className="mb-3 space-y-1.5 text-label">
          {rows.map((row) => (
            <li key={row.id}>
              <span className="text-caption text-ink-muted">{row.relation}: </span>
              <Link href={`/users/requests/${row.id}`} className="link">
                {row.requestNo}
              </Link>{" "}
              · <SafeText text={row.title} /> <span className="text-caption text-ink-muted">({row.status})</span>
            </li>
          ))}
        </ul>
      )}
      {followUpHref && (
        <p className="mb-3">
          <Link href={followUpHref} className="btn-secondary btn-compact">
            Raise a follow-up
          </Link>
        </p>
      )}
      <form ref={formRef} onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="requestId" value={requestId} />
        <div>
          <label htmlFor="link-no" className="field-label">
            Link another request
          </label>
          <input id="link-no" name="otherRequestNo" placeholder="e.g. PUR-2026-000123" className="field-input w-56" />
        </div>
        <SubmitButton pending={pending} variant="secondary" className="btn-compact h-11">
          Link
        </SubmitButton>
        <div className="w-full">
          <FieldError result={result} name="otherRequestNo" />
          {result?.ok && <ResultMessage result={result} />}
        </div>
      </form>
    </section>
  );
}
