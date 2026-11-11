"use client";

import Link from "next/link";
import { useState } from "react";
import { bulkReassignAction } from "@/app/admin/workload/actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { Hint } from "@/features/ui/Hint";
import { PersonSelect } from "@/features/ui/PersonSelect";

// v1.7.0 (A3): tick pending tasks, choose one person, give a reason. The
// server checks each task again and moves them one by one; every task gets
// its own result line.
const MAX = 100;
const time = (value: Date | string) => new Date(value).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

export interface ReassignRow {
  requestId: number;
  taskKey: string;
  requestNo: string;
  title: string;
  nodeLabel: string;
  work: boolean;
  approverName: string;
  workflowName: string;
  createdAt: string;
  overdue: boolean;
}
type Outcome = { requestId: number; taskKey: string; requestNo: string | null; ok: boolean; message: string };

export function BulkReassign({ rows, people }: { rows: ReassignRow[]; people: { id: number; label: string; detail?: string }[] }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const { result, pending, onSubmit, confirmBar } = useActionForm(bulkReassignAction, {
    confirm: `Move ${picked.size} task${picked.size === 1 ? "" : "s"} to the chosen person? Each one is checked again; anything that can't move is listed with the reason.`,
    confirmTitle: "Move these tasks?",
    confirmLabel: "Yes, move them",
  });
  const outcomes = (result && "data" in result ? (result.data?.outcomes as Outcome[] | undefined) : undefined) ?? [];
  const key = (row: ReassignRow) => `${row.requestId}:${row.taskKey}`;
  const toggle = (value: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else if (next.size < MAX) next.add(value);
      return next;
    });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <section className="card px-5 py-4">
        <div className="mb-2 flex flex-wrap items-center gap-3 text-label">
          <button type="button" className="link" onClick={() => setPicked(new Set(rows.slice(0, MAX).map(key)))}>
            Tick all{rows.length > MAX ? ` (first ${MAX})` : ""}
          </button>
          <button type="button" className="link" onClick={() => setPicked(new Set())}>
            Clear
          </button>
          <span className="text-ink-muted" role="status">
            {picked.size} ticked
          </span>
        </div>
        {rows.length === 0 ? (
          <p className="text-label text-ink-muted">Nothing is waiting for these choices.</p>
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line">
            {rows.map((row) => (
              <li key={key(row)} className="flex items-start gap-3 px-3 py-2">
                <input type="checkbox" name="item" value={key(row)} checked={picked.has(key(row))} onChange={() => toggle(key(row))} className="mt-1 h-5 w-5" aria-label={`Move ${row.requestNo}: ${row.nodeLabel} (${row.approverName})`} />
                <div className="min-w-0 text-label">
                  <Link href={`/users/requests/${row.requestId}`} className="link">
                    {row.requestNo} · {row.title}
                  </Link>
                  <p className="text-caption text-ink-muted">
                    {row.workflowName} · {row.nodeLabel}
                    {row.work ? " (work)" : ""} · with {row.approverName} · since {time(row.createdAt)}
                    {row.overdue ? " · overdue" : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card grid gap-4 px-5 py-4 sm:grid-cols-2">
        <div>
          <div className="flex items-center gap-1">
            <label htmlFor="toUserId" className="field-label">
              Move them to
            </label>
            <Hint text="Approval steps need someone who can approve; work steps can go to anyone active." align="start" className="mb-1.5" />
          </div>
          <PersonSelect id="toUserId" name="toUserId" required options={people} placeholder="Choose a person" />
          <FieldError result={result} name="toUserId" />
        </div>
        <div>
          <div className="flex items-center gap-1">
            <label htmlFor="reason" className="field-label">
              Reason
            </label>
            <Hint text="Shown on each request's timeline." align="start" className="mb-1.5" />
          </div>
          <input id="reason" name="reason" required minLength={3} maxLength={500} className="field-input" />
          <FieldError result={result} name="reason" />
        </div>
        <div className="sm:col-span-2">
          <SubmitButton pending={pending}>Move {picked.size || ""} ticked</SubmitButton>
        </div>
        {confirmBar}
      </section>
      <ResultMessage result={result} />
      {outcomes.length > 0 && (
        <ul aria-label="Results" className="card space-y-1 px-5 py-4 text-label">
          {outcomes.map((outcome) => (
            <li key={`${outcome.requestId}:${outcome.taskKey}`} className={outcome.ok ? "text-success-600" : "text-danger-600"}>
              {outcome.requestNo ?? `#${outcome.requestId}`}: {outcome.ok ? "moved" : "not moved"} · {outcome.message}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
