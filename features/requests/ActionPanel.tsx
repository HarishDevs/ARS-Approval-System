"use client";

import { decideAction, resumeAction } from "@/app/users/actions";
import { FieldError, ResultMessage, useActionForm } from "@/features/ui/form";

// What the signed-in person can do on this request right now (F-14). The
// server decides again on every press (F-12).
export function DecisionForm({ requestId, taskKey, label }: { requestId: number; taskKey: string; label: string }) {
  const { result, pending, onSubmit } = useActionForm(decideAction);
  return (
    <form onSubmit={onSubmit} className="space-y-3 px-5 py-4">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="taskKey" value={taskKey} />
      <p className="font-medium">Your decision: {label}</p>
      <div>
        <label htmlFor={`comment-${taskKey}`} className="field-label">
          Comment <span className="font-normal text-ink-faint">(required to reject or ask for changes)</span>
        </label>
        <textarea id={`comment-${taskKey}`} name="comment" rows={3} className="field-input h-auto py-2.5" />
        <FieldError result={result} name="comment" />
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="decision" value="APPROVE" disabled={pending} className="btn-primary btn-compact">
          Approve
        </button>
        <button type="submit" name="decision" value="REQUEST_CHANGES" disabled={pending} className="btn-secondary btn-compact">
          Ask for changes
        </button>
        <button type="submit" name="decision" value="HOLD" disabled={pending} className="btn-secondary btn-compact">
          Put on hold
        </button>
        <button type="submit" name="decision" value="REJECT" disabled={pending} className="btn-secondary btn-compact text-danger-600">
          Reject
        </button>
      </div>
      <ResultMessage result={result} />
    </form>
  );
}

export function ResumeForm({ requestId }: { requestId: number }) {
  const { result, pending, onSubmit } = useActionForm(resumeAction);
  return (
    <form onSubmit={onSubmit} className="space-y-2 px-5 py-4">
      <input type="hidden" name="requestId" value={requestId} />
      <p className="text-label text-ink-muted">This request is on hold. Resume it when you&apos;re ready to decide.</p>
      <button type="submit" disabled={pending} className="btn-secondary btn-compact">
        {pending ? "Working…" : "Resume"}
      </button>
      <ResultMessage result={result} />
    </form>
  );
}
