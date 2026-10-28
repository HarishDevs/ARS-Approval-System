"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isTyping } from "@/features/shell/shortcuts";
import { Check, MessageSquareWarning, PauseCircle, XCircle } from "lucide-react";
import { Dialog } from "@/features/ui/Dialog";
import { answerInfoAction, decideAction, delegateTaskAction, recallAction, reopenAction, resolveBlockedAction, resumeAction, withdrawAction } from "@/app/users/actions";
import { FieldError, ResultMessage, useActionForm } from "@/features/ui/form";
import { Hint } from "@/features/ui/Hint";

// What the signed-in person can do on this request right now (F-14). The
// server decides again on every press (F-12).
// A work task (D-097) is marked done, or sent back; it can't be rejected.
export type DecisionKind = "APPROVE" | "REQUEST_CHANGES" | "HOLD" | "REJECT" | "INFO";

export function DecisionForm({ requestId, taskKey, label, work = false, only, idPrefix = "comment" }: { requestId: number; taskKey: string; label: string; work?: boolean; only?: DecisionKind; idPrefix?: string }) {
  const { result, pending, onSubmit } = useActionForm(decideAction);
  const shows = (kind: DecisionKind) => !only || only === kind;
  return (
    <form onSubmit={onSubmit} className={only ? "space-y-3" : "space-y-3 px-5 py-4"}>
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="taskKey" value={taskKey} />
      {work && <input type="hidden" name="work" value="1" />}
      <p className="font-medium">
        {work ? "Your task" : "Your decision"}: {label}
      </p>
      <div>
        <div className="flex items-center gap-1">
          <label htmlFor={`${idPrefix}-${taskKey}`} className="field-label">
            {only === "INFO" ? "Your question for the requester" : "Comment"}
          </label>
          {only !== "INFO" && <Hint text={work ? "Say what you did. Required to ask for changes or a question." : "Required to reject, ask for changes or ask a question."} align="start" className="mb-1.5" />}
        </div>
        <textarea id={`${idPrefix}-${taskKey}`} name="comment" rows={3} maxLength={2000} data-autofocus={only ? true : undefined} className="field-input h-auto py-2.5" />
        <FieldError result={result} name="comment" />
      </div>
      <div className="flex flex-wrap gap-2">
        {shows("APPROVE") && (
          <button type="submit" name="decision" value="APPROVE" disabled={pending} className="btn-primary btn-compact">
            {pending && only ? "Working…" : work ? "Mark as done" : "Approve"}
          </button>
        )}
        {shows("REQUEST_CHANGES") && (
          <button type="submit" name="decision" value="REQUEST_CHANGES" disabled={pending} className={only ? "btn-primary btn-compact" : "btn-secondary btn-compact"}>
            {pending && only ? "Working…" : "Ask for changes"}
          </button>
        )}
        {shows("HOLD") && (
          <button type="submit" name="decision" value="HOLD" disabled={pending} className={only ? "btn-primary btn-compact" : "btn-secondary btn-compact"}>
            {pending && only ? "Working…" : "Put on hold"}
          </button>
        )}
        {shows("INFO") && (
          <button type="submit" name="decision" value="INFO" disabled={pending} className={only ? "btn-primary btn-compact" : "btn-secondary btn-compact"}>
            {pending && only ? "Working…" : "Ask a question"}
          </button>
        )}
        {!work && shows("REJECT") && (
          <button type="submit" name="decision" value="REJECT" disabled={pending} className={only ? "btn-danger btn-compact" : "btn-secondary btn-compact text-danger-600"}>
            {pending && only ? "Working…" : "Reject"}
          </button>
        )}
      </div>
      <ResultMessage result={result} />
    </form>
  );
}

// IT moves a blocked step on (D-098): give it to people, skip it, try the
// approvers again after fixing the masters, or pick a path on a choice.
export interface BlockedStep {
  nodeId: string;
  label: string;
  kind: "APPROVAL" | "CONDITION";
  work: boolean;
  reason: string;
  paths: { edgeId: string; label: string }[];
}

export function BlockedStepForm({ requestId, step, people }: { requestId: number; step: BlockedStep; people: { id: number; label: string }[] }) {
  const { result, pending, onSubmit } = useActionForm(resolveBlockedAction);
  const choices = step.kind === "CONDITION" ? (["TAKE_PATH", "RETRY"] as const) : (["ASSIGN", "SKIP", "RETRY"] as const);
  const [action, setAction] = useState<(typeof choices)[number]>(choices[0]);
  const words: Record<string, string> = {
    ASSIGN: step.work ? "Give this task to:" : "These people approve this step:",
    SKIP: "Skip this step (it isn't needed)",
    RETRY: "Try again (after fixing the department, designation or group)",
    TAKE_PATH: "Send it down this path:",
  };
  return (
    <form onSubmit={onSubmit} className="space-y-3 px-5 py-4">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="nodeId" value={step.nodeId} />
      <p className="font-medium">
        Blocked: {step.label} <span className="font-normal text-ink-muted">({step.reason})</span>
      </p>
      <fieldset className="space-y-2">
        <legend className="sr-only">How to move it on</legend>
        {choices.map((choice) => (
          <label key={choice} className="flex items-start gap-2 text-label">
            <input type="radio" name="action" value={choice} checked={action === choice} onChange={() => setAction(choice)} className="mt-1" />
            <span>{words[choice]}</span>
          </label>
        ))}
      </fieldset>
      {action === "ASSIGN" && (
        <div>
          <label htmlFor={`assign-${step.nodeId}`} className="field-label">
            People (hold Ctrl to pick several)
          </label>
          <select id={`assign-${step.nodeId}`} name="userIds" multiple className="field-input h-32 py-2">
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.label}
              </option>
            ))}
          </select>
          <FieldError result={result} name="userIds" />
        </div>
      )}
      {action === "TAKE_PATH" && (
        <select name="edgeId" aria-label="Path" className="field-input">
          {step.paths.map((path) => (
            <option key={path.edgeId} value={path.edgeId}>
              {path.label}
            </option>
          ))}
        </select>
      )}
      <div>
        <div className="flex items-center gap-1">
          <label htmlFor={`unblock-reason-${step.nodeId}`} className="field-label">
            Reason
          </label>
          <Hint text="Shown on the timeline and to the requester." align="start" className="mb-1.5" />
        </div>
        <input id={`unblock-reason-${step.nodeId}`} name="reason" maxLength={500} className="field-input" />
        <FieldError result={result} name="reason" />
      </div>
      <button type="submit" disabled={pending} className="btn-primary btn-compact">
        {pending ? "Working…" : "Move it on"}
      </button>
      <ResultMessage result={result} />
    </form>
  );
}

export function ResumeForm({ requestId }: { requestId: number }) {
  const { result, pending, onSubmit } = useActionForm(resumeAction);
  return (
    <form onSubmit={onSubmit} className="space-y-2 px-5 py-4">
      <input type="hidden" name="requestId" value={requestId} />
      <p className="text-label text-ink-muted">This request is on hold.</p>
      <button type="submit" disabled={pending} className="btn-secondary btn-compact">
        {pending ? "Working…" : "Resume"}
      </button>
      <ResultMessage result={result} />
    </form>
  );
}

export function WithdrawForm({ requestId }: { requestId: number }) {
  const { result, pending, onSubmit, confirmBar } = useActionForm(withdrawAction, { confirmTitle: "Withdraw this request?", confirmLabel: "Yes, withdraw", confirmTone: "danger", confirm: "Withdraw this request? It can't be undone; you'd raise a new one instead." });
  return (
    <form onSubmit={onSubmit} className="space-y-2 px-5 py-4">
      <input type="hidden" name="requestId" value={requestId} />
      <p className="flex items-center gap-1 font-medium">
        Withdraw this request
        <Hint text="Closes it now. Anyone still to approve is told it's no longer needed." align="start" />
      </p>
      <input name="reason" maxLength={500} placeholder="Reason (optional)" aria-label="Reason for withdrawing" className="field-input" />
      <button type="submit" disabled={pending} className="btn-secondary btn-compact text-danger-600">
        {pending ? "Working…" : "Withdraw"}
      </button>
      <ResultMessage result={result} />
      {confirmBar}
    </form>
  );
}

export function ReopenForm({ requestId }: { requestId: number }) {
  const { result, pending, onSubmit, confirmBar } = useActionForm(reopenAction, { confirm: "It goes through every level again.", confirmTitle: "Reopen this approved request?", confirmLabel: "Yes, reopen" });
  return (
    <form onSubmit={onSubmit} className="space-y-2 px-5 py-4">
      <input type="hidden" name="requestId" value={requestId} />
      <p className="flex items-center gap-1 font-medium">
        Reopen (Super Admin)
        <Hint text="Starts approval again from the first level, on the same number. The earlier approvals stay in the history." align="start" />
      </p>
      <input name="reason" maxLength={500} placeholder="Reason (required)" aria-label="Reason for reopening" className="field-input" />
      <FieldError result={result} name="reason" />
      <button type="submit" disabled={pending} className="btn-secondary btn-compact">
        {pending ? "Working…" : "Reopen"}
      </button>
      <ResultMessage result={result} />
      {confirmBar}
    </form>
  );
}

// RA-02: on phones, the actions the person may take stay at the bottom of
// the screen. Each opens a drawer with the comment box and that one action,
// which goes through the same server action (and checks) as the full form.
export function MobileDecisionBar({ requestId, taskKey, label, work = false }: { requestId: number; taskKey: string; label: string; work?: boolean }) {
  const [open, setOpen] = useState<DecisionKind | null>(null);
  const actions: { kind: DecisionKind; label: string; icon: React.ReactNode; style: string }[] = [
    { kind: "APPROVE", label: work ? "Done" : "Approve", icon: <Check aria-hidden="true" className="h-4 w-4" />, style: "btn-primary" },
    { kind: "REQUEST_CHANGES", label: "Changes", icon: <MessageSquareWarning aria-hidden="true" className="h-4 w-4" />, style: "btn-secondary" },
    { kind: "HOLD", label: "Hold", icon: <PauseCircle aria-hidden="true" className="h-4 w-4" />, style: "btn-secondary" },
    ...(work ? [] : [{ kind: "REJECT" as const, label: "Reject", icon: <XCircle aria-hidden="true" className="h-4 w-4" />, style: "btn-secondary text-danger-600" }]),
  ];
  const titles: Record<DecisionKind, string> = { APPROVE: work ? "Mark as done" : "Approve", REQUEST_CHANGES: "Ask for changes", HOLD: "Put on hold", REJECT: "Reject", INFO: "Ask a question" };
  return (
    <>
      <div role="region" aria-label="Your decision" className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-sticky border-t border-line bg-surface px-3 py-2 shadow-overlay md:hidden">
        <div className={`grid gap-2 ${actions.length === 4 ? "grid-cols-4" : "grid-cols-3"}`}>
          {actions.map((action) => (
            <button key={action.kind} type="button" onClick={() => setOpen(action.kind)} className={`${action.style} btn-compact flex-col !gap-0.5 !px-1 !text-[length:calc(12px*var(--text-scale,1))]`}>
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      </div>
      <Dialog open={open !== null} onClose={() => setOpen(null)} variant="drawer" title={open ? titles[open] : ""} description={label}>
        {open && <DecisionForm requestId={requestId} taskKey={taskKey} label={label} work={work} only={open} idPrefix="drawer-comment" />}
      </Dialog>
    </>
  );
}

// WS-02: A / C on the request page (or arriving from the queue with
// ?act=approve|changes) open that one action in a dialog. Nothing is decided
// until the person presses the action's button there.
export function DecisionShortcuts({ requestId, taskKey, label, work = false, initial }: { requestId: number; taskKey: string; label: string; work?: boolean; initial?: string }) {
  const start: DecisionKind | null = initial === "approve" ? "APPROVE" : initial === "changes" ? "REQUEST_CHANGES" : null;
  const [open, setOpen] = useState<DecisionKind | null>(start);
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    // Drop ?act from the address so a reload doesn't reopen it.
    if (start) router.replace(pathname, { scroll: false });
  }, [start, router, pathname]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target) || document.querySelector("dialog[open]")) return;
      const key = event.key.toLowerCase();
      if (key === "a") setOpen("APPROVE");
      if (key === "c") setOpen("REQUEST_CHANGES");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const title = open === "APPROVE" ? (work ? "Mark as done?" : "Approve this request?") : "Ask for changes";
  return (
    <Dialog open={open !== null} onClose={() => setOpen(null)} title={title} description={label} size="sm">
      {open && <DecisionForm requestId={requestId} taskKey={taskKey} label={label} work={work} only={open} idPrefix="shortcut-comment" />}
    </Dialog>
  );
}

// EN-04 (BD-1): the requester takes it back to change it.
export function RecallForm({ requestId }: { requestId: number }) {
  const { result, pending, onSubmit, confirmBar } = useActionForm(recallAction, {
    confirmTitle: "Recall this request?",
    confirm: "The approvers waiting on it are told it isn't needed for now. Decisions already made stay. You then change it and resubmit.",
    confirmLabel: "Yes, recall",
  });
  return (
    <form onSubmit={onSubmit} className="space-y-2 px-5 py-4">
      <input type="hidden" name="requestId" value={requestId} />
      <p className="font-medium">Need to change something?</p>
      <label htmlFor="recall-reason" className="field-label">
        Reason for recalling
      </label>
      <input id="recall-reason" name="reason" maxLength={500} className="field-input" placeholder="e.g. Wrong quote attached" />
      <FieldError result={result} name="reason" />
      <button type="submit" disabled={pending} className="btn-secondary btn-compact">
        {pending ? "Working…" : "Recall to change it"}
      </button>
      <ResultMessage result={result} />
      {confirmBar}
    </form>
  );
}

// EN-05: the approver's question, answered by the requester.
export function AnswerQuestionForm({ requestId, question, byName }: { requestId: number; question: string; byName: string }) {
  const { result, pending, onSubmit } = useActionForm(answerInfoAction);
  return (
    <form onSubmit={onSubmit} className="space-y-2 px-5 py-4">
      <input type="hidden" name="requestId" value={requestId} />
      <p className="font-medium">{byName} asked:</p>
      <blockquote className="rounded-md border-l-4 border-warning-600 bg-warning-50 px-3 py-2 text-label">{question}</blockquote>
      <label htmlFor="info-answer" className="field-label">
        Your answer
      </label>
      <textarea id="info-answer" name="answer" rows={3} maxLength={2000} className="field-input h-auto py-2.5" />
      <FieldError result={result} name="answer" />
      <button type="submit" disabled={pending} className="btn-primary btn-compact">
        {pending ? "Sending…" : "Send answer"}
      </button>
      <ResultMessage result={result} />
    </form>
  );
}

// EN-07 (BD-10): pass my own approval to a colleague.
export function DelegateTaskForm({ requestId, taskKey, people }: { requestId: number; taskKey: string; people: { id: number; label: string }[] }) {
  const { result, pending, onSubmit, confirmBar } = useActionForm(delegateTaskAction, {
    confirmTitle: "Pass this approval on?",
    confirm: "It moves to the colleague you chose straight away, with a fresh response time. You won't be able to decide it unless it comes back.",
    confirmLabel: "Yes, pass it on",
  });
  return (
    <details className="px-5 py-3">
      <summary className="cursor-pointer text-label font-semibold text-primary-600">Pass this to a colleague</summary>
      <form onSubmit={onSubmit} className="mt-3 space-y-2">
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="taskKey" value={taskKey} />
        <label htmlFor={`delegate-to-${taskKey}`} className="field-label">
          Colleague
        </label>
        <select id={`delegate-to-${taskKey}`} name="toUserId" defaultValue="" className="field-input">
          <option value="">Choose…</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.label}
            </option>
          ))}
        </select>
        <FieldError result={result} name="toUserId" />
        <label htmlFor={`delegate-reason-${taskKey}`} className="field-label">
          Why
        </label>
        <input id={`delegate-reason-${taskKey}`} name="reason" maxLength={500} className="field-input" placeholder="e.g. They manage this budget" />
        <FieldError result={result} name="reason" />
        <button type="submit" disabled={pending} className="btn-secondary btn-compact">
          {pending ? "Working…" : "Pass it on"}
        </button>
        <ResultMessage result={result} />
        {confirmBar}
      </form>
    </details>
  );
}
