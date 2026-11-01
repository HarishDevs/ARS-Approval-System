"use client";

import Link from "next/link";
import { AlertCircle, Check, Clock, Mail, Send, UserRound } from "lucide-react";
import type { JourneyFyi, JourneyTask } from "@/server/journey/types";
import { when } from "@/features/journey/format";

const TASK_WORD: Record<JourneyTask["status"], string> = { OPEN: "To do", IN_PROGRESS: "In progress", BLOCKED: "Blocked", COMPLETED: "Completed", CANCELLED: "Cancelled" };
const DELIVERY_WORD = { DELIVERED: "Delivered", PENDING: "Pending", FAILED: "Failed" } as const;
const DELIVERY_STYLE = { DELIVERED: "bg-[#14532d] text-[#bbf7d0]", PENDING: "bg-[#1e3a8a] text-[#bfdbfe]", FAILED: "bg-[#7f1d1d] text-[#fecaca]" } as const;

// D-273: the request's linked tasks: work steps the request waits for, and
// background work it doesn't. Separate from the checkpoints: a task is never
// an approval, and its card follows the task's own status.
export function WorkTaskActivity({ task, fresh }: { task: JourneyTask; fresh: boolean }) {
  const done = task.status === "COMPLETED";
  const closed = done || task.status === "CANCELLED";
  return (
    <li
      className={`jr-card rounded-lg border p-3 ${done ? "border-[#16a34a] bg-[#052e16]" : task.overdue ? "border-[#f97316] bg-[#1c1917]" : "border-[#334155] bg-[#0f1b2d]"} ${fresh ? "jr-card-new" : ""}`}
      data-testid="journey-task"
      data-status={task.status}
    >
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${done ? "jr-tick bg-[#22c55e] text-white" : closed ? "bg-[#334155] text-[#94a3b8]" : "bg-[#1d4ed8] text-white"}`} aria-hidden="true">
          {done ? <Check className="h-4 w-4" strokeWidth={3} /> : <Clock className="h-3.5 w-3.5" />}
        </span>
        <div className="min-w-0 flex-1">
          <Link href={`/users/tasks/${task.id}`} className="block truncate text-[13px] font-semibold text-white hover:underline">
            {task.title}
          </Link>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-[#94a3b8]">
            <span className="font-mono">{task.taskNo}</span>
            <span className="inline-flex items-center gap-1">
              <UserRound className="h-3 w-3" aria-hidden="true" />
              {task.assignee}
            </span>
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className={`rounded px-1.5 py-0.5 font-semibold ${done ? "bg-[#14532d] text-[#bbf7d0]" : closed ? "bg-[#1e293b] text-[#94a3b8]" : task.overdue ? "bg-[#7c2d12] text-[#fed7aa]" : "bg-[#1e3a8a] text-[#bfdbfe]"}`}>
              {task.overdue && !closed ? "Overdue" : TASK_WORD[task.status]}
            </span>
            <span className="rounded bg-[#1e293b] px-1.5 py-0.5 text-[#cbd5e1]">{task.blocking ? "The request waits for it" : "Doesn't hold the request up"}</span>
          </p>
          <p className="mt-1 text-[11px] text-[#94a3b8]">
            {done && task.completedAt ? `Completed ${when(task.completedAt)}` : task.dueAt ? `Due ${when(task.dueAt)}` : `Created ${when(task.createdAt)}`}
          </p>
        </div>
      </div>
    </li>
  );
}

// D-273: an FYI step's message: who was told and whether it reached them.
// FYI is never a checkpoint and never holds the request up; it is sent when
// the request reaches the FYI step's place in the workflow.
export function FyiActivity({ item, fresh }: { item: JourneyFyi; fresh: boolean }) {
  return (
    <li className={`jr-card relative rounded-lg border border-[#334155] bg-[#0f1b2d] p-3 ${fresh ? "jr-card-new" : ""}`} data-testid="journey-fyi" data-status={item.status}>
      {fresh && (
        <span className="jr-fly pointer-events-none absolute -left-2 top-2" aria-hidden="true">
          <Mail className="h-4 w-4 text-white" />
        </span>
      )}
      <div className="flex items-start gap-2">
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#0e7490] text-white" aria-hidden="true">
          <Send className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-white">Information shared: {item.step}</p>
          <p className="text-[11px] text-[#94a3b8]">Shared {when(item.at)}</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {item.recipients.map((recipient, index) => (
              <li key={`${recipient.name}-${index}`} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${DELIVERY_STYLE[recipient.status]}`}>
                {recipient.status === "FAILED" && <AlertCircle className="h-3 w-3" aria-hidden="true" />}
                {recipient.name} · {DELIVERY_WORD[recipient.status]}
              </li>
            ))}
            {item.recipients.length === 0 && <li className="text-[11px] text-[#94a3b8]">Nobody to tell</li>}
          </ul>
        </div>
      </div>
    </li>
  );
}
