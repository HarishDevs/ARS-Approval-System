"use client";

import { resendRequestMessagesAction, snoozeStuckAction } from "@/app/admin/attention/actions";
import { resendOutboxAction, runJobsNowAction } from "@/app/superadmin/automation/actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";

// FN2 / FN11 small forms for Needs attention and Automation.
export function SnoozeForm({ requestId, reason, requestNo }: { requestId: number; reason: string; requestNo: string }) {
  const { result, pending, formRef, onSubmit } = useActionForm(snoozeStuckAction, { resetOnSuccess: true });
  const id = `snooze-${requestId}-${reason}`;
  return (
    <details className="text-label">
      <summary className="cursor-pointer font-semibold text-primary-600">Hide for a while</summary>
      <form ref={formRef} onSubmit={onSubmit} className="mt-2 flex flex-wrap items-start gap-2">
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="reason" value={reason} />
        <div>
          <label htmlFor={`${id}-days`} className="sr-only">
            Hide {requestNo} for
          </label>
          <select id={`${id}-days`} name="days" defaultValue="7" className="field-input h-9 w-28">
            {[1, 3, 7, 14, 30].map((days) => (
              <option key={days} value={days}>
                {days} day{days === 1 ? "" : "s"}
              </option>
            ))}
          </select>
          <FieldError result={result} name="days" />
        </div>
        <div>
          <label htmlFor={`${id}-note`} className="sr-only">
            Why hide {requestNo}?
          </label>
          <input id={`${id}-note`} name="note" maxLength={300} placeholder="Why, e.g. waiting for the vendor" className="field-input h-9 w-64" />
          <FieldError result={result} name="note" />
        </div>
        <SubmitButton pending={pending} variant="secondary" className="btn-compact">
          Hide
        </SubmitButton>
        {result && (result.ok || !result.fieldErrors) && <ResultMessage result={result} />}
      </form>
    </details>
  );
}

function OneButton({ action, fields, label }: { action: Parameters<typeof useActionForm>[0]; fields: Record<string, string | number>; label: string }) {
  const { result, pending, onSubmit } = useActionForm(action);
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <SubmitButton pending={pending} variant="secondary" className="btn-compact">
        {label}
      </SubmitButton>
      <ResultMessage result={result} />
    </form>
  );
}

export const ResendRequestMessages = ({ requestId }: { requestId: number }) => (
  <OneButton action={resendRequestMessagesAction} fields={{ requestId }} label="Resend messages" />
);

export const ResendOutbox = ({ outboxId }: { outboxId: number }) => <OneButton action={resendOutboxAction} fields={{ outboxId }} label="Resend" />;

export const RunJobsNow = ({ job, label }: { job?: string; label: string }) => <OneButton action={runJobsNowAction} fields={job ? { job } : {}} label={label} />;
