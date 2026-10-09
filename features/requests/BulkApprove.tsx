"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { bulkApproveAction } from "@/app/users/actions";
import { ResultMessage, useActionForm } from "@/features/ui/form";
import type { QueueItem } from "@/lib/db/repositories/approvals.repository";

// Bulk approval workspace (#7). Only plain approvals of open requests can be
// ticked; the server checks every one again and approves them one by one.
const MAX = 25;
const time = (value: Date | string) => new Date(value).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

type Outcome = { requestId: number; taskKey: string; requestNo: string | null; result: string; message: string };

export function BulkApprove({ items }: { items: QueueItem[] }) {
  const eligible = useMemo(() => items.filter((item) => !item.work && !item.onHold), [items]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState(false);
  const { result, pending, onSubmit } = useActionForm(bulkApproveAction);
  const outcomes = (result?.ok !== undefined && result && "data" in result ? (result.data?.outcomes as Outcome[] | undefined) : undefined) ?? [];
  const key = (item: QueueItem) => `${item.requestId}:${item.taskKey}`;
  const toggle = (value: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else if (next.size < MAX) next.add(value);
      return next;
    });
  // Hidden with fewer than two to pick, unless it still has results to show.
  if (eligible.length < 2 && outcomes.length === 0) return null;
  const chosen = eligible.filter((item) => picked.has(key(item)));

  return (
    <section className="card mb-6 px-5 py-4" aria-labelledby="bulk">
      <h2 id="bulk" className="font-semibold">
        Approve several at once
      </h2>
      <p className="text-label text-ink-muted">
        Only straightforward approvals are listed: work tasks and requests on hold are done one by one. Open a request first if you need to read it. Up to {MAX} at a time.
      </p>
      <form onSubmit={onSubmit} className="mt-3 space-y-3">
        <div className="flex flex-wrap gap-3 text-label">
          <button type="button" className="link" onClick={() => setPicked(new Set(eligible.slice(0, MAX).map(key)))}>
            Tick all{eligible.length > MAX ? ` (first ${MAX})` : ""}
          </button>
          <button type="button" className="link" onClick={() => setPicked(new Set())}>
            Clear
          </button>
          <span className="text-ink-muted">{picked.size} ticked</span>
        </div>
        <ul className="divide-y divide-line rounded-md border border-line">
          {eligible.map((item) => (
            <li key={key(item)} className="flex items-start gap-3 px-3 py-2">
              <input
                type="checkbox"
                name="item"
                value={key(item)}
                checked={picked.has(key(item))}
                onChange={() => toggle(key(item))}
                className="mt-1 h-5 w-5"
                aria-label={`Approve ${item.requestNo}: ${item.title}`}
              />
              <div className="min-w-0 text-label">
                <Link href={`/users/requests/${item.requestId}`} className="link">
                  {item.title}
                </Link>
                <p className="text-caption text-ink-muted">
                  {item.requestNo} · {item.nodeLabel} · from {item.requesterName}
                  {item.forName ? ` · for ${item.forName}` : ""}
                  {item.dueAt ? ` · ${item.overdue ? "overdue since" : "due"} ${time(item.dueAt)}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
        {reviewing ? (
          <div role="alertdialog" aria-label="Confirm approvals" className="space-y-2 rounded-md border border-warning-600/40 bg-warning-50 px-3 py-3 text-label">
            <p className="font-medium">Approve these {chosen.length}?</p>
            <ul className="list-disc pl-5">
              {chosen.map((item) => (
                <li key={key(item)}>
                  {item.requestNo}: {item.title}
                </li>
              ))}
            </ul>
            <label htmlFor="bulk-comment" className="field-label">
              Comment for all of them <span className="font-normal text-ink-faint">(optional)</span>
            </label>
            <textarea id="bulk-comment" name="comment" rows={2} maxLength={2000} className="field-input h-auto py-2" />
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={pending} className="btn-primary btn-compact" onClick={() => setTimeout(() => setReviewing(false), 0)}>
                {pending ? "Approving…" : `Yes, approve ${chosen.length}`}
              </button>
              <button type="button" className="btn-secondary btn-compact" onClick={() => setReviewing(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" disabled={chosen.length === 0 || pending} className="btn-primary btn-compact" onClick={() => setReviewing(true)}>
            Review {chosen.length || ""} approval{chosen.length === 1 ? "" : "s"}
          </button>
        )}
        <ResultMessage result={result} />
        {outcomes.length > 0 && (
          <ul aria-label="Results" className="space-y-1 text-label">
            {outcomes.map((outcome) => (
              <li key={`${outcome.requestId}:${outcome.taskKey}`} className={outcome.result === "APPROVED" ? "text-success-600" : outcome.result === "SKIPPED" ? "text-warning-600" : "text-danger-600"}>
                {outcome.requestNo ?? `#${outcome.requestId}`}: {outcome.result === "APPROVED" ? "approved" : outcome.result === "SKIPPED" ? "skipped" : "not approved"} · {outcome.message}
              </li>
            ))}
          </ul>
        )}
      </form>
    </section>
  );
}
